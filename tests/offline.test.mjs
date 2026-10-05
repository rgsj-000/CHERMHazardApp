import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectBasemapMode } from '../js/map.js';

test('basemap selection keeps app functional offline',()=>{
  assert.equal(selectBasemapMode({online:true,hasLocal:false}),'osm');
  assert.equal(selectBasemapMode({online:false,hasLocal:true}),'local');
  assert.equal(selectBasemapMode({online:false,hasLocal:false}),'neutral');
});

test('Windows launcher uses local PowerShell static server',async()=>{
  const bat=await readFile(new URL('../start.bat',import.meta.url),'utf8');
  const ps=await readFile(new URL('../tools/serve.ps1',import.meta.url),'utf8');
  assert.match(bat,/serve\.ps1/i); assert.match(ps,/HttpListener/); assert.doesNotMatch(bat,/https?:\/\//i);
});
