import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPlayerAnalyticsPolicy,normalizePlayerAttribution,recordPlayerSession,readPlayerAnalytics,cleanupPlayerAnalytics,preflightPlayerAnalytics,playerActivityDelta} from '../player-sessions.js';
const policy=createPlayerAnalyticsPolicy({HERO_PLAYER_ANALYTICS_ENABLED:'1'});
const identity={sub:'test-member',provider:'google'};
const sessionId='fixture-session-0001';
const start={event:'start',sessionId,sequence:0,foreground:false,source:'google_search',platform:'web',device:'desktop'};
const copy=x=>structuredClone(x);
// Deterministic SQL/transaction/row-lock fault model, not real PostgreSQL.
function fixture({now=Date.UTC(2026,9,27),known=true,missing=false}={}){
 const state={accounts:new Map(),sessions:new Map()};const queries=[];let failure=null,lostCommit=false;let tail=Promise.resolve();
 const result=x=>({rows:x===null?[]:[copy(x)],rowCount:x===null?0:1});
 const database={async connect(){let active=false,local,unlock;return{release(){assert.equal(active,false);},async query(sql,args=[]){
  queries.push({sql,args:copy(args)});
  if(sql==='BEGIN'){active=true;return result(null)}
  if(sql==='ROLLBACK'){active=false;local=null;unlock?.();unlock=null;return result(null)}
  if(sql==='COMMIT'){if(local){state.accounts=copy(local.accounts);state.sessions=copy(local.sessions)}active=false;unlock?.();unlock=null;if(lostCommit){lostCommit=false;throw Error('Lost commit response')}return result(null)}
  assert.ok(active);
  if(missing)throw Object.assign(Error('Missing table'),{code:'42P01'});
  if(failure&&sql.startsWith(failure))throw Error('Injected query failure');
  if(sql.startsWith('INSERT INTO hero_auction_player_activity')||sql.startsWith('SELECT a.account_id FROM hero_auction_player_activity')){
   if(!unlock){const prev=tail;tail=new Promise(resolve=>unlock=resolve);await prev;local=copy(state);}
  }
  if(sql.startsWith('INSERT INTO hero_auction_player_activity')){if(known&&!local.accounts.has(args[0]))local.accounts.set(args[0],{last_seen_at:new Date(now).toISOString(),last_credit_at:null});return result(null)}
  if(sql.startsWith('SELECT last_seen_at,last_credit_at'))return result(local.accounts.get(args[0])||null);
  if(sql==='SELECT clock_timestamp() AS server_now')return result({server_now:new Date(now).toISOString()});
  const key=args[0]+'|'+args[1];
  if(sql.startsWith('SELECT session_id,sequence'))return result(local.sessions.get(key)||null);
  if(sql.startsWith('SELECT COUNT(*)'))return result({count:[...local.sessions.values()].filter(s=>s.account_id===args[0]&&Date.parse(s.started_at)>=Date.parse(args[1])).length});
  if(sql.startsWith('INSERT INTO hero_auction_player_sessions')){assert.equal(local.sessions.has(key),false);local.sessions.set(key,{account_id:args[0],session_id:args[1],sequence:0,started_at:args[2],last_seen_at:args[2],ended_at:null,foreground:args[3],active_ms:0,source:args[4],source_provenance:args[5],platform:args[6],device:args[7]});return result(null)}
  if(sql.startsWith('UPDATE hero_auction_player_sessions')){Object.assign(local.sessions.get(key),{sequence:args[2],last_seen_at:args[3],ended_at:args[4],foreground:args[5],active_ms:args[6]});return result(null)}
  if(sql.startsWith('UPDATE hero_auction_player_activity')){const row=local.accounts.get(args[0]);row.last_seen_at=args[1];if(args[2])row.last_credit_at=args[1];return result(null)}
  if(sql.startsWith('SELECT a.account_id FROM hero_auction_player_activity'))return{rows:[...local.accounts].filter(([id,row])=>Date.parse(row.last_seen_at)<now-30*86400000||[...local.sessions.values()].some(s=>s.account_id===id&&Date.parse(s.started_at)<now-30*86400000)).map(([id])=>({account_id:id}))};
  if(sql.startsWith('DELETE FROM hero_auction_player_sessions')){let n=0;for(const [key,row]of local.sessions)if(args[0].includes(row.account_id)&&Date.parse(row.started_at)<now-30*86400000){local.sessions.delete(key);n++}return{rows:[],rowCount:n}}
  if(sql.startsWith('DELETE FROM hero_auction_player_activity')){let n=0;for(const [id,row]of local.accounts)if(args[0].includes(id)&&Date.parse(row.last_seen_at)<now-30*86400000&&![...local.sessions.values()].some(s=>s.account_id===id)){local.accounts.delete(id);n++}return{rows:[],rowCount:n}}
  throw Error('Unexpected SQL '+sql);
 }}} ,async query(sql,args=[]){queries.push({sql,args:copy(args)});if(missing)throw Object.assign(Error('Missing table'),{code:'42P01'});if(sql.endsWith('LIMIT 0'))return{rows:[]};assert.match(sql,/WHERE s.account_id=ANY\(\$1::text\[\]\).*interval '30 days'/s);const rows=[];for(const id of args[0]){const list=[...state.sessions.values()].filter(s=>s.account_id===id&&Date.parse(s.started_at)>=now-30*86400000).sort((a,b)=>Date.parse(b.last_seen_at)-Date.parse(a.last_seen_at)||a.session_id.localeCompare(b.session_id));if(list.length)rows.push({account_id:id,session_count:list.length,active_ms:list.reduce((sum,s)=>sum+s.active_ms,0),last_seen:list[0].last_seen_at,...Object.fromEntries(['source','source_provenance','platform','device'].map(k=>[k,list[0][k]]))})}return{rows}}};
 return {database,state,queries,advance:ms=>now+=ms,setNow:ms=>now=ms,fail:value=>failure=value,loseCommit:()=>lostCommit=true,run:(request=start,extra={})=>recordPlayerSession({database,identity,policy,request,...extra}),read:(accountIds=[identity.sub],extra={})=>readPlayerAnalytics({database,policy,accountIds,...extra}),row:(id=sessionId,account=identity.sub)=>state.sessions.get(account+'|'+id)};
}
const heartbeat=(sequence,foreground=true,extra={})=>({event:'heartbeat',sessionId,sequence,foreground,...extra});
test('collection is strict opt-in; no disabled auth or invalid request touches storage',async()=>{
 for(const env of [{},{HERO_PLAYER_ANALYTICS_ENABLED:true},{HERO_PLAYER_ANALYTICS_ENABLED:'true'},{HERO_PLAYER_ANALYTICS_ENABLED:1}])assert.equal(createPlayerAnalyticsPolicy(env).enabled,false);
 assert.equal(policy.enabled,true);assert.equal(policy.retentionDays,30);assert.equal(Object.hasOwn(policy,'geo'),false);
 for(const extra of [{policy:createPlayerAnalyticsPolicy()},{identity:null},{identity:{sub:'id with spaces',provider:'google'}}]){const f=fixture();await assert.rejects(f.run(start,extra));assert.equal(f.queries.length,0)}
 for(const request of [null,{...start,sequence:1},{...start,sessionId:'short'},{...start,sessionId:sessionId+'\n'},{...start,foreground:'true'},{...start,event:'update'},heartbeat(0),heartbeat(100001),heartbeat(1.5)]){const f=fixture();await assert.rejects(f.run(request),e=>e.status===400);assert.equal(f.queries.length,0)}
});
test('attribution is coarse, browser-reported and does not confuse Google login with acquisition',()=>{
 assert.equal(normalizePlayerAttribution(identity,{}).source,'direct_or_unknown');
 assert.equal(normalizePlayerAttribution(identity,{source:'crazygames'}).source,'direct_or_unknown');
 assert.deepEqual(normalizePlayerAttribution(identity,{source:'https://google.com/?token=secret',platform:'UA secret',device:'fingerprint',city:'Istanbul',country:'TR',ip:'127.0.0.1'}),{source:'direct_or_unknown',sourceProvenance:'client_reported',platform:'unknown',device:'unknown'});
 assert.equal(normalizePlayerAttribution({provider:'crazygames'},{}).source,'crazygames');
 assert.equal(normalizePlayerAttribution({provider:'crazygames'},{}).sourceProvenance,'verified_platform');
});
test('start, resume, heartbeat, background, return and end count only bounded foreground intervals',async()=>{
 const f=fixture();await f.run();await f.run(heartbeat(1));f.advance(15000);assert.equal((await f.run(heartbeat(2))).foregroundActiveMs,15000);
 f.advance(10000);assert.equal((await f.run(heartbeat(3,false))).foregroundActiveMs,25000);
 f.advance(300000);assert.equal((await f.run(heartbeat(4))).foregroundActiveMs,25000);
 f.advance(15000);await f.run(heartbeat(5));f.advance(5000);const end=await f.run({...heartbeat(6,false),event:'end'});assert.equal(end.foregroundActiveMs,45000);assert.equal(end.closed,true);
 const before=copy(f.state);f.advance(15000);assert.equal((await f.run(heartbeat(7))).closed,true);assert.deepEqual(f.state,before);
});
test('exact and out-of-order retries never refresh time, alter attribution or resurrect a closed session',async()=>{
 const f=fixture();await f.run();await f.run(heartbeat(1));f.advance(15000);await f.run(heartbeat(2));const before=copy(f.state);
 f.advance(15000);for(const request of [{...start,source:'invite'},heartbeat(1,false),heartbeat(2,false)])assert.equal((await f.run(request)).replayed,true);assert.deepEqual(f.state,before);
 await assert.rejects(f.run(heartbeat(100)),e=>e.status===409);assert.deepEqual(f.state,before);
});
test('unknown sessions cannot heartbeat; unknown accounts cannot create wallets',async()=>{
 const f=fixture();await assert.rejects(f.run(heartbeat(1)),e=>e.status===409);assert.equal(f.state.sessions.size,0);
 const unknown=fixture({known:false});await assert.rejects(unknown.run(),e=>e.status===404);assert.equal(unknown.state.accounts.size,0);
 assert.equal(unknown.queries.some(q=>/^INSERT INTO hero_auction_wallets/.test(q.sql)),false);
});
test('stale cutoff drops gaps, delay cap bounds intervals and recovery reset credits nothing',async()=>{
 const f=fixture();await f.run({...start,foreground:true});f.advance(40000);assert.equal((await f.run(heartbeat(1))).foregroundActiveMs,30000);
 f.advance(46000);assert.equal((await f.run(heartbeat(2))).foregroundActiveMs,30000);
 f.advance(15000);assert.equal((await f.run(heartbeat(3,false,{reset:true}))).foregroundActiveMs,30000);
 await f.run(heartbeat(4));f.advance(15000);assert.equal((await f.run(heartbeat(5))).foregroundActiveMs,45000);
});
test('pure interval union never double counts already-covered concurrent tabs',()=>{
 assert.equal(playerActivityDelta({previousSeen:0,now:15000,previousForeground:true,lastCredit:null}),15000);
 assert.equal(playerActivityDelta({previousSeen:0,now:15000,previousForeground:true,lastCredit:15000}),0);
 assert.equal(playerActivityDelta({previousSeen:10000,now:20000,previousForeground:true,lastCredit:15000}),5000);
 assert.equal(playerActivityDelta({previousSeen:0,now:45001,previousForeground:true,lastCredit:null}),0);
 assert.throws(()=>playerActivityDelta({previousSeen:1000,now:999,previousForeground:true,lastCredit:null}));
});
test('simultaneous tabs serialize account intervals while counting separate sessions in the retained window',async()=>{
 const f=fixture(),other='fixture-session-0002';await f.run({...start,foreground:true});await f.run({...start,sessionId:other,foreground:true,source:'invite'});
 f.advance(15000);await Promise.all([f.run(heartbeat(1)),f.run({...heartbeat(1),sessionId:other})]);const summary=(await f.read()).accounts[identity.sub];
 assert.equal(summary.sessionCount,2);assert.equal(summary.repeatVisits,1);assert.equal(summary.activeMs,15000);assert.equal(summary.observed,true);
 for(const field of ['country','city','geoProvenance'])assert.equal(Object.hasOwn(summary.latest,field),false);
 f.advance(15000);await Promise.all([f.run(heartbeat(2)),f.run({...heartbeat(2),sessionId:other})]);assert.equal((await f.read()).accounts[identity.sub].activeMs,30000);
});
test('two accounts remain separate; guest accounts use the same authenticated subject boundary',async()=>{
 const f=fixture();await f.run({...start,foreground:true});await f.run({...start,foreground:true},{identity:{sub:'guest:fixture-0001',provider:'guest'}});f.advance(15000);await f.run(heartbeat(1));await f.run(heartbeat(1),{identity:{sub:'guest:fixture-0001',provider:'guest'}});
 const summary=await f.read([identity.sub,'guest:fixture-0001']);assert.equal(summary.accounts[identity.sub].activeMs,15000);assert.equal(summary.accounts['guest:fixture-0001'].activeMs,15000);
});
test('heartbeat write rate is bounded while immediate visibility state transitions remain correct',async()=>{
 const f=fixture();await f.run({...start,foreground:true});f.advance(500);const limited=await f.run(heartbeat(1));assert.equal(limited.throttled,true);assert.equal(limited.sequence,0);
 assert.equal((await f.run(heartbeat(2,false))).throttled,false);assert.equal((await f.run(heartbeat(3,false))).throttled,true);assert.equal((await f.run(heartbeat(4))).throttled,false);assert.equal(f.row().foreground,true);
});
test('24 hour sessions close without billing an expired gap; negative clock fails closed',async()=>{
 const f=fixture();await f.run({...start,foreground:true});const before=copy(f.state);f.advance(-1);await assert.rejects(f.run(heartbeat(1)),e=>e.status===503);assert.deepEqual(f.state,before);f.advance(86400001);const result=await f.run(heartbeat(1));assert.equal(result.closed,true);assert.equal(result.foregroundActiveMs,0);
});
test('retention filters reads before cleanup; disabled cleanup still deletes obsolete records',async()=>{
 const f=fixture();await f.run();f.advance(30*86400000+1);const unseen=(await f.read()).accounts[identity.sub];assert.deepEqual(unseen,{observed:false,sessionCount:null,repeatVisits:null,activeMs:null,lastSeen:null,latest:null});
 const removed=await cleanupPlayerAnalytics({database:f.database,policy:createPlayerAnalyticsPolicy()});assert.deepEqual(removed,{sessionsDeleted:1,accountsDeleted:1});assert.equal(f.state.sessions.size,0);
});
test('storage unavailable is not misrepresented as observed zero visits',async()=>{
 const missing=fixture({missing:true});const summary=await missing.read();assert.equal(summary.available,false);assert.equal(summary.reason,'storage_unavailable');assert.equal(summary.accounts[identity.sub].sessionCount,null);
 const f=fixture();assert.equal((await f.read(undefined,{policy:createPlayerAnalyticsPolicy()})).reason,'disabled');assert.equal(f.queries.length,0);
 assert.equal(await preflightPlayerAnalytics(null),false);await preflightPlayerAnalytics(f.database);assert.equal(f.queries.length,2);assert.ok(f.queries.every(q=>q.sql.startsWith('SELECT')));
});
test('atomic rollback and lost commit response recover using same session ID and sequence',async()=>{
 const f=fixture();f.fail('UPDATE hero_auction_player_activity');await assert.rejects(f.run());assert.equal(f.state.sessions.size,0);f.fail(null);f.loseCommit();await assert.rejects(f.run());assert.equal(f.state.sessions.size,1);f.advance(15000);const before=copy(f.state);assert.equal((await f.run()).replayed,true);assert.deepEqual(f.state,before);
});
test('session count cap and migration protect bounded storage without raw identifiers beyond the account/session keys',async()=>{
 const f=fixture();await f.run();for(let i=1;i<1000;i++)f.state.sessions.set(identity.sub+'|fixture-session-'+i,{...copy(f.row()),session_id:'fixture-session-'+i});await assert.rejects(f.run({...start,sessionId:'another-session-1001'}),e=>e.status===429);assert.equal(f.state.sessions.size,1000);
 const sql=readFileSync(new URL('../migrations/007-player-sessions.sql',import.meta.url),'utf8');assert.match(sql,/ON DELETE CASCADE/);assert.match(sql,/CHECK\(active_ms>=0 AND active_ms<=86400000\)/);assert.doesNotMatch(sql,/\b(?:raw_ip|referrer_url|user_agent|country_code|latitude|longitude)\s+(?:TEXT|VARCHAR|REAL)/i);
});
