import test from 'node:test';
import assert from 'node:assert/strict';
import { runScenarioModels } from '../js/scenario-runner.js';
import { buildTrainingSamples } from '../js/hazard-model.js';
const raster=(name,data,target)=>({name,width:6,height:1,bbox:[121,13,121.6,13.1],nodata:-9999,data:Float32Array.from(data),target});
function rasters(){
  const values=[1,2,3,4,5,6];
  const inputs=Object.fromEntries(['dem','slope','distRiver','distUrban','rain','temp','pastLC','presentLC'].map(id=>[id,raster(`${id}.tif`,values)]));
  inputs.landslide=raster('landslide.tif',[1,2,3,1,2,3],{kind:'susceptibility',min:1,max:3});
  inputs.flood=raster('25yr_flood.tif',[-9999,-9999,-9999,-9999,-9999,-9999],{kind:'susceptibility',min:1,max:3});
  return inputs;
}
const scenario={baselineYear:2020,futureYear:2050,landcoverIntensity:26,rainChange:10,rainMode:'pct',tempChange:1,tempMode:'c'};

test('missing flood labels preserve the available landslide scenario',async()=>{
  const result=await runScenarioModels({rasters:rasters(),scenario,trees:5,maxSamples:20});
  assert.ok(result.hazards.landslide.output.data.some(Number.isFinite));
  assert.equal(result.hazards.flood.output,null);
  assert.match(result.hazards.flood.error,/25yr_flood\.tif.*no valid.*flood|no valid.*flood.*25yr_flood\.tif/i);
  assert.equal(result.hazards.flood.samples.stats.areaCells,6);
  assert.equal(result.hazards.flood.samples.stats.predictorValid,6);
  assert.equal(result.hazards.flood.samples.stats.hazardValid,0);
});

test('missing landslide labels do not prevent a flood scenario',async()=>{
  const inputs=rasters();inputs.landslide.data.fill(-9999);
  inputs.flood=raster('5yr_flood.tif',[0,1,2,3,0,1],{kind:'susceptibility',min:0,max:3});
  const result=await runScenarioModels({rasters:inputs,scenario,trees:5,maxSamples:20});
  assert.equal(result.hazards.landslide.output,null);
  assert.ok(result.hazards.flood.output.data.some(Number.isFinite));
});

test('coverage diagnostics distinguish missing labels from missing predictors',()=>{
  const inputs=rasters();inputs.slope.data.fill(-9999);
  inputs.flood=raster('5yr_flood.tif',[0,1,2,3,0,1],{kind:'susceptibility',min:0,max:3});
  const samples=buildTrainingSamples({rasters:inputs,hazardId:'flood',areaMask:Uint8Array.from([1,1,0,0,0,0])});
  assert.equal(samples.stats.areaCells,2);
  assert.equal(samples.stats.predictorValid,0);
  assert.equal(samples.stats.hazardValid,2);
  assert.equal(samples.stats.missingByPredictor.slope,2);
  assert.equal(samples.stats.valid,0);
});

test('an area without raster cells has an actionable explanation',async()=>{
  const result=await runScenarioModels({rasters:rasters(),scenario,trees:5,areaMask:new Uint8Array(6)});
  assert.match(result.hazards.landslide.error,/no raster cell centers.*finer.*grid/i);
  assert.equal(result.hazards.landslide.output,null);
  assert.equal(result.hazards.flood.output,null);
});
