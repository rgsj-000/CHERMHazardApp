import { validateAlignedRasters } from './raster.js';
import { createAreaMask } from './area-mask.js';
import { projectFutureLandcover } from './landcover.js';
import { PREDICTOR_IDS,OPTIONAL_PREDICTOR_IDS,buildTrainingSamples,trainHazardModel,predictHazardSurface } from './hazard-model.js';

function noSampleReason(id,raster,stats){
  if(!stats.areaCells)return 'No raster cell centers fall inside this area. Select a larger area or prepare a finer raster grid.';
  if(!stats.hazardValid)return `No valid ${id} labels are available in ${raster.name} for the selected area. ${id==='flood'?'Choose another flood return period or an area with flood coverage.':'Choose an area with landslide coverage or supply a replacement raster.'}`;
  if(!stats.predictorValid){
    const missing=Object.entries(stats.missingByPredictor).filter(([,count])=>count>0).map(([key])=>key).join(', ');
    return `Environmental predictors have no complete cells in the selected area. Check NoData coverage in ${missing}.`;
  }
  return `Valid ${id} labels in ${raster.name} do not overlap complete predictor cells in the selected area.`;
}

export async function runScenarioModels({rasters,geometry=null,areaMask=null,scenario,trees=35,maxSamples=1000,random=Math.random,onProgress=async()=>{},onHazard=async()=>{}}){
  const base=validateAlignedRasters(rasters,[...PREDICTOR_IDS,...OPTIONAL_PREDICTOR_IDS.filter(id=>rasters[id]),'pastLC','landslide','flood']);
  const mask=areaMask??createAreaMask(base,geometry);
  await onProgress(10,'Projecting future land cover internally…');
  const futureLandcover=projectFutureLandcover({pastRaster:rasters.pastLC,presentRaster:rasters.presentLC,geometry,areaMask:mask,baselineYear:scenario.baselineYear,futureYear:scenario.futureYear,intensity:scenario.landcoverIntensity,random});
  const hazards={};
  for(const [position,id] of ['landslide','flood'].entries()){
    const start=position===0?25:65,end=position===0?60:95;
    await onProgress(start,`Training ${id} Random Forest…`);
    const samples=buildTrainingSamples({rasters,hazardId:id,geometry,areaMask:mask,maxSamples,random});
    const result={samples,output:null,error:null};hazards[id]=result;
    if(!samples.X.length){result.error=noSampleReason(id,rasters[id],samples.stats);await onHazard(id,result);continue;}
    let model;
    try{model=trainHazardModel({samples,trees,random});}
    catch(error){result.error=`${id==='flood'?'Flood':'Landslide'} (${rasters[id].name}): ${error.message}`;await onHazard(id,result);continue;}
    result.output=await predictHazardSurface({rasters,hazardId:id,model,geometry,areaMask:mask,futureLandcover,scenario,
      yieldFn:async progress=>onProgress(start+(end-start)*progress,`Predicting future ${id} susceptibility…`)});
    await onHazard(id,result);
  }
  return {futureLandcover,hazards};
}
