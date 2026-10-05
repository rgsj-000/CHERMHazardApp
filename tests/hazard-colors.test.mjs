import test from 'node:test';
import assert from 'node:assert/strict';
import { hazardColor, hazardClass, rgbaCss } from '../js/map.js';

test('hazard classes cover very low through very high',()=>{
  assert.equal(hazardClass(0.1),'Very Low');
  assert.equal(hazardClass(0.3),'Low');
  assert.equal(hazardClass(0.5),'Moderate');
  assert.equal(hazardClass(0.7),'High');
  assert.equal(hazardClass(0.95),'Very High');
});

test('landslide and flood use distinct ramps',()=>{
  assert.notDeepEqual(hazardColor('landslide',0.8),hazardColor('flood',0.8));
  assert.equal(hazardColor('landslide',-1)[3]>0,true);
  assert.equal(hazardColor('flood',2)[3]>0,true);
});

test('invalid values are transparent',()=>{
  assert.deepEqual(hazardColor('landslide',NaN),[0,0,0,0]);
  assert.equal(rgbaCss([1,2,3,0.5]),'rgba(1, 2, 3, 0.5)');
});
