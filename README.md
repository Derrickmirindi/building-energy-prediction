# Building Energy Design Studio

**Explore design alternatives with the existing trained model.**
Developed by Derrick Mirindi.

Live site: https://derrickmirindi.github.io/building-energy-prediction/

A static web application that runs a trained neural network in the browser (TensorFlow.js) to estimate the
**heating load** and **cooling load** of a building from eight design parameters, and helps you explore design
alternatives with it.

- **Predict**: the original eight-input prediction, with validation, clipping disclosure, consistency checks
  against the training data and a schematic building illustration.
- **Compare**: save scenarios, pick a baseline and compare up to four (absolute and percentage differences in
  model estimates), with CSV and JSON export/import.
- **Parameter Explorer**: one-variable response curves and two-variable heatmaps, computed point by point with
  the unchanged model, with progress, cancellation and evaluation limits.
- **Reports**: a printable report (save as PDF from the browser's print dialog).
- **Model & Methods**: architecture, inputs, inference steps, runtime and file checksums, limitations.

> This is a data-driven estimator trained on simulated buildings. It is **not** an EnergyPlus or other
> physics-based simulation, and not a tool for code compliance, HVAC sizing or design sign-off.

## The model (unchanged)

| File | SHA-256 |
|---|---|
| `model.json` | `a6df51ca60ca23ca296f0b0bd844a798deb7f44e12c848f504e00b9596e6fc8d` |
| `group1-shard1of1.bin` | `a7106a77d03b686b39798171532f81288e7fae21990f71da5079c46d09fac8e0` |
| `scaler_params.json` | `40924e7135a54b8eda3826e77ae23aa89bddd6aa45d6d811d3ff9afd4dce2947` |

- Architecture (from `model.json`): fully connected network (multilayer perceptron),
  8 → Dense 256 → Dense 128 → Dense 64 → 2, with batch normalisation and ReLU after each hidden layer and
  dropout 0.3 after the first two (inactive at prediction time). Earlier versions of this README and site
  called it a CNN; it has no convolutional layers.
- Inputs, in this order: relative compactness, surface area, wall area, roof area, overall height,
  orientation (code 2–5), glazing area, glazing area distribution (code 0–5).
- Pipeline: `(x − X_mean) / X_std` → model → `z × Y_std + Y_mean` → clip heating to 6.0–45.0 and cooling to
  11.0–48.0 → two decimals. Implemented once, in `assets/js/inference.js`.
- Runtime: TensorFlow.js 4.22.0 (+ WASM backend) from jsDelivr, exactly as before.
- Training data: the inputs match the UCI “Energy efficiency” dataset (Tsanas & Xifara 2012, CC BY 4.0). The
  unit (kWh/m²) and “annual” basis are as stated by this project; the dataset documentation does not state them.

See [`docs/MODEL_AUDIT.md`](docs/MODEL_AUDIT.md) for the full audit and open questions.

## Run locally

No build step and no dependencies. Serve the folder over HTTP (the model cannot load from `file://`):

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

The page loads TensorFlow.js from cdn.jsdelivr.net, so an internet connection is needed.

## Test

```bash
node --test tests/*.test.mjs        # Node 18+: checksums, pipeline, validation, import/export
```

Then open `tests/regression.html` in a browser (locally or on the live site). It runs the 18 baseline cases
captured from the original application through the site's inference adapter with the real TensorFlow.js and
shows PASS/FAIL. Displayed values must match exactly; raw values may differ by at most 2×10⁻⁵ between
TensorFlow.js backends.

## Deploy

GitHub Pages serves this repository from the **`main` branch, root folder** (Settings → Pages →
“Deploy from a branch”). Merging to `main` publishes the site; there is no build step and no workflow file.
All paths are relative, so the site works under `/building-energy-prediction/`.

## Privacy

Everything runs in your browser. Saved scenarios are kept in this browser’s local storage only, until you
delete them (Compare → Delete all) or clear site data. No analytics, accounts or external data collection.

## Maintenance and rollback

See [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md). The last version before the studio redesign is commit
`81d5d9b4319155714b92156315cf30ad4b70cb81`.
