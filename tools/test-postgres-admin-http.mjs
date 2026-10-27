// Integrated HTTP + PostgreSQL18 fixtures only. Never uses ambient production
// credentials, real provider sign-ins, real players, deployment or browser QA.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createHmac} from 'node:crypto';
import pg from 'pg';

const APPROVED='postgresql://test:test@127.0.0.1:55432/hero_admin_http_test';
if(process.env.HERO_ADMIN_HTTP_TEST_DB!==APPROVED||process.env.DATABASE_URL){
 console.error('REFUSED: exact disposable loopback HERO_ADMIN_HTTP_TEST_DB required, with no DATABASE_URL. No connection attempted.');process.exit(1);
}
const SCHEMA='hero_admin_http_fixture',MISSING_SCHEMA='hero_admin_http_missing';
const secret='5b'.repeat(32),owner={sub:'http-fixture-owner',provider:'google',email:'http-owner@example.invalid',name:'Fixture Owner'},player={sub:'http-fixture-player',provider:'google',email:'player@example.invalid',name:'Fixture Player'};
const pool=new pg.Pool({host:'127.0.0.1',port:55432,database:'hero_admin_http_test',user:'test',password:'test',ssl:false,max:5,
 connectionTimeoutMillis:5000,idleTimeoutMillis:1000,application_name:'hero-disposable-admin-http-test',options:`-c search_path=${SCHEMA} -c statement_timeout=15000 -c lock_timeout=10000`});
const query=(sql,args=[])=>pool.query(sql,args);
const token=identity=>{const data=Buffer.from(JSON.stringify({expires:Date.now()+3600000,...identity})).toString('base64url');return data+'.'+createHmac('sha256',Buffer.from(secret,'hex')).update(data).digest('base64url')};
let checks=0,activeServer=null;
async function check(name,run){await run();checks++;console.log('PASS '+name)}
async function migration(source){const client=await pool.connect();try{await client.query(source)}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
async function startServer({schema=SCHEMA,enabled=true}={}){
 const socket=createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve)});
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const connection=new URL(APPROVED);connection.searchParams.set('options',`-c search_path=${schema} -c statement_timeout=15000 -c lock_timeout=10000`);
 // Deliberately not {...process.env}: only synthetic fixture identity, database,
 // port and exact tested feature flags enter the child server.
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{
  PORT:String(port),DATABASE_URL:connection.toString(),AUTH_SIGNING_SECRET:secret,ADMIN_GOOGLE_EMAIL:owner.email,
  HERO_ADMIN_WALLET_CREDITS_ENABLED:enabled?'1':'0',HERO_PLAYER_ANALYTICS_ENABLED:enabled?'1':'0',
  HERO_DIAMONDS_ENABLED:enabled?'1':'0',HERO_MAGIC_DUST_ENABLED:enabled?'1':'0',
  HERO_DIAMOND_EXCHANGE_ENABLED:'0',HERO_DIAMOND_SIGNUP_BONUS_ENABLED:'0',HERO_LOGIN_REWARDS_ENABLED:'0',HERO_VICTORY_CHESTS_ENABLED:'0'
 },stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',value=>{logs+=value});child.stderr.on('data',value=>{logs+=value});
 const base='http://127.0.0.1:'+port;
 const stop=async()=>{if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>{const timer=setTimeout(()=>child.kill('SIGKILL'),2000);child.once('exit',()=>{clearTimeout(timer);resolve()})})}assert.doesNotMatch(logs,new RegExp(secret+'|'+owner.email.replaceAll('.','\\.')))};
 try{
  let ready=false;
  for(let attempt=0;attempt<150;attempt++){
   if(child.exitCode!==null)throw Error('Fixture server exited: '+logs);
   try{const response=await fetch(base+'/api/info',{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,40));
  }
  assert.ok(ready,'Fixture server readiness timeout: '+logs);
  const post=async(path,body={},expected=200)=>{
   const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','cf-ipcountry':'TR','cf-ipcity':'Forged City','x-forwarded-for':'203.0.113.1'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
   const text=await response.text();assert.equal(response.status,expected,path+': '+text);return JSON.parse(text);
  };
  return {post,stop,getInfo:async()=>(await fetch(base+'/api/info')).json()};
 }catch(error){await stop();throw error}
}
const ownerPost=(server,path,body={},expected=200)=>server.post('/api/admin/'+path,{...body,authToken:token(owner)},expected);
const playerPost=(server,event,body={},expected=200)=>server.post('/api/player-sessions/'+event,{...body,authToken:token(player)},expected);
const creditRequest={requestId:'http-fixture-credit-0001',accountId:player.sub,currency:'diamonds',amount:17,reason:'Synthetic HTTP correction'};
const session={sessionId:'http-fixture-session-001',sequence:0,foreground:true,platform:'web',device:'desktop'};
try{
 const identity=(await query("SELECT current_database() AS db,current_user AS role,inet_server_port() AS port,current_setting('server_version_num') AS version")).rows[0];
 assert.equal(identity.db,'hero_admin_http_test');assert.equal(identity.role,'test');assert.equal(identity.port,55432);assert.ok(Number(identity.version)>=180000&&Number(identity.version)<190000);
 for(const name of [SCHEMA,MISSING_SCHEMA])assert.equal((await query('SELECT to_regnamespace($1) AS name',[name])).rows[0].name,null,'REFUSED: fixture schema already exists; no reset/drop attempted');
 await query('CREATE SCHEMA hero_admin_http_fixture; CREATE SCHEMA hero_admin_http_missing');
 await query(`CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0));
 CREATE TABLE hero_auction_user_profiles(account_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE hero_auction_commanders(account_id TEXT PRIMARY KEY,profile JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
 for(const file of ['001-paid-diamonds-foundation.sql','002-diamond-exchange.sql','003-diamond-signup-bonus.sql','004-login-rewards.sql','005-victory-chests-magic-dust.sql','006-admin-wallet-credits.sql','007-player-sessions.sql'])await migration(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 for(const account of [owner,player,{sub:'http-unobserved-player',name:'Unobserved Fixture'}]){
  await query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,500)',[account.sub]);await query('INSERT INTO hero_auction_user_profiles(account_id,display_name) VALUES($1,$2)',[account.sub,account.name]);
  await query('INSERT INTO hero_auction_diamond_wallets(account_id,diamonds) VALUES($1,10)',[account.sub]);await query('INSERT INTO hero_auction_magic_dust_wallets(account_id,magic_dust) VALUES($1,20)',[account.sub]);
 }
 console.log('Verified disposable PostgreSQL '+identity.version+' and isolated HTTP fixture schemas.');
 activeServer=await startServer();
 await check('real owner list returns independent balances, grant readiness and honest unobserved analytics',async()=>{
  const info=await activeServer.getInfo();assert.deepEqual(info.playerAnalytics,{enabled:true,retentionDays:30});
  const result=await ownerPost(activeServer,'list'),account=result.accounts.find(row=>row.account_id===player.sub);
  assert.equal(result.viewer.accountId,owner.sub);assert.equal(result.walletCredits.available,true);
  assert.deepEqual(Object.fromEntries(['gold','diamonds','magicDust'].map(name=>[name,account[name]])),{gold:500,diamonds:10,magicDust:20});
  assert.equal(account.analytics.observed,false);assert.equal(account.analytics.sessionCount,null);assert.equal(account.analytics.activeMs,null);
  assert.equal(result.playerAnalytics.available,true);assert.equal(Object.hasOwn(result.playerAnalytics,'geo'),false);
 });
 await check('signed guest, CrazyGames, wrong owner, expired and forged tokens cannot read or mutate admin state',async()=>{
  const forbidden=[undefined,'forged',token({...owner,provider:'guest',sub:'guest:http-fixture'}),token({...owner,provider:'crazygames',sub:'crazygames:http-fixture'}),token({...owner,email:'other@example.invalid'}),token({...owner,expires:0}),token({...owner,sub:'guest:spoof'})];
  for(const authToken of forbidden)for(const path of ['list','history','wallet/credit','wallet/receipt'])await activeServer.post('/api/admin/'+path,{...creditRequest,authToken},403);
  assert.equal((await query('SELECT count(*)::int AS count FROM hero_auction_admin_wallet_credits')).rows[0].count,0);

 });
 await check('existing absolute gold control remains available with new feature enabled',async()=>{
  const result=await ownerPost(activeServer,'gold',{accountId:player.sub,gold:9999});assert.equal(result.gold,9999);assert.equal(result.action,'gold');
  const list=await ownerPost(activeServer,'list');assert.equal(list.walletCredits.legacyGoldSetAvailable,true);
  const account=list.accounts.find(row=>row.account_id===player.sub);assert.equal(account.gold,9999);assert.equal(account.diamonds,10);assert.equal(account.magicDust,20);
  assert.ok((await ownerPost(activeServer,'history')).history.some(row=>row.action==='gold'&&row.old_gold===500&&row.new_gold===9999));
  await ownerPost(activeServer,'gold',{accountId:player.sub,gold:500});
 });
 await check('real owner HTTP credit is atomic, idempotent, isolated and present in receipt/history',async()=>{
  const [first,second]=await Promise.all([ownerPost(activeServer,'wallet/credit',creditRequest),ownerPost(activeServer,'wallet/credit',creditRequest)]);
  assert.deepEqual([first.replayed,second.replayed].sort(),[false,true]);assert.equal(first.receipt.actorId,owner.sub);assert.equal(first.receipt.balanceBefore,10);assert.equal(first.receipt.balanceAfter,27);
  const receipt=await ownerPost(activeServer,'wallet/receipt',{requestId:creditRequest.requestId});assert.deepEqual(receipt.receipt,first.receipt);
  const history=await ownerPost(activeServer,'history');assert.equal(history.creditsAvailable,true);assert.equal(history.credits.length,1);assert.deepEqual(history.credits[0],first.receipt);
  const account=(await ownerPost(activeServer,'list')).accounts.find(row=>row.account_id===player.sub);assert.equal(account.gold,500);assert.equal(account.diamonds,27);assert.equal(account.magicDust,20);
  await ownerPost(activeServer,'wallet/credit',{...creditRequest,amount:18},409);
  for(const patch of [{amount:0},{amount:1.5},{amount:'5'},{amount:1000001},{reason:'ab'},{currency:['gold']}])await ownerPost(activeServer,'wallet/credit',{...creditRequest,requestId:'http-invalid-credit-0001',...patch},400);
 });
 await check('authenticated HTTP sessions use signed account, never accept forged geo or Google-auth attribution',async()=>{
  await activeServer.post('/api/player-sessions/start',{...session},401);
  const started=await playerPost(activeServer,'start',{...session,accountId:owner.sub,provider:'crazygames',source:'crazygames',country:'TR',city:'Injected City',ip:'203.0.113.1',url:'https://private.invalid/?authToken=secret',userAgent:'fingerprint'});
  assert.equal(started.foregroundActiveMs,0);assert.equal(started.sequence,0);
  const rows=(await query('SELECT * FROM hero_auction_player_sessions')).rows;assert.equal(rows.length,1);assert.equal(rows[0].account_id,player.sub);assert.equal(rows[0].source,'direct_or_unknown');assert.equal(rows[0].source_provenance,'client_reported');
  assert.doesNotMatch(JSON.stringify(rows),/Injected City|203\.0\.113\.1|private\.invalid|authToken|fingerprint/);
  const latest=(await ownerPost(activeServer,'list')).accounts.find(row=>row.account_id===player.sub).analytics.latest;
  assert.equal(Object.hasOwn(latest,'country'),false);assert.equal(Object.hasOwn(latest,'city'),false);assert.equal(Object.hasOwn(latest,'geoProvenance'),false);
 });
 await check('real session heartbeat/end accumulates foreground only and duplicate/end replay does not revive it',async()=>{
  // Synthetic fixture timestamps only: avoid waiting ten real seconds. DB clock
  // remains authoritative to the service; no client duration is accepted.
  await query("UPDATE hero_auction_player_sessions SET started_at=clock_timestamp()-interval '10 seconds',last_seen_at=clock_timestamp()-interval '10 seconds' WHERE account_id=$1 AND session_id=$2",[player.sub,session.sessionId]);
  await query("UPDATE hero_auction_player_activity SET last_seen_at=clock_timestamp()-interval '10 seconds' WHERE account_id=$1",[player.sub]);
  const heartbeat=await playerPost(activeServer,'heartbeat',{...session,sequence:1,foreground:false,activeMs:999999999});
  assert.ok(heartbeat.foregroundActiveMs>=9000&&heartbeat.foregroundActiveMs<=12000);assert.equal(heartbeat.sequence,1);
  const repeat=await playerPost(activeServer,'heartbeat',{...session,sequence:1});assert.equal(repeat.replayed,true);assert.equal(repeat.foregroundActiveMs,heartbeat.foregroundActiveMs);
  const ended=await playerPost(activeServer,'end',{...session,sequence:2,foreground:true});assert.equal(ended.closed,true);assert.equal(ended.foregroundActiveMs,heartbeat.foregroundActiveMs);
  const late=await playerPost(activeServer,'heartbeat',{...session,sequence:3});assert.equal(late.closed,true);assert.equal(late.replayed,true);assert.equal(late.foregroundActiveMs,heartbeat.foregroundActiveMs);
  await playerPost(activeServer,'start',{...session,sessionId:'http-fixture-session-002'});
  const summary=(await ownerPost(activeServer,'list')).accounts.find(row=>row.account_id===player.sub).analytics;
  assert.equal(summary.sessionCount,2);assert.equal(summary.repeatVisits,1);assert.ok(summary.activeMs>=9000&&summary.activeMs<=12000);assert.equal(summary.latest.source,'direct_or_unknown');
  const unobserved=(await ownerPost(activeServer,'list')).accounts.find(row=>row.account_id==='http-unobserved-player').analytics;assert.equal(unobserved.observed,false);assert.equal(unobserved.lastSeen,null);
 });
 await check('suspended player cannot send authenticated session events',async()=>{
  await query('INSERT INTO hero_auction_admin_accounts(account_id,banned) VALUES($1,true)',[player.sub]);
  await playerPost(activeServer,'heartbeat',{...session,sessionId:'http-fixture-session-002',sequence:1},403);
  await query('UPDATE hero_auction_admin_accounts SET banned=false WHERE account_id=$1',[player.sub]);
 });
 await activeServer.stop();activeServer=null;
 activeServer=await startServer({enabled:false});
 await check('flags-off restart disables new collection/grants but still reconciles existing receipts',async()=>{
  assert.deepEqual((await activeServer.getInfo()).playerAnalytics,{enabled:false,retentionDays:30});
  const list=await ownerPost(activeServer,'list');assert.equal(list.walletCredits.available,false);assert.equal(list.walletCredits.legacyGoldSetAvailable,true);assert.equal(list.playerAnalytics.available,false);
  const legacy=await ownerPost(activeServer,'gold',{accountId:player.sub,gold:31415});assert.equal(legacy.gold,31415);assert.equal(legacy.action,'gold');
  const account=list.accounts.find(row=>row.account_id===player.sub);assert.equal(account.diamonds,null);assert.equal(account.magicDust,null);assert.equal(account.analytics.observed,false);
  await ownerPost(activeServer,'wallet/credit',{...creditRequest,requestId:'http-disabled-credit-001'},503);
  await playerPost(activeServer,'start',{...session,sessionId:'http-disabled-session-001'},503);
  const receipt=await ownerPost(activeServer,'wallet/receipt',{requestId:creditRequest.requestId});assert.equal(receipt.receipt.amount,17);
  assert.equal((await query('SELECT count(*)::int AS count FROM hero_auction_admin_wallet_credits')).rows[0].count,1);
  assert.equal((await query('SELECT count(*)::int AS count FROM hero_auction_player_sessions')).rows[0].count,2);
 });
 await activeServer.stop();activeServer=null;
 activeServer=await startServer({schema:MISSING_SCHEMA,enabled:true});
 await check('missing migrations fail closed without auto-creating new schema or fabricating balances/analytics',async()=>{
  await query("INSERT INTO hero_admin_http_missing.hero_auction_wallets(account_id,gold) VALUES($1,500)",[player.sub]);
  assert.equal((await activeServer.getInfo()).playerAnalytics.enabled,false);
  const list=await ownerPost(activeServer,'list'),account=list.accounts.find(row=>row.account_id===player.sub);
  assert.equal(list.walletCredits.available,false);assert.equal(list.playerAnalytics.available,false);assert.equal(account.diamonds,null);assert.equal(account.analytics.observed,false);
  assert.equal(account.currencyAvailability.diamonds.reason,'storage_unavailable');
  await ownerPost(activeServer,'wallet/credit',{...creditRequest,currency:'gold'},503);
  const legacy=await ownerPost(activeServer,'gold',{accountId:player.sub,gold:1234});assert.equal(legacy.gold,1234);
  await playerPost(activeServer,'start',session,503);
  assert.equal((await query("SELECT to_regclass('hero_admin_http_missing.hero_auction_admin_wallet_credits') AS relation")).rows[0].relation,null);
  assert.equal((await query("SELECT to_regclass('hero_admin_http_missing.hero_auction_player_sessions') AS relation")).rows[0].relation,null);
 });
 console.log(`PASS ${checks} integrated PostgreSQL + HTTP groups; synthetic schemas retained, no production action.`);
}catch(error){console.error(error);process.exitCode=1}finally{if(activeServer)await activeServer.stop();await pool.end()}
