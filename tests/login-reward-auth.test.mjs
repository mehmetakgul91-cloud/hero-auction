import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createLoginRewardPolicy,isGoogleRewardMember} from '../login-rewards.js';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('provider provenance is HMAC signed, never client data; legacy Google-only bridge preserves valid sessions',()=>{
 const secret=Buffer.alloc(32,7),context=vm.createContext({Buffer,crypto,authSecret:secret});
 vm.runInContext(source.slice(source.indexOf('function signLogin(user)'),source.indexOf('function chosenName(')),context);
 const google=context.signLogin({sub:'google-subject',name:'Member',provider:'google',email:'m@example.test'});
 assert.equal(isGoogleRewardMember(context.readLogin(google)),true);
 const [raw,sig]=google.split('.'),claims=JSON.parse(Buffer.from(raw,'base64url').toString());
 claims.provider='crazygames';const edited=Buffer.from(JSON.stringify(claims)).toString('base64url')+'.'+sig;
 assert.equal(context.readLogin(edited),null);
 const signLegacy=values=>{const body=Buffer.from(JSON.stringify({sub:'legacy-google',email:'verified@example.test',expires:Date.now()+60000,...values})).toString('base64url');return body+'.'+crypto.createHmac('sha256',secret).update(body).digest('base64url')};
 assert.equal(isGoogleRewardMember(context.readLogin(signLegacy({}))),true);
 for(const patch of [{sub:'guest:123'},{sub:'crazygames:game:user'},{email:null},{provider:'apple'},{provider:'guest'},{expires:1}])assert.equal(isGoogleRewardMember(context.readLogin(signLegacy(patch))),false);
});

test('claim HTTP handler passes only trusted identity and requested receipt date; account/amount/provider cannot be overridden',async()=>{
 const identity={sub:'google-member',provider:'google'},calls=[];
 const context=vm.createContext({readLogin:()=>identity,databaseReady:true,database:{query:async()=>({rows:[]})},loginRewardPolicy:createLoginRewardPolicy({HERO_DIAMONDS_ENABLED:'1',HERO_LOGIN_REWARDS_ENABLED:'1'}),
  claimLoginReward:async args=>{calls.push(args);return{receipt:{day:1,gold:100,diamonds:0,rewardDate:'2026-10-25'}}},
  error:(message,status)=>{throw Object.assign(Error(message),{status})}});
 vm.runInContext(source.slice(source.indexOf('async function apiAction(url,b,requestContext)'),source.indexOf('const mime=')),context);
 await context.apiAction('/api/login-rewards/claim',{authToken:'signed',rewardDate:'2026-10-25',accountId:'victim',provider:'google',day:7,gold:999999,diamonds:999999,email:'forged@example.test',now:'2099-01-01'});
 assert.equal(calls.length,1);assert.equal(calls[0].identity,identity);assert.deepEqual(JSON.parse(JSON.stringify(calls[0].request)),{rewardDate:'2026-10-25'});
});

for(const enabled of [false,true])test(`isolated store/reward HTTP ${enabled?'ON without storage':'OFF'} remains read-only, authenticated and unavailable`,{timeout:20000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1',HERO_DIAMONDS_ENABLED:enabled?'1':'0',HERO_LOGIN_REWARDS_ENABLED:enabled?'1':'0',HERO_DIAMOND_EXCHANGE_ENABLED:enabled?'1':'0',HERO_DIAMOND_SIGNUP_BONUS_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',value=>logs+=value);child.stderr.on('data',value=>logs+=value);
 const base='http://127.0.0.1:'+port,post=async(path,body={},expected=200)=>{const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const json=await res.json();assert.equal(res.status,expected,JSON.stringify(json));return json;};
 try{
  let ready=false;for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,30));}assert.ok(ready,logs);
  await post('/api/store/status',{},401);await post('/api/login-rewards/claim',{},401);
  const login=await post('/api/auth/guest',{name:'Store test',provider:'google',email:'forged@example.test'}),auth={authToken:login.authToken};
  const status=await post('/api/store/status',{...auth,provider:'google'});
  assert.equal(status.gold,500);assert.equal(status.diamonds,null);assert.equal(status.purchase.available,false);assert.equal(status.rewardedAds.enabled,false);assert.equal(status.exchange.available,false);
  assert.equal(status.loginRewards.enabled,enabled);assert.equal(status.loginRewards.eligible,false);assert.equal(status.loginRewards.available,false);assert.equal(status.loginRewards.reason,enabled?'google_required':'disabled');
  assert.deepEqual(status.loginRewards.rewards.map(r=>[r.gold,r.diamonds]),[[100,0],[150,0],[200,0],[250,0],[300,0],[400,0],[0,5]]);
  await post('/api/login-rewards/claim',{...auth,rewardDate:'2026-10-25',provider:'google',accountId:'other',gold:999999},enabled?403:503);
  await post('/api/rewarded/claim',{...auth,verified:true},503);
  for(const path of ['/api/diamonds/purchase','/api/diamonds/grant'])await post(path,{...auth,paid:true},404);
  assert.equal((await fetch(base+'/api/login-rewards/claim')).status,404);
  assert.equal((await post('/api/store/status',auth)).gold,500);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref();});}
});

test('reward schema remains opt-in draft, not part of server bootstrap or a GET action',()=>{
 assert.doesNotMatch(source,/CREATE TABLE[^\n]*hero_auction_login_reward/);
 assert.equal((source.match(/claimLoginReward\(/g)||[]).length,1);
 assert.match(source,/if\(url==='\/api\/login-rewards\/claim'\)/);
 assert.match(source,/req.method==='POST'&&url.pathname.startsWith\('\/api\/'\)/);
 assert.match(source,/rewardedAdsEnabled=false/);
 assert.match(source,/const REWARDED_AD_GOLD=100/);
 assert.match(source,/REWARDED_AD_DAILY_LIMIT=5/);
});
