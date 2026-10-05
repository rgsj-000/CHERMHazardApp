# Climate and Land-Cover Hazard Impact Simulator

Date: 2026-10-05
Repository: `rgsj-000/CHERMHazardApp`
Status: Design specification for review

## 1. Purpose

Build a laptop-friendly web application for estimating how climate and land-cover change may affect rain-induced landslide and flooding hazards. The application must work with locally supplied GIS datasets, support municipal and barangay areas of interest, display current hazard conditions, model future hazard scenarios, and overlay resulting hazard rasters on a map.

The application must remain usable without an internet connection after it has been downloaded to the laptop.

## 2. Primary user workflow

1. Launch the application on a laptop.
2. Load or use locally packaged Municipality and Barangay polygon data.
3. Select a Municipality from a dropdown.
4. Select a Barangay filtered to the selected Municipality.
5. Automatically zoom to the selected administrative polygon.
6. Highlight Municipality and Barangay boundaries with different outline colors and no polygon fill.
7. Load environmental GeoTIFF inputs from the laptop.
8. View present or baseline landslide and flood rasters.
9. Configure a future scenario using future year or time slice, rainfall change, temperature change, and land-cover change intensity.
10. Internally estimate future land cover from past and present land-cover rasters.
11. Do not render the predicted future land-cover raster as a map layer.
12. Train and execute separate Random Forest hazard models for landslide and flooding.
13. Render predicted future landslide and flood rasters over the selected Municipality or Barangay.
14. Compare baseline and future hazard layers using the map layer control.

## 3. Required input data

### Raster inputs

* DEM / elevation
* Slope
* Distance to river
* Distance to urban area
* Annual rainfall
* Annual mean daily temperature
* Past land cover
* Present land cover
* Present landslide raster
* Present flood raster

The first implementation will accept GeoTIFF files from the user's local drive.

### Vector inputs

* Municipality polygons
* Barangay polygons

GeoJSON is the primary supported vector format for the first release because it can be parsed directly in the browser without a server or desktop GIS dependency.

Administrative features should expose municipality and barangay names through configurable or auto-detected attribute fields.

## 4. Scenario controls

The interface will provide controls for:

* Municipality
* Barangay
* Future year
* Baseline year or climate time slice
* Rainfall change in millimeters or percent
* Temperature change in degrees Celsius or percent
* Land-cover change intensity in percent
* Number of Random Forest trees
* Training sample limit

Slider controls will remain synchronized with numeric inputs.

## 5. Selected application architecture

### Selected approach: static browser application with local assets

The application will use HTML, CSS, and JavaScript and will run in Chrome or Edge on a laptop. Leaflet and GeoTIFF parsing libraries will be stored inside the repository instead of loaded from public CDNs.

This approach was selected because it:

* preserves the existing browser-based prototype direction;
* requires no Python, QGIS, ArcGIS, Node.js application server, or database for ordinary use;
* supports GitHub development and GitHub Pages for online demonstrations;
* can run offline after download when all runtime libraries and required GIS data are available locally;
* keeps user-supplied environmental datasets on the user's laptop.

### Alternative considered: Electron desktop package

Electron could provide stronger filesystem access and a desktop installer, but it would significantly increase application size and packaging complexity. It is not required for the first version.

### Alternative considered: Python desktop or local server application

Python with Rasterio, GeoPandas, scikit-learn, and Flask/FastAPI would provide more mature geospatial and machine-learning libraries. However, it would require Python installation or bundling and would make the application less portable for nontechnical users. This remains a possible future migration path if browser memory or modeling limitations become significant.

## 6. Repository structure

```text
CHERMHazardApp/
├── index.html
├── README.md
├── start.bat
├── start.sh
├── css/
│   └── app.css
├── js/
│   ├── app.js
│   ├── map.js
│   ├── boundaries.js
│   ├── raster.js
│   ├── landcover.js
│   ├── random-forest.js
│   └── hazard-model.js
├── assets/
│   ├── leaflet/
│   └── geotiff/
├── data/
│   ├── boundaries/
│   └── basemap/
└── docs/
    └── superpowers/
        └── specs/
```

Large user rasters should not be committed to GitHub unless they are intentionally selected sample datasets and are small enough for repository use.

## 7. Online and offline behavior

### Online mode

When internet access is available, the map may use OpenStreetMap tiles as the basemap.

### Offline mode

The modeling and GIS interface must not depend on the internet.

The application will use locally packaged JavaScript and CSS assets. Place search through remote geocoding services will not be required for navigation. Municipality and Barangay dropdowns will provide location navigation from local polygon data.

If OpenStreetMap tiles are unavailable, the app will continue to operate using one of these fallbacks:

1. a locally loaded basemap raster when supplied;
2. a neutral map background with administrative boundaries and hazard raster overlays.

The first release will prioritize reliable hazard visualization over packaging a very large offline street-map tile archive.

The UI will display an Online / Offline status indicator and the active basemap source.

## 8. Administrative boundary behavior

The Municipality and Barangay selectors are cascading.

When a Municipality is selected:

* zoom to its polygon;
* draw it with a visible outline and transparent fill;
* filter the Barangay dropdown to features belonging to that Municipality.

When a Barangay is selected:

* zoom to the Barangay polygon;
* keep the Municipality outline visible;
* draw the Barangay using a different outline color;
* use the Barangay polygon as the active modeling mask when appropriate.

If no Barangay is selected, the selected Municipality is the active modeling mask.

## 9. Raster validation and alignment

Hazard modeling requires environmental rasters to describe the same spatial grid or be transformed to a compatible analysis grid.

The first version will validate:

* raster width and height;
* bounding box;
* NoData values where available;
* geographic compatibility;
* finite predictor values.

The application will stop with a clear validation error when required rasters are not aligned.

Because browser-side reprojection is outside the initial scope, projected or mismatched rasters should be preprocessed to a common CRS, cell size, extent, and pixel alignment before modeling.

The recommended first-release analysis CRS is WGS 84 geographic coordinates when the source resolution and use case are appropriate for Leaflet display. A future release may add explicit reprojection support.

## 10. Land-cover projection

Past and present land-cover rasters will be compared to estimate observed class transitions.

The projected future land cover will use the historical transition pattern, future horizon, and user-specified land-cover change intensity to modify transition likelihood.

The resulting raster is an internal predictor only.

It must not:

* appear in the map layer control;
* be rendered as an image overlay;
* be presented as a user-facing final output.

The diagnostics panel may report that future land cover was calculated successfully without displaying the raster itself.

The model will clearly describe this as a simplified scenario projection rather than a validated land-use change model.

## 11. Hazard modeling

Two independent models will be trained:

### Rain-induced landslide model

Response / occurrence raster:

* Present landslide raster

Predictors:

* DEM
* Slope
* Distance to river
* Distance to urban area
* Annual rainfall
* Annual mean daily temperature
* Land cover

### Flood model

Response / occurrence raster:

* Present flood raster

Predictors:

* DEM
* Slope
* Distance to river
* Distance to urban area
* Annual rainfall
* Annual mean daily temperature
* Land cover

The current-condition model will be trained from present predictor values and present hazard occurrence.

Future prediction will substitute scenario-adjusted rainfall, scenario-adjusted temperature, and internally projected future land cover while retaining static terrain variables unless later requirements introduce terrain-change scenarios.

## 12. Random Forest implementation

The first browser implementation will use a lightweight Random Forest regressor written in JavaScript.

For binary occurrence rasters, response values are normalized to 0 or 1. Each regression tree stores the mean response value in a terminal node. Forest prediction is the average of the terminal-node predictions across all trees, producing a continuous value from approximately 0 to 1.

This output will be treated as a relative hazard probability / susceptibility score for visualization.

This is more appropriate for the requested Random Forest regression behavior than using majority-vote classification leaves.

The UI and documentation will avoid claiming calibrated probability unless calibration and validation are added later.

## 13. Sampling strategy

Training every raster cell may exceed laptop browser memory for large datasets.

The application will therefore use bounded sampling within the active area of interest.

The first implementation will:

* collect valid pixels only inside the selected Municipality or Barangay;
* skip NoData and invalid predictor cells;
* cap the training set using reservoir sampling;
* attempt to preserve both occurrence and nonoccurrence examples for binary hazard inputs;
* report the number of valid, positive, and negative training samples.

If only one response class exists within the selected area, the model must stop with a diagnostic instead of producing a misleading result.

## 14. Future climate scenario transformation

### Rainfall

Percent mode:

`futureRain = baselineRain × (1 + rainfallChange / 100)`

Millimeter mode:

`futureRain = baselineRain + rainfallChange`

### Temperature

Degree Celsius mode:

`futureTemp = baselineTemp + temperatureChange`

Percent mode:

`futureTemp = baselineTemp × (1 + temperatureChange / 100)`

Scenario values will be checked for nonfinite or clearly invalid results before prediction.

## 15. Hazard raster output

Future landslide and future flood outputs will be continuous raster surfaces restricted to the selected area of interest.

The rasters will be rendered in Leaflet as canvas-backed image overlays.

### Landslide color ramp

A perceptually ordered warm ramp will represent low to high hazard, for example:

* very low: pale yellow
* low: yellow
* moderate: orange
* high: red-orange
* very high: dark red

### Flood color ramp

A blue sequential ramp will distinguish flood hazard from landslide hazard, for example:

* very low: pale cyan
* low: light blue
* moderate: blue
* high: deep blue
* very high: dark navy

NoData and pixels outside the selected polygon remain transparent.

A legend will show the active hazard scale.

## 16. Map layers

The layer control will support:

* Online OpenStreetMap when available
* Optional local offline basemap
* Municipality boundary
* Barangay boundary
* Present landslide
* Present flood
* Future landslide
* Future flood

The predicted future land-cover raster will never appear as a selectable map layer.

## 17. Comparison behavior

Users must be able to visually compare present and future hazard conditions.

Baseline and future layers will have independent visibility controls.

The first release will use layer toggling and opacity controls. A swipe comparison tool may be added later but is not required for the initial implementation.

## 18. Local basemap handling

The app will support a user-selected local raster basemap for offline operation.

To keep the first release technically manageable, the preferred offline basemap input will be a georeferenced raster compatible with the analysis map extent.

OpenStreetMap tile downloading and redistribution will not be built into the application. When online, standard OpenStreetMap tile attribution will be retained.

## 19. Laptop performance targets

Target environment:

* Windows 10 or Windows 11 laptop
* Chrome or Edge
* 8 GB RAM minimum
* 16 GB RAM recommended
* modern Intel Core i5 / AMD Ryzen 5 class CPU or better recommended
* no dedicated GPU requirement

Performance safeguards will include:

* area-of-interest masking;
* bounded model sampling;
* asynchronous processing yields so the UI remains responsive;
* progress reporting;
* avoiding display of the future land-cover raster;
* avoiding unnecessary copies of large typed arrays where possible.

The app will warn users when raster size is likely to exceed practical browser-memory limits.

## 20. Local launcher

The repository will include `start.bat` for Windows and `start.sh` for macOS/Linux.

The launcher will start a local static file server when an appropriate built-in runtime is available and open the application in a browser.

The app should also be deployable to GitHub Pages for online demonstrations.

The documentation will distinguish:

* GitHub Pages use, which requires internet access;
* local laptop use, which can work without internet after the repository and required local assets have been downloaded.

## 21. User interface layout

Desktop layout:

* left control panel;
* right interactive Leaflet map.

Control-panel sections:

1. Area of Interest
2. Environmental Raster Inputs
3. Basemap
4. Future Scenario
5. Model Settings
6. Run Scenario
7. Map Layers / Opacity
8. Diagnostics
9. Processing Log

The application will remain usable on smaller laptop displays using a responsive layout.

## 22. Diagnostics and scientific transparency

The application will display:

* selected Municipality and Barangay;
* raster dimensions and bounding boxes;
* input validation status;
* model training sample counts;
* Random Forest tree count;
* response-class balance for binary occurrence rasters;
* active scenario transformations;
* model completion status;
* warnings about methodological limitations.

The interface and README will state that scenario outputs are decision-support estimates and require validation before operational hazard-management use.

## 23. Error handling

The app must provide specific errors for:

* missing required rasters;
* unreadable GeoTIFF or GeoJSON files;
* incompatible raster grids;
* missing Municipality or Barangay attributes;
* too few valid training cells;
* one-class hazard occurrence data;
* unsupported geographic metadata;
* browser memory pressure when detectable;
* failed online basemap access.

A failure in the online basemap must not stop local modeling.

## 24. Privacy and local-data behavior

Environmental rasters loaded through browser file inputs remain local to the user's machine. The first version will not upload GIS input files to a remote server.

This behavior will be explained in the user interface and README.

## 25. Initial acceptance criteria

The first functional release is complete when all of the following are true:

1. The application launches locally on a laptop.
2. All application runtime libraries required for modeling are stored locally.
3. The map can use OpenStreetMap when online.
4. The map remains usable when offline without OpenStreetMap.
5. Municipality and Barangay dropdowns work from local polygon data.
6. Selecting an administrative area zooms to and highlights its polygon.
7. Municipality and Barangay outlines are visually distinct and have transparent fill.
8. All required environmental GeoTIFF inputs can be selected from the local drive.
9. Present landslide and flood rasters can be displayed.
10. Future land cover is calculated internally but is not displayed.
11. Rainfall and temperature scenarios affect future prediction inputs.
12. Separate Random Forest regression models execute for landslide and flood.
13. Future landslide and flood rasters are rendered on the map.
14. Output rasters are masked to the selected area of interest.
15. Baseline and future hazard layers can be compared.
16. The application reports invalid or mismatched raster inputs clearly.
17. Modeling continues to function without internet access.
18. A README explains preparation of GIS data, local startup, limitations, and GitHub Pages deployment.

## 26. Explicitly deferred features

The following are outside the first implementation unless later requested:

* server-side processing;
* cloud raster storage;
* user accounts;
* database persistence;
* automatic raster reprojection;
* automatic resampling of mismatched grids;
* downloading OpenStreetMap tiles for offline redistribution;
* GPU acceleration;
* calibrated probabilistic risk estimates;
* damage or exposure estimation;
* population or infrastructure risk modeling;
* automated climate-model data downloads;
* advanced land-use cellular automata models.

## 27. Implementation sequencing

Implementation should proceed in these stages after this specification is approved:

1. project scaffold and local runtime assets;
2. Leaflet map and online/offline basemap behavior;
3. Municipality and Barangay vector workflow;
4. local GeoTIFF loader and validation;
5. baseline hazard rendering;
6. hidden land-cover scenario model;
7. Random Forest regression engine;
8. landslide model pipeline;
9. flood model pipeline;
10. raster masking, legends, opacity and comparison controls;
11. diagnostics and error handling;
12. offline launcher and README;
13. browser verification using representative small test datasets.

## 28. Design constraint summary

The key product constraint is that future land cover influences future hazard predictions but is not itself a displayed result. The user-facing outputs are the current and future landslide and flood hazard surfaces within the selected Municipality or Barangay.

The key deployment constraint is that the downloaded application must remain usable on a laptop without internet access.