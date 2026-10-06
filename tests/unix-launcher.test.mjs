import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {existsSync} from 'node:fs';
import {copyFile,mkdir,mkdtemp,rm,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const python=['python3','python'].find(command=>spawnSync(command,['-c','import sys; raise SystemExit(sys.version_info < (3, 7))'],{windowsHide:true}).status===0);
const shell=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/sh';

async function stop(child){
  if(child.exitCode!==null)return;
  const closed=new Promise(resolve=>child.once('exit',resolve));
  if(process.platform==='win32')await new Promise(resolve=>spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).once('exit',resolve));
  else child.kill('SIGTERM');
  await closed;
}

async function start(command,args,cwd){
  const child=spawn(command,args,{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='';
  try{
    const url=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`Launcher not ready: ${output}`)),15000);
      const collect=chunk=>{
        output+=chunk.toString();const match=output.match(/CHERM Hazard Simulator running at (http:\/\/[^\s]+)/);
        if(match){clearTimeout(timer);resolve(match[1]);}
      };
      child.stdout.on('data',collect);child.stderr.on('data',collect);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Launcher exited (${code}): ${output}`));});
    });
    return {url,child};
  }catch(error){if(child.pid)await stop(child);throw error;}
}

test('portable server binds loopback and serves app assets with correct MIME and HEAD', {skip:!python},async()=>{
  const {url,child}=await start(python,[join(root,'tools/serve.py'),'--port','0','--no-browser'],root);
  try{
    assert.equal(new URL(url).hostname,'127.0.0.1');
    const html=await fetch(url);assert.equal(html.status,200);assert.match(await html.text(),/Hazard Scenario Studio/);
    for(const [path,type] of [['js/app.js',/javascript/],['data/boundaries/municipality.geojson',/application\/geo\+json/],['data/rasters/hazards/5yr_flood.tif',/image\/tiff/],['assets/brand/cherm-logo.jpg',/image\/jpeg/]]){
      const file=await fetch(new URL(path,url));assert.equal(file.status,200);assert.match(file.headers.get('content-type'),type);
      assert.equal((await file.arrayBuffer()).byteLength,(await stat(join(root,path))).size);
      const head=await fetch(new URL(path,url),{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
      assert.equal(head.headers.get('content-length'),file.headers.get('content-length'));
    }
    assert.equal((await fetch(new URL('missing.tif',url))).status,404);
    assert.equal((await fetch(new URL('data/',url))).status,404);
  }finally{await stop(child);}
});

test('portable launcher selects another port when the requested port is occupied', {skip:!python},async()=>{
  const occupied=createServer();await new Promise(resolve=>occupied.listen(0,'127.0.0.1',resolve));let child;
  try{
    const port=occupied.address().port,result=await start(python,[join(root,'tools/serve.py'),'-Port',String(port),'-NoBrowser'],root);child=result.child;
    assert.notEqual(Number(new URL(result.url).port),port);assert.equal((await fetch(result.url)).status,200);
  }finally{if(child)await stop(child);await new Promise(resolve=>occupied.close(resolve));}
});

test('start.sh works from another directory and a project path containing spaces', {skip:!python||!existsSync(shell)},async()=>{
  const directory=await mkdtemp(join(root,'docs/verification/unix launcher '));let child;
  try{
    await mkdir(join(directory,'tools'));
    await copyFile(join(root,'start.sh'),join(directory,'start.sh'));
    await copyFile(join(root,'tools/serve.py'),join(directory,'tools/serve.py'));
    await writeFile(join(directory,'index.html'),'CHERM launch from a path with spaces');
    const result=await start(shell,[join(directory,'start.sh'),'--port','0','--no-browser'],root);child=result.child;
    assert.equal(await (await fetch(result.url)).text(),'CHERM launch from a path with spaces');
  }finally{if(child)await stop(child);await rm(directory,{recursive:true,force:true});}
});

test('invalid launcher ports exit visibly instead of starting a server', {skip:!python},()=>{
  const result=spawnSync(python,[join(root,'tools/serve.py'),'--port','65536','--no-browser'],{windowsHide:true,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/0.*65535/);
});

test('start.sh displays startup failures and returns the failing exit code', {skip:!python||!existsSync(shell)},()=>{
  const result=spawnSync(shell,[join(root,'start.sh'),'--port','65536','--no-browser'],{windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000});
  assert.equal(result.status,2,result.stderr);
  assert.match(result.stderr,/0.*65535/);assert.match(result.stderr,/CHERM could not start/);
});

test('stopping start.sh also stops its server and releases the port', {skip:!python||!existsSync(shell)},async()=>{
  const wrapper='sh "$1" --port 0 --no-browser & launcher_pid=$!; read -r stop_request; kill -TERM "$launcher_pid"; wait "$launcher_pid"';
  const {url,child}=await start(shell,['-c',wrapper,'verify-stop',join(root,'start.sh').replaceAll('\\','/')],root);
  try{
    assert.equal((await fetch(url)).status,200);
    const exit=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Launcher did not stop its server')),10000);
      child.once('exit',code=>{clearTimeout(timer);resolve(code);});
    });
    child.stdin.end('\n');assert.equal(await exit,0);
    const probe=createServer();
    await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(Number(new URL(url).port),'127.0.0.1',resolve);});
    await new Promise(resolve=>probe.close(resolve));
  }finally{await stop(child);}
});

test('automatic browser launch uses the bound URL and can be disabled', {skip:!python},()=>{
  const script=`
import importlib.util, sys
from threading import Event
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('cherm_server', sys.argv[1])
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
for disabled in (False, True):
    ready = Event()
    urls = []
    def browser(url, new):
        assert new == 2
        urls.append(url)
        ready.set()
        return True
    def serve(**kwargs):
        if disabled:
            assert not ready.wait(0.1)
        else:
            assert ready.wait(3), 'Browser launch did not occur'
    sys.argv = ['serve.py', '--port', '0'] + (['--no-browser'] if disabled else [])
    with patch.object(app.webbrowser, 'open', side_effect=browser), patch.object(app.LocalServer, 'serve_forever', side_effect=serve):
        assert app.main() == 0
    if not disabled:
        print('Browser opened: ' + urls[0])
`;
  const result=spawnSync(python,['-c',script,join(root,'tools/serve.py')],{windowsHide:true,encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  const ready=result.stdout.match(/running at (http:\/\/[^\s]+)/)[1];
  const opened=result.stdout.match(/Browser opened: (http:\/\/[^\s]+)/)[1];
  assert.equal(opened,ready);assert.notEqual(new URL(ready).port,'0');
});
