import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import manifest from '../image-asset-manifest.json' with {type:'json'};
import {verifiedPortraitPaths,versionedPortraitCachePaths} from '../versioned-portrait-assets.js';
import {arenaDecorativeCacheControl} from '../arena-decorative-assets.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=url=>readFileSync(new URL('../public'+url,import.meta.url));
const immutable='public, max-age=31536000, immutable';

test('all thirteen full-resolution portrait derivatives have verified source/content identities and substantial byte savings',()=>{
 assert.equal(manifest.version,1);assert.equal(manifest.encoding.resize,false);assert.equal(manifest.assets.length,13);
 assert.equal(new Set(manifest.assets.map(a=>a.source)).size,13);assert.equal(new Set(manifest.assets.map(a=>a.url)).size,13);
 let original=0,optimized=0;
 for(const a of manifest.assets){
  const source=read(a.source),bytes=read(a.url);
  assert.equal(hash(source),a.sourceSha256,a.source);assert.equal(source.length,a.sourceBytes);
  assert.equal(hash(bytes),a.sha256,a.url);assert.equal(bytes.length,a.bytes);
  assert.ok(a.url.endsWith('.'+a.sha256.slice(0,16)+'.webp'));
  assert.equal(source.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(source.readUInt32BE(16),a.width);assert.equal(source.readUInt32BE(20),a.height);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  // The current opaque, lossy derivatives are simple VP8 WebPs. Verify actual canvas dimensions, not just manifest metadata.
  assert.equal(bytes.toString('ascii',12,16),'VP8 ');assert.equal(bytes.toString('hex',23,26),'9d012a');
  assert.equal(bytes.readUInt16LE(26)&0x3fff,a.width);assert.equal(bytes.readUInt16LE(28)&0x3fff,a.height);
  assert.ok(a.bytes<a.sourceBytes*.4,a.url+' must save at least 60%');
  assert.ok(versionedPortraitCachePaths.has(a.url.slice(1)));
  assert.equal(arenaDecorativeCacheControl(a.url.slice(1)),immutable);
  assert.equal(arenaDecorativeCacheControl(a.source.slice(1)),'no-store');
  original+=a.sourceBytes;optimized+=a.bytes;
 }
 assert.ok(optimized<original*.3,'aggregate transfer reduction exceeds 70%');
});

test('verified portrait paths fail closed for missing, modified, incorrectly sized, forged or non-image assets',()=>{
 const a=manifest.assets[0],bytes=read(a.url);
 assert.deepEqual([...verifiedPortraitPaths([a],()=>bytes)],[a.url.slice(1)]);
 for(const bad of [null,undefined,{},{...a,sha256:'not-a-hash'},{...a,bytes:a.bytes+1},{...a,sha256:'0'.repeat(64)},
  {...a,url:a.url+'?v=1'},{...a,url:a.url.replace('.webp','.js')},{...a,url:'/api/state'},
  {...a,url:'/images/optimized/../hero-01.'+a.sha256.slice(0,16)+'.webp'},
  {...a,url:a.url.replace('hero-01','unknown')}])assert.equal(verifiedPortraitPaths([bad],()=>bytes).size,0,JSON.stringify(bad));
 assert.equal(verifiedPortraitPaths([a],()=>{throw Error('missing');}).size,0);
 assert.equal(verifiedPortraitPaths([a],()=>Buffer.alloc(a.bytes)).size,0);
 for(const path of ['app.js','style.css','index.html','api/state','images/optimized/hero-01.0000000000000000.webp',a.source.slice(1)+'?v='+a.sha256])assert.equal(arenaDecorativeCacheControl(path),'no-store');
});

test('changed derivative content requires a new digest URL; stale URL cannot become immutable',()=>{
 const old=manifest.assets[0],changed=Buffer.from(read(old.url));changed[changed.length-1]^=1;
 const sha256=hash(changed),next={...old,sha256,url:old.url.replace(old.sha256.slice(0,16),sha256.slice(0,16))};
 assert.notEqual(next.url,old.url);
 assert.equal(verifiedPortraitPaths([old],()=>changed).size,0);
 assert.equal(verifiedPortraitPaths([{...next,url:old.url}],()=>changed).size,0);
 assert.deepEqual([...verifiedPortraitPaths([next],()=>changed)],[next.url.slice(1)]);
});

test('normal and CrazyGames HTTP serve verified images identically while legacy assets, auth, wallets, room state and SSE retain private cache policy',{timeout:30000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1',HERO_DIAMONDS_ENABLED:'0',HERO_LOGIN_REWARDS_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const post=async(path,body,status=200)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,status,path);assert.equal(r.headers.get('cache-control'),'no-store',path);return r.json();};
 try{
  let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs);try{const r=await fetch(base+'/api/info');await r.text();if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,40));}assert.ok(ready,logs);
  for(const prefix of ['', '/crazygames']){
   for(const a of manifest.assets){
    for(const [url,cache,mime] of [[a.url,immutable,'image/webp'],[a.source,'no-store','image/png']]){
     const r=await fetch(base+prefix+url);assert.equal(r.status,200,url);assert.equal(r.headers.get('cache-control'),cache);assert.equal(r.headers.get('content-type'),mime);assert.deepEqual(Buffer.from(await r.arrayBuffer()),read(url));
    }
   }
   for(const path of ['/','/app.js','/style.css','/index.html?v=0123456789abcdef',manifest.assets[0].source+'?v='+manifest.assets[0].sha256]){
    const r=await fetch(base+prefix+path);assert.equal(r.status,200,path);assert.equal(r.headers.get('cache-control'),'no-store');await r.arrayBuffer();
   }
   for(const path of ['/images/optimized/hero-01.0000000000000000.webp','/images/optimized/missing.webp?v=1','/images/optimized/%2e%2e%2f%2e%2e%2f%2e%2e%2fserver.js']){
    const r=await fetch(base+prefix+path);assert.equal(r.status,404,path);assert.equal(r.headers.get('cache-control'),'no-store');await r.text();
   }
  }
  for(const path of ['/crazygames/admin.html','/crazygames/commander-training.html']){const r=await fetch(base+path);assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store');await r.text();}
  const guest=await post('/api/auth/guest',{name:'Portrait cache test'}),auth={authToken:guest.authToken};
  assert.equal((await post('/api/auth/check?v=0123456789abcdef',auth)).user.sub,guest.user.sub);
  await post('/api/wallet?image=portrait.webp&v=0123456789abcdef',auth);
  const created=await post('/api/create',auth),seat={...auth,code:created.room.code,token:created.token};
  assert.equal((await post('/api/state?v=0123456789abcdef',seat)).room.code,created.room.code);
  await post('/api/auth/check',{},401);await post('/api/wallet',{},401);await post('/api/state',{...seat,token:'wrong'},403);
  const denied=await fetch(base+'/api/events?code=INVALID&v=0123456789abcdef');assert.equal(denied.status,403);assert.equal(denied.headers.get('cache-control'),'no-store');await denied.text();
  const controller=new AbortController();
  try{const events=await fetch(base+'/api/events?'+new URLSearchParams(seat),{signal:controller.signal});assert.equal(events.status,200);assert.equal(events.headers.get('cache-control'),'no-cache');assert.equal(events.headers.get('content-type'),'text/event-stream');await events.body.cancel();}finally{controller.abort();}
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref();});}
});
