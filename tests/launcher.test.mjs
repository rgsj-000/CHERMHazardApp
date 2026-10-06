import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

async function startServer(port){
  const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../tools/serve.ps1',import.meta.url)),'-Port',String(port),'-NoBrowser'],{windowsHide:true});
  let output='';
  const url=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error(`Launcher did not become ready: ${output}`));},15000);
    child.stdout.on('data',chunk=>{
      output+=chunk.toString();const match=output.match(/CHERM Hazard Simulator running at (http:\/\/[^\s]+)/);
      if(match){clearTimeout(timer);resolve(match[1]);}
    });
    child.stderr.on('data',chunk=>{output+=chunk.toString();});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('exit',code=>{clearTimeout(timer);reject(new Error(`Launcher exited (${code}): ${output}`));});
  });
  return {url,child};
}

test('Windows server launches without HTTP registration and serves app assets', {skip:process.platform!=='win32'},async()=>{
  const {url,child}=await startServer(0);
  try{
    const html=await fetch(url);assert.equal(html.status,200);assert.match(html.headers.get('content-type'),/text\/html/);assert.match(await html.text(),/Climate & Land-Cover/);
    const js=await fetch(new URL('js/app.js',url));assert.match(js.headers.get('content-type'),/javascript/);assert.match(await js.text(),/loadBundledDataset/);
    const manifest=await (await fetch(new URL('data/dataset.json',url))).json();assert.equal(manifest.grid.crs,'EPSG:4326');
    const path='data/rasters/hazards/5yr_flood.tif';
    const tiff=await fetch(new URL(path,url));assert.equal(tiff.status,200);assert.match(tiff.headers.get('content-type'),/image\/tiff/);
    assert.equal((await tiff.arrayBuffer()).byteLength,(await stat(new URL(`../${path}`,import.meta.url))).size);
    const head=await fetch(new URL(path,url),{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),tiff.headers.get('content-length'));assert.equal((await head.arrayBuffer()).byteLength,0);
    assert.equal((await fetch(new URL('missing-file.tif',url))).status,404);
    assert.equal((await fetch(new URL('index.html',url),{method:'POST',body:'test'})).status,405);
  }finally{child.kill();}
});

test('Windows launcher chooses another port when the requested port is occupied', {skip:process.platform!=='win32'},async()=>{
  const occupied=createServer();await new Promise(resolve=>occupied.listen(0,'127.0.0.1',resolve));
  let child;
  try{
    const port=occupied.address().port,server=await startServer(port);child=server.child;
    assert.notEqual(Number(new URL(server.url).port),port);
    assert.equal((await fetch(server.url)).status,200);
  }finally{child?.kill();await new Promise(resolve=>occupied.close(resolve));}
});
