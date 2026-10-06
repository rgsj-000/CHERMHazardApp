"""Data preparation checks use tiny real GeoTIFFs, not mocks."""
import importlib.util
import os
from pathlib import Path
from contextlib import contextmanager
from uuid import uuid4
import unittest

os.environ['PROJ_DATA'] = str(Path(importlib.util.find_spec('rasterio').origin).parent / 'proj_data')
import numpy as np
import rasterio
from rasterio.transform import from_origin

spec = importlib.util.spec_from_file_location('prepare_data', Path(__file__).parents[1] / 'tools' / 'prepare-data.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


@contextmanager
def fixture_directory():
    # Windows sandbox access works with inherited ACLs; tempfile's mode=0o700 does not.
    path = Path(__file__).parent / ('fixture-' + uuid4().hex)
    path.mkdir()
    try:
        yield path
    finally:
        assert path.resolve().is_relative_to(Path(__file__).parent.resolve())
        for file in path.iterdir():
            file.unlink()
        path.rmdir()


class PreparationTests(unittest.TestCase):
    def test_reprojection_uses_shared_grid_preserves_classes_and_nodata(self):
        with fixture_directory() as folder:
            source, output = Path(folder) / 'source.tif', Path(folder) / 'output.tif'
            transform = from_origin(121, 14, .1, .1)
            data = np.array([[1, 2], [3, 0]], dtype='uint8')
            with rasterio.open(source, 'w', driver='GTiff', width=2, height=2, count=1, dtype='uint8', crs='EPSG:4326', transform=transform, nodata=0) as dst:
                dst.write(data, 1)
            grid = {'transform': transform, 'width': 2, 'height': 2, 'crs': 'EPSG:4326'}
            result = prepare.prepare_raster(source, output, grid, categorical=True)
            with rasterio.open(output) as dst:
                np.testing.assert_array_equal(dst.read(1), [[1, 2], [3, -9999]])
                self.assertEqual(dst.nodata, -9999)
                self.assertEqual(dst.crs.to_epsg(), 4326)
                self.assertEqual(dst.transform, transform)
            self.assertEqual(result['validCells'], 3)

    def test_temperature_scaling_does_not_scale_nodata(self):
        with fixture_directory() as folder:
            source, output = Path(folder) / 'temp.tif', Path(folder) / 'output.tif'
            transform = from_origin(121, 14, .1, .1)
            with rasterio.open(source, 'w', driver='GTiff', width=2, height=1, count=1, dtype='float32', crs='EPSG:4326', transform=transform, nodata=-9999) as dst:
                dst.write(np.array([[250, -9999]], dtype='float32'), 1)
            prepare.prepare_raster(source, output, {'transform': transform, 'width': 2, 'height': 1, 'crs': 'EPSG:4326'}, scale=.1)
            with rasterio.open(output) as dst:
                np.testing.assert_allclose(dst.read(1), [[25, -9999]])

    def test_boundaries_transform_utm_coordinates_to_longitude_latitude(self):
        collection = {'type': 'FeatureCollection', 'crs': {'type':'name','properties':{'name':'EPSG:32651'}}, 'features': [{'type':'Feature', 'properties': {'Municipali':'Test'}, 'geometry':{'type':'Polygon','coordinates': [[[500000,0],[501000,0],[500000,1000],[500000,0]]]}}]}
        result = prepare.prepare_boundaries(collection)
        point = result['features'][0]['geometry']['coordinates'][0][0]
        np.testing.assert_allclose(point, [123, 0], atol=1e-6)
        self.assertNotIn('crs', result)
        self.assertEqual(result['features'][0]['properties']['Municipali'], 'Test')


if __name__ == '__main__':
    unittest.main()
