import { appState } from './state.js';
import { loadDataset,loadDatasetRaster,scaleTemperature,removeIncompatibleBundledPredictors } from './dataset.js';
import { createAreaMask } from './area-mask.js';
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
  {id:'landslide',label:'Present landslide raster'},{id:'flood',label:'Present flood raster'},
  {id:'distCoast',label:'Distance to coast (optional)',optional:true},{id:'flowAcc',label:'Flow accumulation (optional)',optional:true}
];
export function requiredModelRasterIds(){return [...PREDICTOR_IDS,'pastLC','landslide','flood'];}
export function visibleOutputKeys(){return ['baseline_landslide','baseline_flood','future_landslide','future_flood'];}
const $=id=>typeof document==='undefined'?null:document.getElementById(id);
let LRuntime=null,GeoTIFFRuntime=null,osmLayer=null,localBasemapLayer=null,landslideLegend=null,floodLegend=null;
let bundledDataset=null,bundledTemperature=null,loadingDataset=false,activeFloodPeriod=null;

function lockControls(locked){for(const control of document.querySelectorAll('.sidebar input,.sidebar select,.sidebar button'))control.disabled=locked;}
function clearFutureOutputs(){
  for(const key of ['future_landslide','future_flood'])removeLayer(key);
  appState.model={futureLandcover:null,futureLandslide:null,futureFlood:null};
  if(landslideLegend){appState.map.removeControl(landslideLegend);landslideLegend=null;}
  if(floodLegend){appState.map.removeControl(floodLegend);floodLegend=null;}
  setProgress(0);setDiagnostics('Inputs changed. Run a scenario to update results.');
}
function showLoadedRaster(id,raster){
  if(id==='landslide'||id==='flood'){
    const key=`baseline_${id}`;removeLayer(key);
    appState.mapLayers[key]=addRasterOverlay(LRuntime,appState.map,raster,{kind:id,normalize:true,opacity:.55});
  }
  const label=$(`loaded_${id}`);if(label)label.textContent=`Loaded: ${raster.name}`;
}
function bundledTemperatureChanged(){
  if(!bundledTemperature)return;
  const factor=Number($('temperatureScale').value)/(bundledDataset.manifest.temperatureScale??1);
  appState.rasters.temp=scaleTemperature(bundledTemperature,factor);
  clearFutureOutputs();refreshLayers();
  setStatus('Temperature units updated. Run a scenario to update results.','info');
}
export async function loadBundledDataset(){
  if(loadingDataset||appState.running)return;
  loadingDataset=true;lockControls(true);
  try{
    $('datasetStatus').textContent='Loading bundled boundaries and rasters…';
    const dataset=await loadDataset(),rasters={};
    for(const {id} of RASTER_DEFS){
      setStatus(`Loading bundled ${id}…`,'info');
      const file=await loadDatasetRaster(dataset,id);
      const raster=await readGeoTiff(file,GeoTIFFRuntime);raster.id=id;raster.bundled=true;
      if(file.target)raster.target=file.target;
      rasters[id]=raster;
      appendLog(`Loaded ${file.name}: ${raster.width} × ${raster.height}.`);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    validateAlignedRasters(rasters,RASTER_DEFS.map(({id})=>id));
    const index=buildBoundaryIndex(dataset.municipality,dataset.barangay);
    clearFutureOutputs();removeLayer('municipalityBoundary');removeLayer('barangayBoundary');
    appState.boundaries={municipalityGeoJSON:dataset.municipality,barangayGeoJSON:dataset.barangay,index};
    appState.selection={municipality:null,barangay:null,geometry:null};
    bundledDataset=dataset;bundledTemperature=rasters.temp;
    rasters.temp=scaleTemperature(bundledTemperature,Number($('temperatureScale').value)/(dataset.manifest.temperatureScale??1));
    appState.rasters=rasters;activeFloodPeriod=dataset.manifest.defaultFloodPeriod;
    $('floodPeriod').value=activeFloodPeriod;
    populateMunicipalities();
    for(const {id} of RASTER_DEFS){$(`file_${id}`).value='';showLoadedRaster(id,rasters[id]);}
    $('municipalityFile').value='';$('barangayFile').value='';
    fitFeature(LRuntime,appState.map,dataset.municipality);refreshLayers();
    $('datasetStatus').textContent=`RSTW2026 loaded: ${municipalityNames(index).length} municipalities, ${dataset.barangay.features.length} barangays; all 12 model inputs ready. Choose an area below.`;
    setStatus('RSTW2026 data ready. Select a Municipality, then run a scenario.','success');
  }catch(error){
    $('datasetStatus').textContent='Bundled data could not be loaded. Reload or choose local files below.';
    setStatus(error.message,'error');appendLog(error.stack||error.message);
  }finally{loadingDataset=false;lockControls(false);}
}
async function floodPeriodChanged(){
  if(!bundledDataset)return;
  const period=$('floodPeriod').value;
  loadingDataset=true;lockControls(true);
  try{
    setStatus(`Loading ${period}-year flood raster…`,'info');
    const file=await loadDatasetRaster(bundledDataset,'flood',period),raster=await readGeoTiff(file,GeoTIFFRuntime);
    raster.id='flood';raster.target=file.target;
    validateAlignedRasters({...appState.rasters,flood:raster},requiredModelRasterIds());
    clearFutureOutputs();appState.rasters.flood=raster;activeFloodPeriod=period;
    $('file_flood').value='';showLoadedRaster('flood',raster);refreshLayers();
    setStatus(`${period}-year flood raster loaded. Run a scenario to update results.`,'success');
  }catch(error){$('floodPeriod').value=activeFloodPeriod??bundledDataset.manifest.defaultFloodPeriod;setStatus(error.message,'error');appendLog(error.message);}
  finally{loadingDataset=false;lockControls(false);}
}

function currentGeometry(){return appState.selection.geometry;}
function removeLayer(key){const layer=appState.mapLayers[key];if(layer&&appState.map?.hasLayer(layer))appState.map.removeLayer(layer);delete appState.mapLayers[key];}
function overlayDictionary(){const entries={};const labels={municipalityBoundary:'Municipality boundary',barangayBoundary:'Barangay boundary',baseline_landslide:'Present landslide',baseline_flood:'Present flood',future_landslide:'Future landslide',future_flood:'Future flood'};for(const [key,label] of Object.entries(labels))if(appState.mapLayers[key])entries[label]=appState.mapLayers[key];return entries;}
function baseDictionary(){const bases={};if(osmLayer)bases['OpenStreetMap']=osmLayer;if(localBasemapLayer)bases['Local basemap']=localBasemapLayer;return bases;}
function refreshLayers(){if(!appState.map||!LRuntime)return;appState.layerControl=refreshLayerControl(LRuntime,appState.map,appState.layerControl,baseDictionary(),overlayDictionary());const keys=visibleOutputKeys().filter(k=>appState.mapLayers[k]);$('layerList').textContent=keys.length?keys.map(k=>k.replaceAll('_',' ')).join(' · '):'No hazard outputs yet.';}

async function readJsonFile(file){if(!file)throw new Error('No GeoJSON file selected.');const text=await file.text();const value=JSON.parse(text);if(value.type!=='FeatureCollection')throw new Error('Boundary file must be a GeoJSON FeatureCollection.');return value;}
function populateMunicipalities(){const select=$('municipality');select.innerHTML='<option value="">Select municipality</option>';for(const name of municipalityNames(appState.boundaries.index)){const o=document.createElement('option');o.value=name;o.textContent=name;select.appendChild(o);} $('barangay').innerHTML='<option value="">All barangays</option>';}
function tryBuildBoundaryIndex(){if(!appState.boundaries.municipalityGeoJSON||!appState.boundaries.barangayGeoJSON)return;appState.boundaries.index=buildBoundaryIndex(appState.boundaries.municipalityGeoJSON,appState.boundaries.barangayGeoJSON);populateMunicipalities();setStatus('Administrative boundaries loaded. Select a Municipality.','success');appendLog(`Indexed ${municipalityNames(appState.boundaries.index).length} municipalities.`);}
async function boundaryFileChanged(kind,file){try{const gj=await readJsonFile(file);clearFutureOutputs();removeLayer('municipalityBoundary');removeLayer('barangayBoundary');appState.selection={municipality:null,barangay:null,geometry:null};appState.boundaries[kind]=gj;tryBuildBoundaryIndex();refreshLayers();}catch(e){setStatus(e.message,'error');appendLog(e.stack||e.message);}}
function municipalityChanged(){const name=$('municipality').value;removeLayer('municipalityBoundary');removeLayer('barangayBoundary');appState.selection.municipality=name||null;appState.selection.barangay=null;appState.selection.geometry=null;const b=$('barangay');b.innerHTML='<option value="">All barangays</option>';if(!name){refreshLayers();return;}const feature=getMunicipalityFeature(appState.boundaries.index,name);appState.selection.geometry=feature.geometry;appState.mapLayers.municipalityBoundary=addBoundaryLayer(LRuntime,appState.map,feature,'municipality');fitFeature(LRuntime,appState.map,feature);for(const brgy of barangaysForMunicipality(appState.boundaries.index,name)){const o=document.createElement('option');o.value=brgy;o.textContent=brgy;b.appendChild(o);}refreshLayers();setStatus(`Selected Municipality: ${name}.`,'info');}
function barangayChanged(){const mun=appState.selection.municipality,name=$('barangay').value;removeLayer('barangayBoundary');appState.selection.barangay=name||null;if(!name){const mf=getMunicipalityFeature(appState.boundaries.index,mun);appState.selection.geometry=mf?.geometry??null;if(mf)fitFeature(LRuntime,appState.map,mf);refreshLayers();return;}const feature=getBarangayFeature(appState.boundaries.index,mun,name);if(!feature){setStatus('Barangay boundary was not found.','error');return;}appState.selection.geometry=feature.geometry;appState.mapLayers.barangayBoundary=addBoundaryLayer(LRuntime,appState.map,feature,'barangay');fitFeature(LRuntime,appState.map,feature);refreshLayers();setStatus(`Selected Barangay: ${name}, ${mun}.`,'info');}

async function rasterChanged(id,file){
  if(!file)return;loadingDataset=true;lockControls(true);
  try{
    setStatus(`Reading ${id}…`,'info');
    const raster=await readGeoTiff(file,GeoTIFFRuntime);raster.id=id;
    clearFutureOutputs();
    if(!RASTER_DEFS.find(def=>def.id===id)?.optional){
      removeIncompatibleBundledPredictors(appState.rasters,raster);
      for(const optionalId of ['distCoast','flowAcc'])if(!appState.rasters[optionalId])$(`loaded_${optionalId}`).textContent='No raster loaded';
    }
    appState.rasters[id]=raster;
    if(id==='temp')bundledTemperature=null;
    if(id==='flood')activeFloodPeriod=null;
    appendLog(`Loaded ${id}: ${raster.width} × ${raster.height} · ${file.name}`);
    if(rasterCellCount(raster)>20000000)appendLog(`Warning: ${id} contains more than 20 million cells and may exceed practical browser memory.`);
    showLoadedRaster(id,raster);refreshLayers();
    setStatus(`Loaded ${file.name}.`,'success');
  }catch(e){setStatus(`Could not read ${id}: ${e.message}`,'error');appendLog(e.stack||e.message);}
  finally{loadingDataset=false;lockControls(false);}
}
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

export async function runCompleteScenario(){if(appState.running||loadingDataset)return;if(!appState.selection.municipality){setStatus('Select a Municipality before running the model.','error');throw new Error('Select a Municipality before running the model.');}appState.running=true;lockControls(true);try{
  setProgress(0);setStatus('Validating aligned raster inputs…','info');const base=validateAlignedRasters(appState.rasters,requiredModelRasterIds());const scenario=scenarioFromUi(),geometry=currentGeometry();
  const areaMask=createAreaMask(base,geometry);
  await new Promise(resolve=>setTimeout(resolve,0));
  setProgress(10);setStatus('Projecting future land cover internally…','info');appState.model.futureLandcover=projectFutureLandcover({pastRaster:appState.rasters.pastLC,presentRaster:appState.rasters.presentLC,geometry,areaMask,baselineYear:scenario.baselineYear,futureYear:scenario.futureYear,intensity:scenario.landcoverIntensity});appendLog('Future land cover calculated as an internal predictor. It is not displayed on the map.');
  setProgress(25);setStatus('Training landslide Random Forest…','info');const lSamples=buildTrainingSamples({rasters:appState.rasters,hazardId:'landslide',geometry,areaMask,maxSamples:Number($('samples').value)});const lModel=trainHazardModel({samples:lSamples,trees:Number($('trees').value)});
  appState.model.futureLandslide=await predictHazardSurface({rasters:appState.rasters,hazardId:'landslide',model:lModel,geometry,areaMask,futureLandcover:appState.model.futureLandcover,scenario,yieldFn:async p=>{setProgress(35+p*25);await new Promise(r=>setTimeout(r,0));}});removeLayer('future_landslide');appState.mapLayers.future_landslide=addRasterOverlay(LRuntime,appState.map,appState.model.futureLandslide,{kind:'landslide',opacity:.72});
  setStatus('Training flood Random Forest…','info');const fSamples=buildTrainingSamples({rasters:appState.rasters,hazardId:'flood',geometry,areaMask,maxSamples:Number($('samples').value)});const fModel=trainHazardModel({samples:fSamples,trees:Number($('trees').value)});
  appState.model.futureFlood=await predictHazardSurface({rasters:appState.rasters,hazardId:'flood',model:fModel,geometry,areaMask,futureLandcover:appState.model.futureLandcover,scenario,yieldFn:async p=>{setProgress(65+p*30);await new Promise(r=>setTimeout(r,0));}});removeLayer('future_flood');appState.mapLayers.future_flood=addRasterOverlay(LRuntime,appState.map,appState.model.futureFlood,{kind:'flood',opacity:.65});
  if(landslideLegend)appState.map.removeControl(landslideLegend);if(floodLegend)appState.map.removeControl(floodLegend);landslideLegend=createLegend(LRuntime,'landslide').addTo(appState.map);floodLegend=createLegend(LRuntime,'flood').addTo(appState.map);refreshLayers();
  const sampleSummary=s=>s.stats.targetKind==='susceptibility'?`${s.stats.used} used (${s.stats.valid} valid class cells)`:`${s.stats.used} used (${s.stats.positive} occurrence / ${s.stats.negative} nonoccurrence valid)`;
  setDiagnostics(`<b>AOI:</b> ${appState.selection.barangay?`${appState.selection.barangay}, `:''}${appState.selection.municipality}<br><b>Landslide samples:</b> ${sampleSummary(lSamples)}<br><b>Flood samples:</b> ${sampleSummary(fSamples)}<br><b>Predictors:</b> ${lSamples.predictorIds.length}<br><b>Flood input:</b> ${appState.rasters.flood.name}<br><b>Output:</b> relative susceptibility scores 0–1; not calibrated probabilities.`);setProgress(100);setStatus('Scenario completed. Toggle baseline and future hazard layers on the map.','success');appendLog('Scenario complete.');
 }catch(e){setStatus(`Model stopped: ${e.message}`,'error');appendLog(e.stack||e.message);throw e;}finally{appState.running=false;lockControls(false);}}

function updateNetworkState(){const online=navigator.onLine;if(!appState.map)return;const mode=selectBasemapMode({online,hasLocal:Boolean(localBasemapLayer)});if(mode==='osm'&&!osmLayer){osmLayer=addOnlineOSM(LRuntime,appState.map);osmLayer.on('tileerror',()=>{setOnlineStatus(false,'Neutral background');});}if(!online&&osmLayer&&appState.map.hasLayer(osmLayer))appState.map.removeLayer(osmLayer);if(online&&osmLayer&&!localBasemapLayer&&!appState.map.hasLayer(osmLayer))osmLayer.addTo(appState.map);setOnlineStatus(online,mode==='local'?'Local basemap':mode==='osm'?'OpenStreetMap':'Neutral background');refreshLayers();}
function initRasterInputs(){
  const host=$('rasterInputs');
  host.innerHTML=RASTER_DEFS.map(({id,label,optional})=>`<label for="file_${id}">${label}</label><span id="loaded_${id}" class="hint">No raster loaded</span><input id="file_${id}" type="file" accept=".tif,.tiff">${optional?`<button id="clear_${id}" type="button">Remove ${label.replace(' (optional)','').toLowerCase()}</button>`:''}`).join('');
  for(const {id,optional} of RASTER_DEFS){
    $(`file_${id}`).addEventListener('change',e=>rasterChanged(id,e.target.files[0]));
    if(optional)$(`clear_${id}`).addEventListener('click',()=>{
      delete appState.rasters[id];$(`file_${id}`).value='';$(`loaded_${id}`).textContent='No raster loaded';
      clearFutureOutputs();refreshLayers();setStatus('Optional predictor removed. Run a scenario to update results.','info');
    });
  }
}
function init(){
  try{
    LRuntime=window.L;GeoTIFFRuntime=window.GeoTIFF;
    if(!LRuntime)throw new Error('Leaflet runtime is missing. Run the vendor-assets setup before offline use.');
    if(!GeoTIFFRuntime)throw new Error('GeoTIFF runtime is missing. Run the vendor-assets setup before offline use.');
    appState.map=createMap(LRuntime);initRasterInputs();
    $('loadBundledDataset').addEventListener('click',()=>loadBundledDataset());
    $('floodPeriod').addEventListener('change',()=>floodPeriodChanged());
    $('temperatureScale').addEventListener('change',bundledTemperatureChanged);
    $('municipalityFile').addEventListener('change',e=>boundaryFileChanged('municipalityGeoJSON',e.target.files[0]));
    $('barangayFile').addEventListener('change',e=>boundaryFileChanged('barangayGeoJSON',e.target.files[0]));
    $('municipality').addEventListener('change',()=>{clearFutureOutputs();municipalityChanged();});
    $('barangay').addEventListener('change',()=>{clearFutureOutputs();barangayChanged();});
    $('localBasemap').addEventListener('change',e=>localBasemapChanged(e.target.files[0]));
    $('runScenario').addEventListener('click',()=>runCompleteScenario().catch(()=>{}));
    syncRangeAndNumber($('rainSlider'),$('rainValue'));syncRangeAndNumber($('tempSlider'),$('tempValue'));syncRangeAndNumber($('lcSlider'),$('lcValue'));
    window.addEventListener('online',updateNetworkState);window.addEventListener('offline',updateNetworkState);
    updateNetworkState();appendLog('Application initialized.');loadBundledDataset();
  }catch(e){setStatus(e.message,'error');appendLog(e.stack||e.message);}
}
if(typeof window!=='undefined'&&typeof document!=='undefined')window.addEventListener('DOMContentLoaded',init);
