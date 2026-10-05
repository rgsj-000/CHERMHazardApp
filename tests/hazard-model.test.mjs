import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingSamples, trainHazardModel, predictHazardSurface } from '../js/hazard-model.js';
const mk=(id,data,nodata=-9999)=>({id,width:2,height:2,bbox:[0,0,2,2],nodata,data:new Float32Array(data)});
function rasters(hazardId='landslide',haz=[0,1,0,1]){return {
 dem:mk('dem',[10,20,30,40]),slope:mk('slope',[1,2,3,4]),distRiver:mk('distRiver',[100,200,300,400]),distUrban:mk('distUrban',[5,6,7,8]),rain:mk('rain',[1000,1100,1200,1300]),temp:mk('temp',[25,26,27,28]),presentLC:mk('presentLC',[1,2,3,4]),[hazardId]:mk(hazardId,haz)
};}

test('training predictor order is dem slope river urban rain temp landcover',()=>{
  const s=buildTrainingSamples({rasters:rasters(),hazardId:'landslide',geometry:null,maxSamples:10,random:()=>0.1});
  const row=s.X.find(r=>r[0]===10);
  assert.deepEqual(row,[10,1,100,5,1000,25,1]);
});

test('single-class hazard samples stop training',()=>{
  const s=buildTrainingSamples({rasters:rasters('flood',[1,1,1,1]),hazardId:'flood',geometry:null,maxSamples:10,random:()=>0.2});
  assert.throws(()=>trainHazardModel({samples:s,trees:5,random:()=>0.2}),/both occurrence and nonoccurrence/i);
});

test('NoData and cells outside AOI are excluded',()=>{
  const rs=rasters();rs.slope.data[0]=NaN;
  const geom={type:'Polygon',coordinates:[[[0,1],[2,1],[2,2],[0,2],[0,1]]]};
  const s=buildTrainingSamples({rasters:rs,hazardId:'landslide',geometry:geom,maxSamples:10,random:()=>0.2});
  assert.equal(s.X.length,1);
  assert.deepEqual(s.X[0],[20,2,200,6,1100,26,2]);
  assert.deepEqual(s.y,[1]);
});

test('future prediction substitutes scenario climate and future land cover',async()=>{
  const rs=rasters(); const futureLC=mk('futureLandcover',[9,9,9,9],NaN); const seen=[];
  const model={predict(row){seen.push(row);return .75;}};
  const out=await predictHazardSurface({rasters:rs,hazardId:'landslide',model,geometry:null,futureLandcover:futureLC,scenario:{rainChange:10,rainMode:'pct',tempChange:2,tempMode:'c'},yieldFn:async()=>{}});
  assert.deepEqual(seen[0],[10,1,100,5,1100,27,9]);
  assert.equal(out.data[0],.75);
});
