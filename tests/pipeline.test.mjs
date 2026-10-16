// Re-derives the baseline from the protected files with an independent float32 implementation,
// and checks the adapter's documented constants (clip limits, rounding) against the original behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReference } from './reference-model.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/baseline.json'), 'utf8'));
const predict = loadReference(ROOT);
const display = (h, c) => [Math.min(Math.max(h, 6.0), 45.0).toFixed(2), Math.min(Math.max(c, 11.0), 48.0).toFixed(2)];

test('baseline is internally consistent (displayed = clip + toFixed(2) of raw, on both backends)', () => {
  for (const c of BASE.cases) {
    assert.deepEqual(display(...c.raw_webgl), c.displayed);
    assert.deepEqual(display(...c.raw_cpu), c.displayed);
  }
});

// Tolerance: TensorFlow.js WebGL and CPU differed by at most 5.2e-6 on these cases; float32 spacing
// near 45 is 3.8e-6 and outputs are scaled by Y_std≈10. 2e-5 allows a few float32 ulps, no more.
const TOL = 2e-5;
test('independent reference reproduces the original app within float32 tolerance', () => {
  for (const c of BASE.cases) {
    const r = predict(c.inputs);
    for (let k = 0; k < 2; k++) assert.ok(Math.abs(r[k] - c.raw_cpu[k]) <= TOL, `${c.inputs}: ${r[k]} vs ${c.raw_cpu[k]}`);
  }
});

test('adapter keeps the original clip limits and output order', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/inference.js'), 'utf8');
  assert.match(src, /CLIP = \{ heating: \[6\.0, 45\.0\], cooling: \[11\.0, 48\.0\] \}/);
  assert.match(src, /heatingStd = arr\[0\]; coolingStd = arr\[1\];/);
  assert.match(src, /tf\.tensor2d\(\[xStd\], \[1, 8\]\)/);
  assert.match(src, /toFixed\(2\)/);
});

test('every prediction call in the interface goes through the adapter', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'assets/js'))) {
    if (f === 'inference.js') continue;
    const s = fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8');
    assert.ok(!/tf\.|loadLayersModel|\.predict\(/.test(s.replace(/M\.predict\(/g, '')), `${f} calls TensorFlow.js directly`);
  }
});
