// Building Energy Design Studio — interface. All predictions go through inference.js.
import * as M from './inference.js';
import { FEATURES, KEYS, byKey, DEFAULT_INPUTS, validate, parseField, feasibility, fmt, valuesToInputs, inputsToValues, difference, esc, toCsv, SHAPES } from './domain.js';
import * as Store from './store.js';
import { lineChart, heatmap, COLORS } from './charts.js';
import { drawBuilding } from './building.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
};
const UNIT = 'kWh/m²*';
const stamp = () => new Date().toISOString();
const fileStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/* ======================================================================= tabs */
const TABS = ['predict', 'compare', 'explore', 'reports'];
function route() {
  const id = (location.hash || '#predict').slice(1);
  const tab = TABS.includes(id) ? id : 'predict';
  $$('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== tab; });
  $$('[data-tab]').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (tab === 'reports') renderReport();
  if (tab === 'explore') { renderBaseSummary(); updateSweepCount(); }
  if (tab === 'compare') renderCompare();
  document.title = `${$(`[data-tab="${tab}"]`).textContent.replace(/\d+/g, '').trim()} — Building Energy Prediction`;
}
window.addEventListener('hashchange', () => { route(); $('main').focus({ preventScroll: true }); });
$('main').tabIndex = -1;

/* ================================================================== model state */
M.onStatus((s) => {
  const ready = s.status === 'ready';
  $('[data-predict]').disabled = !ready;
  $('[data-sweep-run]').disabled = !ready;
  $('[data-load-error]').hidden = s.status !== 'error';
  if (s.status === 'error') $('[data-load-error-text]').textContent = s.message;
  if (!ready && s.status === 'loading') setFormStatus(s.message);
});
$('[data-retry]').addEventListener('click', () => start());

async function start() {
  try {
    await M.load();
    setFormStatus('Model ready. Enter inputs and press Predict loads.');
    await M.verifyBatch(SHAPES.slice(0, 6).map((s, i) => [...s, 2 + (i % 4), [0, 0.1, 0.25, 0.4][i % 4], i % 4 === 0 ? 0 : 1 + (i % 5)]));
    await refreshScenarioResults();
  } catch (err) {
    setFormStatus('The model could not be loaded: ' + (err.message || err), true);
  }
}

/* ================================================================ predict form */
const fieldsHost = $('[data-fields]');
const form = $('[data-form]');
let current = { inputs: null, values: null, result: null, stale: false };

function buildFields() {
  FEATURES.forEach((f, i) => {
    const id = 'in-' + f.key;
    let control;
    if (f.kind === 'category') {
      control = h('select', { id, name: f.key, 'aria-describedby': `${id}-meta ${id}-err` }, h('option', { value: '', text: 'Select a code' }), ...f.codes.map((c) => h('option', { value: String(c), text: `Code ${c}` })));
    } else {
      control = h('input', { id, name: f.key, type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': `${id}-meta ${id}-err` });
    }
    const chips = f.kind === 'continuous' ? h('div', { class: 'chips', role: 'group', 'aria-label': `${f.name}: dataset values` },
      ...f.dataset.map((d) => h('button', { type: 'button', class: 'chip', 'data-set': f.key, 'data-value': String(d), 'aria-pressed': 'false', disabled: (d < f.min || d > f.max) ? true : null, title: (d < f.min || d > f.max) ? 'Dataset value outside the supported input range' : null, text: String(d) }))) : null;
    const meta = h('div', { class: 'field-meta', id: `${id}-meta` },
      f.kind === 'category' ? h('span', { class: 'range', text: `Categorical code: ${f.codes.join(', ')}` }) : h('span', { class: 'range', text: `Supported ${f.min}–${f.max}${f.unit !== '–' && f.unit !== 'fraction' ? ' ' + f.unit : ''} · dataset values:` }),
      chips,
      h('details', { class: 'help' }, h('summary', { text: 'About this input' }), h('p', { text: f.help }), f.note ? h('p', { text: f.note }) : null));
    fieldsHost.append(h('div', { class: 'field', 'data-field': f.key },
      h('span', { class: 'field-n', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') }),
      h('label', { class: 'field-label', for: id }, f.name, ' ', h('span', { class: 'unit', text: f.unit === '–' ? '(dimensionless)' : f.unit === 'code' ? '(code)' : f.unit === 'fraction' ? '(fraction)' : `(${f.unit})` })),
      h('div', { class: 'field-control' }, control),
      meta,
      h('p', { class: 'field-error', id: `${id}-err`, hidden: true })));
  });
}
function readForm() { return Object.fromEntries(KEYS.map((k) => [k, $(`#in-${k}`).value])); }
function writeForm(inputs) {
  KEYS.forEach((k) => { $(`#in-${k}`).value = inputs[k] === undefined || inputs[k] === null ? '' : String(inputs[k]); });
  syncChips(); clearErrors(); markStale();
}
function syncChips() {
  $$('.chip[data-set]').forEach((c) => c.setAttribute('aria-pressed', String($(`#in-${c.dataset.set}`).value.trim() !== '' && Number($(`#in-${c.dataset.set}`).value) === Number(c.dataset.value))));
}
function clearErrors() { $$('[data-field]').forEach((f) => { f.classList.remove('has-error'); const e = $('.field-error', f); e.hidden = true; e.textContent = ''; $('input,select', f).removeAttribute('aria-invalid'); }); }
function showErrors(errors) {
  clearErrors();
  for (const [k, msg] of Object.entries(errors)) {
    const f = $(`[data-field="${k}"]`); f.classList.add('has-error');
    const e = $('.field-error', f); e.hidden = false; e.textContent = msg;
    $('input,select', f).setAttribute('aria-invalid', 'true');
  }
}
function setFormStatus(msg, isErr = false) { const s = $('[data-form-status]'); s.textContent = msg; s.classList.toggle('is-error', isErr); }

function markStale() {
  if (!current.result) return;
  const same = current.inputs && KEYS.every((k) => String(readForm()[k]).trim() === String(current.inputs[k]));
  current.stale = !same;
  $('.results').classList.toggle('is-stale', current.stale);
  $('[data-result-state]').textContent = current.stale ? 'Inputs have changed since this estimate. Press Predict loads to update it.' : 'Estimate for the inputs shown.';
  $('[data-save-row]').hidden = current.stale;
}

function showResult(r) {
  $('[data-out-heating]').textContent = r.heatingText;
  $('[data-out-cooling]').textContent = r.coolingText;
  const clipMsg = (raw, lo, hi, txt) => `Clipped: the model’s value ${raw.toFixed(2)} is outside the ${lo.toFixed(1)}–${hi.toFixed(1)} output limits of the original application, so ${txt} is shown.`;
  const ch = $('[data-clip-heating]'); ch.hidden = !r.heatingClipped; if (r.heatingClipped) ch.textContent = clipMsg(r.heatingRaw, ...M.CLIP.heating, r.heatingText);
  const cc = $('[data-clip-cooling]'); cc.hidden = !r.coolingClipped; if (r.coolingClipped) cc.textContent = clipMsg(r.coolingRaw, ...M.CLIP.cooling, r.coolingText);
}
function resetResult() {
  current = { inputs: null, values: null, result: null, stale: false };
  $('[data-out-heating]').textContent = '—'; $('[data-out-cooling]').textContent = '—';
  $('[data-clip-heating]').hidden = true; $('[data-clip-cooling]').hidden = true;
  $('[data-result-state]').textContent = 'No prediction yet.';
  $('.results').classList.remove('is-stale');
  $('[data-feasibility]').replaceChildren();
  $('[data-save-row]').hidden = true;
}
function renderFeasibility(values, host) {
  host.replaceChildren(...feasibility(values).map((n) => h('li', { class: n.level, text: n.text })));
}
function liveSchematic() {
  const inputs = readForm();
  const vals = KEYS.map((k) => { const r = parseField(byKey[k], inputs[k]); return r.ok ? r.value : NaN; });
  const need = [2, 3, 4, 6].every((i) => Number.isFinite(vals[i]));
  const host = $('[data-schematic]');
  if (need) drawBuilding(host, vals); else host.replaceChildren(h('p', { class: 'muted small', text: 'Enter wall area, roof area, height and glazing area to draw the schematic.' }));
}

form.addEventListener('input', () => { syncChips(); markStale(); liveSchematic(); });
form.addEventListener('change', () => { markStale(); liveSchematic(); });
fieldsHost.addEventListener('click', (e) => {
  const c = e.target.closest('.chip[data-set]'); if (!c) return;
  $(`#in-${c.dataset.set}`).value = c.dataset.value;
  syncChips(); markStale(); liveSchematic();
});
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const inputs = readForm();
  const v = validate(inputs);
  if (!v.ok) {
    showErrors(v.errors);
    setFormStatus(`Fix ${Object.keys(v.errors).length} input${Object.keys(v.errors).length > 1 ? 's' : ''} before predicting. Values are never adjusted automatically.`, true);
    $(`#in-${Object.keys(v.errors)[0]}`).focus();
    return;
  }
  clearErrors();
  if (!M.isReady()) { setFormStatus('Please wait for the model to finish loading.', true); return; }
  setFormStatus('Running the model…');
  $('[data-predict]').disabled = true;
  try {
    const r = await M.predict(v.values);
    current = { inputs: Object.fromEntries(KEYS.map((k) => [k, String(inputs[k]).trim()])), values: v.values, result: r, stale: false, at: stamp() };
    showResult(r);
    renderFeasibility(v.values, $('[data-feasibility]'));
    markStale();
    setFormStatus(`Prediction complete · heating ${r.heatingText}, cooling ${r.coolingText} ${UNIT.replace('*', '')}${r.heatingClipped || r.coolingClipped ? ' (clipped; see note)' : ''}.`);
    $('#scenario-name').value = $('#scenario-name').value || suggestName(v.values);
    if (matchMedia('(max-width: 1080px)').matches) {
      $('.results').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  } catch (err) {
    setFormStatus('Prediction error: ' + err.message, true);
  } finally {
    $('[data-predict]').disabled = !M.isReady();
  }
});
$('[data-example]').addEventListener('click', () => { writeForm(DEFAULT_INPUTS); resetResult(); liveSchematic(); setFormStatus('Example loaded (dataset building form 5). Press Predict loads.'); });
$('[data-reset]').addEventListener('click', () => { writeForm(Object.fromEntries(KEYS.map((k) => [k, '']))); resetResult(); liveSchematic(); setFormStatus('Inputs cleared.'); $('#in-rc').focus(); });
const suggestName = (v) => `RC ${v[0]} · H ${v[4]} m · glazing ${v[6]} / code ${v[7]} · orientation ${v[5]}`;

/* ================================================================== scenarios */
$('[data-save-scenario]').addEventListener('click', () => {
  const st = $('[data-save-status]');
  if (!current.result || current.stale) { st.textContent = 'Predict the current inputs first.'; return; }
  try {
    if (editingId) {
      Store.updateScenario(editingId, { name: $('#scenario-name').value, inputs: valuesToInputs(current.values), result: current.result });
      st.textContent = 'Scenario updated.'; editingId = null; $('[data-save-scenario]').textContent = 'Save scenario';
    } else {
      const s = Store.addScenario($('#scenario-name').value, valuesToInputs(current.values), current.result);
      st.textContent = `Saved “${s.name}”.`;
    }
    $('#scenario-name').value = '';
    scenarioResults.clear();
    refreshScenarioResults();
  } catch (err) { st.textContent = err.message; }
});

const scenarioResults = new Map();   // id -> result, always recomputed by the model (stored/imported numbers are not trusted)
async function refreshScenarioResults() {
  const { scenarios } = Store.get();
  if (!M.isReady()) { renderCompare(); return; }
  for (const s of scenarios) {
    if (scenarioResults.has(s.id)) continue;
    try { scenarioResults.set(s.id, await M.predict(inputsToValues(s.inputs))); } catch (err) { scenarioResults.set(s.id, { error: err.message }); }
  }
  for (const id of [...scenarioResults.keys()]) if (!scenarios.some((s) => s.id === id)) scenarioResults.delete(id);
  renderCompare();
}

let editingId = null;
function renderCompare() {
  const p = Store.get();
  $('[data-scenario-count]').textContent = p.scenarios.length ? String(p.scenarios.length) : '';
  $('[data-storage-note]').textContent = Store.isPersistent()
    ? 'Scenarios are stored only in this browser (local storage) on this device. They are not uploaded anywhere. Export a project file to keep a copy or move it to another device.'
    : 'This browser does not allow local storage, so scenarios last only until you close the page. Export a project file to keep them.';
  const list = $('[data-scenario-list]');
  if (!p.scenarios.length) {
    list.replaceChildren(h('p', { class: 'muted', text: 'No scenarios yet. Run a prediction on the Predict tab and use “Save scenario”.' }));
    $('[data-compare-panel]').hidden = true;
    return;
  }
  const rows = p.scenarios.map((s) => {
    const r = scenarioResults.get(s.id);
    const inCmp = p.compare.includes(s.id);
    return h('tr', {},
      h('td', { 'data-label': 'Baseline' }, h('input', { type: 'radio', name: 'baseline', 'aria-label': `Use ${s.name} as baseline`, checked: p.baselineId === s.id, onchange: () => { Store.setBaseline(s.id); renderCompare(); } })),
      h('td', { 'data-label': 'Compare' }, h('input', { type: 'checkbox', 'aria-label': `Compare ${s.name}`, checked: inCmp, disabled: !inCmp && p.compare.length >= 4, onchange: (e) => { Store.setCompare(e.target.checked ? [...p.compare, s.id] : p.compare.filter((x) => x !== s.id)); renderCompare(); } })),
      h('td', {}, h('span', { class: 'scn-name', text: s.name }), p.baselineId === s.id ? h('span', { class: 'tag tag-base', text: 'baseline' }) : null, ' ',
        h('div', { class: 'small muted', text: KEYS.map((k) => s.inputs[k]).join(' · ') }),
        h('div', { class: 'scn-actions' },
          h('button', { type: 'button', class: 'btn btn-small', text: 'Edit', 'aria-label': `Edit ${s.name} in Predict`, onclick: () => editScenario(s.id) }),
          h('button', { type: 'button', class: 'btn btn-small', text: 'Duplicate', 'aria-label': `Duplicate ${s.name}`, onclick: () => { try { Store.duplicateScenario(s.id); refreshScenarioResults(); } catch (err) { $('[data-compare-status]').textContent = err.message; } } }),
          h('button', { type: 'button', class: 'btn btn-small', text: 'Rename', 'aria-label': `Rename ${s.name}`, onclick: () => renameScenario(s) }),
          h('button', { type: 'button', class: 'btn btn-small btn-danger', text: 'Delete', 'aria-label': `Delete ${s.name}`, onclick: () => { if (confirmAction(`Delete “${s.name}”?`)) { Store.deleteScenario(s.id); scenarioResults.delete(s.id); renderCompare(); } } }))),
      h('td', { class: 'num', 'data-label': 'Heating' }, r ? (r.error ? h('span', { class: 'tag tag-clip', text: 'error' }) : [r.heatingText, r.heatingClipped ? h('span', { class: 'tag tag-clip', text: 'clipped' }) : null]) : '…'),
      h('td', { class: 'num', 'data-label': 'Cooling' }, r ? (r.error ? '' : [r.coolingText, r.coolingClipped ? h('span', { class: 'tag tag-clip', text: 'clipped' }) : null]) : '…'),
    );
  });
  list.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'data scn-table' },
    h('thead', {}, h('tr', {}, h('th', { text: 'Base' }), h('th', { text: 'Compare' }), h('th', { text: 'Scenario · inputs in model order' }), h('th', { class: 'num', text: 'Heating' }), h('th', { class: 'num', text: 'Cooling' }))),
    h('tbody', {}, rows))));
  renderComparison();
}
function confirmAction(msg) { return window.confirm(msg); }
function renameScenario(s) {
  const name = window.prompt('New name for this scenario', s.name);
  if (name === null) return;
  Store.updateScenario(s.id, { name }); renderCompare();
}
function editScenario(id) {
  const s = Store.get().scenarios.find((x) => x.id === id); if (!s) return;
  writeForm(s.inputs); resetResult(); liveSchematic();
  editingId = id; $('#scenario-name').value = s.name; $('[data-save-scenario]').textContent = 'Update scenario';
  setFormStatus(`Editing “${s.name}”. Change inputs, press Predict loads, then Update scenario.`);
  location.hash = '#predict';
}

function comparisonData() {
  const p = Store.get();
  const ids = p.compare.filter((id) => scenarioResults.get(id) && !scenarioResults.get(id).error);
  const base = p.scenarios.find((s) => s.id === p.baselineId);
  const baseR = base && scenarioResults.get(base.id);
  const cols = ids.map((id) => { const s = p.scenarios.find((x) => x.id === id); return { s, r: scenarioResults.get(id) }; });
  return { cols, base, baseR: baseR && !baseR.error ? baseR : null };
}
function renderComparison() {
  const { cols, base, baseR } = comparisonData();
  const panel = $('[data-compare-panel]');
  panel.hidden = cols.length === 0;
  if (!cols.length) return;
  $('[data-compare-sub]').textContent = base ? `Differences relative to the baseline “${base.name}”. Differences in model estimates, not verified real-world energy savings.` : 'Select a baseline to see differences.';
  const max = Math.max(...cols.flatMap((c) => [c.r.heating, c.r.cooling]));
  const bars = (key, color, label) => h('div', { class: 'cbar-group' }, h('h3', { text: `${label} (${UNIT.replace('*', '')})` }),
    ...cols.map((c) => h('div', { class: 'cbar' }, h('span', { class: 'cbar-name', title: c.s.name, text: c.s.name }),
      h('span', { class: 'cbar-track' }, h('span', { class: 'cbar-fill', style: `width:${(c.r[key] / max) * 100}%;background:${color}` })),
      h('span', { class: 'cbar-val', text: c.r[key + 'Text'] }))));
  $('[data-compare-bars]').replaceChildren(bars('heating', COLORS.heating, 'Heating'), bars('cooling', COLORS.cooling, 'Cooling'));
  const head = h('tr', {}, h('th', { text: '' }), ...cols.map((c) => h('th', { class: 'num' }, c.s.name, c.s.id === base?.id ? h('div', {}, h('span', { class: 'tag tag-base', text: 'baseline' })) : null)));
  const rows = FEATURES.map((f, i) => h('tr', {}, h('th', { text: `${i + 1}. ${f.name}` }), ...cols.map((c) => h('td', { class: 'num', text: String(c.s.inputs[f.key]) }))));
  const res = (key, label) => h('tr', { class: key === 'heating' ? 'sep' : '' }, h('th', { text: `${label} (${UNIT})` }), ...cols.map((c) => h('td', { class: 'num' }, c.r[key + 'Text'], c.r[key + 'Clipped'] ? h('span', { class: 'tag tag-clip', text: 'clipped' }) : null)));
  const diff = (key, label, pct) => h('tr', {}, h('th', { text: label }), ...cols.map((c) => {
    if (!baseR) return h('td', { class: 'num', text: '–' });
    const d = difference(c.r[key], baseR[key]);
    const v = pct ? d.pct : d.abs;
    if (v === null) return h('td', { class: 'num', text: 'n/a (baseline is 0)' });
    const txt = (v > 0 ? '+' : '') + v.toFixed(pct ? 1 : 2) + (pct ? ' %' : '');
    return h('td', { class: 'num ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : ''), text: txt });
  }));
  $('[data-compare-table]').replaceChildren(h('thead', {}, head), h('tbody', {}, rows,
    res('heating', 'Heating load'), res('cooling', 'Cooling load'),
    diff('heating', 'Δ heating vs baseline', false), diff('heating', 'Δ heating vs baseline (%)', true),
    diff('cooling', 'Δ cooling vs baseline', false), diff('cooling', 'Δ cooling vs baseline (%)', true)));
}

/* ---- exports / imports */
function download(name, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function meta() { return { generator: 'Building Energy Prediction', model: M.MODEL_ID, backend: M.snapshot().backend, tfjs: M.snapshot().tfjs, unitNote: 'Unit as stated by the original project (kWh/m²); unit and time basis are not stated in the dataset documentation.' }; }
$('[data-export-scen-csv]').addEventListener('click', () => {
  const p = Store.get(); const st = $('[data-compare-status]');
  if (!p.scenarios.length) { st.textContent = 'There are no scenarios to export.'; return; }
  const base = scenarioResults.get(p.baselineId);
  const rows = [['scenario', 'baseline', ...FEATURES.map((f) => `${f.name}${f.unit === 'm²' || f.unit === 'm' ? ` (${f.unit})` : ''}`), 'heating_load', 'heating_clipped', 'heating_raw', 'cooling_load', 'cooling_clipped', 'cooling_raw', 'delta_heating', 'delta_heating_pct', 'delta_cooling', 'delta_cooling_pct']];
  for (const s of p.scenarios) {
    const r = scenarioResults.get(s.id);
    if (!r || r.error) continue;
    const dh = base && !base.error ? difference(r.heating, base.heating) : null; const dc = base && !base.error ? difference(r.cooling, base.cooling) : null;
    rows.push([s.name, s.id === p.baselineId ? 'yes' : '', ...KEYS.map((k) => s.inputs[k]), r.heatingText, r.heatingClipped, r.heatingRaw, r.coolingText, r.coolingClipped, r.coolingRaw,
      dh ? dh.abs.toFixed(2) : '', dh && dh.pct !== null ? dh.pct.toFixed(2) : '', dc ? dc.abs.toFixed(2) : '', dc && dc.pct !== null ? dc.pct.toFixed(2) : '']);
  }
  const m = meta();
  rows.push([], ['# exported', stamp()], ['# model', m.model], ['# backend', `${m.backend} (TensorFlow.js ${m.tfjs})`], ['# units', m.unitNote], ['# note', 'Differences are differences in model estimates, not verified energy savings. Clipped values are shown at the clip limit.']);
  download(`scenarios-${fileStamp()}.csv`, 'text/csv;charset=utf-8', '﻿' + toCsv(rows));
  st.textContent = `Exported ${p.scenarios.length} scenario(s) to CSV.`;
});
const exportJson = (st) => () => {
  const obj = Store.exportProject(meta());
  obj.scenarios = obj.scenarios.map((s) => ({ ...s, result: scenarioResults.get(s.id) && !scenarioResults.get(s.id).error ? (({ heating, cooling, heatingRaw, coolingRaw, heatingClipped, coolingClipped }) => ({ heating, cooling, heatingRaw, coolingRaw, heatingClipped, coolingClipped }))(scenarioResults.get(s.id)) : null }));
  obj.lastSweep = lastSweep ? sweepExportObject() : null;
  download(`energy-studio-project-${fileStamp()}.json`, 'application/json', JSON.stringify(obj, null, 2));
  st.textContent = `Exported a project file with ${obj.scenarios.length} scenario(s).`;
};
$('[data-export-json]').addEventListener('click', exportJson($('[data-compare-status]')));
$('[data-export-json-2]').addEventListener('click', exportJson($('[data-compare-status]')));
$('[data-import-json]').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  const st = $('[data-compare-status]');
  if (!file) return;
  if (file.size > 1_000_000) { st.textContent = 'That file is larger than 1 MB, so it was not imported.'; return; }
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { st.textContent = 'That file is not valid JSON. Nothing was imported.'; return; }
  const r = Store.parseProject(obj);
  if (!r.ok) { st.textContent = 'Import refused: ' + r.errors.slice(0, 3).join(' ') + (r.errors.length > 3 ? ` (+${r.errors.length - 3} more)` : ''); return; }
  if (Store.get().scenarios.length && !confirmAction(`Replace your ${Store.get().scenarios.length} current scenario(s) with ${r.project.scenarios.length} from the file?`)) { st.textContent = 'Import cancelled.'; return; }
  Store.replaceProject(r.project); scenarioResults.clear();
  st.textContent = `Imported ${r.project.scenarios.length} scenario(s). Their loads were recalculated with the model; numbers stored in the file are not used.`;
  refreshScenarioResults();
});
$('[data-delete-all]').addEventListener('click', () => {
  const n = Store.get().scenarios.length;
  if (!n) { $('[data-compare-status]').textContent = 'There is nothing to delete.'; return; }
  if (!confirmAction(`Delete all ${n} scenario(s) from this browser? Export a project file first if you want to keep them.`)) return;
  Store.clearAll(); scenarioResults.clear(); renderCompare();
  $('[data-compare-status]').textContent = 'All scenarios were deleted from this browser.';
});

/* ================================================================== explorer */
const LIMIT_1D = 200; const LIMIT_2D = 2500;
let sweepRunning = false; let sweepCancel = false; let lastSweep = null;
function axisBox(which) {
  const host = $(`[data-axis="${which}"]`);
  const sel = h('select', { 'data-var': which, 'aria-label': `${which === 'x' ? 'First' : 'Second'} variable` }, ...FEATURES.map((f, i) => h('option', { value: f.key, text: `${i + 1}. ${f.name}` })));
  sel.value = which === 'x' ? 'ga' : 'or';
  const body = h('div', { 'data-axis-body': which });
  host.replaceChildren(h('div', { class: 'axis-box' }, h('h3', { text: which === 'x' ? 'Variable' : 'Second variable' }), sel, body));
  sel.addEventListener('change', () => { axisBody(which); updateSweepCount(); });
  body.addEventListener('input', updateSweepCount);
  body.addEventListener('change', updateSweepCount);
  axisBody(which);
}
function axisBody(which) {
  const f = byKey[$(`[data-var="${which}"]`).value];
  const body = $(`[data-axis-body="${which}"]`);
  if (f.kind === 'category') {
    body.replaceChildren(h('div', { class: 'codes', role: 'group', 'aria-label': 'Codes to test' }, ...f.codes.map((c) => h('label', {}, h('input', { type: 'checkbox', value: String(c), checked: true, 'data-code': which }), `Code ${c}`))),
      h('p', { class: 'small muted', text: 'Categorical codes are tested one by one; they are not treated as a continuous scale.' }));
  } else {
    body.replaceChildren(h('div', { class: 'row3' },
      h('label', {}, 'From', h('input', { type: 'text', inputmode: 'decimal', value: String(f.min), 'data-from': which })),
      h('label', {}, 'To', h('input', { type: 'text', inputmode: 'decimal', value: String(f.max), 'data-to': which })),
      h('label', {}, 'Points', h('input', { type: 'text', inputmode: 'numeric', value: which === 'x' ? '21' : '11', 'data-n': which }))),
    h('label', { class: 'small check-inline' }, h('input', { type: 'checkbox', 'data-dsvals': which }), ' Use only the dataset values (', f.dataset.filter((d) => d >= f.min && d <= f.max).join(', '), ')'));
  }
}
function axisValues(which) {
  const f = byKey[$(`[data-var="${which}"]`).value];
  if (f.kind === 'category') {
    const vals = $$(`[data-code="${which}"]:checked`).map((c) => Number(c.value));
    return vals.length ? { f, vals } : { f, error: `Choose at least one ${f.name.toLowerCase()} code.` };
  }
  if ($(`[data-dsvals="${which}"]`).checked) return { f, vals: f.dataset.filter((d) => d >= f.min && d <= f.max) };
  const a = parseField(f, $(`[data-from="${which}"]`).value); const b = parseField(f, $(`[data-to="${which}"]`).value);
  const nRaw = $(`[data-n="${which}"]`).value.trim(); const n = Number(nRaw);
  if (!a.ok) return { f, error: `${f.name} “From”: ${a.error}` };
  if (!b.ok) return { f, error: `${f.name} “To”: ${b.error}` };
  if (!/^\d+$/.test(nRaw) || n < 2 || n > LIMIT_1D) return { f, error: `${f.name}: points must be a whole number from 2 to ${LIMIT_1D}.` };
  if (a.value >= b.value) return { f, error: `${f.name}: “From” must be smaller than “To”.` };
  const vals = Array.from({ length: n }, (_, i) => +(a.value + ((b.value - a.value) * i) / (n - 1)).toPrecision(12));
  return { f, vals };
}
const sweepMode = () => Number($('[name="mode"]:checked').value);
function updateSweepCount() {
  const out = $('[data-sweep-count]');
  const x = axisValues('x');
  if (x.error) { out.textContent = x.error; return null; }
  if (sweepMode() === 1) { out.textContent = `${x.vals.length} model evaluations (limit ${LIMIT_1D}).`; return { x }; }
  const y = axisValues('y');
  if (y.error) { out.textContent = y.error; return null; }
  if (y.f.key === x.f.key) { out.textContent = 'Choose two different variables.'; return null; }
  const n = x.vals.length * y.vals.length;
  out.textContent = `${x.vals.length} × ${y.vals.length} = ${n} model evaluations${n > LIMIT_2D ? ` — above the limit of ${LIMIT_2D}; reduce the number of points.` : ` (limit ${LIMIT_2D}).`}`;
  return n > LIMIT_2D ? null : { x, y };
}
$$('[name="mode"]').forEach((r) => r.addEventListener('change', () => { $('[data-axis="y"]').hidden = sweepMode() === 1; updateSweepCount(); }));
function baseValues() {
  const v = validate(current.inputs && !current.stale ? current.inputs : readForm());
  return v;
}
function renderBaseSummary() {
  const v = baseValues(); const host = $('[data-base-summary]');
  if (!v.ok) { host.replaceChildren(h('strong', { text: 'Base inputs: ' }), 'the Predict form has missing or invalid inputs. ', h('a', { href: '#predict', text: 'Complete them first.' })); return; }
  host.replaceChildren(h('strong', { text: 'Base inputs (from Predict): ' }), FEATURES.map((f, i) => `${f.name} ${v.values[i]}`).join(' · '));
}
$('[data-sweep-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sweepRunning) return;
  const spec = updateSweepCount();
  const base = baseValues();
  if (!base.ok) { renderBaseSummary(); $('[data-sweep-count]').textContent = 'The Predict inputs are incomplete or invalid; they are needed as the base for the sweep.'; return; }
  if (!spec) return;
  const xi = KEYS.indexOf(spec.x.f.key); const yi = spec.y ? KEYS.indexOf(spec.y.f.key) : -1;
  const rows = []; const coords = [];
  if (!spec.y) spec.x.vals.forEach((xv, i) => { const r = [...base.values]; r[xi] = xv; rows.push(r); coords.push([i]); });
  else spec.x.vals.forEach((xv, i) => spec.y.vals.forEach((yv, j) => { const r = [...base.values]; r[xi] = xv; r[yi] = yv; rows.push(r); coords.push([i, j]); }));
  sweepRunning = true; sweepCancel = false;
  const prog = $('[data-sweep-progress]'); prog.hidden = false;
  const bar = $('.progress-bar span', prog); const msg = $('p', prog);
  $('[data-sweep-cancel]').hidden = false; $('[data-sweep-run]').disabled = true;
  const t0 = performance.now();
  try {
    const { results, cancelled } = await M.predictMany(rows, {
      onProgress: (d, n) => { bar.style.width = `${(d / n) * 100}%`; msg.textContent = `${d} of ${n} evaluated…`; },
      shouldStop: () => sweepCancel,
    });
    if (cancelled) { msg.textContent = `Cancelled after ${results.length} of ${rows.length} evaluations. Partial results are not shown.`; return; }
    msg.textContent = `${rows.length} evaluations in ${((performance.now() - t0) / 1000).toFixed(1)} s (${M.snapshot().batchSafe ? 'batched, verified identical to single predictions' : 'one at a time'}).`;
    lastSweep = { spec, base: base.values, rows, results, coords, at: stamp(), backend: M.snapshot().backend };
    renderSweep();
  } catch (err) {
    msg.textContent = 'The sweep stopped with an error: ' + err.message;
  } finally {
    sweepRunning = false; $('[data-sweep-cancel]').hidden = true; $('[data-sweep-run]').disabled = !M.isReady();
  }
});
$('[data-sweep-cancel]').addEventListener('click', () => { sweepCancel = true; });

function sweepWarnings(sw) {
  const keys = [sw.spec.x.f.key, sw.spec.y?.f.key].filter(Boolean);
  const out = [{ level: 'info', text: 'Each tested combination is a model estimate. Inputs that are each within range can still form a building unlike any in the training data.' }];
  const geom = ['rc', 'sa', 'wa', 'ra', 'h'];
  if (keys.some((k) => geom.includes(k))) out.push({ level: 'warn', text: 'This sweep changes building geometry while the other geometric inputs stay fixed. Most tested points are therefore not one of the 12 dataset building forms, and many break the relation surface area = wall area + 2 × roof area.' });
  if (keys.includes('ga') || keys.includes('gd')) out.push({ level: 'info', text: 'In the dataset, glazing area 0 occurs only with distribution code 0, and code 0 only with no glazing. Points mixing them are outside the training data.' });
  const nInconsistent = sw.rows.filter((r) => feasibility(r).some((n) => n.level === 'warn')).length;
  out.push({ level: nInconsistent ? 'warn' : 'ok', text: `${nInconsistent} of ${sw.rows.length} tested points trigger at least one consistency warning.` });
  const nClip = sw.results.filter((r) => r.heatingClipped || r.coolingClipped).length;
  if (nClip) out.push({ level: 'warn', text: `${nClip} point(s) were clipped to the output limits; they are drawn as open markers or with a diagonal stroke.` });
  return out;
}
function renderSweep() {
  const sw = lastSweep; if (!sw) return;
  $('[data-sweep-empty]').hidden = true; $('[data-sweep-out]').hidden = false;
  const fx = sw.spec.x.f; const fy = sw.spec.y?.f;
  const label = (f) => `${f.name}${f.unit === 'm²' || f.unit === 'm' ? ` (${f.unit})` : f.kind === 'category' ? ' (code)' : ''}`;
  $('[data-sweep-title]').textContent = fy ? `${fx.name} × ${fy.name}` : `Varying ${fx.name.toLowerCase()}`;
  $('[data-sweep-warnings]').replaceChildren(...sweepWarnings(sw).map((n) => h('li', { class: n.level, text: n.text })));
  const minIdx = (k) => sw.results.reduce((bi, r, i) => (r[k] < sw.results[bi][k] ? i : bi), 0);
  const bh = minIdx('heating'); const bc = minIdx('cooling');
  const xiKey = KEYS.indexOf(fx.key);
  if (!fy) {
    const pts = (k) => sw.results.map((r, i) => ({ x: sw.spec.x.vals[i], y: r[k], clipped: r[k + 'Clipped'], label: `${esc(fx.name)} ${sw.spec.x.vals[i]}` }));
    const common = { xLabel: label(fx), categorical: fx.kind === 'category', current: sw.base[xiKey] };
    lineChart($('[data-chart-heat]'), { ...common, points: pts('heating'), color: COLORS.heating, yLabel: `Heating (${UNIT.replace('*', '')})`, yShort: 'Heating', best: bh, ariaLabel: `Heating load estimate against ${fx.name}` });
    lineChart($('[data-chart-cool]'), { ...common, points: pts('cooling'), color: COLORS.cooling, yLabel: `Cooling (${UNIT.replace('*', '')})`, yShort: 'Cooling', best: bc, ariaLabel: `Cooling load estimate against ${fx.name}` });
  } else {
    const nx = sw.spec.x.vals.length; const ny = sw.spec.y.vals.length;
    const at = (i, j) => sw.results[i * ny + j];
    const pos = (idx) => ({ xi: Math.floor(idx / ny), yi: idx % ny });
    const anyClip = sw.results.some((r) => r.heatingClipped || r.coolingClipped);
    heatmap($('[data-chart-heat]'), { xs: sw.spec.x.vals, ys: sw.spec.y.vals, xLabel: label(fx), yLabel: label(fy), color: COLORS.heating, yShort: 'Heating', values: (i, j) => ({ v: at(i, j).heating, clipped: at(i, j).heatingClipped }), best: pos(bh), anyClipped: anyClip, ariaLabel: `Heating load estimate heatmap, ${fx.name} by ${fy.name}` });
    heatmap($('[data-chart-cool]'), { xs: sw.spec.x.vals, ys: sw.spec.y.vals, xLabel: label(fx), yLabel: label(fy), color: COLORS.cooling, yShort: 'Cooling', values: (i, j) => ({ v: at(i, j).cooling, clipped: at(i, j).coolingClipped }), best: pos(bc), anyClipped: anyClip, ariaLabel: `Cooling load estimate heatmap, ${fx.name} by ${fy.name}` });
  }
  const bestCard = (k, idx, title) => {
    const r = sw.results[idx]; const row = sw.rows[idx];
    return h('div', { class: 'best-card' }, h('h3', { text: title }),
      h('p', {}, h('strong', { text: `${r[k + 'Text']} ${UNIT.replace('*', '')}` }), r[k + 'Clipped'] ? ' (clipped)' : '', ` at ${fx.name.toLowerCase()} ${row[xiKey]}`, fy ? `, ${fy.name.toLowerCase()} ${row[KEYS.indexOf(fy.key)]}` : ''),
      h('p', { class: 'small muted', text: 'Best among the tested scenarios only — not a globally optimal building.' }),
      h('button', { type: 'button', class: 'btn btn-small', text: 'Open in Predict', onclick: () => { writeForm(valuesToInputs(row)); resetResult(); liveSchematic(); location.hash = '#predict'; setFormStatus('Inputs loaded from the sweep. Press Predict loads.'); } }));
  };
  $('[data-sweep-best]').replaceChildren(bestCard('heating', bh, 'Lowest heating estimate tested'), bestCard('cooling', bc, 'Lowest cooling estimate tested'));
  const head = h('tr', {}, h('th', { text: fx.name }), fy ? h('th', { text: fy.name }) : null, h('th', { class: 'num', text: 'Heating' }), h('th', { class: 'num', text: 'Cooling' }), h('th', { text: 'Flags' }));
  const body = sw.rows.map((row, i) => { const r = sw.results[i]; return h('tr', {}, h('td', { text: String(row[xiKey]) }), fy ? h('td', { text: String(row[KEYS.indexOf(fy.key)]) }) : null, h('td', { class: 'num', text: r.heatingText }), h('td', { class: 'num', text: r.coolingText }), h('td', { text: [r.heatingClipped ? 'heating clipped' : '', r.coolingClipped ? 'cooling clipped' : ''].filter(Boolean).join(', ') })); });
  $('[data-sweep-table]').replaceChildren(h('table', { class: 'data' }, h('thead', {}, head), h('tbody', {}, body)));
}
function sweepExportObject() {
  const sw = lastSweep;
  return { at: sw.at, backend: sw.backend, variables: [sw.spec.x.f.key, sw.spec.y?.f.key].filter(Boolean), base: valuesToInputs(sw.base),
    points: sw.rows.map((r, i) => ({ inputs: valuesToInputs(r), heating: sw.results[i].heating, cooling: sw.results[i].cooling, heatingRaw: sw.results[i].heatingRaw, coolingRaw: sw.results[i].coolingRaw, heatingClipped: sw.results[i].heatingClipped, coolingClipped: sw.results[i].coolingClipped })) };
}
$('[data-export-sweep]').addEventListener('click', () => {
  const sw = lastSweep; if (!sw) return;
  const rows = [[...FEATURES.map((f) => f.name), 'heating_load', 'heating_clipped', 'heating_raw', 'cooling_load', 'cooling_clipped', 'cooling_raw', 'consistency_warnings']];
  sw.rows.forEach((r, i) => { const x = sw.results[i]; rows.push([...r, x.heatingText, x.heatingClipped, x.heatingRaw, x.coolingText, x.coolingClipped, x.coolingRaw, feasibility(r).filter((n) => n.level === 'warn').length]); });
  const m = meta();
  rows.push([], ['# exported', stamp()], ['# swept', [sw.spec.x.f.name, sw.spec.y?.f.name].filter(Boolean).join(' x ')], ['# model', m.model], ['# backend', `${sw.backend} (TensorFlow.js ${m.tfjs})`], ['# units', m.unitNote], ['# note', 'Model response under the specified input changes; not causal effects or validated sensitivities.']);
  download(`sweep-${fileStamp()}.csv`, 'text/csv;charset=utf-8', '﻿' + toCsv(rows));
});

/* ================================================================== report */
function renderReport() {
  const host = $('[data-report]');
  const inc = (k) => $(`[data-rep="${k}"]`).checked;
  const s = M.snapshot();
  const parts = [h('div', { class: 'rep-head' },
    h('div', {}, h('p', { class: 'rep-title', text: 'Building Energy Prediction — report' }), h('p', { class: 'small', text: 'Model estimates of heating and cooling load. Developed by Derrick Mirindi.' })),
    h('div', { class: 'rep-meta' }, h('div', { text: `Generated ${new Date().toLocaleString()}` }), h('div', { text: `Model: ${M.MODEL_ID}` }), h('div', { text: `Runtime: TensorFlow.js ${s.tfjs || '–'}, ${s.backend || '–'} backend` })))];
  if (inc('predict')) {
    parts.push(h('h2', { text: 'Current prediction' }));
    if (!current.result || current.stale) parts.push(h('p', { class: 'rep-empty', text: 'No up-to-date prediction on the Predict tab.' }));
    else {
      parts.push(h('table', { class: 'data' }, h('tbody', {}, FEATURES.map((f, i) => h('tr', {}, h('th', { text: `${i + 1}. ${f.name}` }), h('td', { class: 'num', text: `${current.values[i]}${f.unit === 'm²' || f.unit === 'm' ? ' ' + f.unit : ''}` }))),
        h('tr', { class: 'sep' }, h('th', { text: `Heating load (${UNIT})` }), h('td', { class: 'num', text: current.result.heatingText + (current.result.heatingClipped ? ` (clipped; model value ${current.result.heatingRaw.toFixed(2)})` : '') })),
        h('tr', {}, h('th', { text: `Cooling load (${UNIT})` }), h('td', { class: 'num', text: current.result.coolingText + (current.result.coolingClipped ? ` (clipped; model value ${current.result.coolingRaw.toFixed(2)})` : '') })))));
      parts.push(h('ul', { class: 'plain small' }, feasibility(current.values).map((n) => h('li', { text: n.text }))));
    }
  }
  if (inc('compare')) {
    parts.push(h('h2', { text: 'Scenario comparison' }));
    const { cols, base, baseR } = comparisonData();
    if (!cols.length) parts.push(h('p', { class: 'rep-empty', text: 'No scenarios selected for comparison.' }));
    else {
      const tbl = $('[data-compare-table]').cloneNode(true);
      tbl.removeAttribute('data-compare-table');
      parts.push(h('p', { class: 'small', text: base && baseR ? `Baseline: ${base.name}. Differences are differences in model estimates, not verified energy savings.` : 'No baseline selected.' }), tbl);
    }
  }
  if (inc('sweep')) {
    parts.push(h('h2', { text: 'Parameter sweep' }));
    if (!lastSweep) parts.push(h('p', { class: 'rep-empty', text: 'No sweep has been run in this session.' }));
    else {
      const sw = lastSweep;
      parts.push(h('p', { class: 'small', text: `Model response under the specified input changes: ${[sw.spec.x.f.name, sw.spec.y?.f.name].filter(Boolean).join(' × ')}, ${sw.rows.length} evaluations, run ${new Date(sw.at).toLocaleString()}. Base inputs: ${FEATURES.map((f, i) => `${f.name} ${sw.base[i]}`).join(', ')}.` }));
      const charts = $('.chart-pair').cloneNode(true);
      $$('.chart-tip', charts).forEach((t) => t.remove());
      parts.push(charts, $('[data-sweep-best]').cloneNode(true));
      $$('button', parts[parts.length - 1]).forEach((b) => b.remove());
      parts.push(h('ul', { class: 'plain small' }, sweepWarnings(sw).map((n) => h('li', { text: n.text }))));
    }
  }
  if (inc('methods')) {
    parts.push(h('h2', { text: 'Model, assumptions and limitations' }),
      h('ul', { class: 'plain small' },
        h('li', { text: 'Model: fully connected neural network (8 → 256 → 128 → 64 → 2 with batch normalisation and ReLU), unchanged from the original application. Files verified by SHA-256 in the repository tests.' }),
        h('li', { text: 'Inputs are standardised with the stored scaler; outputs are inverse-transformed and clipped to 6.0–45.0 (heating) and 11.0–48.0 (cooling).' }),
        h('li', { text: 'Training data inputs match the UCI “Energy efficiency” dataset (Tsanas & Xifara 2012): simulated residential buildings in Athens, Greece, 12 building forms. The model receives no climate, material, HVAC or occupancy inputs.' }),
        h('li', { text: '* Units: kWh/m² as stated by the original project; the dataset documentation does not state the unit or time basis. Orientation and glazing-distribution code meanings are not documented in the dataset.' }),
        h('li', { text: 'Heating plus cooling is not a whole-building energy use intensity. No uncertainty intervals, accuracy figures, costs, carbon, code compliance or HVAC sizing are provided.' }),
        h('li', { text: 'This is not an EnergyPlus or physics-based simulation.' })));
  }
  host.replaceChildren(...parts);
}
$$('[data-rep]').forEach((c) => c.addEventListener('change', renderReport));
$('[data-print]').addEventListener('click', () => { renderReport(); window.print(); });
window.addEventListener('beforeprint', renderReport);

/* ================================================================== boot */
buildFields();
axisBox('x'); axisBox('y');
Store.load();
writeForm(DEFAULT_INPUTS);
resetResult();
liveSchematic();
route();
renderCompare();
start();
