# Model audit and preservation record

Baseline: `main` at commit `81d5d9b4319155714b92156315cf30ad4b70cb81` (2025-12-31), audited 2026-10-16.

## Protected files

| File | Bytes | SHA-256 |
|---|---:|---|
| `model.json` | 19,416 | `a6df51ca60ca23ca296f0b0bd844a798deb7f44e12c848f504e00b9596e6fc8d` |
| `group1-shard1of1.bin` | 181,512 | `a7106a77d03b686b39798171532f81288e7fae21990f71da5079c46d09fac8e0` |
| `scaler_params.json` | 807 | `40924e7135a54b8eda3826e77ae23aa89bddd6aa45d6d811d3ff9afd4dce2947` |

The live site at the baseline served byte-identical copies of these files and of `index.html`.
`tests/protected-files.test.mjs` fails if any of them change.

## Architecture (verified from model.json)

- Keras 3.10.0 functional model, converted by TensorFlow.js Converter 4.22.0, `layers-model` format.
- Input `[None, 8]` float32 → Dense 256 → BatchNorm → ReLU → Dropout 0.3 → Dense 128 → BatchNorm → ReLU →
  Dropout 0.3 → Dense 64 → BatchNorm → ReLU → Dense 2 (linear). BatchNorm epsilon 0.001.
- One output tensor `[None, 2]`: index 0 heating, index 1 cooling (matches `target_names`).
- 20 float32 weight arrays in one shard, no quantisation.

**Discrepancy:** the original page called this a “Convolutional Neural Network (CNN)”. There are no
convolutional layers; it is a multilayer perceptron. The code comments and the IndexedDB key already said
“MLP”. The studio now says MLP (approved by the owner on 2026-10-16).

## Original inference pipeline (preserved)

1. Backend: `tf.setBackend('webgl')`; if that throws, WASM with jsDelivr wasm paths; if that throws, CPU; then `tf.ready()`.
2. Scaler from `./scaler_params.json`.
3. Model from IndexedDB cache if present, else `tf.loadLayersModel('./model.json', {strict: false})`, then cached.
4. Warm-up on `tf.zeros([1, 8])`.
5. `x' = (x − X_mean) / X_std` in JavaScript doubles; `tf.tensor2d([x'], [1, 8])`; `predict`; `data()`.
6. `heating = z0 · Y_std[0] + Y_mean[0]`, `cooling = z1 · Y_std[1] + Y_mean[1]`.
7. Clip heating to [6.0, 45.0] and cooling to [11.0, 48.0]; display `toFixed(2)`.

All of this lives in `assets/js/inference.js`; every studio feature calls it.

### Changes around the pipeline (not to the numbers)

- **Cache key** (approved): `building-energy-mlp` → `building-energy-mlp-<model.json sha>-<shard sha>`, so a
  cached model can never be combined with a different model release or a newer `scaler_params.json`.
  The original loaded any cached model first, with no versioning.
- **Validation**: the original relied on the browser’s min/max/step checks plus a NaN check. The studio keeps
  the same min/max ranges, rejects empty, non-numeric and non-finite values with a message, and never
  adjusts a value. The 0.01 step restriction is not enforced (it does not affect any prediction).
- **Scaler structure check**: the studio refuses to predict if the scaler file is malformed.
- **Batched sweeps**: the parameter explorer may predict in batches, but only after checking on the
  visitor’s device that batched outputs are bit-identical to single-row outputs; otherwise it predicts one
  row at a time.

## Regression baseline

`tests/baseline.json` holds 18 cases captured from the original live application (in the owner’s browser,
TensorFlow.js 4.22.0, through the page’s own form handler): the 12 dataset building forms across all
orientation codes, glazing areas and distribution codes; the corners of the input box; and three cases that
hit the lower clip limits (heating 5.85 → 6.00, cooling 10.97 → 11.00, heating 4.34 → 6.00).

| Check | Result |
|---|---|
| Displayed values, WebGL vs CPU (original app) | identical for all 18 |
| Raw values, WebGL vs CPU (original app) | max difference 5.1 × 10⁻⁶ |
| Cached model vs fresh download (original app) | identical |
| Independent NumPy / JavaScript float32 re-implementation vs original | max difference 4.8 × 10⁻⁶ |

Tolerance for raw values in tests: 2 × 10⁻⁵ (a few float32 steps at outputs scaled by Y_std ≈ 10).
Displayed values must match exactly.

## Supported domain

Inputs and values match the UCI “Energy efficiency” dataset (A. Tsanas, A. Xifara, 2012, CC BY 4.0;
paper: *Energy and Buildings* 49): 768 residential buildings simulated in Ecotect for Athens, Greece; 12 building
forms built from 3.5 m cubes; four orientations; glazing 0/10/25/40 % of floor area in five distributions.
`scaler_params.json` statistics correspond to 537 rows (70 % of 768). Verified against a public copy of
`ENB2012_data.xlsx`:

- Surface area = wall area + 2 × roof area in all 768 rows.
- Glazing area 0 always occurs with distribution code 0, and code 0 only with glazing area 0.
- Heating load ranges 6.01–43.10 and cooling load 10.90–48.03 in the data; the clip limits sit just around these.
- Largest surface area is 808.5 m², but the original form caps it at 808.0 m² (kept unchanged; flagged).
- Within the form’s input box the model did not reach the upper clip limits in a 400,000-point random sample
  (max heating 42.9, cooling 45.7).

## Open questions (not resolved by the documentation)

1. **Units and time basis.** UCI and the paper give no unit for the loads and do not say “annual”. The site
   keeps “kWh/m²” as stated by the project, with a caveat.
2. **Orientation codes 2–5.** Not defined by the dataset. The original page called them North, East, South,
   West; the studio labels this as unverified.
3. **Glazing distribution codes 0–5.** The paper describes the variants (none, uniform, north, east, south,
   west) but not the code mapping. The studio does not label codes with directions.
4. **Glazing area.** The paper defines it relative to floor area; the original page said “façade glazed”.
5. **Training details.** Split, epochs, loss and accuracy of this model are not in the repository, so the
   studio shows no accuracy or uncertainty figures.
