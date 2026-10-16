// Independent float32 re-implementation of the network, used ONLY by tests to check that the
// protected files and the documented pipeline reproduce the baseline. The site never uses it.
import fs from 'node:fs';
import path from 'node:path';

export function loadReference(root) {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'model.json'), 'utf8'));
  const buf = fs.readFileSync(path.join(root, 'group1-shard1of1.bin'));
  const S = JSON.parse(fs.readFileSync(path.join(root, 'scaler_params.json'), 'utf8'));
  const W = {}; let off = 0;
  for (const w of m.weightsManifest[0].weights) {
    const n = w.shape.reduce((a, b) => a * b, 1);
    W[w.name] = { data: new Float32Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + 4 * n)), shape: w.shape };
    off += 4 * n;
  }
  if (off !== buf.length) throw new Error('weight manifest does not cover the shard exactly');
  const f = Math.fround;
  const dense = (x, k) => {
    const K = W[k + '/kernel']; const B = W[k + '/bias'].data; const [nin, nout] = K.shape; const y = new Float32Array(nout);
    for (let j = 0; j < nout; j++) { let s = 0; for (let i = 0; i < nin; i++) s = f(s + f(x[i] * K.data[i * nout + j])); y[j] = f(s + B[j]); }
    return y;
  };
  const bnRelu = (x, p, relu = true) => x.map((v, i) => {
    const y = f(f(f(v - W[p + '/moving_mean'].data[i]) / f(Math.sqrt(f(W[p + '/moving_variance'].data[i] + f(0.001))))) * W[p + '/gamma'].data[i] + W[p + '/beta'].data[i]);
    return relu ? Math.max(y, 0) : y;
  });
  return function predict(vals) {
    const z = Float32Array.from(vals.map((v, i) => (v - S.X_mean[i]) / S.X_std[i]));
    let h = bnRelu(dense(z, 'dense'), 'batch_normalization');
    h = bnRelu(dense(h, 'dense_1'), 'batch_normalization_1');
    h = bnRelu(dense(h, 'dense_2'), 'batch_normalization_2');
    const o = dense(h, 'output');
    return [o[0] * S.Y_std[0] + S.Y_mean[0], o[1] * S.Y_std[1] + S.Y_mean[1]];
  };
}
