import { appState } from './state.js';
import { setStatus,setProgress,appendLog,setOnlineStatus,setDiagnostics,syncRangeAndNumber } from './ui.js';
import { buildBoundaryIndex,municipalityNames,barangaysForMunicipality,getMunicipalityFeature,getBarangayFeature } from './boundaries.js';
import { readGeoTiff,validateAlignedRasters,rasterCellCount } from './raster.js';
import { validateScenario } from './scenario.js';
import { projectFutureLandcover } from './landcover.js';
import { buildTrainingSamples,trainHazardModel,predictHazardSurface,PREDICTOR_IDS } from './hazard-model.js';
import { createMap,addOnlineOSM,addBoundaryLayer,fitFeature,addRasterOverlay,addLocalBasemap,createLegend,refreshLayerControl,selectBasemapMode } from './map.js';

export const RASTER_DEFS=[
  {id:'dem',label:'DEM / elevation'},{id:'slope',label:'Slope'},{id:'distRiver',label:'Distance to river'},
  {id:'distUrban',label:'Distance to urban area'},{id:'rain',label:'Annual rainfall'},{id:'temp',label:'Annual mean daily temperature'},
  {id:'pastLC',label:'Past land cover'},{id:'presentLC',label:'Present land cover'},
  {id:'landslide',label:'Present landslide raster'},{id:'flood',label:'Present flood raster'}
];
export function requiredModelRasterIds(){return [...PREDICTOR_IDS,'pastLC','landslide','flood'];}
export function visibleOutputKeys(){return ['baseline_landslide','baseline_flood','future_landslide','future_flood'];}
const $=id=>typeof document==='undefined'?null:document.getElementById(id);
let LRuntime=null,GeoTIFFRuntime=null,osmLayer=null,localBasemapLayer=null,landslideLegend=null,floodLegend=null;

function currentGeometry(){return appState.selection.geometry;}
function removeLayer(key){const layer=appState.mapLayers[key];if(layer&&appState.map?.hasLayer(layer))appState.map.removeLayer(layer);delete appState.mapLayers[key];}
function overlayDictionary(){const entries={};const labels={municipalityBoundary:'Municipality boundary',barangayBoundary:'Barangay boundary',baseline_landslide:'Present landslide',baseline_flood:'Present flood',future_landslide:'Future landslide',future_flood:'Future flood'};for(const [key,label] of Object.entries(labels))if(appState.mapLayers[key])entries[label]=appState.mapLayers[key];return entries;}
function baseDictionary(){const bases={};if(osmLayer)bases['OpenStreetMap']=osmLayer;if(localBasemapLayer)bases['Local basemap']=localBasemapLayer;return bases;}
function refreshLayers(){if(!appState.map||!LRuntime)return;appState.layerControl=refreshLayerControl(LRuntime,appState.map,appState.layerControl,baseDictionary(),overlayDictionary());const keys=visibleOutputKeys().filter(k=>appState.mapLayers[k]);$('layerList').textContent=keys.length?keys.map(k=>k.replaceAll('_',' ')).join(' · '):'No hazard outputs yet.';}

async function readJsonFile(file){if(!file)throw new Error('No GeoJSON file selected.');const text=await file.text();const value=JSON.parse(text);if(value.type!=='FeatureCollection')throw new Error('Boundary file must be a GeoJSON FeatureCollection.');return value;}
function populateMunicipalities(){const select=$('municipality');select.innerHTML='<option value="">Select municipality</option>';for(const name of municipalityNames(appState.boundaries.index)){const o=document.createElement('option');o.value=name;o.textContent=name;select.appendChild(o);} $('barangay').innerHTML='<option value="">All barangays</option>';}
function tryBuildBoundaryIndex(){if(!appState.boundaries.municipalityGeoJSON||!appState.boundaries.barangayGeoJSON)return;appState.boundaries.index=buildBoundaryIndex(appState.boundaries.municipalityGeoJSON,appState.boundaries.barangayGeoJSON);populateMunicipalities();setStatus('Administrative boundaries loaded. Select a Municipality.','success');appendLog(`Indexed ${municipalityNames(appState.boundaries.index).length} municipalities.`);}
async function boundaryFileChanged(kind,file){try{const gj=await readJsonFile(file);appState.boundaries[kind]=gj;tryBuildBoundaryIndex();}catch(e){setStatus(e.message,'error');appendLog(e.stack||e.message);}}
function municipalityChanged(){const name=$('municipality').value;removeLayer('municipalityBoundary');removeLayer('barangayBoundary');appState.selection.municipality=name||null;appState.selection.barangay=null;appState.selection.geometry=null;const b=$('barangay');b.innerHTML='<option value="">All barangays</option>';if(!name){refreshLayers();return;}const feature=getMunicipalityFeature(appState.boundaries.index,name);appState.selection.geometry=feature.geometry;appState.mapLayers.municipalityBoundary=addBoundaryLayer(LRuntime,appState.map,feature,'municipality');fitFeature(LRuntime,appState.map,feature);for(const brgy of barangaysForMunicipality(appState.boundaries.index,name)){const o=document.createElement('option');o.value=brgy;o.textContent=brgy;b.appendChild(o);}refreshLayers();setStatus(`Selected Municipality: ${name}.`,'info');}
function barangayChanged(){const mun=appState.selection.municipality,name=$('barangay').value;removeLayer('barangayBoundary');appState.selection.barangay=name||null;if(!name){const mf=getMunicipalityFeature(appState.boundaries.index,mun);appState.selection.geometry=mf?.geometry??null;if(mf)fitFeature(LRuntime,appState.map,mf);refreshLayers();return;}const feature=getBarangayFeature(appState.boundaries.index,mun,name);if(!feature){setStatus('Barangay boundary was not found.','error');return;}appState.selection.geometry=feature.geometry;appState.mapLayers.barangayBoundary=addBoundaryLayer(LRuntime,appState.map,feature,'barangay');fitFeature(LRuntime,appState.map,feature);refreshLayers();setStatus(`Selected Barangay: ${name}, ${mun}.`,'info');}

async function rasterChanged(id,file){if(!file)return;try{setStatus(`Reading ${id}…`,'info');const raster=await readGeoTiff(file,GeoTIFFRuntime);raster.id=id;appState.rasters[id]=raster;appendLog(`Loaded ${id}: ${raster.width} × ${raster.height} · ${file.name}`);if(rasterCellCount(raster)>20000000)appendLog(`Warning: ${id} contains more than 20 million cells and may exceed practical browser memory.`);if(id==='landslide'||id==='flood'){const key=`baseline_${id}`;removeLayer(key);appState.mapLayers[key]=addRasterOverlay(LRuntime,appState.map,raster,{kind:id,normalize:true,opacity:.55});refreshLayers();}setStatus(`Loaded ${file.name}.`,'success');}catch(e){setStatus(`Could not read ${id}: ${e.message}`,'error');appendLog(e.stack||e.message);}}
async function localBasemapChanged(file){
  if(!file)return;
  try{
    const raster=await readGeoTiff(file,GeoTIFFRuntime);
    if(localBasemapLayer&&appState.map.hasLayer(localBasemapLayer))appState.map.removeLayer(localBasemapLayer);
    localBasemapLayer=addLocalBasemap(LRuntime,appState.map,raster);
    if(osmLayer&&appState.map.hasLayer(osmLayer))appState.map.removeLayer(osmLayer);
    setOnlineStatus(navigator.onLine,'Local basemap');
    refreshLayers();
    const [xmin,ymin,xmax,ymax]=raster.bbox;
    const feature={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[xmin,ymin],[xmax,ymin],[xmax,ymax],[xmin,ymax],[xmin,ymin]]]}};
    fitFeature(LRuntime,appState.map,feature);
  }catch(e){
    setStatus(`Local basemap failed: ${e.message}`,'error');
  }
}
function scenarioFromUi(){return validateScenario({baselineYear:$('baselineYear').value,futureYear:$('futureYear').value,rainChange:$('rainValue').value,rainMode:$('rainMode').value,tempChange:$('tempValue').value,tempMode:$('tempMode').value,landcoverIntensity:$('lcValue').value});}

export async function runCompleteScenario(){if(appState.running)return;if(!appState.selection.municipality)throw new Error('Select a Municipality before running the model.');appState.running=true;$('runScenario').disabled=true;try{
  setProgress(0);setStatus('Validating aligned raster inputs…','info');validateAlignedRasters(appState.rasters,requiredModelRasterIds());const scenario=scenarioFromUi(),geometry=currentGeometry();
  setProgress(10);setStatus('Projecting future land cover internally…','info');appState.model.futureLandcover=projectFutureLandcover({pastRaster:appState.rasters.pastLC,presentRaster:appState.rasters.presentLC,geometry,baselineYear:scenario.baselineYear,futureYear:scenario.futureYear,intensity:scenario.landcoverIntensity});appendLog('Future land cover calculated as an internal predictor. It is not displayed on the map.');
  setProgress(25);setStatus('Training landslide Random Forest…','info');const lSamples=buildTrainingSamples({rasters:appState.rasters,hazardId:'landslide',geometry,maxSamples:Number($('samples').value)});const lModel=trainHazardModel({samples:lSamples,trees:Number($('trees').value)});
  appState.model.futureLandslide=await predictHazardSurface({rasters:appState.rasters,hazardId:'landslide',model:lModel,geometry,futureLandcover:appState.model.futureLandcover,scenario,yieldFn:async p=>{setProgress(35+p*25);await new Promise(r=>setTimeout(r,0));}});removeLayer('future_landslide');appState.mapLayers.future_landslide=addRasterOverlay(LRuntime,appState.map,appState.model.futureLandslide,{kind:'landslide',opacity:.72});
  setStatus('Training flood Random Forest…','info');const fSamples=buildTrainingSamples({rasters:appState.rasters,hazardId:'flood',geometry,maxSamples:Number($('samples').value)});const fModel=trainHazardModel({samples:fSamples,trees:Number($('trees').value)});
  appState.model.futureFlood=await predictHazardSurface({rasters:appState.rasters,hazardId:'flood',model:fModel,geometry,futureLandcover:appState.model.futureLandcover,scenario,yieldFn:async p=>{setProgress(65+p*30);await new Promise(r=>setTimeout(r,0));}});removeLayer('future_flood');appState.mapLayers.future_flood=addRasterOverlay(LRuntime,appState.map,appState.model.futureFlood,{kind:'flood',opacity:.65});
  if(landslideLegend)appState.map.removeControl(landslideLegend);if(floodLegend)appState.map.removeControl(floodLegend);landslideLegend=createLegend(LRuntime,'landslide').addTo(appState.map);floodLegend=createLegend(LRuntime,'flood').addTo(appState.map);refreshLayers();setDiagnostics(`<b>AOI:</b> ${appState.selection.barangay?`${appState.selection.barangay}, `:''}${appState.selection.municipality}<br><b>Landslide samples:</b> ${lSamples.stats.used} used (${lSamples.stats.positive} occurrence / ${lSamples.stats.negative} nonoccurrence valid)<br><b>Flood samples:</b> ${fSamples.stats.used} used (${fSamples.stats.positive} occurrence / ${fSamples.stats.negative} nonoccurrence valid)<br><b>Output:</b> relative susceptibility scores 0–1; not calibrated probabilities.`);setProgress(100);setStatus('Scenario completed. Toggle baseline and future hazard layers on the map.','success');appendLog('Scenario complete.');
 }catch(e){setStatus(`Model stopped: ${e.message}`,'error');appendLog(e.stack||e.message);throw e;}finally{appState.running=false;$('runScenario').disabled=false;}}

function updateNetworkState(){const online=navigator.onLine;if(!appState.map)return;const mode=selectBasemapMode({online,hasLocal:Boolean(localBasemapLayer)});if(mode==='osm'&&!osmLayer){osmLayer=addOnlineOSM(LRuntime,appState.map);osmLayer.on('tileerror',()=>{setOnlineStatus(false,'Neutral background');});}if(!online&&osmLayer&&appState.map.hasLayer(osmLayer))appState.map.removeLayer(osmLayer);if(online&&osmLayer&&!localBasemapLayer&&!appState.map.hasLayer(osmLayer))osmLayer.addTo(appState.map);setOnlineStatus(online,mode==='local'?'Local basemap':mode==='osm'?'OpenStreetMap':'Neutral background');refreshLayers();}
function initRasterInputs(){const host=$('rasterInputs');host.innerHTML=RASTER_DEFS.map(({id,label})=>`<label for="file_${id}">${label}</label><input id="file_${id}" type="file" accept=".tif,.tiff">`).join('');for(const {id} of RASTER_DEFS)$(`file_${id}`).addEventListener('change',e=>rasterChanged(id,e.target.files[0]));}
function init(){try{LRuntime=window.L;GeoTIFFRuntime=window.GeoTIFF;if(!LRuntime)throw new Error('Leaflet runtime is missing. Run the vendor-assets setup before offline use.');if(!GeoTIFFRuntime)throw new Error('GeoTIFF runtime is missing. Run the vendor-assets setup before offline use.');appState.map=createMap(LRuntime);initRasterInputs();$('municipalityFile').addEventListener('change',e=>boundaryFileChanged('municipalityGeoJSON',e.target.files[0]));$('barangayFile').addEventListener('change',e=>boundaryFileChanged('barangayGeoJSON',e.target.files[0]));$('municipality').addEventListener('change',municipalityChanged);$('barangay').addEventListener('change',barangayChanged);$('localBasemap').addEventListener('change',e=>localBasemapChanged(e.target.files[0]));$('runScenario').addEventListener('click',()=>runCompleteScenario().catch(()=>{}));syncRangeAndNumber($('rainSlider'),$('rainValue'));syncRangeAndNumber($('tempSlider'),$('tempValue'));syncRangeAndNumber($('lcSlider'),$('lcValue'));window.addEventListener('online',updateNetworkState);window.addEventListener('offline',updateNetworkState);updateNetworkState();appendLog('Application initialized.');}catch(e){setStatus(e.message,'error');appendLog(e.stack||e.message);}}
if(typeof window!=='undefined'&&typeof document!=='undefined')window.addEventListener('DOMContentLoaded',init);
