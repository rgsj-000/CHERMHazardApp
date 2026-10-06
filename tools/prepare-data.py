"""Organize RSTW2026 originals and build aligned GeoTIFFs for the static app.

Development-only: Python, NumPy and Rasterio are not needed to use the app.
"""
import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil

# Prefer the matching PROJ database shipped with Rasterio over system PostGIS.
os.environ['PROJ_DATA'] = str(Path(importlib.util.find_spec('rasterio').origin).parent / 'proj_data')
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.warp import calculate_default_transform, reproject, transform_geom

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
SOURCE = DATA / 'source' / 'rstw2026'
NODATA = -9999
INPUTS = {
    'dem': ('predictors', 'elevation.tif', False),
    'slope': ('predictors', 'slope.tif', False),
    'distRiver': ('predictors', 'dist2river.tif', False),
    'distUrban': ('predictors', 'dist2urban.tif', False),
    'rain': ('predictors', 'ann_rain_v2.tif', False),
    'temp': ('predictors', 'ann_temp_v2.tif', False),
    'distCoast': ('predictors', 'dist2coast4.tif', False),
    'flowAcc': ('predictors', 'flowacc.tif', False),
    'pastLC': ('landcover', 'past_landcover.tif', True),
    'presentLC': ('landcover', 'present_landcover.tif', True),
    'landslide': ('hazards', 'landslide.tif', True),
    'flood5': ('hazards', '5yr_flood.tif', True),
    'flood25': ('hazards', '25yr_flood.tif', True),
    'flood100': ('hazards', '100yr_flood.tif', True),
}


def organize_sources():
    extracted = DATA / 'RSTW2026_Final Envi Predictor Variables'
    moves = []
    if extracted.exists():
        for file in sorted(extracted.rglob('*')):
            if not file.is_file():
                continue
            category = next((group for group, name, _ in INPUTS.values()
                             if file.name == Path(name).stem + file.suffix
                             or file.name.startswith(name + '.')
                             or file.name == name), 'boundaries')
            target = SOURCE / category / file.name
            # Check resolved targets before moving any files. Refuse collisions.
            if not file.resolve().is_relative_to(DATA.resolve()) or not target.resolve().is_relative_to(DATA.resolve()):
                raise ValueError('Source organization must stay inside the project data folder.')
            if target.exists():
                raise FileExistsError(f'Will not overwrite original: {target}')
            moves.append((file, target))
    for archive in DATA.glob('RSTW2026*.zip'):
        target = DATA / 'source' / 'archives' / archive.name
        if target.exists():
            raise FileExistsError(f'Will not overwrite archive: {target}')
        moves.append((archive, target))
    for file, target in moves:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(file), str(target))
    if extracted.exists():
        # Only remove verified empty directories, never recursively delete data.
        for folder in sorted((p for p in extracted.rglob('*') if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
            if folder.resolve().is_relative_to(DATA.resolve()) and not any(folder.iterdir()):
                folder.rmdir()
        if not any(extracted.iterdir()):
            extracted.rmdir()
    print(f'Organized {len(moves)} original files; source values were preserved.', flush=True)


def prepare_boundaries(collection):
    result = copy.deepcopy(collection)
    source_crs = result.pop('crs', {}).get('properties', {}).get('name', 'EPSG:32651')
    for feature in result['features']:
        feature['geometry'] = transform_geom(source_crs, 'EPSG:4326', feature['geometry'], precision=7)
        feature.pop('bbox', None)
    result.pop('bbox', None)
    return result


def prepare_raster(source, output, grid, categorical=False, scale=1, mask=None):
    output.parent.mkdir(parents=True, exist_ok=True)
    array = np.full((grid['height'], grid['width']), NODATA, dtype='float32')
    resampling = Resampling.nearest if categorical else Resampling.bilinear
    with rasterio.open(source) as src:
        reproject(source=rasterio.band(src, 1), destination=array,
                  src_transform=src.transform, src_crs=src.crs, src_nodata=src.nodata,
                  dst_transform=grid['transform'], dst_crs=grid['crs'], dst_nodata=NODATA,
                  resampling=resampling, num_threads=2)
        original = {'crs': str(src.crs), 'width': src.width, 'height': src.height,
                    'bbox': list(src.bounds), 'nodata': src.nodata}
    valid = np.isfinite(array) & (array != NODATA)
    if mask is not None:
        valid &= mask
    array[~valid] = NODATA
    array[valid] *= scale
    with rasterio.open(output, 'w', driver='GTiff', width=grid['width'], height=grid['height'],
                       count=1, dtype='float32', crs=grid['crs'], transform=grid['transform'],
                       nodata=NODATA, compress='deflate') as dst:
        dst.write(array, 1)
    values = array[valid]
    result = {'path': output.relative_to(DATA).as_posix() if output.is_relative_to(DATA) else output.name,
              'source': source.relative_to(DATA).as_posix() if source.is_relative_to(DATA) else source.name,
              'sourceGrid': original, 'resampling': resampling.name, 'scale': scale,
              'validCells': int(values.size), 'min': float(values.min()) if values.size else None,
              'max': float(values.max()) if values.size else None}
    if categorical and ('flood' in source.name or source.name == 'landslide.tif'):
        result['target'] = {'kind': 'susceptibility', 'min': result['min'], 'max': result['max']}
    print(f'Prepared {source.name}: {grid["width"]} x {grid["height"]}, {values.size} valid cells', flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--max-dimension', type=int, default=1536, help='Maximum grid dimension; default 1536 for laptop use')
    parser.add_argument('--temperature-scale', type=float, default=1, help='Explicit multiplier for temperature values, e.g. 0.1 for tenths of Celsius')
    args = parser.parse_args()
    if args.max_dimension < 128 or not np.isfinite(args.temperature_scale) or args.temperature_scale <= 0:
        parser.error('Use max-dimension >= 128 and a finite positive temperature scale.')
    organize_sources()
    boundaries = {}
    for kind, name in [('municipality', 'Municipalities_geojson.geojson'), ('barangay', 'Barangays_geojson.json')]:
        collection = prepare_boundaries(json.loads((SOURCE / 'boundaries' / name).read_text(encoding='utf-8')))
        destination = DATA / 'boundaries' / f'{kind}.geojson'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(collection, separators=(',', ':')), encoding='utf-8')
        boundaries[kind] = destination.relative_to(DATA).as_posix()
        if kind == 'municipality':
            municipalities = collection
        print(f'Prepared {len(collection["features"])} {kind} boundaries.', flush=True)
    with rasterio.open(SOURCE / 'predictors' / 'elevation.tif') as src:
        transform, width, height = calculate_default_transform(src.crs, 'EPSG:4326', src.width, src.height, *src.bounds)
        factor = args.max_dimension / max(width, height)
        # Never upscale the source beyond its original resolution.
        if factor < 1:
            new_width, new_height = max(1, round(width * factor)), max(1, round(height * factor))
            transform = transform * rasterio.Affine.scale(width / new_width, height / new_height)
            width, height = new_width, new_height
    grid = {'crs': 'EPSG:4326', 'width': width, 'height': height, 'transform': transform}
    mask = geometry_mask([f['geometry'] for f in municipalities['features']], out_shape=(height, width), transform=transform, invert=True)
    rasters, floods = {}, {}
    for key, (group, name, categorical) in INPUTS.items():
        result = prepare_raster(SOURCE / group / name, DATA / 'rasters' / group / name, grid,
                                categorical=categorical, scale=args.temperature_scale if key == 'temp' else 1, mask=mask)
        if key.startswith('flood'):
            floods[key[5:]] = result
        else:
            rasters[key] = result
    rasters['flood'] = floods['5']
    bounds = list(rasterio.transform.array_bounds(height, width, transform))
    manifest = {'name': 'RSTW2026 Quezon environmental predictors', 'defaultFloodPeriod': '5',
                'boundaries': boundaries, 'rasters': rasters, 'floods': floods,
                'grid': {'crs': grid['crs'], 'width': width, 'height': height, 'bbox': bounds,
                         'pixelSize': [transform.a, -transform.e], 'nodata': NODATA},
                'notes': 'Aligned, reduced-resolution derivatives for laptop scenarios. Original class values and source NoData are preserved. Hazard classes are normalized to relative susceptibility scores, not occurrence records.',
                'temperatureScale': args.temperature_scale}
    (DATA / 'dataset.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('Wrote data/dataset.json.', flush=True)


if __name__ == '__main__':
    main()
