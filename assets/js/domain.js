// Input definitions, validation and documented feasibility checks.
// Ranges are the ones enforced by the original form (main@81d5d9b). Dataset values come from the
// UCI "Energy efficiency" dataset (Tsanas & Xifara 2012, 768 simulated buildings, CC BY 4.0).

export const FEATURES = [
  { key: 'rc', name: 'Relative compactness', unit: '–', kind: 'continuous', min: 0.62, max: 0.98,
    dataset: [0.62, 0.64, 0.66, 0.69, 0.71, 0.74, 0.76, 0.79, 0.82, 0.86, 0.9, 0.98],
    help: 'Dimensionless shape factor. Each of the 12 dataset shapes has its own value.' },
  { key: 'sa', name: 'Surface area', unit: 'm²', kind: 'continuous', min: 514.5, max: 808.0,
    dataset: [514.5, 563.5, 588, 612.5, 637, 661.5, 686, 710.5, 735, 759.5, 784, 808.5],
    help: 'Total external surface area. In every dataset building it equals wall area + 2 × roof area.',
    note: 'The original form limits this to 808.0 m²; the dataset’s largest value is 808.5 m², so that shape cannot be entered. The limit is kept unchanged.' },
  { key: 'wa', name: 'Wall area', unit: 'm²', kind: 'continuous', min: 245.0, max: 416.5,
    dataset: [245, 269.5, 294, 318.5, 343, 367.5, 416.5], help: 'External wall area.' },
  { key: 'ra', name: 'Roof area', unit: 'm²', kind: 'continuous', min: 110.25, max: 220.5,
    dataset: [110.25, 122.5, 147, 220.5], help: 'Roof area.' },
  { key: 'h', name: 'Overall height', unit: 'm', kind: 'continuous', min: 3.5, max: 7.0,
    dataset: [3.5, 7.0], help: 'Only 3.5 m (one storey) and 7.0 m (two storeys) occur in the dataset; values in between are extrapolation.' },
  { key: 'or', name: 'Orientation', unit: 'code', kind: 'category', codes: [2, 3, 4, 5],
    help: 'Categorical code. The dataset documentation does not say which compass direction each code means; the earlier version of this site described 2–5 as North, East, South, West (unverified).' },
  { key: 'ga', name: 'Glazing area', unit: 'fraction', kind: 'continuous', min: 0.0, max: 0.4,
    dataset: [0, 0.1, 0.25, 0.4],
    help: 'Glazing as a fraction. The source paper defines it as a percentage of floor area (0, 10, 25, 40 %).' },
  { key: 'gd', name: 'Glazing area distribution', unit: 'code', kind: 'category', codes: [0, 1, 2, 3, 4, 5],
    help: 'Categorical code. The source paper describes no glazing, uniform glazing, and glazing concentrated on the north, east, south or west side, but does not document which code is which. In the dataset, code 0 always goes with glazing area 0.' },
];
export const KEYS = FEATURES.map((f) => f.key);
export const byKey = Object.fromEntries(FEATURES.map((f) => [f.key, f]));

// The 12 building forms of the dataset (verified against ENB2012_data.xlsx).
export const SHAPES = [
  [0.98, 514.5, 294.0, 110.25, 7.0], [0.90, 563.5, 318.5, 122.5, 7.0], [0.86, 588.0, 294.0, 147.0, 7.0],
  [0.82, 612.5, 318.5, 147.0, 7.0], [0.79, 637.0, 343.0, 147.0, 7.0], [0.76, 661.5, 416.5, 122.5, 7.0],
  [0.74, 686.0, 245.0, 220.5, 3.5], [0.71, 710.5, 269.5, 220.5, 3.5], [0.69, 735.0, 294.0, 220.5, 3.5],
  [0.66, 759.5, 318.5, 220.5, 3.5], [0.64, 784.0, 343.0, 220.5, 3.5], [0.62, 808.5, 367.5, 220.5, 3.5],
];

export const DEFAULT_INPUTS = { rc: 0.79, sa: 637.0, wa: 343.0, ra: 147.0, h: 7.0, or: 2, ga: 0.25, gd: 1 };

/** Parse one raw field. Never coerces an invalid value into a valid one. */
export function parseField(f, raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return { ok: false, error: 'Required.' };
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return { ok: false, error: 'Enter a number.' };
  const v = Number(s);
  if (!Number.isFinite(v)) return { ok: false, error: 'Enter a finite number.' };
  if (f.kind === 'category') {
    if (!f.codes.includes(v)) return { ok: false, error: `Choose one of ${f.codes.join(', ')}.` };
  } else if (v < f.min || v > f.max) {
    return { ok: false, error: `Outside the supported range ${f.min}–${f.max}${f.unit === '–' ? '' : ' ' + f.unit}.` };
  }
  return { ok: true, value: v };
}

/** Validate a full input object; returns {ok, values(model order), errors{key:msg}}. */
export function validate(inputs) {
  const errors = {}; const values = [];
  for (const f of FEATURES) {
    const r = parseField(f, inputs[f.key]);
    if (!r.ok) errors[f.key] = r.error; else values.push(r.value);
  }
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, values: ok ? values : null };
}

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

/** Documented-consistency notes. These are warnings: a passing check does not prove a design is in-distribution. */
export function feasibility(v) {
  const [rc, sa, wa, ra, h, , ga, gd] = v;
  const notes = [];
  const shapeIdx = SHAPES.findIndex((s) => near(s[0], rc) && near(s[1], sa) && near(s[2], wa) && near(s[3], ra) && near(s[4], h));
  if (shapeIdx >= 0) notes.push({ level: 'ok', text: `Geometry matches dataset building form ${shapeIdx + 1} of 12.` });
  else notes.push({ level: 'warn', text: 'This combination of compactness, areas and height is not one of the 12 building forms in the training data. Each value may be in range while the combination is not; treat the estimate as extrapolation.' });
  const diff = sa - (wa + 2 * ra);
  if (Math.abs(diff) > 0.5) notes.push({ level: 'warn', text: `Surface area differs from wall area + 2 × roof area by ${diff > 0 ? '+' : ''}${diff.toFixed(2)} m². In every dataset building these are equal.` });
  if (!byKey.h.dataset.some((d) => near(d, h))) notes.push({ level: 'warn', text: 'Overall height is between the two dataset values (3.5 m and 7.0 m).' });
  if (!byKey.ga.dataset.some((d) => near(d, ga))) notes.push({ level: 'info', text: 'Glazing area is between the dataset values 0, 0.10, 0.25 and 0.40.' });
  if ((ga === 0) !== (gd === 0)) notes.push({ level: 'warn', text: ga === 0 ? 'Glazing area is 0 but a distribution code other than 0 is selected; the dataset never combines these.' : 'Distribution code 0 is selected with non-zero glazing area; in the dataset code 0 only occurs with no glazing.' });
  return notes;
}

export const fmt = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : v.toFixed(d));
export const valuesToInputs = (vals) => Object.fromEntries(KEYS.map((k, i) => [k, vals[i]]));
export const inputsToValues = (o) => KEYS.map((k) => Number(o[k]));

/** Differences of model estimates. pct is null when the baseline is 0. */
export function difference(value, base) {
  const abs = value - base;
  return { abs, pct: base === 0 ? null : (abs / base) * 100 };
}

/** Escape text for HTML contexts (names and imported text are untrusted). */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** CSV cell: quote, double quotes, and neutralise spreadsheet formula injection. */
export function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
