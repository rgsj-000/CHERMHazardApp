# CHERM Climate & Land-Cover Hazard Impact Simulator

A laptop-friendly browser application for exploring scenario-based impacts of climate and land-cover change on **rain-induced landslide** and **flood** susceptibility.

The simulator reads environmental rasters directly from the user's laptop, models future land cover internally, trains separate Random Forest regressors for landslide and flooding, and overlays baseline and future hazard rasters on an interactive Municipality/Barangay map.

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

The launcher uses Windows PowerShell's built-in `HttpListener` and opens:

```text
http://localhost:8000/
```

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

Training uses bounded, approximately class-balanced reservoir samples within the selected Municipality or Barangay. NoData, nonfinite values and cells outside the active polygon are excluded.

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
