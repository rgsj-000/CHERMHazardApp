import { isNoData } from './raster.js';

const LANDSLIDE_STOPS=[[255,249,196],[254,224,139],[253,174,97],[244,109,67],[165,0,38]];
export function selectBasemapMode({online,hasLocal}){return hasLocal?'local':(online?'osm':'neutral');}
const FLOOD_STOPS=[[224,243,248],[171,217,233],[116,173,209],[43,140,190],[8,48,107]];
function clamp01(v){return Math.max(0,Math.min(1,Number(v)));}
export function hazardClass(score){const s=clamp01(score);if(s<.2)return'Very Low';if(s<.4)return'Low';if(s<.6)return'Moderate';if(s<.8)return'High';return'Very High';}
export function hazardColor(kind,score,alpha=.72){if(!Number.isFinite(Number(score)))return[0,0,0,0];const s=clamp01(score),stops=kind==='flood'?FLOOD_STOPS:LANDSLIDE_STOPS;const pos=s*(stops.length-1),i=Math.min(stops.length-2,Math.floor(pos)),f=pos-i;const a=stops[i],b=stops[i+1];return[a.map((v,k)=>Math.round(v+(b[k]-v)*f))[0],Math.round(a[1]+(b[1]-a[1])*f),Math.round(a[2]+(b[2]-a[2])*f),alpha];}
export function rgbaCss([r,g,b,a]){return`rgba(${r}, ${g}, ${b}, ${a})`;}

export function createMap(L,mapElement='map'){
  if(!L?.map)throw new Error('Leaflet runtime is not available.');
  const map=L.map(mapElement,{zoomControl:true,preferCanvas:true}).setView([13.9,121.5],8);
  map.createPane('hazards');map.getPane('hazards').style.zIndex=350;
  map.createPane('admin');map.getPane('admin').style.zIndex=450;
  L.control.scale({imperial:false}).addTo(map);
  return map;
}
export function addOnlineOSM(L,map){return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);}
export function addBoundaryLayer(L,map,feature,level){if(!feature)return null;const style=level==='barangay'?{color:'#00897b',weight:3,fill:false,opacity:1}:{color:'#6a1b9a',weight:3,fill:false,opacity:1};const layer=L.geoJSON(feature,{style,pane:'admin'}).addTo(map);return layer;}
export function fitFeature(L,map,feature,padding=[24,24]){if(!feature)return;const layer=L.geoJSON(feature);const bounds=layer.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding});}
function rasterMinMax(raster){let min=Infinity,max=-Infinity;for(const raw of raster.data){const v=Number(raw);if(isNoData(v,raster.nodata))continue;if(v<min)min=v;if(v>max)max=v;}return Number.isFinite(min)?{min,max}:{min:0,max:1};}
export function rasterToDataUrl(raster,{kind='landslide',normalize=false,alpha=.72}={}){if(typeof document==='undefined')throw new Error('Raster rendering requires a browser canvas.');const canvas=document.createElement('canvas');canvas.width=raster.width;canvas.height=raster.height;const ctx=canvas.getContext('2d'),img=ctx.createImageData(raster.width,raster.height),{min,max}=rasterMinMax(raster);for(let i=0;i<raster.data.length;i++){const raw=Number(raster.data[i]),o=i*4;if(isNoData(raw,raster.nodata)){img.data[o+3]=0;continue;}const score=normalize?(max===min?(raw>0?1:0):(raw-min)/(max-min)):raw;const [r,g,b,a]=hazardColor(kind,score,alpha);img.data[o]=r;img.data[o+1]=g;img.data[o+2]=b;img.data[o+3]=Math.round(a*255);}ctx.putImageData(img,0,0);return canvas.toDataURL('image/png');}
export function addRasterOverlay(L,map,raster,{kind='landslide',normalize=false,opacity=.75,pane='hazards'}={}){const url=rasterToDataUrl(raster,{kind,normalize,alpha:1});const [xmin,ymin,xmax,ymax]=raster.bbox;return L.imageOverlay(url,[[ymin,xmin],[ymax,xmax]],{opacity,pane,interactive:false}).addTo(map);}
export function createLegend(L,kind){const control=L.control({position:'bottomright'});control.onAdd=()=>{const div=L.DomUtil.create('div','hazard-legend');div.innerHTML=`<strong>${kind==='flood'?'Flood':'Landslide'} susceptibility</strong>`+[.1,.3,.5,.7,.9].map(v=>`<div><i style="background:${rgbaCss(hazardColor(kind,v,1))}"></i>${hazardClass(v)}</div>`).join('');return div;};return control;}
export function refreshLayerControl(L,map,current,baseLayers,overlays){if(current)map.removeControl(current);return L.control.layers(baseLayers,overlays,{collapsed:false,position:'topright'}).addTo(map);}

export function rasterToBasemapDataUrl(raster){
  if(typeof document==='undefined')throw new Error('Basemap rendering requires a browser canvas.');
  const canvas=document.createElement('canvas');canvas.width=raster.width;canvas.height=raster.height;
  const ctx=canvas.getContext('2d'),img=ctx.createImageData(raster.width,raster.height);const {min,max}=rasterMinMax(raster);
  for(let i=0;i<raster.data.length;i++){const v=Number(raster.data[i]),o=i*4;if(isNoData(v,raster.nodata)){img.data[o+3]=0;continue;}const t=max===min?.5:Math.max(0,Math.min(1,(v-min)/(max-min)));const g=Math.round(30+205*t);img.data[o]=g;img.data[o+1]=g;img.data[o+2]=g;img.data[o+3]=255;}
  ctx.putImageData(img,0,0);return canvas.toDataURL('image/png');
}
export function addLocalBasemap(L,map,raster){const [xmin,ymin,xmax,ymax]=raster.bbox;return L.imageOverlay(rasterToBasemapDataUrl(raster),[[ymin,xmin],[ymax,xmax]],{opacity:1,interactive:false}).addTo(map);}
