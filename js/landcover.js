import { isNoData, pixelCenter, sameGrid } from './raster.js';
import { pointInGeometry } from './boundaries.js';

export function deriveTransitions(pastRaster,presentRaster,geometry=null){
  if(!sameGrid(pastRaster,presentRaster))throw new Error('Past and present land-cover rasters must share the same grid.');
  const transitions=new Map();
  for(let row=0;row<presentRaster.height;row++)for(let col=0;col<presentRaster.width;col++){
    const i=row*presentRaster.width+col; const [lon,lat]=pixelCenter(presentRaster,row,col);
    if(geometry&&!pointInGeometry(lon,lat,geometry))continue;
    const from=Number(pastRaster.data[i]),to=Number(presentRaster.data[i]);
    if(isNoData(from,pastRaster.nodata)||isNoData(to,presentRaster.nodata))continue;
    if(!transitions.has(from))transitions.set(from,new Map());
    const rowMap=transitions.get(from); rowMap.set(to,(rowMap.get(to)||0)+1);
  }
  return transitions;
}

function targetOptions(transitions,current){
  const row=transitions.get(current); if(!row)return [];
  const total=[...row.values()].reduce((a,b)=>a+b,0);
  return [...row.entries()].filter(([cls])=>cls!==current).map(([cls,count])=>({cls,p:count/total})).sort((a,b)=>b.p-a.p);
}

function finiteValue(value,label){
  if(value===null||value===undefined||typeof value==='string'&&value.trim()==='')throw new Error(`${label} must be a finite number.`);
  const n=Number(value);if(!Number.isFinite(n))throw new Error(`${label} must be a finite number.`);return n;
}
export function projectFutureLandcover({pastRaster,presentRaster,geometry=null,baselineYear,futureYear,intensity=0,random=Math.random}){
  if(!sameGrid(pastRaster,presentRaster))throw new Error('Past and present land-cover rasters must share the same grid.');
  const base=finiteValue(baselineYear,'Baseline year'),future=finiteValue(futureYear,'Future year'),strength=finiteValue(intensity,'Land-cover intensity');
  if(future<base)throw new Error('Invalid land-cover projection years.');
  const transitions=deriveTransitions(pastRaster,presentRaster,geometry);
  const out=new Float32Array(presentRaster.data.length); out.fill(Number.NaN);
  const yearsAhead=future-base;
  const horizon=Math.min(1,yearsAhead/30);
  const intensityFactor=Math.max(0,1+strength/100);
  for(let row=0;row<presentRaster.height;row++)for(let col=0;col<presentRaster.width;col++){
    const i=row*presentRaster.width+col,[lon,lat]=pixelCenter(presentRaster,row,col);
    if(geometry&&!pointInGeometry(lon,lat,geometry))continue;
    const current=Number(presentRaster.data[i]); if(isNoData(current,presentRaster.nodata))continue;
    out[i]=current; if(yearsAhead===0)continue;
    const opts=targetOptions(transitions,current); if(!opts.length)continue;
    let draw=Math.max(0,Math.min(0.999999999999,Number(random()))),acc=0;
    for(const option of opts){acc+=Math.min(1,option.p*horizon*intensityFactor);if(draw<acc){out[i]=option.cls;break;}}
  }
  return {...presentRaster,id:'futureLandcover',name:'Predicted future land cover (internal)',data:out,nodata:Number.NaN,internal:true};
}
