// Rasterize polygon membership once per scenario using pixel-center scanlines.
// Ring crossings preserve holes; separate polygons are unioned into the mask.
export function createAreaMask(raster,geometry){
  const {width,height,bbox:[xmin,ymin,xmax,ymax]}=raster;
  const mask=new Uint8Array(width*height);
  if(!geometry){mask.fill(1);return mask;}
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:null;
  if(!polygons)throw new Error('Area of interest must be a Polygon or MultiPolygon.');
  const dx=(xmax-xmin)/width,dy=(ymax-ymin)/height;
  for(let row=0;row<height;row++){
    const y=ymax-(row+.5)*dy;
    for(const polygon of polygons){
      const crossings=[];
      for(const ring of polygon)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const [xi,yi]=ring[i],[xj,yj]=ring[j];
        if((yi>y)!==(yj>y))crossings.push(xi+(y-yi)*(xj-xi)/(yj-yi));
      }
      crossings.sort((a,b)=>a-b);
      for(let i=0;i+1<crossings.length;i+=2){
        const start=Math.max(0,Math.min(width,Math.ceil((crossings[i]-xmin)/dx-.5)));
        const end=Math.max(0,Math.min(width,Math.ceil((crossings[i+1]-xmin)/dx-.5)));
        if(end>start)mask.fill(1,row*width+start,row*width+end);
      }
    }
  }
  return mask;
}
