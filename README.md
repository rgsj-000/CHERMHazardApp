# CHERM Climate & Land-Cover Hazard Impact Simulator

A laptop-friendly browser application for exploring scenario-based impacts of climate and land-cover change on **rain-induced landslide** and **flood** susceptibility.

The simulator automatically loads the bundled RSTW2026 Quezon dataset, supports replacement inputs from the user's laptop, models future land cover internally, trains separate Random Forest regressors for landslide and flooding, and overlays baseline and future hazard rasters on an interactive Municipality/Barangay map.

## Bundled RSTW2026 data

Launch `start.bat`, wait for the dataset to load, select a Municipality (and optionally a Barangay), then run a scenario. File selection is only needed to replace bundled inputs. Use **Reload RSTW2026 data** to restore the defaults.

* `data/boundaries/`: WGS 84 GeoJSON for 40 municipalities and 1,243 barangays.
* `data/rasters/predictors/`: elevation, slope, river/urban/coast distance, rainfall, temperature and flow accumulation.
* `data/rasters/landcover/`: past and present land cover.
* `data/rasters/hazards/`: landslide and 5-, 25- and 100-year flood rasters. The default flood return period is 5 years; change it using the selector in the app.
* `data/dataset.json`: file paths, common grid, source metadata, valid-cell counts, resampling and hazard target ranges.
* `data/source/rstw2026/`: original-resolution rasters, shapefiles, source GeoJSON and companion files organized by type.
* `data/source/archives/`: original download ZIP. Source files are retained locally and excluded from Git; the browser loads only prepared derivatives.

The original UTM zone 51N inputs had different dimensions and extents. Their prepared derivatives share an EPSG:4326 grid of **1,157 × 1,536 cells**, approximately **150 m** per cell, based on the elevation raster extent and masked to the municipality boundaries. Continuous predictors use bilinear resampling; land-cover and hazard class rasters use nearest-neighbor resampling. The 14 prepared rasters total approximately 13 MB. These reduced-resolution inputs are intended for laptop scenario exploration; small features can be lost during resampling.

The supplied temperature values are stored in tenths of °C, confirmed by the dataset owner. The app divides by 10 when loading bundled temperatures, preserving NoData. The units selector applies only to the bundled input; manually selected temperature rasters must already use °C.

The hazard files contain class maps, rather than event occurrence records. Bundled model targets are class values normalized to 0–1 over the valid range recorded in the manifest. Original NoData is preserved, including 0 in the landslide/25-year flood rasters and 3 in the 100-year flood raster; masked cells are not relabeled as nonoccurrence. Some small areas may contain insufficient valid cells or only one class; select a larger area when the model reports this. Confirm the source hazard class meanings before operational interpretation.

Landslide and flood scenarios finish independently. If one hazard has no usable training cells or class variation, its explanation appears in the status and Diagnostics, while the available hazard layer remains visible. Diagnostics distinguish area cells, complete predictor cells, valid hazard labels and overlapping training cells. For example, **Magsaysay, Atimonan has no valid 25-year flood labels** in the supplied dataset; its landslide scenario can still run. Such missing coverage does not mean zero flood susceptibility.

Distance to coast and flow accumulation join the model as optional predictors when loaded. Their removal buttons let you omit them. When a required input is replaced with data on another grid, incompatible bundled optional predictors are cleared automatically. Future land cover remains internal to the model.

To regenerate the prepared files, install the development GIS requirements and run:

```text
python -m pip install -r tools/requirements-gis.txt
python tools/prepare-data.py
python tests/prepare-data.test.py
```

The preparation script keeps temperature values in their source units; the app handles their confirmed scale. Use `--max-dimension 3072` to prepare a finer grid, with increased memory and processing costs. No Python or GIS software is needed during normal app use. Preparation follows [Rasterio's reprojection](https://rasterio.readthedocs.io/en/stable/topics/reproject.html) and [resampling](https://rasterio.readthedocs.io/en/stable/topics/resampling.html) APIs.

## What the app does

1. Loads Municipality and Barangay polygons from local GeoJSON files.
2. Provides cascading Municipality and Barangay dropdowns and zooms to the selected boundary.
3. Highlights Municipality and Barangay outlines using different colors with transparent fill.
4. Loads DEM, slope, distance-to-river, distance-to-urban, rainfall, temperature, past/present land cover, present landslide and present flood GeoTIFFs from the local drive.
5. Displays present landslide and flood rasters as baseline overlays.
6. Applies rainfall, temperature, future-year and land-cover-change scenario controls.
7. Projects a future land-cover raster internally. **Future land cover is never displayed as a map layer.**
8. Trains separate Random Forest regression models for landslide and flood occurrence.
9. Displays future landslide and flood susceptibility surfaces from 0 to 1.
10. Works without internet after the repository and vendored runtime files have been downloaded.

## Important scientific interpretation

The model output is a **relative susceptibility / hazard score**, not a calibrated probability of a landslide or flood occurring. Calibration, independent validation, uncertainty analysis and model-performance metrics should be added before operational decision making.

The first release uses a simplified land-cover transition projection. Because the requested inputs do not include the acquisition year of the historical land-cover raster, one observed past-to-present transition step is scaled against a 30-year reference future horizon and the user-specified land-cover-change intensity. This assumption should be replaced with explicit historical dates in a research-grade version.

## Raster requirements

All environmental and hazard rasters used together must be preprocessed to the same:

* coordinate reference system
* width and height
* spatial extent
* pixel size
* pixel registration / alignment

Browser-side reprojection and resampling are intentionally outside the first release. For direct Leaflet overlay, WGS 84 geographic coordinates are recommended where appropriate for the source data and analysis scale.

## Required raster inputs

| ID | Input |
| --- | --- |
| `dem` | DEM / elevation |
| `slope` | Slope |
| `distRiver` | Distance to river |
| `distUrban` | Distance to urban area |
| `rain` | Annual rainfall |
| `temp` | Annual mean daily temperature |
| `pastLC` | Past land cover |
| `presentLC` | Present land cover |
| `landslide` | Present landslide raster |
| `flood` | Present flood raster |

GeoTIFF is supported for raster input. Municipality and Barangay boundaries use GeoJSON FeatureCollections.

## Windows offline use

Download or clone the repository **after the `vendor/` folder has been populated**. Then double-click:

```text
start.bat
```

The launcher uses Windows PowerShell and .NET's built-in loopback TCP server. It opens the browser automatically and prints the app address in the launcher window, normally:

```text
http://127.0.0.1:8000/
```

If port 8000 is occupied or reserved, the launcher selects another available port. Keep the launcher window open while using the app; closing it stops the local server. Startup errors stay visible rather than disappearing when the batch window closes. Administrator privileges are not required.

No Python, Node.js, QGIS, ArcGIS, database or internet connection is required for normal Windows use once the repository contains the vendored browser assets.

When the laptop is online, OpenStreetMap is used as the default basemap. When offline, the simulator continues using a neutral map background or an optional locally selected georeferenced GeoTIFF basemap.

## macOS / Linux development launch

`start.sh` uses Python 3's basic HTTP server when Python is installed:

```bash
./start.sh
```

## Development

Node.js is used only for development tests and for copying pinned browser dependencies into `vendor/`.

```bash
npm install --ignore-scripts
npm run vendor
npm test
```

For local browser verification with an installed headless Edge/Chrome and a running static server:

```text
node tools/verify-dataset.mjs http://127.0.0.1:8765/
```

An optional second argument selects the browser executable. This checks automatic loading, alignment, temperature scaling, barangay filtering, all flood return periods, a complete Tiaong scenario (5 trees / 200 samples), clearing old outputs after input changes, and the Magsaysay/Atimonan 25-year coverage gap (35 trees / 1,000 samples). Screenshots and the report are saved in `docs/verification/`. The scenario reuses one rasterized area mask to avoid repeated polygon scans.

Pinned browser runtime versions:

* Leaflet 1.9.4
* GeoTIFF.js 2.1.3

The GitHub Actions workflow `.github/workflows/vendor-assets.yml` performs this vendoring process on the feature branch and commits the resulting browser files into the repository so downloaded releases work offline.

## GitHub Pages

The static application is compatible with GitHub Pages. GitHub Pages itself requires internet access, and OpenStreetMap tiles also require internet access. The same repository can be downloaded for offline laptop use.

## Modeling pipeline

```text
Past land cover + Present land cover
                │
                ▼
      Future land cover
        internal only
                │
      ┌─────────┴─────────┐
      ▼                   ▼
Landslide model       Flood model
      │                   │
DEM, slope, river distance, urban distance,
scenario rainfall, scenario temperature,
future land cover
      │                   │
      ▼                   ▼
Future landslide      Future flood
susceptibility        susceptibility
      └─────────┬─────────┘
                ▼
         Leaflet map overlays
```

Training uses bounded reservoir samples within the selected Municipality or Barangay. Bundled class-map targets use a uniform sample and normalized class scores. Manual occurrence inputs retain the approximately balanced occurrence/nonoccurrence sampling. NoData, nonfinite values and cells outside the active polygon are excluded.

## Laptop guidance

8 GB RAM is a practical minimum and 16 GB is recommended for larger municipal rasters. A modern Core i5 / Ryzen 5 class CPU or better is recommended. A dedicated GPU is not required.

Very large GeoTIFFs can exceed browser memory. Pre-clip and resample source datasets to the intended study area and resolution when needed.

## Current limitations

* No browser-side CRS transformation or raster resampling
* First GeoTIFF band only
* Offline local basemap displayed as grayscale from the first band
* Simplified land-cover transition projection
* No independent model validation or calibrated probability output
* Random Forest implementation is optimized for portable browser use, not large national-scale rasters

## Repository branches

Development for the first offline simulator is performed on `feature/offline-hazard-simulator`. Merge into `main` only after review and validation with representative CHERM datasets.
