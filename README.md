# Building Energy Design Studio

Explore building designs. Compare model estimates. Understand the limitations.

A browser-based workspace for estimating heating and cooling loads from eight building-design inputs using an existing trained neural network.

Developed by Derrick Mirindi.

[Launch the studio](https://derrickmirindi.github.io/building-energy-prediction/) · [Model audit](docs/MODEL_AUDIT.md) · [Maintenance](docs/MAINTENANCE.md)

> For exploration and teaching. This is a data-driven estimator trained on simulated buildings, not a physics-based simulation. Do not use it for code compliance, HVAC sizing or design sign-off.

## Explore the studio

| Workspace | What you can do |
| --- | --- |
| Predict | Enter eight inputs, review validation and consistency notes, and estimate heating and cooling loads. Output clipping is disclosed. |
| 3D design view | Rotate, tilt and zoom an illustrative building mass; switch between solid and wireframe views. Inspect input areas in a separate 3D bar widget. |
| Compare | Save scenarios locally, choose a baseline and compare up to four scenarios, including absolute and percentage differences in model estimates. |
| Parameter Explorer | Compute one-variable response curves or two-variable heatmaps with progress, cancellation and evaluation limits. |
| Reports and exports | Print a report or save it as PDF through your browser. Export comparison and sweep data as CSV; export/import scenarios as project JSON. |

### Start with a design

1. Open the studio and choose Load example, or enter your own supported inputs.
2. Inspect the illustrative geometry and input consistency notes.
3. Select Predict loads to calculate estimates with the trained model.
4. Save a named scenario, change inputs and predict again.
5. Use Compare to examine alternatives or Parameter Explorer to evaluate a sweep.

Changing inputs makes the previous prediction stale. Camera controls change only the visualization, never the model inputs or outputs.

## Model and scientific scope

### Preserved prediction pipeline

The model is a multilayer perceptron, not a CNN. Earlier project descriptions incorrectly called it convolutional; it has no convolutional layers.

```text
8 inputs
  -> Dense 256 -> Batch normalization -> ReLU -> Dropout 0.3
  -> Dense 128 -> Batch normalization -> ReLU -> Dropout 0.3
  -> Dense  64 -> Batch normalization -> ReLU
  -> 2 outputs: heating and cooling
```

Dropout is inactive at prediction time. All predictions use `assets/js/inference.js`:

```text
Standardize:  (x - X_mean) / X_std
Predict:      existing trained neural network
Rescale:      z * Y_std + Y_mean
Clip:         heating [6.0, 45.0]; cooling [11.0, 48.0]
Display:      two decimal places
```

Runtime: TensorFlow.js 4.22.0 with the existing WebGL/WASM/CPU backend selection. The interface redesign does not retrain the model, modify its weights, or change scaling, clipping or rounding.

### Inputs in model order

| Position | Parameter | Representation |
| --- | --- | --- |
| 1 | Relative compactness | Dimensionless |
| 2 | Surface area | m² |
| 3 | Wall area | m² |
| 4 | Roof area | m² |
| 5 | Overall height | m |
| 6 | Orientation | Categorical code 2–5 |
| 7 | Glazing area | Dataset glazing input; see the audit for its definition |
| 8 | Glazing area distribution | Categorical code 0–5 |

### Interpret results carefully

- The inputs match the UCI Energy efficiency dataset by Tsanas and Xifara (2012), licensed CC BY 4.0. See the audit for provenance and training-data checks.
- kWh/m² is the unit stated by this project. The dataset documentation does not establish the output unit or an annual time basis.
- Heating and cooling are separate outputs. Their sum is not a validated whole-building energy use intensity.
- Scenario differences are differences between model estimates, not verified real-world savings.
- Sweeps show model responses, not causal effects or validated engineering sensitivity studies.
- Supported input bounds do not guarantee a physically consistent building or a well-supported prediction.
- Training accuracy, uncertainty and the full training procedure are not documented; this interface makes no claims about them.

### Protected model files

| File | SHA-256 |
| --- | --- |
| `model.json` | `a6df51ca60ca23ca296f0b0bd844a798deb7f44e12c848f504e00b9596e6fc8d` |
| `group1-shard1of1.bin` | `a7106a77d03b686b39798171532f81288e7fae21990f71da5079c46d09fac8e0` |
| `scaler_params.json` | `40924e7135a54b8eda3826e77ae23aa89bddd6aa45d6d811d3ff9afd4dce2947` |

Read the [full model audit](docs/MODEL_AUDIT.md) for validation details and unresolved questions.

## Development and deployment

### Run locally

No build step or package installation is required. Runtime libraries are loaded from a CDN, so the application is not dependency-free or fully offline.

Serve the repository over HTTP; opening `index.html` directly through `file://` cannot load the model correctly.

```bash
python3 -m http.server 8000
```

Open [the local studio](http://localhost:8000/). An internet connection is needed to load TensorFlow.js from jsDelivr.


### Design implementation

The interface uses a black, grey and red palette, a structured grid, system sans-serif typography and high-contrast controls. Existing heating/cooling colors remain distinct for chart continuity.

`assets/js/building.js` retains the `drawBuilding(host, values)` and `blockDims(roofArea, wallArea, height)` interfaces and loads `assets/css/design.css` as a presentation-only enhancement. The existing inference, validation, storage and application-routing modules are unchanged. The viewer renders on interaction rather than running a continuous animation loop.

## Privacy and maintenance

Predictions execute in the browser. Saved scenarios remain in this browser's local storage until deleted through Compare → Delete all or by clearing site data. Export JSON to retain a portable copy.

The application has no analytics or account system. Loading the site and CDN libraries still makes normal network requests to their hosts; local inference does not mean the entire visit is network-free.

See [maintenance and rollback](docs/MAINTENANCE.md). The pre-studio baseline is commit `81d5d9b4319155714b92156315cf30ad4b70cb81`. Preserve the model files and run regression checks before publishing future changes.
