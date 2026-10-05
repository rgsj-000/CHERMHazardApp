import test from 'node:test';
import assert from 'node:assert/strict';
import { sameGrid, validateAlignedRasters, pixelCenter, rasterIndex, isNoData } from '../js/raster.js';
const raster=(id,overrides={})=>({id,width:2,height:2,bbox:[120,14,122,16],nodata:-9999,data:new Float32Array([1,2,3,4]),...overrides});

test('sameGrid compares dimensions and bounding box',()=>{
  assert.equal(sameGrid(raster('a'),raster('b')),true);
  assert.equal(sameGrid(raster('a'),raster('b',{width:3})),false);
  assert.equal(sameGrid(raster('a'),raster('b',{bbox:[120,14,122.01,16]})),false);
});

test('validateAlignedRasters names conflicting raster ids',()=>{
  const rs={dem:raster('dem'),slope:raster('slope',{height:3})};
  assert.throws(()=>validateAlignedRasters(rs,['dem','slope']),/dem.*slope|slope.*dem/i);
  assert.throws(()=>validateAlignedRasters({dem:raster('dem')},['dem','slope']),/Missing raster.*slope/i);
});

test('NoData rejects nonfinite and explicit nodata',()=>{
  assert.equal(isNoData(NaN,-9999),true);
  assert.equal(isNoData(Infinity,-9999),true);
  assert.equal(isNoData(-9999,-9999),true);
  assert.equal(isNoData(0,-9999),false);
});

test('pixelCenter and rasterIndex use north-up geographic bbox',()=>{
  const r=raster('dem');
  assert.deepEqual(pixelCenter(r,0,0),[120.5,15.5]);
  assert.equal(rasterIndex(r,120.5,15.5),0);
  assert.equal(rasterIndex(r,121.5,14.5),3);
  assert.equal(rasterIndex(r,119,15),-1);
  assert.equal(rasterIndex(r,122.1,15),-1);
});
