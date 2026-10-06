import { isNoData, pixelCenter, validateAlignedRasters, sameGrid } from './raster.js';
import { pointInGeometry } from './boundaries.js';
import { applyRainfallChange, applyTemperatureChange } from './scenario.js';
import { RandomForestRegressor } from './random-forest.js';

export const PREDICTOR_IDS=['dem','slope','distRiver','distUrban','rain','temp','presentLC'];
export const OPTIONAL_PREDICTOR_IDS=['distCoast','flowAcc'];
function predictorIdsFor(rasters){return [...PREDICTOR_IDS,...OPTIONAL_PREDICTOR_IDS.filter(id=>rasters[id])];}
function reservoirPush(items,value,limit,random,seen){if(items.length<limit){items.push(value);return;}const j=Math.floor(random()*seen);if(j<limit)items[j]=value;}
function occurrence(value,nodata){if(isNoData(value,nodata))return null;return Number(value)>0?1:0;}

export function buildTrainingSamples({rasters,hazardId,geometry=null,areaMask=null,maxSamples=1000,random=Math.random}){
  const predictorIds=predictorIdsFor(rasters),ids=[...predictorIds,hazardId]; const base=validateAlignedRasters(rasters,ids);
  if(maxSamples===null||maxSamples===undefined||typeof maxSamples==='string'&&maxSamples.trim()==='')throw new Error('Training sample limit must be a finite number.');
  const sampleLimit=Number(maxSamples);if(!Number.isFinite(sampleLimit))throw new Error('Training sample limit must be a finite number.');
  const cap=Math.max(2,Math.floor(sampleLimit)); const perClass=Math.max(1,Math.floor(cap/2));
  const pos=[],neg=[];let seenPos=0,seenNeg=0,seenClass=0;
  const target=rasters[hazardId].target,classSamples=[],classified=target?.kind==='susceptibility';
  for(let row=0;row<base.height;row++)for(let col=0;col<base.width;col++){
    const i=row*base.width+col;
    if(areaMask){if(!areaMask[i])continue;}else if(geometry){const [lon,lat]=pixelCenter(base,row,col);if(!pointInGeometry(lon,lat,geometry))continue;}
    const values=predictorIds.map(id=>Number(rasters[id].data[i]));
    if(values.some((v,k)=>isNoData(v,rasters[predictorIds[k]].nodata)))continue;
    const raw=Number(rasters[hazardId].data[i]);if(isNoData(raw,rasters[hazardId].nodata))continue;
    const y=classified?(target.max===target.min?0:Math.max(0,Math.min(1,(raw-target.min)/(target.max-target.min)))):occurrence(raw,rasters[hazardId].nodata);
    if(classified){seenClass++;reservoirPush(classSamples,{x:values,y},cap,random,seenClass);continue;}
    const pair={x:values,y};if(y){seenPos++;reservoirPush(pos,pair,perClass,random,seenPos);}else{seenNeg++;reservoirPush(neg,pair,perClass,random,seenNeg);}
  }
  const combined=classified?classSamples:[...neg,...pos];
  return {X:combined.map(p=>p.x),y:combined.map(p=>p.y),predictorIds,stats:{valid:classified?seenClass:seenPos+seenNeg,positive:seenPos,negative:seenNeg,used:combined.length,targetKind:classified?'susceptibility':'occurrence'}};
}

export function trainHazardModel({samples,trees=35,random=Math.random}){
  if(!samples?.X?.length)throw new Error('No valid training samples were found in the selected area.');
  const positives=samples.y.filter(v=>v===1).length,negatives=samples.y.filter(v=>v===0).length;
  if(samples.stats?.targetKind==='susceptibility'){
    if(new Set(samples.y).size<2)throw new Error('Hazard training requires at least two susceptibility classes inside the selected area. Choose a larger area.');
  }else if(!positives||!negatives)throw new Error('Hazard training requires both occurrence and nonoccurrence cells inside the selected area.');
  const model=new RandomForestRegressor({trees:Number(trees),maxDepth:10,minLeaf:3,random});model.fit(samples.X,samples.y);model.predictorIds=samples.predictorIds??PREDICTOR_IDS;model.sampleStats={...samples.stats,positiveUsed:positives,negativeUsed:negatives};return model;
}

export async function predictHazardSurface({rasters,hazardId,model,geometry=null,areaMask=null,futureLandcover,scenario,yieldFn=async()=>{}}){
  const predictorIds=model.predictorIds??predictorIdsFor(rasters),ids=[...predictorIds,hazardId]; const base=validateAlignedRasters(rasters,ids);
  if(!futureLandcover||!sameGrid(base,futureLandcover))throw new Error('Future land-cover raster must be aligned with hazard predictors.');
  const out=new Float32Array(base.width*base.height);out.fill(Number.NaN);
  for(let row=0;row<base.height;row++){
    if(row%20===0)await yieldFn(row/base.height);
    for(let col=0;col<base.width;col++){
      const i=row*base.width+col;
      if(areaMask){if(!areaMask[i])continue;}else if(geometry){const [lon,lat]=pixelCenter(base,row,col);if(!pointInGeometry(lon,lat,geometry))continue;}
      const vals=predictorIds.map(id=>Number((id==='presentLC'?futureLandcover:rasters[id]).data[i]));
      const nd=predictorIds.map(id=>(id==='presentLC'?futureLandcover:rasters[id]).nodata);if(vals.some((v,k)=>isNoData(v,nd[k])))continue;
      vals[4]=applyRainfallChange(vals[4],scenario.rainChange,scenario.rainMode);vals[5]=applyTemperatureChange(vals[5],scenario.tempChange,scenario.tempMode);
      if(vals.some(v=>!Number.isFinite(v)))continue;
      const score=Number(model.predict(vals));out[i]=Number.isFinite(score)?Math.max(0,Math.min(1,score)):Number.NaN;
    }
  }
  await yieldFn(1);
  return {...base,id:`future_${hazardId}`,name:`Future ${hazardId} susceptibility`,data:out,nodata:Number.NaN};
}
