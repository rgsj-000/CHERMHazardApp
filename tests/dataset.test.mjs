import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDataset, loadDatasetRaster, scaleTemperature, removeIncompatibleBundledPredictors } from '../js/dataset.js';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

// Exercise the loader against real HTTP responses, including missing files.
const manifest={name:'Test dataset',boundaries:{municipality:'municipalities.geojson',barangay:'barangays.geojson'},rasters:{dem:{path:'elevation.tif'},flood:{path:'5yr.tif',target:{kind:'susceptibility',min:0,max:3}}},floods:{'25':{path:'missing.tif'}}};
const feature={type:'FeatureCollection',features:[{type:'Feature',properties:{MUNICIPALI:'AGDANGAN',Barangay:'One',Municipali:'AGDANGAN'},geometry:{type:'Polygon',coordinates:[[[121,13],[122,13],[122,14],[121,13]]]}}]};
const tiff=new Uint8Array([73,73,42,0]);
async function withServer(fn){
  const server=createServer((req,res)=>{
    const files={'/data/dataset.json':JSON.stringify(manifest),'/data/municipalities.geojson':JSON.stringify(feature),'/data/barangays.geojson':JSON.stringify(feature),'/data/elevation.tif':tiff,'/data/5yr.tif':tiff};
    const body=files[req.url];res.statusCode=body===undefined?404:200;res.end(body??'missing');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await fn(`http://127.0.0.1:${server.address().port}/data/dataset.json`);}finally{await new Promise(resolve=>server.close(resolve));}
}

test('bundled dataset loader resolves files relative to manifest and loads boundaries',async()=>{
  await withServer(async url=>{
    const loaded=await loadDataset(url);
    assert.equal(loaded.municipality.features[0].properties.MUNICIPALI,'AGDANGAN');
    assert.equal(loaded.barangay.features.length,1);
    const file=await loadDatasetRaster(loaded,'dem');
    assert.equal(file.name,'elevation.tif');
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()),tiff);
    const flood=await loadDatasetRaster(loaded,'flood');
    assert.equal(flood.target.max,3);
    await assert.rejects(loadDatasetRaster(loaded,'flood','25'),/missing\.tif.*404/);
  });
});

test('missing manifest produces a useful error and does not return a partially loaded dataset',async()=>{
  await withServer(async url=>await assert.rejects(loadDataset(url.replace('dataset.json','absent.json')),/absent\.json.*404/));
});

test('temperature unit conversion preserves NoData and leaves the source values intact',()=>{
  const original={data:new Float32Array([250,-9999,270]),nodata:-9999};
  const scaled=scaleTemperature(original,.1);
  assert.deepEqual([...scaled.data],[25,-9999,27]);
  assert.deepEqual([...original.data],[250,-9999,270]);
});

test('manual replacement on a new grid drops incompatible bundled optional inputs',()=>{
  const grid={width:2,height:2,bbox:[120,13,121,14]};
  const rs={distCoast:{...grid,bundled:true},flowAcc:{...grid,bundled:true}};
  removeIncompatibleBundledPredictors(rs,grid);
  assert.ok(rs.distCoast&&rs.flowAcc);
  removeIncompatibleBundledPredictors(rs,{...grid,width:3});
  assert.deepEqual(rs,{});
  const custom={distCoast:{...grid,bundled:false}};
  removeIncompatibleBundledPredictors(custom,{...grid,width:3});
  assert.ok(custom.distCoast,'Explicitly uploaded predictors remain subject to grid validation.');
});

test('supplied barangay municipality field works with the boundary index',async()=>{
  const {buildBoundaryIndex,barangaysForMunicipality}=await import('../js/boundaries.js');
  const index=buildBoundaryIndex(feature,feature);
  assert.deepEqual(barangaysForMunicipality(index,'AGDANGAN'),['One']);
});

test('prepared manifest connects all model inputs and all flood return periods',async()=>{
  const config=JSON.parse(await readFile(new URL('../data/dataset.json',import.meta.url),'utf8'));
  assert.equal(config.grid.crs,'EPSG:4326');
  assert.ok(config.grid.width<=1536&&config.grid.height<=1536);
  for(const id of ['dem','slope','distRiver','distUrban','rain','temp','pastLC','presentLC','landslide','flood','distCoast','flowAcc']){
    assert.ok((await readFile(new URL(`../data/${config.rasters[id].path}`,import.meta.url))).length>0,id);
  }
  for(const period of ['5','25','100'])assert.ok(config.floods[period].path);
});
