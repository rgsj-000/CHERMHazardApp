import test from 'node:test';
import assert from 'node:assert/strict';
import * as lc from '../js/landcover.js';
const mk=(data)=>({id:'lc',width:2,height:2,bbox:[0,0,2,2],nodata:-9999,data:new Float32Array(data)});

test('deriveTransitions counts observed class changes',()=>{
  const t=lc.deriveTransitions(mk([1,1,2,2]),mk([1,2,2,3]),null);
  assert.equal(t.get(1).get(1),1); assert.equal(t.get(1).get(2),1);
  assert.equal(t.get(2).get(2),1); assert.equal(t.get(2).get(3),1);
});

test('future land cover respects AOI mask and deterministic RNG',()=>{
  const geometry={type:'Polygon',coordinates:[[[0,1],[1,1],[1,2],[0,2],[0,1]]]};
  const result=lc.projectFutureLandcover({pastRaster:mk([1,1,2,2]),presentRaster:mk([1,2,2,3]),geometry,baselineYear:2020,futureYear:2050,intensity:100,random:()=>0});
  assert.equal(Number.isNaN(result.data[0]),false);
  assert.equal(Number.isNaN(result.data[1]),true);
  assert.equal(Number.isNaN(result.data[2]),true);
  assert.equal(Number.isNaN(result.data[3]),true);
});

test('same baseline and future year keeps present classes inside AOI',()=>{
  const present=mk([1,2,2,3]);
  const result=lc.projectFutureLandcover({pastRaster:mk([1,1,2,2]),presentRaster:present,geometry:null,baselineYear:2020,futureYear:2020,intensity:100,random:()=>0});
  assert.deepEqual(Array.from(result.data),Array.from(present.data));
});

test('blank projection inputs are rejected instead of silently becoming zero',()=>{
  assert.throws(()=>lc.projectFutureLandcover({pastRaster:mk([1,1,2,2]),presentRaster:mk([1,2,2,3]),geometry:null,baselineYear:'',futureYear:2050,intensity:'20',random:()=>0}),/finite/i);
});

test('landcover module does not expose map rendering functions',()=>{
  const keys=Object.keys(lc).join(' ').toLowerCase();
  assert.doesNotMatch(keys,/leaflet|canvas|overlay|layercontrol|render/);
});
