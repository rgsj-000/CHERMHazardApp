function mean(values){return values.reduce((s,v)=>s+v,0)/values.length;}
function sse(values){if(!values.length)return 0;const m=mean(values);return values.reduce((s,v)=>s+(v-m)**2,0);}
function sampleWithoutReplacement(n,k,random){const a=Array.from({length:n},(_,i)=>i);for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,k);}
function bootstrap(n,random){return Array.from({length:n},()=>Math.min(n-1,Math.floor(random()*n)));}
function predictTree(node,row){let n=node;while(!n.leaf)n=row[n.feature]<=n.threshold?n.left:n.right;return n.value;}
function buildTree(X,y,{depth,maxDepth,minLeaf,mtry,random}){
  const node={leaf:true,value:mean(y)};
  if(depth>=maxDepth||y.length<minLeaf*2||sse(y)<=1e-15)return node;
  const featureIds=sampleWithoutReplacement(X[0].length,Math.min(mtry,X[0].length),random);
  let best=null;
  for(const feature of featureIds){
    const values=[...new Set(X.map(r=>r[feature]))].sort((a,b)=>a-b);if(values.length<2)continue;
    const stride=Math.max(1,Math.floor(values.length/16));
    for(let i=1;i<values.length;i+=stride){
      const threshold=(values[i-1]+values[i])/2,left=[],right=[];
      for(let j=0;j<X.length;j++)(X[j][feature]<=threshold?left:right).push(j);
      if(left.length<minLeaf||right.length<minLeaf)continue;
      const loss=sse(left.map(j=>y[j]))+sse(right.map(j=>y[j]));
      if(!best||loss<best.loss)best={feature,threshold,left,right,loss};
    }
  }
  if(!best)return node;
  node.leaf=false;node.feature=best.feature;node.threshold=best.threshold;
  node.left=buildTree(best.left.map(i=>X[i]),best.left.map(i=>y[i]),{depth:depth+1,maxDepth,minLeaf,mtry,random});
  node.right=buildTree(best.right.map(i=>X[i]),best.right.map(i=>y[i]),{depth:depth+1,maxDepth,minLeaf,mtry,random});
  return node;
}
export class RandomForestRegressor{
  constructor({trees=35,maxDepth=10,minLeaf=3,mtry=null,random=Math.random}={}){
    if(!Number.isInteger(trees)||trees<=0)throw new Error('Random Forest trees must be a positive integer.');
    this.treeCount=trees;this.maxDepth=maxDepth;this.minLeaf=minLeaf;this.mtry=mtry;this.random=random;this.trees_=[];this.featureCount=0;
  }
  fit(X,y){
    if(!Array.isArray(X)||X.length===0)throw new Error('Training data is empty.');
    if(!Array.isArray(y)||X.length!==y.length)throw new Error('X/y length mismatch.');
    const p=X[0]?.length||0;if(!p)throw new Error('Training rows must contain features.');
    if(X.some(row=>!Array.isArray(row)||row.length!==p||row.some(v=>!Number.isFinite(Number(v))))||y.some(v=>!Number.isFinite(Number(v))))throw new Error('Training data must contain finite numeric values.');
    this.featureCount=p;const mtry=this.mtry==null?Math.max(1,Math.floor(Math.sqrt(p))):Math.max(1,Math.min(p,Math.floor(this.mtry)));
    this.trees_=[];
    for(let t=0;t<this.treeCount;t++){const ids=bootstrap(X.length,this.random);this.trees_.push(buildTree(ids.map(i=>X[i]),ids.map(i=>Number(y[i])),{depth:0,maxDepth:this.maxDepth,minLeaf:this.minLeaf,mtry,random:this.random}));}
    return this;
  }
  predict(row){if(!this.trees_.length)throw new Error('Random Forest has not been fitted.');if(!Array.isArray(row)||row.length!==this.featureCount||row.some(v=>!Number.isFinite(Number(v))))throw new Error('Prediction row must match the finite numeric feature schema.');return this.trees_.reduce((s,t)=>s+predictTree(t,row),0)/this.trees_.length;}
}
