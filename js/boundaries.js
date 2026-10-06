const MUNICIPALITY_FIELDS=['MUNICIPALITY','Municipality','municipality','ADM3_EN','MUN_NAME','MUNICIPALI','NAME_3'];
const BARANGAY_FIELDS=['BARANGAY','Barangay','barangay','BRGY_NAME','ADM4_EN','NAME_4'];
const BARANGAY_MUNICIPALITY_FIELDS=['MUNICIPALITY','Municipality','municipality','ADM3_EN','MUN_NAME','MUNICIPALI','Municipali','NAME_3'];
export function normalizeAdminName(value){return String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase();}
export function detectAdminField(properties={},candidates=[]){return candidates.find(k=>Object.prototype.hasOwnProperty.call(properties,k)&&String(properties[k]??'').trim()!=='')??null;}
function featureCollectionFeatures(gj,label){if(!gj||gj.type!=='FeatureCollection'||!Array.isArray(gj.features)||!gj.features.length)throw new Error(`${label} GeoJSON must be a non-empty FeatureCollection.`);return gj.features;}
export function buildBoundaryIndex(municipalityGeojson,barangayGeojson){
  const municipalities=featureCollectionFeatures(municipalityGeojson,'Municipality');
  const barangays=featureCollectionFeatures(barangayGeojson,'Barangay');
  const munField=detectAdminField(municipalities[0].properties,MUNICIPALITY_FIELDS);
  if(!munField)throw new Error('Could not detect a municipality name field.');
  const brgyField=detectAdminField(barangays[0].properties,BARANGAY_FIELDS);
  if(!brgyField)throw new Error('Could not detect a barangay name field.');
  const brgyMunField=detectAdminField(barangays[0].properties,BARANGAY_MUNICIPALITY_FIELDS);
  if(!brgyMunField)throw new Error('Could not detect municipality field in Barangay GeoJSON.');
  const municipalityByKey=new Map(); const displayMunicipalities=[];
  for(const ft of municipalities){const value=ft.properties?.[munField];const key=normalizeAdminName(value);if(!key)continue;if(!municipalityByKey.has(key)){municipalityByKey.set(key,ft);displayMunicipalities.push(String(value).trim());}}
  const barangaysByMunicipality=new Map();
  for(const ft of barangays){const mun=normalizeAdminName(ft.properties?.[brgyMunField]);const bname=String(ft.properties?.[brgyField]??'').trim();if(!mun||!bname)continue;if(!barangaysByMunicipality.has(mun))barangaysByMunicipality.set(mun,[]);barangaysByMunicipality.get(mun).push({name:bname,key:normalizeAdminName(bname),feature:ft});}
  for(const arr of barangaysByMunicipality.values())arr.sort((a,b)=>a.name.localeCompare(b.name));
  displayMunicipalities.sort((a,b)=>a.localeCompare(b));
  return {municipalityByKey,barangaysByMunicipality,municipalityNames:displayMunicipalities,fields:{municipality:munField,barangay:brgyField,barangayMunicipality:brgyMunField}};
}
export function municipalityNames(index){return [...index.municipalityNames];}
export function barangaysForMunicipality(index,municipalityName){return (index.barangaysByMunicipality.get(normalizeAdminName(municipalityName))??[]).map(x=>x.name);}
export function getMunicipalityFeature(index,name){return index.municipalityByKey.get(normalizeAdminName(name))??null;}
export function getBarangayFeature(index,municipalityName,barangayName){return (index.barangaysByMunicipality.get(normalizeAdminName(municipalityName))??[]).find(x=>x.key===normalizeAdminName(barangayName))?.feature??null;}
function pointInRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];const crosses=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||Number.EPSILON)+xi);if(crosses)inside=!inside;}return inside;}
function pointInPolygon(x,y,poly){if(!poly?.length||!pointInRing(x,y,poly[0]))return false;return !poly.slice(1).some(r=>pointInRing(x,y,r));}
export function pointInGeometry(lon,lat,geometry){if(!geometry)return true;if(geometry.type==='Polygon')return pointInPolygon(lon,lat,geometry.coordinates);if(geometry.type==='MultiPolygon')return geometry.coordinates.some(p=>pointInPolygon(lon,lat,p));return false;}
