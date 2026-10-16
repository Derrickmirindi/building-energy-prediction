// Scenario storage (this browser only) and project import/export.
import { KEYS, validate, valuesToInputs } from './domain.js';

export const STORAGE_KEY = 'beds.project.v1';
export const SCHEMA = 'building-energy-design-studio/project';
export const SCHEMA_VERSION = 1;
export const MAX_SCENARIOS = 50;
const MAX_NAME = 80;

let mem = { scenarios: [], baselineId: null, compare: [] };
let persistent = true;

function storage() {
  try { const k = '__beds_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch { return null; }
}

export function cleanName(name) {
  // Untrusted text: strip control characters, collapse whitespace, cap length. Rendered with textContent only.
  const s = String(name ?? '').replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.slice(0, MAX_NAME) || 'Untitled scenario';
}
const newId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function load() {
  const ls = storage();
  persistent = Boolean(ls);
  if (!ls) return mem;
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (raw) { const r = parseProject(JSON.parse(raw)); if (r.ok) mem = r.project; }
  } catch { /* corrupt storage: start empty, do not throw */ }
  return mem;
}
export const isPersistent = () => persistent;
function save() {
  const ls = storage();
  if (!ls) { persistent = false; return; }
  try { ls.setItem(STORAGE_KEY, JSON.stringify(mem)); } catch { persistent = false; }
}
export const get = () => mem;

export function addScenario(name, inputs, result) {
  if (mem.scenarios.length >= MAX_SCENARIOS) throw new Error(`You can keep up to ${MAX_SCENARIOS} scenarios. Delete some first.`);
  const s = { id: newId(), name: cleanName(name), inputs: { ...inputs }, result: result ? pickResult(result) : null, saved: new Date().toISOString() };
  mem.scenarios.push(s);
  if (!mem.baselineId) mem.baselineId = s.id;
  if (mem.compare.length < 4) mem.compare.push(s.id);
  save();
  return s;
}
export function updateScenario(id, patch) {
  const s = mem.scenarios.find((x) => x.id === id);
  if (!s) return null;
  if (patch.name !== undefined) s.name = cleanName(patch.name);
  if (patch.inputs) { s.inputs = { ...patch.inputs }; s.result = patch.result ? pickResult(patch.result) : null; s.saved = new Date().toISOString(); }
  save();
  return s;
}
export function duplicateScenario(id) {
  const s = mem.scenarios.find((x) => x.id === id);
  if (!s) return null;
  return addScenario(`${s.name} (copy)`, s.inputs, s.result);
}
export function deleteScenario(id) {
  mem.scenarios = mem.scenarios.filter((x) => x.id !== id);
  mem.compare = mem.compare.filter((x) => x !== id);
  if (mem.baselineId === id) mem.baselineId = mem.scenarios[0]?.id ?? null;
  save();
}
export function setBaseline(id) { if (mem.scenarios.some((s) => s.id === id)) { mem.baselineId = id; save(); } }
export function setCompare(ids) { mem.compare = ids.filter((id) => mem.scenarios.some((s) => s.id === id)).slice(0, 4); save(); }
export function clearAll() {
  mem = { scenarios: [], baselineId: null, compare: [] };
  const ls = storage();
  if (ls) { try { ls.removeItem(STORAGE_KEY); } catch { /* ignore */ } }
}
function pickResult(r) {
  return { heating: r.heating, cooling: r.cooling, heatingRaw: r.heatingRaw, coolingRaw: r.coolingRaw, heatingClipped: r.heatingClipped, coolingClipped: r.coolingClipped };
}

/** Wrap the current project for export. */
export function exportProject(meta) {
  return {
    schema: SCHEMA, schemaVersion: SCHEMA_VERSION, exported: new Date().toISOString(), ...meta,
    scenarios: mem.scenarios.map((s) => ({ id: s.id, name: s.name, inputs: s.inputs, result: s.result, saved: s.saved })),
    baselineId: mem.baselineId, compare: mem.compare,
  };
}

/**
 * Validate an untrusted project object. Inputs must pass the same validation as the form.
 * Stored results are NOT trusted: imported scenarios are re-predicted by the app.
 */
export function parseProject(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['The file is not a JSON object.'] };
  if ('schema' in obj && obj.schema !== SCHEMA) return { ok: false, errors: [`Unknown schema “${String(obj.schema).slice(0, 60)}”.`] };
  if ('schemaVersion' in obj && obj.schemaVersion !== SCHEMA_VERSION) return { ok: false, errors: [`Unsupported schema version ${String(obj.schemaVersion).slice(0, 10)}; this version of the studio reads version ${SCHEMA_VERSION}.`] };
  if (!Array.isArray(obj.scenarios)) return { ok: false, errors: ['The file has no “scenarios” list.'] };
  if (obj.scenarios.length > MAX_SCENARIOS) return { ok: false, errors: [`Too many scenarios (${obj.scenarios.length}); the limit is ${MAX_SCENARIOS}.`] };
  const scenarios = []; const seen = new Set();
  obj.scenarios.forEach((s, i) => {
    if (!s || typeof s !== 'object' || !s.inputs || typeof s.inputs !== 'object') { errors.push(`Scenario ${i + 1}: missing inputs.`); return; }
    const raw = Object.fromEntries(KEYS.map((k) => [k, s.inputs[k]]));
    if (KEYS.some((k) => typeof raw[k] !== 'number')) { errors.push(`Scenario ${i + 1}: every input must be a number.`); return; }
    const v = validate(raw);
    if (!v.ok) { errors.push(`Scenario ${i + 1} (${cleanName(s.name)}): ${Object.entries(v.errors).map(([k, e]) => `${k}: ${e}`).join('; ')}`); return; }
    let id = typeof s.id === 'string' && /^[a-z0-9]{1,40}$/i.test(s.id) ? s.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    scenarios.push({ id, name: cleanName(s.name), inputs: valuesToInputs(v.values), result: null, saved: typeof s.saved === 'string' ? s.saved.slice(0, 40) : null });
  });
  if (errors.length) return { ok: false, errors };
  const ids = new Set(scenarios.map((s) => s.id));
  const baselineId = ids.has(obj.baselineId) ? obj.baselineId : scenarios[0]?.id ?? null;
  const compare = Array.isArray(obj.compare) ? obj.compare.filter((x) => ids.has(x)).slice(0, 4) : scenarios.slice(0, 4).map((s) => s.id);
  return { ok: true, project: { scenarios, baselineId, compare } };
}

/** Replace the current project with an imported, validated one. */
export function replaceProject(project) { mem = project; save(); }
