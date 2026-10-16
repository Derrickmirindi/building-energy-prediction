// The trained model and scaler must stay byte-for-byte identical to the baseline commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/baseline.json'), 'utf8'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');

test('protected model files are unchanged since the baseline commit', () => {
  for (const [f, want] of Object.entries(BASE.protected_sha256)) assert.equal(sha(f), want, `${f} changed`);
});

test('inference adapter declares the same checksums (cache key and Model & Methods page)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/inference.js'), 'utf8');
  for (const [f, want] of Object.entries(BASE.protected_sha256)) assert.ok(src.includes(`'${f}': '${want}'`), `inference.js does not declare ${f}`);
});

test('model.json references only the protected weight shard, unquantised float32', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'model.json'), 'utf8'));
  assert.deepEqual(m.weightsManifest.flatMap((w) => w.paths), ['group1-shard1of1.bin']);
  for (const w of m.weightsManifest[0].weights) { assert.equal(w.dtype, 'float32'); assert.equal(w.quantization, undefined); }
});

test('inference runtime is still TensorFlow.js 4.22.0 from the original CDN URLs', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'));
  assert.ok(html.includes('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/tf-backend-wasm.min.js'));
});
