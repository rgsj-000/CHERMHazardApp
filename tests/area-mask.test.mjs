import test from 'node:test';
import assert from 'node:assert/strict';
import { createAreaMask } from '../js/area-mask.js';
import { pixelCenter } from '../js/raster.js';
import { pointInGeometry } from '../js/boundaries.js';
import { readFile } from 'node:fs/promises';

const raster={width:4,height:4,bbox:[0,0,4,4]};
const square=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
test('scanline mask preserves holes and partially covered cells',()=>{
  const mask=createAreaMask(raster,{type:'Polygon',coordinates:[square(0,0,3,4),square(1,1,2,3)]});
  assert.deepEqual([...mask],[1,1,1,0,1,0,1,0,1,0,1,0,1,1,1,0]);
});
test('mask unions multipolygon parts instead of toggling overlap off',()=>{
  const mask=createAreaMask(raster,{type:'MultiPolygon',coordinates:[[square(0,0,2,2)],[square(1,1,3,3)]]});
  assert.deepEqual([...mask],[0,0,0,0,0,1,1,0,1,1,1,0,1,1,0,0]);
});
test('mask for the supplied General Nakar polygon matches point membership',async()=>{
  const config=JSON.parse(await readFile(new URL('../data/dataset.json',import.meta.url),'utf8'));
  const boundaries=JSON.parse(await readFile(new URL('../data/boundaries/municipality.geojson',import.meta.url),'utf8'));
  const geometry=boundaries.features.find(f=>f.properties.MUNICIPALI==='GENERAL NAKAR').geometry;
  const grid={...config.grid,width:70,height:90},mask=createAreaMask(grid,geometry);
  for(let row=0;row<grid.height;row++)for(let col=0;col<grid.width;col++){
    const [x,y]=pixelCenter(grid,row,col);
    assert.equal(Boolean(mask[row*grid.width+col]),pointInGeometry(x,y,geometry));
  }
});
