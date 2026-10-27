// Disposable-only PostgreSQL integration. Never reads production credentials.
// Requires parent to start fixture PostgreSQL and invoke this in the same network
// namespace: HERO_ANALYTICS_TEST_DB=postgresql://test:test@127.0.0.1:55432/hero_analytics_test
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createPlayerAnalyticsPolicy,recordPlayerSession,readPlayerAnalytics,cleanupPlayerAnalytics,preflightPlayerAnalytics} from '../player-sessions.js';
const expected='postgresql://test:test@127.0.0.1:55432/hero_analytics_test';
if(Object.hasOwn(process.env,'DATABASE_URL'))throw Error('Refusing inherited DATABASE_URL; no production credential is permitted.');
if(process.env.HERO_ANALYTICS_TEST_DB!==expected)throw Error('Requires exact disposable loopback analytics fixture URL.');
const schema='analytics_fixture_'+randomUUID().replaceAll('-','');
const root=new pg.Client({connectionString:expected,connectionTimeoutMillis:5000});
let pool;let created=false;
try{
 await root.connect();
 const identity=(await root.query("SELECT current_database() AS db,current_user AS username,host(inet_server_addr()) AS address")).rows[0];
 assert.equal(identity.db,'hero_analytics_test');assert.equal(identity.username,'test');assert.equal(identity.address,'127.0.0.1');
 await root.query(`CREATE SCHEMA "${schema}"`);created=true;
 pool=new pg.Pool({connectionString:expected,options:`-c search_path=${schema}`,max:6,connectionTimeoutMillis:5000});
 await pool.query('CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0))');
 await pool.query(readFileSync(new URL('../migrations/007-player-sessions.sql',import.meta.url),'utf8'));
 await preflightPlayerAnalytics(pool);
 const policy=createPlayerAnalyticsPolicy({HERO_PLAYER_ANALYTICS_ENABLED:'1'});
 const user={sub:'analytics-fixture-google',provider:'google'};
 const second={sub:'guest:analytics-fixture',provider:'guest'};
 await pool.query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,500),($2,750)',[user.sub,second.sub]);
 const sid='analytics-session-first',other='analytics-session-other';
 const run=(request,identity=user)=>recordPlayerSession({database:pool,identity,policy,request});
 const start=(sessionId=sid,more={})=>({event:'start',sessionId,sequence:0,foreground:false,source:'direct_or_unknown',platform:'web',device:'desktop',...more});
 const heartbeat=(sequence,foreground=true,sessionId=sid,more={})=>({event:'heartbeat',sessionId,sequence,foreground,...more});
 const snapshot=async()=>(await pool.query('SELECT * FROM hero_auction_player_sessions ORDER BY account_id,session_id')).rows;
 const backdate=async(seconds=15)=>{
  await pool.query("UPDATE hero_auction_player_sessions SET started_at=clock_timestamp()-interval '1 hour',last_seen_at=clock_timestamp()-$1::double precision*interval '1 second' WHERE account_id=$2",[seconds,user.sub]);
  await pool.query("UPDATE hero_auction_player_activity SET last_seen_at=clock_timestamp()-$1::double precision*interval '1 second',last_credit_at=NULL WHERE account_id=$2",[seconds,user.sub]);
 };
 await run(start());await run(heartbeat(1));await backdate();
 const first=await run(heartbeat(2));assert.ok(first.foregroundActiveMs>=15000&&first.foregroundActiveMs<16000);
 const before=await snapshot();const replay=await run(start(sid,{source:'invite'}));assert.equal(replay.replayed,true);assert.deepEqual(await snapshot(),before);
 const prior=await run(heartbeat(1,false));assert.equal(prior.replayed,true);assert.deepEqual(await snapshot(),before);
 await assert.rejects(run(heartbeat(100)),e=>e.status===409);assert.deepEqual(await snapshot(),before);
 // A pause stops accrual, and a resumed foreground does not bill background time.
 await run(heartbeat(3,false));const paused=(await snapshot())[0].active_ms;
 await backdate(180);await run(heartbeat(4));assert.equal((await snapshot())[0].active_ms,paused);
 await backdate(46);await run(heartbeat(5));assert.equal((await snapshot())[0].active_ms,paused);
 await backdate(40);const capped=await run(heartbeat(6));assert.equal(capped.foregroundActiveMs-Number(paused),30000);
 await backdate(15);const reset=await run(heartbeat(7,false,sid,{reset:true}));assert.equal(reset.foregroundActiveMs,capped.foregroundActiveMs);
 // Concurrent sessions share the account lock and cover an interval once only.
 await pool.query('DELETE FROM hero_auction_player_sessions');await pool.query('DELETE FROM hero_auction_player_activity');
 await run(start(sid,{foreground:true}));await run(start(other,{foreground:true,source:'google_search'}));await backdate();
 await Promise.all([run(heartbeat(1,true,sid)),run(heartbeat(1,true,other))]);
 const analytics=await readPlayerAnalytics({database:pool,policy,accountIds:[user.sub,second.sub]});
 const summary=analytics.accounts[user.sub];assert.equal(summary.sessionCount,2);assert.equal(summary.repeatVisits,1);assert.ok(summary.activeMs>=15000&&summary.activeMs<16000,JSON.stringify(summary));
 for(const field of ['country','city','geoProvenance'])assert.equal(Object.hasOwn(summary.latest,field),false);
 assert.equal(analytics.accounts[second.sub].observed,false);assert.equal(analytics.accounts[second.sub].activeMs,null);
 // Repeated requests concurrently create one row and one session count.
 const retry='analytics-retried-session';await Promise.all(Array.from({length:8},()=>run(start(retry))));assert.equal(Number((await pool.query('SELECT COUNT(*) FROM hero_auction_player_sessions WHERE session_id=$1',[retry])).rows[0].count),1);
 // Account boundaries are trusted server identity, not browser accountId; unsolicited location fields are ignored.
 await run(start('analytics-guest-session',{accountId:user.sub,country:'TR',city:'Ankara',source:'crazygames'}),second);
 const guest=await readPlayerAnalytics({database:pool,policy,accountIds:[second.sub]});assert.equal(guest.accounts[second.sub].sessionCount,1);assert.equal(guest.accounts[second.sub].latest.source,'direct_or_unknown');
 // Unknown identity never manufactures a wallet, analytics row, or balance.
 await assert.rejects(run(start(),{sub:'analytics-unknown',provider:'google'}),e=>e.status===404);
 assert.equal(Number((await pool.query("SELECT COUNT(*) FROM hero_auction_wallets WHERE account_id='analytics-unknown'")).rows[0].count),0);
 // SQL constraints reject malformed sequences and durations independent of JS.
 await assert.rejects(pool.query('UPDATE hero_auction_player_sessions SET active_ms=-1 WHERE account_id=$1',[user.sub]),e=>e.code==='23514');
 await assert.rejects(pool.query('UPDATE hero_auction_player_sessions SET sequence=100001 WHERE account_id=$1',[user.sub]),e=>e.code==='23514');
 const ending=await run({...heartbeat(2,false,sid),event:'end'});assert.equal(ending.closed,true);const closed=await snapshot();assert.equal((await run(heartbeat(3,true,sid))).closed,true);assert.deepEqual(await snapshot(),closed);
 // A separate fixture session expires at24h; no wall-clock day gets credited.
 await pool.query("UPDATE hero_auction_player_sessions SET started_at=clock_timestamp()-interval '25 hours' WHERE session_id=$1",[other]);
 assert.equal((await run(heartbeat(2,true,other))).closed,true);
 // Force old retained rows; the read window hides them even before cleanup.
 await pool.query("UPDATE hero_auction_player_sessions SET started_at=clock_timestamp()-interval '31 days',last_seen_at=clock_timestamp()-interval '31 days',ended_at=NULL WHERE account_id=$1",[second.sub]);
 await pool.query("UPDATE hero_auction_player_activity SET last_seen_at=clock_timestamp()-interval '31 days',last_credit_at=NULL WHERE account_id=$1",[second.sub]);
 const hidden=await readPlayerAnalytics({database:pool,policy,accountIds:[second.sub]});assert.equal(hidden.accounts[second.sub].observed,false);
 const holder=await pool.connect();
 try{
  await holder.query('BEGIN');await holder.query('SELECT account_id FROM hero_auction_player_activity WHERE account_id=$1 FOR UPDATE',[second.sub]);
  const deferred=await cleanupPlayerAnalytics({database:pool,policy:createPlayerAnalyticsPolicy()});assert.equal(deferred.sessionsDeleted,0);assert.equal(deferred.accountsDeleted,0);
  await holder.query('COMMIT');
 }finally{await holder.query('ROLLBACK');holder.release();}
 const cleanup=await cleanupPlayerAnalytics({database:pool,policy:createPlayerAnalyticsPolicy()});assert.equal(cleanup.sessionsDeleted,1);assert.equal(cleanup.accountsDeleted,1);
 // Recording never changes any economy value.
 assert.deepEqual((await pool.query('SELECT account_id,gold FROM hero_auction_wallets ORDER BY account_id')).rows,[{account_id:user.sub,gold:500},{account_id:second.sub,gold:750}].sort((a,b)=>a.account_id.localeCompare(b.account_id)));
 console.log('PASS: PostgreSQL analytics migration, constraints, account isolation, session lifecycle, retries, concurrent tab de-duplication, timing caps, retained-window reads, cleanup while disabled, and unchanged wallets.');
}finally{
 if(pool)await pool.end();
 if(created)await root.query(`DROP SCHEMA "${schema}" CASCADE`);
 await root.end();
}
