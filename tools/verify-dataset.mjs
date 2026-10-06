// Local headless verification when no connected browser is available.
// Usage: node tools/verify-dataset.mjs http://127.0.0.1:8765/ [browser-executable]
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
const base=new URL('../docs/verification/',import.meta.url);
await mkdir(base,{recursive:true});
const profile=await mkdtemp(fileURLToPath(new URL('browser-profile-',base)));
const portServer=createServer();
await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));
const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
const executable=process.argv[3]??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const child=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ws;
try{
  let pages;
  for(let n=0;n<40;n++){
    try{pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.some(p=>p.type==='page'))break;}catch{}
    await delay(250);
  }
  if(!pages?.some(p=>p.type==='page'))throw new Error('Headless browser did not start.');
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let sequence=0;const pending=new Map(),errors=[];
  ws.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
    if(message.id){const entry=pending.get(message.id);if(entry){pending.delete(message.id);message.error?entry.reject(new Error(message.error.message)):entry.resolve(message.result);}}
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor=async expression=>{
    for(let n=0;n<120;n++){if(await evaluate(expression))return;await delay(500);}
    throw new Error(`Timed out: ${expression}; status: ${await evaluate("document.getElementById('status').textContent")}`);
  };
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:process.argv[2]??'http://127.0.0.1:8765/'});
  await waitFor("document.getElementById('datasetStatus')?.textContent.includes('all 12 model inputs ready')");
  const data=await evaluate(`(async()=>{
    const {appState}=await import('/js/state.js');
    const {validateAlignedRasters}=await import('/js/raster.js');
    validateAlignedRasters(appState.rasters,Object.keys(appState.rasters));
    return {municipalities:document.getElementById('municipality').options.length-1,barangays:appState.boundaries.barangayGeoJSON.features.length,inputs:Object.keys(appState.rasters).length,tempMin:Math.min(...appState.rasters.temp.data.filter(x=>x!==-9999).slice(0,1000)),bounds:appState.rasters.dem.bbox,layers:Object.keys(appState.mapLayers)};
  })()`);
  assert.equal(data.municipalities,40);assert.equal(data.barangays,1243);assert.equal(data.inputs,12);
  assert.ok(data.tempMin>10&&data.tempMin<35);assert.ok(data.bounds[0]>120&&data.bounds[2]<124);
  assert.deepEqual(data.layers.sort(),['baseline_flood','baseline_landslide']);
  console.log('Automatic loading, alignment, temperature scaling and baseline overlays verified.',JSON.stringify(data));
  await evaluate("document.getElementById('municipality').value='ATIMONAN';document.getElementById('municipality').dispatchEvent(new Event('change'))");
  const barangays=await evaluate("document.getElementById('barangay').options.length-1");assert.ok(barangays>0);
  await evaluate("document.getElementById('barangay').selectedIndex=1;document.getElementById('barangay').dispatchEvent(new Event('change'))");
  assert.ok(await evaluate("(async()=>Boolean((await import('/js/state.js')).appState.mapLayers.barangayBoundary))()"));
  await evaluate("document.getElementById('barangay').value='';document.getElementById('barangay').dispatchEvent(new Event('change'))");
  for(const period of ['25','100','5']){
    await evaluate(`document.getElementById('floodPeriod').value='${period}';document.getElementById('floodPeriod').dispatchEvent(new Event('change'))`);
    await waitFor(`document.getElementById('status').textContent.startsWith('${period}-year flood raster loaded')`);
    assert.equal(await evaluate("(async()=>(await import('/js/state.js')).appState.rasters.flood.name)()"),`${period}yr_flood.tif`);
  }
  console.log(`Municipality/barangay filtering and all flood return periods verified (${barangays} Atimonan barangays).`);
  await evaluate("document.getElementById('municipality').value='TIAONG';document.getElementById('municipality').dispatchEvent(new Event('change'));document.getElementById('trees').value='5';document.getElementById('samples').value='200';document.getElementById('runScenario').click()");
  await waitFor("document.getElementById('status').textContent.startsWith('Scenario completed')||document.getElementById('status').textContent.startsWith('Model stopped')");
  const scenario=await evaluate(`(async()=>{const {appState}=await import('/js/state.js');return {status:document.getElementById('status').textContent,diagnostics:document.getElementById('diagnostics').textContent,layers:Object.keys(appState.mapLayers),landslideFinite:appState.model.futureLandslide?.data.some(Number.isFinite),floodFinite:appState.model.futureFlood?.data.some(Number.isFinite)};})()`);
  assert.match(scenario.status,/Scenario completed/);assert.ok(scenario.landslideFinite&&scenario.floodFinite);
  assert.ok(scenario.layers.includes('future_landslide')&&scenario.layers.includes('future_flood'));
  assert.ok(!scenario.layers.some(key=>/landcover/i.test(key)));
  console.log('Full scenario completed.',JSON.stringify(scenario));
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(new URL('rstw2026-map.png',base),Buffer.from(screenshot.data,'base64'));
  await evaluate("document.getElementById('floodPeriod').value='25';document.getElementById('floodPeriod').dispatchEvent(new Event('change'))");
  await waitFor("document.getElementById('status').textContent.startsWith('25-year flood raster loaded')");
  assert.ok(await evaluate("(async()=>{const {appState}=await import('/js/state.js');return !appState.mapLayers.future_flood&&!appState.mapLayers.future_landslide;})()"));
  assert.deepEqual(errors,[]);
  const report={data,atimonanBarangays:barangays,scenario,uncaughtExceptions:errors.length};
  await writeFile(new URL('rstw2026-check.json',base),JSON.stringify(report,null,2)+'\n');
  console.log('Future results are cleared on input change; no uncaught browser exceptions.');
}finally{
  if(ws?.readyState===WebSocket.OPEN)ws.close();
  child.kill();await delay(500);
  // The profile was created in this project; never delete a real browser profile.
  if(profile.startsWith(fileURLToPath(base))&&profile.includes('browser-profile-')){
    try{await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{console.log('Temporary headless profile remains in ignored verification folder.');}
  }
}
