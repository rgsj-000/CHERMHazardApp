import test from 'node:test';
import assert from 'node:assert/strict';
import { RASTER_DEFS, requiredModelRasterIds, visibleOutputKeys } from '../js/app.js';

test('app requires the complete environmental and baseline hazard raster set',()=>{
  assert.deepEqual(RASTER_DEFS.filter(x=>!x.optional).map(x=>x.id),['dem','slope','distRiver','distUrban','rain','temp','pastLC','presentLC','landslide','flood']);
  assert.deepEqual(requiredModelRasterIds(),['dem','slope','distRiver','distUrban','rain','temp','presentLC','pastLC','landslide','flood']);
});

test('future land cover is not a visible map output',()=>{
  assert.deepEqual(visibleOutputKeys(),['baseline_landslide','baseline_flood','future_landslide','future_flood']);
  assert.equal(visibleOutputKeys().some(x=>/landcover/i.test(x)),false);
});
