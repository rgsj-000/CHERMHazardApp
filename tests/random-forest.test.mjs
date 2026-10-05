import test from 'node:test';
import assert from 'node:assert/strict';
import { RandomForestRegressor } from '../js/random-forest.js';

function rng(seed=1){let s=seed>>>0;return()=>((s=(1664525*s+1013904223)>>>0)/4294967296);}

test('terminal regression node stores mean response',()=>{
  let k=0; const seq=[0.1,0.3,0.6,0.9];
  const rf=new RandomForestRegressor({trees:1,maxDepth:0,random:()=>seq[(k++)%seq.length]});
  rf.fit([[0],[1],[2],[3]],[0,0,1,1]);
  assert.equal(rf.predict([999]),0.5);
});

test('forest prediction averages tree values',()=>{
  const rf=new RandomForestRegressor({trees:2});
  rf.featureCount=1;
  rf.trees_=[{leaf:true,value:0.2},{leaf:true,value:0.8}];
  assert.ok(Math.abs(rf.predict([3])-0.5)<1e-12);
});

test('deterministic RNG produces reproducible predictions',()=>{
  const X=[[0],[1],[2],[3],[4],[5]],y=[0,0,.1,.8,1,1];
  const a=new RandomForestRegressor({trees:7,maxDepth:4,minLeaf:1,random:rng(7)});a.fit(X,y);
  const b=new RandomForestRegressor({trees:7,maxDepth:4,minLeaf:1,random:rng(7)});b.fit(X,y);
  assert.equal(a.predict([2.5]),b.predict([2.5]));
});

test('validates training data and tree count',()=>{
  assert.throws(()=>new RandomForestRegressor({trees:0}),/trees/i);
  assert.throws(()=>new RandomForestRegressor().fit([],[]),/empty/i);
  assert.throws(()=>new RandomForestRegressor().fit([[1]],[0,1]),/length/i);
  assert.throws(()=>new RandomForestRegressor().fit([[NaN]],[0]),/finite numeric/i);
});
