import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectAdminField, buildBoundaryIndex, municipalityNames,
  barangaysForMunicipality, getMunicipalityFeature, getBarangayFeature,
  pointInGeometry
} from '../js/boundaries.js';

const square=(x0,y0,x1,y1)=>({type:'Polygon',coordinates:[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]]});

test('detects common municipality and barangay fields',()=>{
  assert.equal(detectAdminField({MUNICIPALITY:'A'},['MUNICIPALITY','Municipality','ADM3_EN','MUN_NAME']),'MUNICIPALITY');
  assert.equal(detectAdminField({ADM3_EN:'A'},['MUNICIPALITY','Municipality','ADM3_EN','MUN_NAME']),'ADM3_EN');
  assert.equal(detectAdminField({BRGY_NAME:'One'},['BARANGAY','BRGY_NAME','ADM4_EN']),'BRGY_NAME');
  assert.equal(detectAdminField({ADM4_EN:'One'},['BARANGAY','BRGY_NAME','ADM4_EN']),'ADM4_EN');
});

test('indexes municipalities and filters barangays to their municipality',()=>{
  const municipalities={type:'FeatureCollection',features:[
    {type:'Feature',properties:{MUN_NAME:'Alpha'},geometry:square(0,0,2,2)},
    {type:'Feature',properties:{MUN_NAME:'Beta'},geometry:square(2,0,4,2)}
  ]};
  const barangays={type:'FeatureCollection',features:[
    {type:'Feature',properties:{ADM3_EN:'Alpha',BRGY_NAME:'One'},geometry:square(0,0,1,1)},
    {type:'Feature',properties:{ADM3_EN:'Alpha',BRGY_NAME:'Two'},geometry:square(1,0,2,1)},
    {type:'Feature',properties:{ADM3_EN:'Beta',BRGY_NAME:'Three'},geometry:square(2,0,3,1)}
  ]};
  const index=buildBoundaryIndex(municipalities,barangays);
  assert.deepEqual(municipalityNames(index),['Alpha','Beta']);
  assert.deepEqual(barangaysForMunicipality(index,' alpha '),['One','Two']);
  assert.equal(getMunicipalityFeature(index,'ALPHA').properties.MUN_NAME,'Alpha');
  assert.equal(getBarangayFeature(index,'Alpha','Two').properties.BRGY_NAME,'Two');
  assert.equal(barangaysForMunicipality(index,'Beta').includes('One'),false);
});

test('throws when usable admin fields cannot be detected',()=>{
  const bad={type:'FeatureCollection',features:[{type:'Feature',properties:{foo:'bar'},geometry:square(0,0,1,1)}]};
  assert.throws(()=>buildBoundaryIndex(bad,bad),/municipality name field/i);
});

test('point-in-geometry handles polygon holes and multipolygons',()=>{
  const polygon={type:'Polygon',coordinates:[
    [[0,0],[4,0],[4,4],[0,4],[0,0]],
    [[1,1],[3,1],[3,3],[1,3],[1,1]]
  ]};
  assert.equal(pointInGeometry(.5,.5,polygon),true);
  assert.equal(pointInGeometry(2,2,polygon),false);
  assert.equal(pointInGeometry(5,5,polygon),false);
  const multi={type:'MultiPolygon',coordinates:[square(0,0,1,1).coordinates,square(10,10,11,11).coordinates]};
  assert.equal(pointInGeometry(10.5,10.5,multi),true);
  assert.equal(pointInGeometry(5,5,multi),false);
});
