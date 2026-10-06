import test from 'node:test';
import assert from 'node:assert/strict';
import {setProgress,setMapContext} from '../js/ui.js';

function withUiNodes(ids,run){
  const previous=globalThis.document;
  const nodes=Object.fromEntries(ids.map(id=>[id,{style:{},attributes:{},textContent:'',setAttribute(name,value){this.attributes[name]=value;}}]));
  globalThis.document={getElementById:id=>nodes[id]??null};
  try{run(nodes);}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}

test('visual progress and screen reader progress agree after clamping and reset',()=>{
  withUiNodes(['progressBar','modelProgress','progressValue'],nodes=>{
    setProgress(140);
    assert.equal(nodes.progressBar.style.width,'100%');
    assert.equal(nodes.modelProgress.attributes['aria-valuenow'],'100');
    assert.equal(nodes.progressValue.textContent,'100%');
    setProgress(0);
    assert.equal(nodes.progressBar.style.width,'0%');
    assert.equal(nodes.modelProgress.attributes['aria-valuenow'],'0');
    assert.equal(nodes.progressValue.textContent,'0%');
  });
});

test('map context follows selected area and distinguishes custom flood data',()=>{
  withUiNodes(['mapArea','mapPeriod','dataOverview'],nodes=>{
    setMapContext({municipality:'ATIMONAN',barangay:'Magsaysay',floodPeriod:'25',inputCount:12});
    assert.equal(nodes.mapArea.textContent,'Magsaysay, ATIMONAN');
    assert.equal(nodes.mapPeriod.textContent,'25-year flood');
    assert.equal(nodes.dataOverview.textContent,'12 raster inputs loaded');
    setMapContext({municipality:'TIAONG',floodPeriod:null,hasFlood:true,inputCount:10});
    assert.equal(nodes.mapArea.textContent,'TIAONG');
    assert.equal(nodes.mapPeriod.textContent,'Custom flood raster');
    setMapContext({inputCount:7});
    assert.equal(nodes.mapArea.textContent,'Quezon Province');
    assert.equal(nodes.mapPeriod.textContent,'No flood raster');
  });
});
