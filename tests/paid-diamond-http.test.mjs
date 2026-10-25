import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

for(const enabled of [false,true])test(`isolated HTTP diamond policy ${enabled?'ON without database':'OFF'}: authenticated, zero-start and unavailable exchange`,{timeout:20000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1',HERO_DIAMONDS_ENABLED:enabled?'1':'0',HERO_DIAMOND_EXCHANGE_ENABLED:enabled?'1':'0',HERO_DIAMOND_SIGNUP_BONUS_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
 const base='http://127.0.0.1:'+port;
 const post=async(path,body={},status=200)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result};
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,40))}assert.ok(ready,logs);
  assert.ok(logs.includes('Commander economy policy: '+JSON.stringify({diamondsEnabled:enabled,signupBonusEnabled:false,exchangeEnabled:enabled,purchaseAvailable:false})),logs);
  await post('/api/diamonds/exchange',{},401);
  await post('/api/commander/get',{},401);
  const login=await post('/api/auth/guest',{name:'Isolated Diamonds'}),auth={authToken:login.authToken};
  assert.equal(login.gold,500);
  let result=await post('/api/commander/select',{...auth,commanderId:'attack',diamonds:999999});
  assert.equal(result.diamonds,enabled?0:null);assert.equal(result.progression.diamondsEnabled,enabled);assert.equal(result.progression.purchaseAvailable,false);assert.deepEqual(result.progression.welcomeBonus,{enabled:false,amount:10,eligibleProviders:['google']});
  assert.equal(result.progression.branches.attack.gold,200);assert.equal(result.progression.branches.attack.diamonds,0);
  assert.equal(result.exchange.rate,500);assert.equal(result.exchange.enabled,enabled);
  await post('/api/diamonds/exchange',{...auth,requestId:'isolated-request-0001',diamondsToSpend:10,expectedRate:500,pricingVersion:'diamonds-to-gold-500-v1',diamonds:999999},503);
  // Unknown purchase/grant paths cannot be used to mint a client-claimed balance.
  for(const path of ['/api/diamonds/purchase','/api/diamonds/grant','/api/diamonds/credit'])await post(path,{...auth,paid:true,verified:true,diamonds:999999},404);
  result=await post('/api/commander/get',auth);assert.equal(result.gold,500);assert.equal(result.diamonds,enabled?0:null);assert.equal(result.profile.levels.attack,0);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
