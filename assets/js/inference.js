// Inference adapter: the ONLY place the trained model is called.
//
// It reproduces the original index.html pipeline (main@81d5d9b) step for step:
//   backend:   tf.setBackend('webgl') -> on throw: WASM (CDN wasm paths) -> on throw: CPU; then tf.ready()
//   load:      tf.loadLayersModel(indexeddb cache) -> on failure: tf.loadLayersModel('./model.json', {strict:false})
//              then model.save(cache); warm-up predict on tf.zeros([1, 8])
//   predict:   x' = (x - X_mean) / X_std  (JS doubles) -> tf.tensor2d([x'], [1, 8]) -> model.predict -> .data()
//              heating = z0 * Y_std[0] + Y_mean[0];  cooling = z1 * Y_std[1] + Y_mean[1]
//              clipped heating = min(max(h, 6.0), 45.0); clipped cooling = min(max(c, 11.0), 48.0)
//              displayed with toFixed(2)
// The only intentional difference (approved 2026-10-16): the IndexedDB cache key now carries the
// protected files' checksums, so a cached model can never be paired with a different model release.
// tests/protected-files.test.mjs fails if the files change without this identifier being updated.

/* global tf */

export const TFJS_VERSION_EXPECTED = '4.22.0';
export const MODEL_FILES = {
  'model.json': 'a6df51ca60ca23ca296f0b0bd844a798deb7f44e12c848f504e00b9596e6fc8d',
  'group1-shard1of1.bin': 'a7106a77d03b686b39798171532f81288e7fae21990f71da5079c46d09fac8e0',
  'scaler_params.json': '40924e7135a54b8eda3826e77ae23aa89bddd6aa45d6d811d3ff9afd4dce2947',
};
export const MODEL_ID = 'mlp-8-256-128-64-2 · model ' + MODEL_FILES['model.json'].slice(0, 8)
  + ' · weights ' + MODEL_FILES['group1-shard1of1.bin'].slice(0, 8) + ' · scaler ' + MODEL_FILES['scaler_params.json'].slice(0, 8);
export const CACHE_KEY = 'indexeddb://building-energy-mlp-' + MODEL_FILES['model.json'].slice(0, 12)
  + '-' + MODEL_FILES['group1-shard1of1.bin'].slice(0, 12);
export const CLIP = { heating: [6.0, 45.0], cooling: [11.0, 48.0] };
const WASM_PATHS = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/';

const state = {
  status: 'idle',        // idle | loading | ready | error
  message: '',
  backend: null,
  source: null,          // 'cache' | 'network'
  error: null,
  model: null,
  scaler: null,
  batchSafe: null,       // true once batched == single-row results were verified on this device
};
const listeners = new Set();
export function onStatus(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); }
function emit(status, message) {
  if (status) state.status = status;
  if (message !== undefined) state.message = message;
  const s = snapshot();
  listeners.forEach((fn) => fn(s));
}
export function snapshot() {
  return {
    status: state.status, message: state.message, backend: state.backend, source: state.source,
    error: state.error, tfjs: (typeof tf !== 'undefined' && tf.version) ? tf.version.tfjs : null, batchSafe: state.batchSafe,
  };
}
export const isReady = () => state.status === 'ready';

/** Same order and behaviour as the original initBackend(). */
async function initBackend() {
  try {
    await tf.setBackend('webgl');
  } catch (e) {
    try {
      if (tf.wasm && tf.wasm.setWasmPaths) tf.wasm.setWasmPaths(WASM_PATHS);
      await tf.setBackend('wasm');
    } catch (err) {
      await tf.setBackend('cpu');
    }
  }
  await tf.ready();
  state.backend = tf.getBackend();
}

function checkScaler(s) {
  const okArr = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && Number.isFinite(v));
  if (!s || !okArr(s.X_mean, 8) || !okArr(s.X_std, 8) || !okArr(s.Y_mean, 2) || !okArr(s.Y_std, 2)) {
    throw new Error('scaler_params.json does not have the expected structure (8 input and 2 output statistics).');
  }
  if ([...s.X_std, ...s.Y_std].some((v) => v === 0)) throw new Error('scaler_params.json contains a zero standard deviation.');
  return s;
}

let loading = null;
/** Load backend, scaler and model once. Resolves when ready; rejects with a readable error. */
export function load({ root = './' } = {}) {
  if (loading) return loading;
  loading = (async () => {
    try {
      if (typeof tf === 'undefined') throw new Error('TensorFlow.js could not be loaded from the CDN (cdn.jsdelivr.net). Check your connection or content blockers.');
      emit('loading', 'Initialising TensorFlow.js…');
      await initBackend();

      emit('loading', 'Loading scaler parameters…');
      const resp = await fetch(root + 'scaler_params.json');
      if (!resp.ok) throw new Error(`scaler_params.json could not be loaded (HTTP ${resp.status}).`);
      state.scaler = checkScaler(await resp.json());

      emit('loading', 'Loading model from this browser’s cache…');
      try {
        state.model = await tf.loadLayersModel(CACHE_KEY);
        state.source = 'cache';
      } catch (cacheErr) {
        emit('loading', 'Downloading model…');
        state.model = await tf.loadLayersModel(root + 'model.json', {
          onProgress: (f) => emit('loading', `Downloading model… ${Math.round(f * 100)}%`),
          strict: false,
        });
        state.source = 'network';
        try { await state.model.save(CACHE_KEY); } catch (saveErr) { console.warn('Model could not be cached locally:', saveErr); }
      }
      const inShape = state.model.inputs?.[0]?.shape;
      const outShape = state.model.outputs?.[0]?.shape;
      if (!inShape || inShape[1] !== 8 || !outShape || outShape[1] !== 2) throw new Error(`Unexpected model shape: input ${JSON.stringify(inShape)}, output ${JSON.stringify(outShape)}.`);

      // Warm-up, as in the original.
      const dummy = tf.zeros([1, 8]);
      const out = state.model.predict(dummy);
      if (Array.isArray(out)) out.forEach((t) => t.dispose()); else out.dispose();
      dummy.dispose();

      emit('ready', `Model ready (${state.backend} backend, loaded from ${state.source === 'cache' ? 'this browser’s cache' : 'the network'}).`);
    } catch (err) {
      state.error = err;
      loading = null;  // allow retry
      emit('error', err && err.message ? err.message : String(err));
      throw err;
    }
  })();
  return loading;
}

/** Forget the cached model in this browser (does not touch the files on the server). */
export async function clearCache() {
  try { await tf.io.removeModel(CACHE_KEY); return true; } catch { return false; }
}

const standardize = (values, m, s) => values.map((v, i) => (v - m[i]) / s[i]);
const inverseStandardize = (values, m, s) => values.map((z, i) => z * s[i] + m[i]);

function finish(heatingStd, coolingStd) {
  const [heating, cooling] = inverseStandardize([heatingStd, coolingStd], state.scaler.Y_mean, state.scaler.Y_std);
  const heatingClipped = Math.min(Math.max(heating, CLIP.heating[0]), CLIP.heating[1]);
  const coolingClipped = Math.min(Math.max(cooling, CLIP.cooling[0]), CLIP.cooling[1]);
  return {
    heating: heatingClipped, cooling: coolingClipped,
    heatingRaw: heating, coolingRaw: cooling,
    heatingText: heatingClipped.toFixed(2), coolingText: coolingClipped.toFixed(2),
    heatingClipped: heatingClipped !== heating, coolingClipped: coolingClipped !== cooling,
  };
}

function assertInputs(vals) {
  if (!Array.isArray(vals) || vals.length !== 8 || vals.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('Exactly eight finite numbers are required, in model order.');
  }
}

/** One prediction, exactly as the original form handler computes it. */
export async function predict(vals) {
  if (!isReady()) throw new Error('The model is not loaded yet.');
  assertInputs(vals);
  const xStd = standardize(vals, state.scaler.X_mean, state.scaler.X_std);
  const xTensor = tf.tensor2d([xStd], [1, 8]);
  let heatingStd, coolingStd;
  try {
    const pred = state.model.predict(xTensor);
    if (Array.isArray(pred)) {
      const hArr = await pred[0].data(); const cArr = await pred[1].data();
      heatingStd = hArr[0]; coolingStd = cArr[0];
      pred.forEach((t) => t.dispose());
    } else {
      const arr = await pred.data();
      heatingStd = arr[0]; coolingStd = arr[1];
      pred.dispose();
    }
  } finally {
    xTensor.dispose();
  }
  return finish(heatingStd, coolingStd);
}

/** Batched prediction for sweeps. Only used after verifyBatch() proved batch == single row on this device. */
async function predictBatchRaw(rows) {
  const xs = rows.map((r) => standardize(r, state.scaler.X_mean, state.scaler.X_std));
  const t = tf.tensor2d(xs, [rows.length, 8]);
  try {
    const pred = state.model.predict(t);
    const arr = await pred.data();
    pred.dispose();
    return rows.map((_, i) => finish(arr[2 * i], arr[2 * i + 1]));
  } finally { t.dispose(); }
}

/** Compare batched and single-row inference bit for bit on a fixed probe set. */
export async function verifyBatch(probe) {
  if (state.batchSafe !== null) return state.batchSafe;
  const single = [];
  for (const r of probe) single.push(await predict(r));
  const batch = await predictBatchRaw(probe);
  state.batchSafe = batch.every((b, i) => b.heatingRaw === single[i].heatingRaw && b.coolingRaw === single[i].coolingRaw);
  emit();
  return state.batchSafe;
}

/**
 * Many predictions without freezing the page. Uses batches only when verified identical to
 * single-row inference; otherwise predicts row by row. onProgress(done, total); shouldStop() cancels.
 */
export async function predictMany(rows, { onProgress = () => {}, shouldStop = () => false, chunk = 64 } = {}) {
  if (!isReady()) throw new Error('The model is not loaded yet.');
  rows.forEach(assertInputs);
  const out = [];
  for (let i = 0; i < rows.length; i += chunk) {
    if (shouldStop()) return { results: out, cancelled: true };
    const part = rows.slice(i, i + chunk);
    if (state.batchSafe) out.push(...await predictBatchRaw(part));
    else for (const r of part) out.push(await predict(r));
    onProgress(out.length, rows.length);
    await new Promise((res) => setTimeout(res, 0));  // keep the interface responsive
  }
  return { results: out, cancelled: false };
}

/** Tensors currently allocated (for leak checks in tests). */
export const numTensors = () => (typeof tf !== 'undefined' ? tf.memory().numTensors : null);
