import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {isOwnerAdmin} from '../admin-wallet-credits.js';

const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const owner={sub:'synthetic-owner',provider:'google',email:'owner@example.invalid'};
const error=(message,status)=>{throw Object.assign(Error(message),{status});};
test('owner-only route boundary precedes every admin database read or action',async()=>{
 const body=source.slice(source.indexOf('async function adminApi('),source.indexOf('\nfunction sameSeat('));
 const calls=[];
 const context={readLogin:value=>value,isOwnerAdmin,ADMIN_GOOGLE_EMAIL:owner.email,error,databaseReady:true,
  database:{query(){calls.push('query');throw Error('unexpected DB access');}},
  creditAdminWallet:async args=>{calls.push(args);return {ok:true};},readAdminWalletCreditReceipt:async args=>{calls.push(args);return {receipt:null};},adminWalletCreditPolicy:{enabled:true}};
 vm.createContext(context);vm.runInContext(body,context);
 const forbidden=[null,{...owner,provider:'guest',sub:'guest:owner'},{...owner,provider:'crazygames',sub:'crazygames:1:owner'},{...owner,email:'other@example.invalid'},{...owner,provider:undefined},{...owner,sub:'guest:forged'}];
 for(const user of forbidden)for(const path of ['list','history','wallet/credit','wallet/receipt','gold','ban','daily-sessions','session-report'])await assert.rejects(context.adminApi('/api/admin/'+path,{authToken:user,accountId:'fixture',currency:'diamonds',amount:100,actorId:owner.sub}),e=>e.status===403);
 assert.equal(calls.length,0);
 await context.adminApi('/api/admin/wallet/credit',{authToken:owner,actorId:'forged-owner',accountId:'fixture',requestId:'fixture-key-0000001'});
 assert.deepEqual(calls[0].user,owner);assert.equal(calls[0].ownerEmail,owner.email);
 await context.adminApi('/api/admin/wallet/receipt',{authToken:owner,requestId:'fixture-key-0000001'});
 assert.equal(calls[1].requestId,'fixture-key-0000001');
 const legacyQueries=[];context.database.connect=async()=>({query:async(sql,args)=>{legacyQueries.push({sql,args});return sql.startsWith('SELECT gold')?{rowCount:1,rows:[{gold:500}]}:{rowCount:1,rows:[]};},release(){}});
 for(const enabled of [false,true]){context.adminWalletCreditPolicy.enabled=enabled;const result=await context.adminApi('/api/admin/gold',{authToken:owner,accountId:'fixture',gold:100});assert.equal(result.gold,100);assert.equal(result.action,'gold');}
 assert.equal(legacyQueries.filter(row=>row.sql.startsWith('UPDATE hero_auction_wallets SET gold=$2')).length,2);
 await assert.rejects(context.adminApi('/api/admin/gold',{authToken:owner,accountId:'fixture',gold:0,expectedGold:400}),e=>e.status===409);
 assert.equal(legacyQueries.filter(row=>row.sql.startsWith('UPDATE hero_auction_wallets SET gold=$2')).length,2);
 assert.equal(calls.length,2);
});

test('analytics API uses signed identity and only a minimal event allowlist',async()=>{
 const body=source.slice(source.indexOf('async function apiAction('),source.indexOf("if(url==='/api/store/status')"))+'\n}';
 const calls=[];const context={readLogin:value=>value,error,databaseReady:true,database:{query:async()=>({rows:[]})},playerAnalyticsPolicy:{enabled:true},playerAnalyticsStorageReady:true,playerLocationsStorageReady:false,
  recordPlayerSession:async args=>{calls.push(args);return {ok:true};}};
 vm.createContext(context);vm.runInContext(body,context);
 await context.apiAction('/api/player-sessions/start',{authToken:owner,event:'end',sessionId:'session-fixture-0001',sequence:0,foreground:true,reset:true,source:'external',platform:'android',device:'mobile',accountId:'victim',provider:'crazygames',country:'TR',city:'Istanbul',ip:'1.2.3.4',url:'https://private.invalid/?secret=x',headers:{'cf-ipcity':'Istanbul'}});
 assert.deepEqual(calls[0].identity,owner);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0].request)),{event:'start',sessionId:'session-fixture-0001',sequence:0,foreground:true,reset:true,source:'external',platform:'android',device:'mobile'});
 context.database.query=async()=>({rows:[{banned:true}]});
 await assert.rejects(context.apiAction('/api/player-sessions/heartbeat',{authToken:owner}),e=>e.status===403);
 assert.equal(calls.length,1);
 context.database.query=async()=>({rows:[]});context.playerLocationsStorageReady=true;
 const requestContext={socket:{remoteAddress:'1.1.1.1'},headers:{}};
 context.playerLocationResolver={lookup:ctx=>{assert.equal(ctx,requestContext);return {country:'TR',city:'Manisa'};}};
 await context.apiAction('/api/player-sessions/start',{authToken:owner,sessionId:'server-location-0001',sequence:0,foreground:false,country:'US',city:'forged'},requestContext);
 assert.deepEqual(calls[1].location,{country:'TR',city:'Manisa'});
 assert.equal(Object.hasOwn(calls[1].request,'country'),false);
});

test('real HTTP defaults are off; forged identities cannot reach admin or collection', {timeout:20000},async()=>{
 const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const secret='ab'.repeat(32),base='http://127.0.0.1:'+port;
 const token=user=>{const data=Buffer.from(JSON.stringify({expires:Date.now()+60000,...user})).toString('base64url');return data+'.'+createHmac('sha256',Buffer.from(secret,'hex')).update(data).digest('base64url');};
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',AUTH_SIGNING_SECRET:secret,ADMIN_GOOGLE_EMAIL:owner.email,COMMANDER_TEST_GUEST_MODE:'1',HERO_ADMIN_WALLET_CREDITS_ENABLED:'0',HERO_PLAYER_ANALYTICS_ENABLED:'0',HERO_DIAMONDS_ENABLED:'0',HERO_MAGIC_DUST_ENABLED:'0',HERO_DIAMOND_EXCHANGE_ENABLED:'0',HERO_DIAMOND_SIGNUP_BONUS_ENABLED:'0',HERO_LOGIN_REWARDS_ENABLED:'0',HERO_VICTORY_CHESTS_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);
 const post=async(path,body,status)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','cf-ipcountry':'TR','cf-ipcity':'Istanbul'},body:JSON.stringify(body)});assert.equal(r.status,status,await r.text());};
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{const r=await fetch(base+'/api/info');if(r.ok){const info=await r.json();assert.deepEqual(info.playerAnalytics,{enabled:false,retentionDays:30});ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,40));}assert.ok(ready,logs);
  for(const authToken of [undefined,'forged',token({...owner,provider:'guest',sub:'guest:fixture'}),token({...owner,provider:'crazygames',sub:'crazygames:1:fixture'}),token({...owner,email:'other@example.invalid'}),token({...owner,expires:0})]){
   for(const path of ['/api/admin/list','/api/admin/history','/api/admin/wallet/credit','/api/admin/wallet/receipt'])await post(path,{authToken,accountId:'fixture',currency:'diamonds',amount:100,reason:'Synthetic fixture',requestId:'fixture-key-00001'},403);
  }
  await post('/api/admin/wallet/credit',{authToken:token(owner)},503);
  for(const action of ['start','heartbeat','end']){
   await post('/api/player-sessions/'+action,{},401);
   await post('/api/player-sessions/'+action,{authToken:token(owner),country:'TR',city:'Istanbul'},503);
  }
  assert.doesNotMatch(logs,/ab{64}|owner@example\.invalid/);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref();});}
});

test('collector is connected only to game identity/capability; no page traffic enables it',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/hero:login-changed',\(\)=>playerSessionTracker\.setIdentity\(login\?\.authToken===playerAnalyticsInvalidatedToken\?null:login\)/);
 assert.match(app,/setEnabled\(r.ok&&j.playerAnalytics\?\.enabled===true\)/);
 assert.match(app,/event.key===null\|\|event.key==='hero-auction-login'/);
 assert.doesNotMatch(source,/CREATE TABLE IF NOT EXISTS hero_auction_(?:admin_wallet_credits|player_sessions|player_activity)/);
});


test('cross-tab logout invalidates measurement until the game adopts a genuinely new token',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const block=app.slice(app.indexOf('const playerSessionTracker='),app.indexOf('const friendsUI='));
 const events={},calls=[],context={login:{authToken:'old'},createPlayerSessionTracker:()=>({setIdentity:value=>calls.push(value)}),window:{addEventListener:(name,handler)=>events[name]=handler}};
 vm.createContext(context);vm.runInContext(block,context);
 events['hero:login-changed']();assert.equal(calls.at(-1).authToken,'old');
 events.storage({key:'hero-auction-login'});assert.equal(calls.at(-1),null);
 events['hero:login-changed']();assert.equal(calls.at(-1),null);
 context.login={authToken:'new'};events['hero:login-changed']();assert.equal(calls.at(-1).authToken,'new');
 events.storage({key:null});events['hero:login-changed']();assert.equal(calls.at(-1),null);
});
