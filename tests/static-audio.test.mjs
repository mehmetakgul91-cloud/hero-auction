import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {audioByteRange,serveStaticAudio} from '../static-audio.js';

test('audio byte ranges support bounded, open-ended and suffix reads without overflow',()=>{
 assert.equal(audioByteRange(undefined,10),null);
 for(const [value,start,end] of [['bytes=0-1',0,1],['bytes=3-',3,9],['bytes=-3',7,9],['bytes=3-999',3,9],['bytes=-99',0,9],[' Bytes=0-0 ',0,0]]){
  assert.deepEqual(audioByteRange(value,10),{start,end},value);
 }
 for(const value of ['bytes=','bytes=-','bytes=-0','bytes=10-','bytes=5-4','bytes=0-NaN','bytes=0-9007199254740992','bytes=9007199254740992-','bytes=0-1 garbage']){
  assert.equal(audioByteRange(value,10),false,value);
 }
 assert.equal(audioByteRange('bytes=0-0',0),false);
 assert.equal(audioByteRange('items=0-1',10),null,'unknown units are ignored');
 assert.equal(audioByteRange('bytes=0-1,4-5',10),null,'multipart ranges are not advertised or implemented');
});

test('MP3 HTTP responses preserve exact bytes, range lengths, HEAD and cancellation',{timeout:10000},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'hero-audio-test-'));
 const file=path.join(directory,'fixture.mp3'),empty=path.join(directory,'empty.mp3');
 const bytes=Buffer.from(Array.from({length:100},(_,i)=>i));
 await writeFile(file,bytes);await writeFile(empty,'');
 const server=http.createServer((req,res)=>serveStaticAudio(req,res,req.url==='/empty'?empty:file));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const full=await fetch(base);assert.equal(full.status,200);assert.equal(full.headers.get('content-type'),'audio/mpeg');
  assert.equal(full.headers.get('content-length'),'100');assert.equal(full.headers.get('accept-ranges'),'bytes');assert.equal(full.headers.get('cache-control'),'no-store');
  assert.deepEqual(Buffer.from(await full.arrayBuffer()),bytes);
  for(const [range,start,end] of [['bytes=0-1',0,1],['bytes=4-',4,99],['bytes=-7',93,99],['bytes=98-999',98,99]]){
   const response=await fetch(base,{headers:{Range:range}});assert.equal(response.status,206,range);
   assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/100`);
   assert.equal(response.headers.get('content-length'),String(end-start+1));
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(start,end+1));
  }
  for(const range of ['bytes=100-','bytes=80-10','bytes=-0','bytes=x-y']){
   const response=await fetch(base,{headers:{Range:range}});assert.equal(response.status,416,range);
   assert.equal(response.headers.get('content-range'),'bytes */100');assert.equal(response.headers.get('content-length'),'0');assert.equal((await response.arrayBuffer()).byteLength,0);
  }
  const head=await fetch(base,{method:'HEAD',headers:{Range:'bytes=0-1'}});
  assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'100');assert.equal(head.headers.get('content-range'),null);assert.equal((await head.arrayBuffer()).byteLength,0);
  const conditional=await fetch(base,{headers:{Range:'bytes=0-1','If-Range':'"unverified"'}});
  assert.equal(conditional.status,200);assert.equal((await conditional.arrayBuffer()).byteLength,100);
  for(const range of ['items=0-1','bytes=0-1,4-5']){
   const response=await fetch(base,{headers:{Range:range}});assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,100);
  }
  const zero=await fetch(base+'/empty');assert.equal(zero.status,200);assert.equal(zero.headers.get('content-length'),'0');assert.equal((await zero.arrayBuffer()).byteLength,0);
  const zeroRange=await fetch(base+'/empty',{headers:{Range:'bytes=0-1'}});assert.equal(zeroRange.status,416);assert.equal(zeroRange.headers.get('content-range'),'bytes */0');
  const cancelled=await fetch(base);await cancelled.body.cancel();
  const later=await fetch(base,{headers:{Range:'bytes=0-1'}});assert.equal(later.status,206);assert.equal((await later.arrayBuffer()).byteLength,2);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});

test('normal and CrazyGames static MP3 routes support Safari byte probes without changing other routes',{timeout:15000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
 const base='http://127.0.0.1:'+port,asset='/audio/hero-auction-senkron-davul-bas-2dk.mp3';
 try{
  let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,30));}assert.ok(ready,logs);
  const bytes=await readFile(new URL('../public'+asset,import.meta.url));
  for(const prefix of ['','/crazygames']){
   const response=await fetch(base+prefix+asset+'?v=probe',{headers:{Range:'bytes=0-1'}});
   assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'audio/mpeg');assert.equal(response.headers.get('content-length'),'2');assert.equal(response.headers.get('content-range'),`bytes 0-1/${bytes.length}`);
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(0,2));
   const head=await fetch(base+prefix+asset,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
   const invalid=await fetch(base+prefix+asset,{headers:{Range:`bytes=${bytes.length}-`}});assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),'bytes */'+bytes.length);
   assert.equal((await fetch(base+prefix+'/audio/not-found.mp3',{headers:{Range:'bytes=0-1'}})).status,404);
  }
  const script=await fetch(base+'/crazygames/platform.js',{headers:{Range:'bytes=0-1'}});assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);assert.equal(script.headers.get('accept-ranges'),null);assert.match(await script.text(),/HeroPlatform/);
  assert.equal((await fetch(base+'/crazygames/admin.mp3')).status,404);
  assert.equal((await fetch(base+'/audio/%2e%2e%2f%2e%2e%2fpackage.json.mp3')).status,404);
  assert.equal((await fetch(base+'/api/info',{method:'HEAD'})).status,405);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref();});}
});
