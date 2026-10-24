import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import crypto from 'node:crypto';
import {androidTestMemoryMode,ANDROID_TEST_RENDER_SERVICE_ID} from '../android-test-mode.js';
test('Android memory mode is default-off and restricted to one Render service or explicit local tests',()=>{
 for(const env of [{},{COMMANDER_TEST_GUEST_MODE:'1'},{NATIVE_ALLOWED_ORIGINS:'https://localhost'},{ANDROID_TEST_MEMORY_ONLY:'0'},{ANDROID_TEST_MEMORY_ONLY:'true'}])assert.equal(androidTestMemoryMode(env),false);
 assert.equal(androidTestMemoryMode({ANDROID_TEST_MEMORY_ONLY:'1',NODE_ENV:'test'}),true);
 assert.equal(androidTestMemoryMode({ANDROID_TEST_MEMORY_ONLY:'1',RENDER:'true',RENDER_SERVICE_ID:ANDROID_TEST_RENDER_SERVICE_ID}),true);
 for(const env of [{},{NODE_ENV:'production'},{NODE_ENV:'test',RENDER:'true'},{RENDER_SERVICE_ID:ANDROID_TEST_RENDER_SERVICE_ID},{NODE_ENV:'test',RENDER_GIT_BRANCH:'main'},{NODE_ENV:'test',RENDER_SERVICE_NAME:'hero-auction'},{RENDER:'true',RENDER_SERVICE_ID:'srv-production'}])assert.throws(()=>androidTestMemoryMode({ANDROID_TEST_MEMORY_ONLY:'1',...env}),/restricted|requires/);
});
async function start(t,{launcher=false}={}){
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 // Pool construction itself fails if the isolation gate ever lets it happen.
 // External auth fetches also fail: no provider request is permitted in this mode.
 const probe='data:text/javascript,'+encodeURIComponent(`import pg from ${JSON.stringify(new URL('../node_modules/pg/lib/index.js',import.meta.url).href)};pg.Pool=class{constructor(){throw Error('DATABASE_POOL_MUST_NOT_BE_CREATED')}};globalThis.fetch=()=>{throw Error('EXTERNAL_AUTH_MUST_NOT_BE_CALLED')};`);
 const child=spawn(process.execPath,['--import',probe,launcher?'scripts/start-android-test.mjs':'server.js'],{cwd:new URL('..',import.meta.url),env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='RENDER'&&!key.startsWith('RENDER_'))),PORT:String(port),NODE_ENV:'test',ANDROID_TEST_MEMORY_ONLY:'1',DATABASE_URL:'postgres://fake:fake@127.0.0.1:1/should-never-connect',AUTH_SIGNING_SECRET:'11'.repeat(32),ADMIN_GOOGLE_EMAIL:'admin@example.invalid',NATIVE_ALLOWED_ORIGINS:'https://localhost',RENDER:'',RENDER_SERVICE_ID:'',RENDER_SERVICE_NAME:'',RENDER_EXTERNAL_URL:'',...(launcher?{RENDER:'true',RENDER_SERVICE_ID:ANDROID_TEST_RENDER_SERVICE_ID,NODE_ENV:'production',ANDROID_TEST_MEMORY_ONLY:'0',NATIVE_ALLOWED_ORIGINS:'https://invalid.example'}:{})},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 t.after(async()=>{child.kill();await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})});
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok)return{base,logs:()=>logs};}catch{}await new Promise(r=>setTimeout(r,20));}throw Error('Server failed: '+logs);
}
function forge(secret){const data=Buffer.from(JSON.stringify({sub:'production-account',name:'Not a test account',email:'admin@example.invalid',expires:Date.now()+60000})).toString('base64url');return data+'.'+crypto.createHmac('sha256',Buffer.from(secret,'hex')).update(data).digest('base64url')}
test('isolated mode never constructs database pool or accepts inherited auth/admin credentials',{timeout:15000},async t=>{
 const {base,logs}=await start(t);
 const post=async(path,body={},status=200)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://localhost'},body:JSON.stringify(body)});const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));assert.equal(r.headers.get('access-control-allow-origin'),'https://localhost');return j};
 const info=await(await fetch(base+'/api/info')).json();assert.equal(info.catalogueCount,50);assert.deepEqual(Object.keys(info.counts),['original']);assert.deepEqual(info.androidTest,{isolated:true,storage:'memory',guestOnly:true,progressionComplete:false});
 await post('/api/auth/check',{authToken:forge('11'.repeat(32))},401);
 for(const path of ['/api/auth/google','/api/auth/crazygames'])await post(path,{credential:'x'.repeat(200)},403);
 const login=await post('/api/auth/guest',{name:'Android Test'}),auth={authToken:login.authToken};assert.equal(login.gold,500);
 const data=login.authToken.split('.')[0];assert.notEqual(login.authToken.split('.')[1],crypto.createHmac('sha256',Buffer.from('11'.repeat(32),'hex')).update(data).digest('base64url'));
 const selected=await post('/api/commander/select',{...auth,commanderId:'defense'});assert.equal(selected.profile.commanderId,'defense');
 assert.equal((await post('/api/friends',auth)).persistent,false);
 await post('/api/moderation/state',auth);
 await post('/api/admin/accounts',auth,403);
 const second=await start(t);const freshCheck=await fetch(second.base+'/api/auth/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(auth)});assert.equal(freshCheck.status,401,'separate/restarted memory instance cannot accept previous auth');
 const bot=await post('/api/bot',{...auth,difficulty:'hard'});assert.equal(bot.room.mode,'bot');assert.equal(bot.room.difficulty,'hard');
 assert.equal((await post('/api/wallet',auth)).gold,500);
 assert.doesNotMatch(logs(),/DATABASE_POOL_MUST_NOT_BE_CREATED|EXTERNAL_AUTH_MUST_NOT_BE_CALLED/);
});

test('test-only launcher fixes isolation and native origin before server import and rejects production',async()=>{
 const {isolatedAndroidStartup}=await import('../scripts/start-android-test.mjs');
 const env={RENDER:'true',RENDER_SERVICE_ID:ANDROID_TEST_RENDER_SERVICE_ID,ANDROID_TEST_MEMORY_ONLY:'0',NATIVE_ALLOWED_ORIGINS:'https://evil.example',DATABASE_URL:'untouched-placeholder'};
 const configured=isolatedAndroidStartup(env);
 assert.equal(configured.ANDROID_TEST_MEMORY_ONLY,'1');assert.equal(configured.NATIVE_ALLOWED_ORIGINS,'https://localhost');assert.equal(configured.DATABASE_URL,'untouched-placeholder');assert.equal(env.ANDROID_TEST_MEMORY_ONLY,'0');
 for(const bad of [{},{RENDER:'true',RENDER_SERVICE_ID:'srv-production'},{NODE_ENV:'test',RENDER_SERVICE_ID:ANDROID_TEST_RENDER_SERVICE_ID}])assert.throws(()=>isolatedAndroidStartup(bad),/refuses/);
});

test('actual isolated launcher supports Android-origin and ordinary web clients in the same authenticated room',{timeout:15000},async t=>{
 const {base}=await start(t,{launcher:true});
 const post=async(path,body={},native=false)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(native?{Origin:'https://localhost'}:{})},body:JSON.stringify(body)});const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));assert.equal(r.headers.get('access-control-allow-origin'),native?'https://localhost':null);return j};
 const info=await(await fetch(base+'/api/info')).json();assert.equal(info.androidTest.isolated,true);assert.equal(info.catalogueCount,50);
 const a=await post('/api/auth/guest',{name:'Android Client'},true),b=await post('/api/auth/guest',{name:'Web Client'});
 await post('/api/commander/select',{authToken:a.authToken,commanderId:'attack'},true);
 await post('/api/commander/select',{authToken:b.authToken,commanderId:'defense'});
 const created=await post('/api/create',{authToken:a.authToken},true);
 const joined=await post('/api/join',{authToken:b.authToken,code:created.room.code});
 assert.equal(joined.room.code,created.room.code);assert.equal(joined.room.phase,'auction');assert.deepEqual(joined.room.players.map(p=>p.name),['Android Client','Web Client']);
 const current=await post('/api/state',{authToken:a.authToken,code:created.room.code,token:created.token},true);assert.equal(current.room.phase,'auction');assert.equal(current.room.code,joined.room.code);
 assert.equal((await post('/api/wallet',{authToken:a.authToken},true)).gold,450);assert.equal((await post('/api/wallet',{authToken:b.authToken})).gold,450);
 const abort=new AbortController();try{const stream=await fetch(base+'/api/events?'+new URLSearchParams({authToken:a.authToken,code:created.room.code,token:created.token}),{headers:{Origin:'https://localhost'},signal:abort.signal});assert.equal(stream.status,200);assert.equal(stream.headers.get('access-control-allow-origin'),'https://localhost');const first=await stream.body.getReader().read();assert.match(new TextDecoder().decode(first.value),/Android Client/);}finally{abort.abort()}
});
