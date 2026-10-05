import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRainfallChange, applyTemperatureChange, validateScenario } from '../js/scenario.js';

test('climate formulas match scenario modes',()=>{
  assert.equal(applyRainfallChange(1000,10,'pct'),1100);
  assert.equal(applyRainfallChange(1000,75,'mm'),1075);
  assert.equal(applyTemperatureChange(25,2,'c'),27);
  assert.ok(Math.abs(applyTemperatureChange(25,10,'pct')-27.5)<1e-12);
});

test('invalid modes and nonfinite values are rejected',()=>{
  assert.throws(()=>applyRainfallChange(100,1,'x'),/rainfall mode/i);
  assert.throws(()=>applyTemperatureChange(25,1,'x'),/temperature mode/i);
  assert.throws(()=>applyRainfallChange(Infinity,1,'pct'),/finite/i);
  assert.throws(()=>validateScenario({baselineYear:2050,futureYear:2040,rainChange:0,rainMode:'pct',tempChange:0,tempMode:'c',landcoverIntensity:0}),/future year/i);
});

test('valid scenario is normalized to numbers',()=>{
  const s=validateScenario({baselineYear:'2020',futureYear:'2050',rainChange:'12.5',rainMode:'pct',tempChange:'1.5',tempMode:'c',landcoverIntensity:'20'});
  assert.equal(s.futureYear,2050); assert.equal(s.rainChange,12.5); assert.equal(s.landcoverIntensity,20);
});

test('blank numeric inputs are rejected instead of coercing to zero',()=>{
  assert.throws(()=>validateScenario({baselineYear:'',futureYear:'2050',rainChange:'12.5',rainMode:'pct',tempChange:'1.5',tempMode:'c',landcoverIntensity:'20'}),/finite/i);
  assert.throws(()=>applyRainfallChange('',10,'pct'),/finite/i);
});
