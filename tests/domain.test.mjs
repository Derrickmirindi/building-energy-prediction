import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, validate, parseField, feasibility, difference, toCsv, SHAPES, byKey } from '../assets/js/domain.js';
import { parseProject, cleanName, SCHEMA } from '../assets/js/store.js';

const good = { rc: '0.79', sa: '637', wa: '343', ra: '147', h: '7', or: '2', ga: '0.25', gd: '1' };

test('feature order matches scaler_params.json', async () => {
  const fs = await import('node:fs');
  const s = JSON.parse(fs.readFileSync(new URL('../scaler_params.json', import.meta.url)));
  assert.deepEqual(FEATURES.map((f) => f.name.toLowerCase()), s.feature_names.map((n) => n.toLowerCase()));
});

test('valid inputs pass in model order', () => {
  const v = validate(good);
  assert.ok(v.ok); assert.deepEqual(v.values, [0.79, 637, 343, 147, 7, 2, 0.25, 1]);
});

test('empty, non-numeric, non-finite and out-of-range values are rejected, never adjusted', () => {
  for (const bad of ['', ' ', 'abc', '1e999', 'NaN', 'Infinity', '0x10', '1,5', '--1']) {
    assert.equal(parseField(byKey.rc, bad).ok, false, `"${bad}" accepted`);
  }
  assert.equal(parseField(byKey.rc, '0.619').ok, false);
  assert.equal(parseField(byKey.rc, '0.981').ok, false);
  assert.equal(parseField(byKey.sa, '808.5').ok, false, 'original limit 808.0 kept');
  assert.equal(parseField(byKey.or, '1').ok, false);
  assert.equal(parseField(byKey.or, '2.5').ok, false);
  assert.equal(parseField(byKey.gd, '6').ok, false);
  assert.equal(parseField(byKey.ga, '-0').ok, true);
  const v = validate({ ...good, h: '9' });
  assert.equal(v.ok, false); assert.ok(v.errors.h); assert.equal(v.values, null);
});

test('boundaries of the original form are accepted', () => {
  for (const f of FEATURES) {
    if (f.kind === 'category') for (const c of f.codes) assert.ok(parseField(f, String(c)).ok);
    else { assert.ok(parseField(f, String(f.min)).ok); assert.ok(parseField(f, String(f.max)).ok); }
  }
});

test('feasibility recognises the 12 dataset forms and flags inconsistent combinations', () => {
  for (const s of SHAPES.slice(0, 11)) {
    const n = feasibility([...s, 2, 0.25, 1]);
    assert.equal(n[0].level, 'ok'); assert.equal(n.filter((x) => x.level === 'warn').length, 0);
  }
  const odd = feasibility([0.62, 514.5, 245, 220.5, 3.5, 2, 0, 0]);
  assert.ok(!odd.some((x) => x.level === 'ok' && /matches dataset building form/.test(x.text)));
  assert.ok(odd.some((x) => /wall area \+ 2 × roof area/.test(x.text)));
  assert.ok(feasibility([0.98, 514.5, 294, 110.25, 7, 2, 0, 3]).some((x) => /code other than 0/.test(x.text)));
  assert.ok(feasibility([0.98, 514.5, 294, 110.25, 5, 2, 0.25, 1]).some((x) => /between the two dataset values/.test(x.text)));
});

test('differences handle a zero baseline', () => {
  assert.deepEqual(difference(12, 10), { abs: 2, pct: 20 });
  assert.equal(difference(5, 0).pct, null);
});

test('CSV escapes quotes, commas and spreadsheet formulas', () => {
  const s = toCsv([['=HYPERLINK("x")', 'a,b', 'he said "hi"', -3.5, '+cmd']]);
  assert.equal(s, `"'=HYPERLINK(""x"")","a,b","he said ""hi""",-3.5,'+cmd\r\n`);
});

test('project import validates untrusted files', () => {
  const sc = (inputs, name = 'A') => ({ name, inputs });
  const okIn = { rc: 0.79, sa: 637, wa: 343, ra: 147, h: 7, or: 2, ga: 0.25, gd: 1 };
  assert.equal(parseProject(null).ok, false);
  assert.equal(parseProject({ schema: 'other', scenarios: [] }).ok, false);
  assert.equal(parseProject({ schema: SCHEMA, schemaVersion: 99, scenarios: [] }).ok, false);
  assert.equal(parseProject({ schema: SCHEMA, schemaVersion: 1, scenarios: [sc({ ...okIn, rc: 5 })] }).ok, false);
  assert.equal(parseProject({ schema: SCHEMA, schemaVersion: 1, scenarios: [sc({ ...okIn, rc: '0.79' })] }).ok, false);
  assert.equal(parseProject({ schema: SCHEMA, schemaVersion: 1, scenarios: Array(51).fill(sc(okIn)) }).ok, false);
  const r = parseProject({ schema: SCHEMA, schemaVersion: 1, scenarios: [{ ...sc(okIn, '<img src=x onerror=alert(1)>‮'), result: { heating: -999 }, id: 'bad id!' }] });
  assert.ok(r.ok);
  assert.equal(r.project.scenarios[0].result, null, 'stored results are never trusted');
  assert.match(r.project.scenarios[0].id, /^[a-z0-9]+$/i);
  assert.equal(cleanName('  a\u0000b\n\nc '), 'a b c');
  assert.equal(cleanName(''), 'Untitled scenario');
  assert.equal(cleanName('x'.repeat(200)).length, 80);
});
