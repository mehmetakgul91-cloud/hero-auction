import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createNativeCors,nativeOrigins} from '../native-cors.js';

function response(){
 const headers=new Map();
 return {headers,status:undefined,ended:false,getHeader:key=>headers.get(key.toLowerCase()),setHeader:(key,value)=>headers.set(key.toLowerCase(),value),writeHead(status,extra={}){this.status=status;for(const [key,value]of Object.entries(extra))this.setHeader(key,value)},end(body){this.ended=true;this.body=body}};
}
const request=(method='GET',origin='https://localhost',headers={})=>({method,headers:{...(origin?{origin}:{}),...headers}});

test('native CORS configuration is an exact HTTPS allowlist, never a wildcard',()=>{
 assert.deepEqual([...nativeOrigins('')],[]);
 assert.deepEqual([...nativeOrigins(' https://localhost,https://test.example:8443,https://localhost ')],['https://localhost','https://test.example:8443']);
 for(const value of ['*','null','https://*.example','http://localhost','https://localhost/','https://localhost/path','https://localhost?x=1','https://localhost#fragment','https://user:pass@localhost','https://LOCALHOST','https://localhost:443','capacitor://localhost'])assert.throws(()=>nativeOrigins(value),/NATIVE_ALLOWED_ORIGINS/,value);
});

test('disabled configuration is a complete no-op including existing preflight behavior',()=>{
 const cors=createNativeCors();
 for(const method of ['GET','POST','OPTIONS']){
  const res=response();assert.equal(cors(request(method),res,'/api/info'),false);assert.equal(res.headers.size,0);assert.equal(res.ended,false);
 }
});

test('CORS applies only to configured origins, GET/POST and API paths, preserving existing Vary',()=>{
 const cors=createNativeCors('https://localhost');
 for(const [req,path]of [[request('GET','https://localhost.evil'),'/api/info'],[request('GET','https://evil.example'),'/api/info'],[request('GET','null'),'/api/info'],[request('GET',null),'/api/info'],[request('DELETE'),'/api/info'],[request(),'/'],[request(),'/api-docs']]){
  const res=response();assert.equal(cors(req,res,path),false);assert.equal(res.headers.size,0);
 }
 for(const method of ['GET','POST']){
  const res=response();res.setHeader('Vary','Accept-Encoding');assert.equal(cors(request(method),res,'/api/info'),false);
  assert.equal(res.getHeader('Access-Control-Allow-Origin'),'https://localhost');assert.equal(res.getHeader('Vary'),'Accept-Encoding, Origin');
  assert.equal(res.getHeader('Access-Control-Allow-Credentials'),undefined);
  cors(request(method),res,'/api/info');assert.equal(res.getHeader('Vary'),'Accept-Encoding, Origin');
 }
});

test('preflight grants only explicit methods and Content-Type, without credentials',()=>{
 const cors=createNativeCors('https://localhost');
 for(const method of ['GET','POST']){
  const res=response();assert.equal(cors(request('OPTIONS','https://localhost',{'access-control-request-method':method,'access-control-request-headers':'Content-Type'}),res,'/api/state'),true);
  assert.equal(res.status,204);assert.equal(res.getHeader('Access-Control-Allow-Origin'),'https://localhost');assert.equal(res.getHeader('Access-Control-Allow-Methods'),'GET, POST');assert.equal(res.getHeader('Access-Control-Allow-Headers'),'Content-Type');assert.equal(res.getHeader('Access-Control-Allow-Credentials'),undefined);assert.equal(res.getHeader('Cache-Control'),'no-store');
 }
 for(const headers of [{'access-control-request-method':'DELETE'},{'access-control-request-method':'POST','access-control-request-headers':'Content-Type, Authorization'},{'access-control-request-method':'POST','access-control-request-headers':'X-Unknown'},{}]){
  const res=response();assert.equal(cors(request('OPTIONS','https://localhost',headers),res,'/api/state'),true);assert.equal(res.status,403);assert.equal(res.getHeader('Access-Control-Allow-Origin'),undefined);
 }
 const denied=response();cors(request('OPTIONS','https://evil.example',{'access-control-request-method':'POST'}),denied,'/api/state');assert.equal(denied.status,403);assert.equal(denied.getHeader('Access-Control-Allow-Origin'),undefined);
});

async function startServer(t,allowedOrigins){
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),DATABASE_URL:'',NODE_ENV:'test',COMMANDER_TEST_GUEST_MODE:'1',NATIVE_ALLOWED_ORIGINS:allowedOrigins},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
 t.after(async()=>{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})});
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<150;i++){
  if(child.exitCode!==null||child.signalCode!==null)throw Error(logs);
  try{if((await fetch(base+'/api/info')).ok)return base}catch{}
  await new Promise(resolve=>setTimeout(resolve,30));
 }
 throw Error('Server startup timed out: '+logs);
}

test('HTTP: opt-in headers survive JSON/errors/SSE, auth remains required, and defaults stay disabled',{timeout:15000},async t=>{
 const base=await startServer(t,'https://localhost');
 const get=path=>fetch(base+path,{headers:{Origin:'https://localhost'}});
 const post=(path,body={})=>fetch(base+path,{method:'POST',headers:{Origin:'https://localhost','Content-Type':'application/json'},body:JSON.stringify(body)});
 const info=await get('/api/info');assert.equal(info.status,200);assert.equal(info.headers.get('Access-Control-Allow-Origin'),'https://localhost');assert.equal((await info.json()).catalogueCount,50);
 const staticPage=await get('/');assert.equal(staticPage.status,200);assert.equal(staticPage.headers.get('Access-Control-Allow-Origin'),null);await staticPage.text();
 const preflight=await fetch(base+'/api/auth/guest',{method:'OPTIONS',headers:{Origin:'https://localhost','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://localhost');assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
 const badPreflight=await fetch(base+'/api/auth/guest',{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});assert.equal(badPreflight.status,403);assert.equal(badPreflight.headers.get('Access-Control-Allow-Origin'),null);await badPreflight.text();
 for(const path of ['/api/create','/api/moderation/state','/api/friends']){
  const denied=await post(path);assert.equal(denied.status,401,path);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),'https://localhost');await denied.text();
 }
 const invalid=await fetch(base+'/api/state',{method:'POST',headers:{Origin:'https://localhost','Content-Type':'application/json'},body:'invalid json'});assert.equal(invalid.status,400);assert.equal(invalid.headers.get('Access-Control-Allow-Origin'),'https://localhost');await invalid.text();
 const guest=await post('/api/auth/guest',{name:'Native CORS Test'});assert.equal(guest.status,200);const {authToken}=await guest.json();
 const create=await post('/api/create',{authToken});assert.equal(create.status,200);const {token,room}=await create.json();
 const controller=new AbortController();t.after(()=>controller.abort());
 const events=await fetch(base+'/api/events?'+new URLSearchParams({code:room.code,token,authToken}),{headers:{Origin:'https://localhost'},signal:controller.signal});
 assert.equal(events.status,200);assert.equal(events.headers.get('Content-Type'),'text/event-stream');assert.equal(events.headers.get('Access-Control-Allow-Origin'),'https://localhost');assert.equal(events.headers.get('Access-Control-Allow-Credentials'),null);
 const reader=events.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/^data: /);await reader.cancel();controller.abort();
 const invalidEvents=await get('/api/events?'+new URLSearchParams({code:room.code,token,authToken:'invalid'}));assert.equal(invalidEvents.status,403);assert.equal(invalidEvents.headers.get('Access-Control-Allow-Origin'),'https://localhost');await invalidEvents.text();
 const unapproved=await fetch(base+'/api/info',{headers:{Origin:'https://evil.example'}});assert.equal(unapproved.status,200);assert.equal(unapproved.headers.get('Access-Control-Allow-Origin'),null);await unapproved.text();
 const disabled=await startServer(t,'');
 const disabledInfo=await fetch(disabled+'/api/info',{headers:{Origin:'https://localhost'}});assert.equal(disabledInfo.status,200);assert.equal(disabledInfo.headers.get('Access-Control-Allow-Origin'),null);assert.equal(disabledInfo.headers.get('Vary'),null);await disabledInfo.text();
 const disabledPreflight=await fetch(disabled+'/api/auth/guest',{method:'OPTIONS',headers:{Origin:'https://localhost','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});assert.equal(disabledPreflight.status,405);assert.equal(disabledPreflight.headers.get('Access-Control-Allow-Origin'),null);await disabledPreflight.text();
});

test('Android-origin and web players share one authenticated room and live SSE state',{timeout:15000},async t=>{
 const base=await startServer(t,'https://localhost');
 const post=async(origin,path,body)=>{
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin||null);
  return {status:response.status,body:await response.json()};
 };
 const android=await post('https://localhost','/api/auth/guest',{name:'Android player'});
 const web=await post(null,'/api/auth/guest',{name:'Web player'});
 assert.equal(android.status,200);assert.equal(web.status,200);
 const host=await post('https://localhost','/api/create',{authToken:android.body.authToken});
 assert.equal(host.status,200);
 const join=await post(null,'/api/join',{authToken:web.body.authToken,code:host.body.room.code});
 assert.equal(join.status,200);
 assert.equal(join.body.room.code,host.body.room.code);
 assert.equal(join.body.room.players.length,2);
 const seats=[{origin:'https://localhost',authToken:android.body.authToken,token:host.body.token},{origin:null,authToken:web.body.authToken,token:join.body.token}];
 const snapshots=[];
 for(const seat of seats){
  const controller=new AbortController();t.after(()=>controller.abort());
  const response=await fetch(base+'/api/events?'+new URLSearchParams({code:host.body.room.code,token:seat.token,authToken:seat.authToken}),{headers:seat.origin?{Origin:seat.origin}:{},signal:controller.signal});
  assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),seat.origin);
  const reader=response.body.getReader();let text='';
  while(!text.includes('\n\n')){const chunk=await reader.read();assert.equal(chunk.done,false);text+=new TextDecoder().decode(chunk.value);}
  snapshots.push(JSON.parse(text.split('\n').find(line=>line.startsWith('data: ')).slice(6)));
  await reader.cancel();controller.abort();
 }
 assert.equal(snapshots[0].code,snapshots[1].code);
 assert.equal(snapshots[0].phase,snapshots[1].phase);
 assert.deepEqual(snapshots[0].players.map(p=>p.name),snapshots[1].players.map(p=>p.name));
 const forged=await post('https://localhost','/api/state',{code:host.body.room.code,token:host.body.token,authToken:web.body.authToken});
 assert.equal(forged.status,403,'CORS must not authorize another player’s seat');
});
