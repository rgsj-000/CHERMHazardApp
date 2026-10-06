import { isNoData,sameGrid } from './raster.js';

async function fetchFile(url){
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Could not load ${url}: HTTP ${response.status}.`);
  return response;
}

export async function loadDataset(manifestUrl=new URL('../data/dataset.json',import.meta.url)){
  const url=new URL(manifestUrl,import.meta.url);
  const manifest=await (await fetchFile(url)).json();
  const [municipality,barangay]=await Promise.all(['municipality','barangay'].map(async kind=>{
    const collection=await (await fetchFile(new URL(manifest.boundaries[kind],url))).json();
    if(collection.type!=='FeatureCollection'||!collection.features?.length)throw new Error(`Bundled ${kind} boundaries are empty or invalid.`);
    return collection;
  }));
  return {manifest,url,municipality,barangay};
}

export async function loadDatasetRaster(dataset,id,floodPeriod=null){
  const entry=id==='flood'&&floodPeriod?dataset.manifest.floods[floodPeriod]:dataset.manifest.rasters[id];
  if(!entry?.path)throw new Error(`Bundled raster ${id} was not found.`);
  const buffer=await (await fetchFile(new URL(entry.path,dataset.url))).arrayBuffer();
  // The existing GeoTIFF reader accepts this same interface for local files.
  return {name:entry.path.split('/').at(-1),arrayBuffer:async()=>buffer,target:entry.target};
}

export function scaleTemperature(raster,factor){
  return {...raster,data:Float32Array.from(raster.data,value=>isNoData(value,raster.nodata)?value:value*factor)};
}
export function removeIncompatibleBundledPredictors(rasters,newRaster){
  for(const id of ['distCoast','flowAcc']){
    if(rasters[id]?.bundled&&!sameGrid(rasters[id],newRaster))delete rasters[id];
  }
}
