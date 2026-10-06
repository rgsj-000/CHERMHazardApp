import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingSamples, trainHazardModel, predictHazardSurface } from '../js/hazard-model.js';
const raster=(data,extra={})=>({width:3,height:1,bbox:[121,13,121.3,13.1],data:new Float32Array(data),nodata:-9999,...extra});
function inputs(){return Object.fromEntries(['dem','slope','distRiver','distUrban','rain','temp','presentLC','distCoast','flowAcc'].map((id,i)=>[id,raster([i+1,i+2,i+3])]));}

test('class hazard targets preserve variation without inventing nonoccurrence cells',()=>{
  const rasters={...inputs(),landslide:raster([1,2,3],{target:{kind:'susceptibility',min:1,max:3}})};
  const samples=buildTrainingSamples({rasters,hazardId:'landslide',maxSamples:10});
  assert.deepEqual([...samples.y].sort(),[0,.5,1]);
  assert.equal(samples.stats.targetKind,'susceptibility');
  assert.equal(samples.X[0].length,9);
  assert.doesNotThrow(()=>trainHazardModel({samples,trees:5}));
});

test('optional coast and flow predictors also reach future prediction in training order',async()=>{
  const rasters={...inputs(),flood:raster([0,1,2],{target:{kind:'susceptibility',min:0,max:2}})};
  const samples=buildTrainingSamples({rasters,hazardId:'flood',maxSamples:10});
  let calls=0;
  const model={predictorIds:samples.predictorIds,predict(values){calls++;assert.equal(values.length,9);assert.equal(values[7],8+(calls-1));assert.equal(values[8],9+(calls-1));return .5;}};
  const result=await predictHazardSurface({rasters,hazardId:'flood',model,futureLandcover:rasters.presentLC,scenario:{rainChange:0,rainMode:'pct',tempChange:0,tempMode:'c'}});
  assert.deepEqual([...result.data],[.5,.5,.5]);
});

test('classified hazard NoData remains excluded rather than becoming a zero target',()=>{
  const rasters={...inputs(),flood:raster([0,2,-9999],{target:{kind:'susceptibility',min:0,max:2}})};
  const samples=buildTrainingSamples({rasters,hazardId:'flood'});
  assert.equal(samples.stats.valid,2);
  assert.deepEqual([...samples.y].sort(),[0,1]);
});
