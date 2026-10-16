# Maintenance

## Layout

```
index.html                 studio page (all tabs)
model.json                 PROTECTED – trained model topology + weight manifest
group1-shard1of1.bin       PROTECTED – weights
scaler_params.json         PROTECTED – input/output standardisation
assets/js/inference.js     the only code that calls TensorFlow.js / the model
assets/js/domain.js        input definitions, validation, consistency checks, CSV helpers
assets/js/store.js         scenarios (local storage), project JSON schema v1, import validation
assets/js/charts.js        SVG line charts and heatmaps
assets/js/building.js      schematic block illustration
assets/js/app.js           interface for all tabs
assets/css/studio.css      styles (screen + print)
tests/                     regression baseline, Node tests, browser regression page
docs/                      audit and this file
```

## Rules

- Do not edit the three protected files. If a new model is ever released, update `MODEL_FILES` in
  `assets/js/inference.js` (this also changes the IndexedDB cache key), recapture `tests/baseline.json`, and
  update `docs/MODEL_AUDIT.md`. `tests/protected-files.test.mjs` will fail until all of that is done.
- Do not call `tf` anywhere except `assets/js/inference.js` (a test enforces this).
- Do not change the TensorFlow.js version or CDN URLs without re-running the browser regression page on
  WebGL and CPU and recording the result.
- Imported files and scenario names are untrusted: render with `textContent`, validate with `parseProject`.

## Before every merge to main

1. `node --test tests/*.test.mjs` passes.
2. Open `tests/regression.html` in a desktop browser: PASS, 18 of 18, no leaked tensors.
3. Check Predict, Compare, Parameter Explorer, Reports and Model & Methods at desktop and phone widths.

## Rollback

The site is served from `main` (root). To return to the pre-studio site:

```bash
git revert -m 1 <merge-commit>     # creates a new commit; keeps history
git push origin main
```

or restore the original page only: `git checkout 81d5d9b -- index.html && git commit`. The protected model
files are identical in both versions, so no model files need restoring. Never force-push `main`.
