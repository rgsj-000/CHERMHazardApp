# Offline Climate and Land-Cover Hazard Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a laptop-friendly, offline-capable browser application that models future rain-induced landslide and flood susceptibility from local GIS inputs and overlays baseline and predicted hazard rasters on a Municipality/Barangay map.

**Architecture:** Use a static HTML/CSS/JavaScript application with browser ES modules, locally vendored Leaflet and GeoTIFF libraries, pure JavaScript modeling modules, and local GeoJSON/GeoTIFF input handling. Modeling remains entirely client-side; future land cover is computed internally and never rendered as a visible map layer.

**Tech Stack:** HTML5, CSS3, JavaScript ES modules, Leaflet 1.9.4, GeoTIFF.js 2.1.3, Node.js built-in `node:test` for development tests, Windows PowerShell local static server for offline laptop launch.

**Spec:** `docs/superpowers/specs/2026-10-05-climate-landcover-hazard-simulator-design.md`

## Global Constraints

* Runtime must work on Windows 10/11 in Chrome or Edge after repository download without requiring internet access.
* No Python, QGIS, ArcGIS, Node.js application server, or database is required for ordinary use.
* OpenStreetMap is used only when internet is available; offline operation must remain functional without OSM.
* All runtime JavaScript/CSS dependencies must be stored locally in the repository.
* Environmental rasters remain on the user's laptop and are selected from the local drive.
* Municipality and Barangay polygons are GeoJSON in the first release.
* Rasters must be pre-aligned to a common CRS, extent, cell size, dimensions, and grid registration; browser-side reprojection is out of scope.
* Predicted future land cover is an internal model input only and must never be rendered or listed as a map layer.
* Separate Random Forest regression models are used for landslide and flood outputs.
* Hazard output is described as susceptibility / relative hazard score unless future calibration is added.
* Baseline and future hazard layers must be independently toggleable.
* Large training datasets must use bounded sampling to keep laptop memory use practical.

## Review Focus

* Misaligned rasters must stop modeling with a clear error rather than silently combine incompatible pixels. Covered in Task 4.
* A hazard raster containing only occurrence or only nonoccurrence cells inside the AOI must stop training with a diagnostic. Covered in Task 8.
* Barangay filtering must tolerate common municipality/barangay property-name variants and must not show Barangays belonging to another Municipality. Covered in Task 3.
* Offline startup with no network and no local basemap must still show boundaries and hazard rasters over a neutral background. Covered in Task 10.
* NoData, NaN, Infinity, and cells outside the selected polygon must remain transparent and excluded from training/prediction. Covered in Tasks 4, 8, and 9.

---

## Planned File Structure

```text
CHERMHazardApp/
├── index.html
├── README.md
├── package.json
├── .nojekyll
├── start.bat
├── start.sh
├── css/
│   └── app.css
├── js/
│   ├── app.js
│   ├── state.js
│   ├── boundaries.js
│   ├── raster.js
│   ├── scenario.js
│   ├── landcover.js
│   ├── random-forest.js
│   ├── hazard-model.js
│   ├── map.js
│   └── ui.js
├── vendor/
│   ├── leaflet/
│   │   ├── leaflet.css
│   │   └── leaflet.js
│   └── geotiff/
│       └── geotiff.js
├── data/
│   ├── boundaries/
│   │   └── README.md
│   └── basemap/
│       └── README.md
├── tools/
│   └── serve.ps1
└── tests/
    ├── boundaries.test.mjs
    ├── raster.test.mjs
    ├── scenario.test.mjs
    ├── landcover.test.mjs
    ├── random-forest.test.mjs
    ├── hazard-model.test.mjs
    └── hazard-colors.test.mjs
```

### Task 1: Application shell and local runtime assets

**Files:**
* Create: `index.html`
* Create: `css/app.css`
* Create: `package.json`
* Create: `.nojekyll`
* Create: `vendor/leaflet/leaflet.css`
* Create: `vendor/leaflet/leaflet.js`
* Create: `vendor/geotiff/geotiff.js`

**Interfaces:**
* Consumes: none
* Produces: DOM element IDs used by later tasks and local runtime asset paths only

- [ ] **Step 1: Write the failing shell test**

Create a Node test that reads `index.html` and asserts it references only local Leaflet and GeoTIFF assets, contains `#map`, `#municipality`, `#barangay`, `#status`, and no CDN URL for runtime libraries.

- [ ] **Step 2: Run the shell test and confirm failure**

Run: `node --test tests/shell.test.mjs`
Expected: FAIL because `index.html` and local vendor references do not yet exist.

- [ ] **Step 3: Implement the minimal application shell**

Create the desktop two-column UI with sections for Area of Interest, Environmental Rasters, Basemap, Scenario Controls, Run Model, Layers, Diagnostics, and Processing Log. Add local Leaflet CSS/JS and local GeoTIFF.js references only.

- [ ] **Step 4: Run the shell test**

Run: `node --test tests/shell.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html css/app.css package.json .nojekyll vendor tests/shell.test.mjs
git commit -m "feat: scaffold offline hazard simulator"
```

### Task 2: Shared application state and UI status utilities

**Files:**
* Create: `js/state.js`
* Create: `js/ui.js`
* Modify: `index.html`

**Interfaces:**
* Produces: `appState`, `setStatus(message, level)`, `setProgress(percent)`, `appendLog(message)`, `setOnlineStatus(isOnline, source)`
* Consumes: DOM IDs created in Task 1

- [ ] **Step 1: Write tests for state defaults and clamped progress**

Assert initial state contains empty raster/layer stores, null Municipality/Barangay selections, no future land-cover output exposed to map layers, and progress clamps to 0–100.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/state.test.mjs`
Expected: FAIL because modules are missing.

- [ ] **Step 3: Implement state and UI utility interfaces**

Keep map-visible layers separate from internal model products. Store future land cover under `appState.model.futureLandcover`, not `appState.mapLayers`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/state.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/state.js js/ui.js index.html tests/state.test.mjs
git commit -m "feat: add application state and status utilities"
```

### Task 3: Municipality and Barangay GeoJSON workflow

**Files:**
* Create: `js/boundaries.js`
* Create: `tests/boundaries.test.mjs`
* Modify: `index.html`

**Interfaces:**
* Produces: `detectAdminField(properties, candidates)`, `buildBoundaryIndex(municipalityGeojson, barangayGeojson)`, `municipalityNames(index)`, `barangaysForMunicipality(index, municipalityName)`, `getMunicipalityFeature(index, name)`, `getBarangayFeature(index, municipalityName, barangayName)`, `pointInGeometry(lon, lat, geometry)`
* Consumes: GeoJSON `FeatureCollection` objects

- [ ] **Step 1: Write failing tests for property detection and cascading filtering**

Test common fields including `MUNICIPALITY`, `Municipality`, `ADM3_EN`, `MUN_NAME`, `BARANGAY`, `BRGY_NAME`, and `ADM4_EN`. Assert Barangays from Municipality A never appear under Municipality B.

- [ ] **Step 2: Add geometry-mask tests**

Test Polygon, Polygon with hole, and MultiPolygon inclusion/exclusion behavior.

- [ ] **Step 3: Run tests and confirm failure**

Run: `node --test tests/boundaries.test.mjs`
Expected: FAIL because `js/boundaries.js` does not exist.

- [ ] **Step 4: Implement boundary indexing and geometry helpers**

Normalize administrative names for matching while retaining original display text. Return a clear error if no usable municipality or barangay name field can be detected.

- [ ] **Step 5: Run tests**

Run: `node --test tests/boundaries.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/boundaries.js index.html tests/boundaries.test.mjs
git commit -m "feat: add municipality and barangay boundary indexing"
```

### Task 4: GeoTIFF parsing, grid validation, and coordinate helpers

**Files:**
* Create: `js/raster.js`
* Create: `tests/raster.test.mjs`

**Interfaces:**
* Produces: `readGeoTiff(file, GeoTIFF)`, `sameGrid(a, b, tolerance)`, `validateAlignedRasters(rasters, requiredIds)`, `pixelCenter(raster, row, col)`, `rasterIndex(raster, lon, lat)`, `isNoData(value, nodata)`
* Consumes: browser File objects and GeoTIFF.js runtime in browser; plain raster fixtures in tests

- [ ] **Step 1: Write failing tests for grid equality and mismatch errors**

Assert mismatched width, height, bounding box, or registration produces an error naming both conflicting raster IDs.

- [ ] **Step 2: Write NoData and coordinate tests**

Assert NaN, Infinity, explicit NoData, and out-of-extent coordinate lookups are rejected appropriately.

- [ ] **Step 3: Run tests and confirm failure**

Run: `node --test tests/raster.test.mjs`
Expected: FAIL.

- [ ] **Step 4: Implement raster helpers and browser reader**

Read the first raster band for the initial release and preserve width, height, bbox, NoData, filename, and typed-array data.

- [ ] **Step 5: Run tests**

Run: `node --test tests/raster.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/raster.js tests/raster.test.mjs
git commit -m "feat: validate and read aligned geotiff rasters"
```

### Task 5: Scenario transformations

**Files:**
* Create: `js/scenario.js`
* Create: `tests/scenario.test.mjs`

**Interfaces:**
* Produces: `applyRainfallChange(value, change, mode)`, `applyTemperatureChange(value, change, mode)`, `validateScenario(input)`
* Consumes: scenario values from UI

- [ ] **Step 1: Write tests for exact climate formulas**

Assert rainfall percent uses `baseline × (1 + change/100)`, rainfall mm uses `baseline + change`, temperature Celsius uses `baseline + change`, and temperature percent uses `baseline × (1 + change/100)`.

- [ ] **Step 2: Write invalid-value tests**

Assert unsupported modes, nonfinite values, and future years earlier than baseline year are rejected.

- [ ] **Step 3: Run tests and confirm failure**

Run: `node --test tests/scenario.test.mjs`
Expected: FAIL.

- [ ] **Step 4: Implement scenario functions**

- [ ] **Step 5: Run tests**

Run: `node --test tests/scenario.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/scenario.js tests/scenario.test.mjs
git commit -m "feat: add climate scenario transformations"
```

### Task 6: Internal future land-cover projection

**Files:**
* Create: `js/landcover.js`
* Create: `tests/landcover.test.mjs`

**Interfaces:**
* Produces: `deriveTransitions(pastRaster, presentRaster, geometry)`, `projectFutureLandcover({pastRaster, presentRaster, geometry, baselineYear, futureYear, intensity, random})`
* Consumes: aligned categorical land-cover rasters and optional AOI geometry
* Output: raster-like object used internally by hazard prediction only

- [ ] **Step 1: Write failing transition tests**

Use small categorical raster fixtures with known class transitions and assert expected transition counts.

- [ ] **Step 2: Write masking and determinism tests**

Inject a deterministic `random()` function. Assert pixels outside the AOI remain NoData and unchanged classes remain valid.

- [ ] **Step 3: Write a visibility guard test**

Assert no exported function from `landcover.js` creates Leaflet layers, canvases, image overlays, or layer-control entries.

- [ ] **Step 4: Run tests and confirm failure**

Run: `node --test tests/landcover.test.mjs`
Expected: FAIL.

- [ ] **Step 5: Implement simplified transition projection**

Scale observed transition tendency by time horizon and the user change-intensity factor. Clearly keep the result internal.

- [ ] **Step 6: Run tests**

Run: `node --test tests/landcover.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add js/landcover.js tests/landcover.test.mjs
git commit -m "feat: project future land cover internally"
```

### Task 7: Random Forest regressor

**Files:**
* Create: `js/random-forest.js`
* Create: `tests/random-forest.test.mjs`

**Interfaces:**
* Produces: `RandomForestRegressor` with `fit(X, y)` and `predict(row)`; constructor accepts `{trees, maxDepth, minLeaf, mtry, random}`
* Consumes: numeric feature matrix and numeric response values

- [ ] **Step 1: Write failing regression tests**

Assert terminal nodes store mean response rather than majority class and that predictions are averages across trees.

- [ ] **Step 2: Write reproducibility tests**

Use injected deterministic RNG and assert identical training data produces identical prediction output.

- [ ] **Step 3: Write input-validation tests**

Reject empty data, mismatched X/y lengths, nonnumeric feature values, and zero trees.

- [ ] **Step 4: Run tests and confirm failure**

Run: `node --test tests/random-forest.test.mjs`
Expected: FAIL.

- [ ] **Step 5: Implement Random Forest regression**

Use bootstrap sampling, random feature subsets, regression split loss based on weighted variance/MSE, terminal-node mean response, and forest mean prediction.

- [ ] **Step 6: Run tests**

Run: `node --test tests/random-forest.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add js/random-forest.js tests/random-forest.test.mjs
git commit -m "feat: add browser random forest regressor"
```

### Task 8: Hazard sample building, training, and prediction

**Files:**
* Create: `js/hazard-model.js`
* Create: `tests/hazard-model.test.mjs`

**Interfaces:**
* Produces: `buildTrainingSamples({rasters, hazardId, geometry, maxSamples, random})`, `trainHazardModel({samples, trees, random})`, `predictHazardSurface({rasters, hazardId, model, geometry, futureLandcover, scenario, yieldFn})`
* Consumes: DEM, slope, river distance, urban distance, rainfall, temperature, present land cover, hazard response raster; future prediction substitutes scenario rainfall/temperature and internal future land cover

- [ ] **Step 1: Write failing predictor-order tests**

Assert every row uses predictor order `[dem, slope, distRiver, distUrban, rain, temp, landcover]` for both hazard models.

- [ ] **Step 2: Write class-balance failure tests**

Assert training stops if valid AOI samples contain only response 0 or only response 1.

- [ ] **Step 3: Write NoData and AOI tests**

Assert cells outside geometry or containing invalid predictor/response values never enter the training set and remain NoData in output.

- [ ] **Step 4: Write scenario substitution tests**

Assert future prediction uses scenario-adjusted rainfall/temperature and `futureLandcover`, not present values.

- [ ] **Step 5: Run tests and confirm failure**

Run: `node --test tests/hazard-model.test.mjs`
Expected: FAIL.

- [ ] **Step 6: Implement bounded sample collection and model calls**

Use reservoir sampling with a hard maximum from the UI and return diagnostics with valid, positive, negative, and retained sample counts.

- [ ] **Step 7: Implement asynchronous prediction yields**

Accept `yieldFn` and call it periodically by raster row so browser controls and progress remain responsive during large predictions.

- [ ] **Step 8: Run tests**

Run: `node --test tests/hazard-model.test.mjs`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add js/hazard-model.js tests/hazard-model.test.mjs
git commit -m "feat: add landslide and flood hazard modeling pipeline"
```

### Task 9: Leaflet map, raster overlays, hazard color ramps, and legends

**Files:**
* Create: `js/map.js`
* Create: `tests/hazard-colors.test.mjs`
* Modify: `css/app.css`

**Interfaces:**
* Produces: `createMap(containerId)`, `setMunicipalityBoundary(feature)`, `setBarangayBoundary(feature)`, `showBaselineHazard(id, raster)`, `showFutureHazard(id, raster)`, `removeHazardLayer(id)`, `setLocalBasemap(raster)`, `hazardColor(kind, value)`, `refreshLayerControl()`
* Consumes: Leaflet global/runtime, raster-like objects, GeoJSON features

- [ ] **Step 1: Write failing color-ramp tests**

Assert values at 0, 0.25, 0.5, 0.75, and 1 return ordered landslide warm-ramp colors and separate flood blue-ramp colors; invalid/NoData returns transparency.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/hazard-colors.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement map setup and transparent administrative boundaries**

Municipality and Barangay outlines use distinct colors and no fill; Municipality remains visible when Barangay is selected.

- [ ] **Step 4: Implement canvas-backed raster overlays**

Baseline and future landslide/flood layers are separate entries in the Leaflet layer control. Future land cover has no rendering path.

- [ ] **Step 5: Implement hazard legend and opacity support**

Keep hazard legends labeled as susceptibility / relative hazard score.

- [ ] **Step 6: Run color tests**

Run: `node --test tests/hazard-colors.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add js/map.js css/app.css tests/hazard-colors.test.mjs
git commit -m "feat: render baseline and future hazard map overlays"
```

### Task 10: Online/offline basemap behavior and local launcher

**Files:**
* Create: `tools/serve.ps1`
* Create: `start.bat`
* Create: `start.sh`
* Create: `data/basemap/README.md`
* Modify: `js/map.js`
* Modify: `js/ui.js`
* Modify: `index.html`

**Interfaces:**
* Produces: `setNetworkState(isOnline)`, `tryOnlineBasemap()`, `useNeutralBasemap()`, user-selected local raster basemap support
* Consumes: browser `navigator.onLine`, online/offline events, local basemap raster

- [ ] **Step 1: Write an offline dependency test**

Assert runtime HTML/JS contains no mandatory remote import, no Nominatim dependency, and the app has a neutral fallback path.

- [ ] **Step 2: Run test and confirm expected failures**

Run: `node --test tests/offline.test.mjs`
Expected: FAIL until fallback behavior is implemented.

- [ ] **Step 3: Implement online OpenStreetMap with failure fallback**

Attempt OSM only while online. Tile failures or offline events must not disable the map; switch to neutral/local basemap while keeping boundaries and hazard overlays intact.

- [ ] **Step 4: Implement Windows launcher**

`start.bat` invokes `tools/serve.ps1`. `serve.ps1` starts a localhost static server from the repository root using Windows PowerShell/.NET and opens the browser. No Python or Node runtime is required for normal Windows use.

- [ ] **Step 5: Implement macOS/Linux convenience launcher**

`start.sh` tries an available local static-server runtime and otherwise prints clear instructions; Windows remains the primary supported offline target.

- [ ] **Step 6: Run offline tests**

Run: `node --test tests/offline.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/serve.ps1 start.bat start.sh data/basemap/README.md js/map.js js/ui.js index.html tests/offline.test.mjs
git commit -m "feat: support offline laptop launch and basemap fallback"
```

### Task 11: Application orchestration and complete scenario workflow

**Files:**
* Create: `js/app.js`
* Modify: `index.html`
* Modify: `css/app.css`
* Create: `data/boundaries/README.md`

**Interfaces:**
* Consumes: all interfaces from Tasks 2–10
* Produces: user-facing workflow for loading boundaries/rasters, selecting AOI, configuring scenarios, running models, and displaying diagnostics/results

- [ ] **Step 1: Add integration assertions to `tests/shell.test.mjs`**

Assert the UI includes Municipality and Barangay selectors, separate vector inputs, all ten required environmental raster inputs, future year, baseline year/time slice, rainfall mode/value, temperature mode/value, land-cover intensity, tree count, sample cap, local basemap input, and one complete-scenario run button.

- [ ] **Step 2: Run tests and confirm failure for missing orchestration hooks**

Run: `npm test`
Expected: FAIL for unimplemented event hooks or missing controls.

- [ ] **Step 3: Wire vector loading and cascading AOI selection**

Selecting Municipality zooms and highlights Municipality. Selecting Barangay filters by Municipality, zooms further, and changes active modeling mask to Barangay.

- [ ] **Step 4: Wire raster loading and baseline hazard display**

Loading present landslide/flood rasters adds independent baseline layers. Other rasters remain model inputs only.

- [ ] **Step 5: Wire complete modeling pipeline**

Validate inputs, calculate future land cover internally, train landslide model, predict future landslide, train flood model, predict future flood, then display only the two future hazard outputs.

- [ ] **Step 6: Wire diagnostics and progress**

Report model sample counts, selected AOI, future scenario values, warnings, and completion state without exposing the future land-cover raster as a map product.

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add js/app.js index.html css/app.css data/boundaries/README.md tests
git commit -m "feat: wire complete climate hazard simulation workflow"
```

### Task 12: Documentation, GitHub Pages readiness, and final verification

**Files:**
* Create: `README.md`
* Modify: `package.json`
* Modify as needed: all implementation files based on verification findings

**Interfaces:**
* Consumes: complete application
* Produces: documented installation, offline launch, online demonstration, data-preparation requirements, model limitations, and verification record

- [ ] **Step 1: Write README setup and data-preparation documentation**

Document required raster inputs, common grid requirement, GeoJSON fields, online GitHub Pages behavior, offline `start.bat` behavior, recommended 8 GB minimum / 16 GB RAM, and the difference between susceptibility score and calibrated probability.

- [ ] **Step 2: Run all automated tests**

Run: `npm test`
Expected: PASS with zero failures.

- [ ] **Step 3: Start the local offline server**

Run on Windows: `start.bat`
Expected: browser opens local simulator and all runtime libraries load from repository paths.

- [ ] **Step 4: Perform browser smoke verification**

Verify Municipality and Barangay GeoJSON loading, cascading selection, zoom/highlight behavior, raster selection, baseline overlays, scenario controls, progress, both hazard outputs, layer toggles, legends, and diagnostics.

- [ ] **Step 5: Perform an explicit offline smoke verification**

Disconnect network or use browser offline mode, reload local app, verify the Online/Offline indicator changes, OSM is replaced by neutral/local basemap, and Municipality/Barangay plus hazard layers remain usable.

- [ ] **Step 6: Verify future land-cover secrecy requirement**

Search UI, layer-control labels, and rendering code for any `Future land cover` map output. Expected: no map-visible future land-cover layer exists.

- [ ] **Step 7: Verify repository remains GitHub Pages-compatible**

Serve repository root as a static site and verify relative paths work without a build step.

- [ ] **Step 8: Commit documentation and verification fixes**

```bash
git add README.md package.json .
git commit -m "docs: document and verify offline hazard simulator"
```

## Self-Review Notes

### Spec coverage

The plan covers the approved requirements for OpenStreetMap online use, local/offline fallback, Municipality and Barangay dropdowns, distinct transparent boundaries, local raster/environmental input, hidden future land-cover projection, separate Random Forest regression models, future landslide/flood raster overlays, baseline hazard comparison, diagnostics, progress, laptop performance safeguards, and offline launch.

### Interface consistency

`futureLandcover` exists only as an internal model product passed to `predictHazardSurface()`. Map rendering accepts only local basemap, boundaries, baseline hazard, and future hazard raster products.

### Scope limits retained

Browser-side raster reprojection, automated OSM tile downloading, calibrated probabilistic hazard claims, full land-use cellular automata, desktop installer packaging, and cloud persistence remain outside the first release.
