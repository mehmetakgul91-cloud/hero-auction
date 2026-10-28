// Synthetic disposable fixture only. Never inherits or accepts production credentials.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import vm from 'node:vm';
import {readAdminSessionReport} from '../admin-player-reports.js';
import {recordPlayerSession,cleanupPlayerAnalytics} from '../player-sessions.js';
import {isOwnerAdmin} from '../admin-wallet-credits.js';
export async function verifyReports(database){
 await database.query('CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL CHECK(gold>=0))');
 await database.query('CREATE TABLE hero_auction_user_profiles(account_id TEXT PRIMARY KEY,display_name TEXT)');
 await database.query('CREATE TABLE hero_auction_admin_accounts(account_id TEXT PRIMARY KEY,banned BOOLEAN)');
 await database.query('CREATE TABLE hero_auction_admin_audit(id BIGSERIAL PRIMARY KEY,account_id TEXT,actor_id TEXT,action TEXT,old_gold INT,new_gold INT,created_at TIMESTAMPTZ DEFAULT now())');
 await database.query('CREATE TABLE game_fixture(id TEXT PRIMARY KEY,record JSONB)');
 await database.query("INSERT INTO hero_auction_wallets VALUES('a',750),('b',920)");
 await database.query("INSERT INTO hero_auction_user_profiles VALUES('a','İzmir %_ Oyuncu'),('b','Başka Oyuncu')");
 await database.query("INSERT INTO game_fixture VALUES('retained','{\"winner\":\"b\",\"gold\":100}')");
 const snapshot=async()=>({wallets:(await database.query('SELECT * FROM hero_auction_wallets ORDER BY account_id')).rows,games:(await database.query('SELECT * FROM game_fixture')).rows});
 const before=await snapshot();
 await database.query(readFileSync(new URL('../migrations/007-player-sessions.sql',import.meta.url),'utf8'));
 const policy={enabled:true};const request={sessionId:'session-location-fixture',event:'start',sequence:0,foreground:false,source:'invite',platform:'android',device:'mobile'};
 // Old schema keeps recording when optional location storage is absent.
 await recordPlayerSession({database,policy,identity:{sub:'a',provider:'google'},request,location:{country:'TR',city:'Manisa'}});
 await database.query(readFileSync(new URL('../migrations/008-player-session-locations.sql',import.meta.url),'utf8'));
 await database.query(readFileSync(new URL('../migrations/008-player-session-locations.sql',import.meta.url),'utf8'));
 assert.equal(Number((await database.query('SELECT count(*) FROM hero_auction_player_session_locations')).rows[0].count),0,'no historical backfill');
 const next={...request,sessionId:'session-location-next'};
 await recordPlayerSession({database,policy,identity:{sub:'a',provider:'google'},request:next,location:{country:'TR',city:'Manisa'}});
 await recordPlayerSession({database,policy,identity:{sub:'a',provider:'google'},request:next,location:{country:'US',city:'forged-retry'}});
 assert.deepEqual((await database.query('SELECT country,city FROM hero_auction_player_session_locations')).rows,[{country:'TR',city:'Manisa'}]);
 await database.query('DELETE FROM hero_auction_player_sessions');
 assert.equal(Number((await database.query('SELECT count(*) FROM hero_auction_player_session_locations')).rows[0].count),0,'parent removal cascades only location');
 await database.query("INSERT INTO hero_auction_player_activity(account_id) VALUES('b')");
 const clock=(await database.query("SELECT clock_timestamp() AS now, date_trunc('day',clock_timestamp() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul' AS midnight")).rows[0];
 const now=new Date(clock.now),midnight=new Date(clock.midnight),day=86400000;
 const seed=[['a',0,'invite','android'],['b',0,'google_search','web'],['a',6,'crazygames','web'],['a',28,'external','web'],['b',31,'direct_or_unknown','web'],['b',-2,'external','web']];
 for(let i=0;i<seed.length;i++){
  const [account,ago,source,platform]=seed[i],at=new Date(midnight-ago*day);
  await database.query('INSERT INTO hero_auction_player_sessions(account_id,session_id,sequence,started_at,last_seen_at,foreground,source,source_provenance,platform,device) VALUES($1,$2,0,$3,$3,false,$4,$5,$6,$7)',[account,'session-seed-fixture-'+i,at,source,source==='crazygames'?'verified_platform':'client_reported',platform,platform==='android'?'mobile':'desktop']);
 }
 await database.query("INSERT INTO hero_auction_player_session_locations VALUES('a','session-seed-fixture-0','TR','Manisa'),('b','session-seed-fixture-4','TR','Eski')");
 for(const [days,count]of [[1,2],[7,3],[30,4]]){
  const report=await readAdminSessionReport({database,policy,now,locationsAvailable:true,request:{days}});
  assert.equal(report.available,true);assert.equal(report.total,count);assert.equal(report.summary.uniqueAccounts,2);assert.equal(report.summary.additionalSessions,count-2);
  assert.equal(report.summary.androidSessions,1);assert.equal(report.entries.find(x=>x.accountId==='a').city,'Manisa');
  assert.equal(report.entries.find(x=>x.accountId==='b').city,null);assert.ok(!JSON.stringify(report).includes('Eski'));
 }
 const filtered=await readAdminSessionReport({database,policy,now,request:{days:30,search:'%_',platform:'android'}});assert.equal(filtered.total,1);assert.equal(filtered.entries[0].accountId,'a');
 const empty=await readAdminSessionReport({database,policy,now,request:{search:'absent'}});assert.equal(empty.summary,null);assert.equal(empty.days.length,0);
 const page=await readAdminSessionReport({database,policy,now,request:{days:30,limit:1,offset:1}});assert.equal(page.total,4);assert.equal(page.entries.length,1);assert.equal(page.entries[0].accountId,'b');
 const exported=await readAdminSessionReport({database,policy,now,request:{days:30,limit:1,offset:2,export:true}});assert.equal(exported.entries.length,4,'export covers all filtered rows, not only current page');
 await cleanupPlayerAnalytics({database});assert.equal(Number((await database.query("SELECT count(*) FROM hero_auction_player_session_locations WHERE city='Eski'")).rows[0].count),0);
 assert.deepEqual(await snapshot(),before,'migration, telemetry, reports and retention preserve money and games');
 // Execute the actual admin route's SQL against the fixture, including stale gold protection.
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const owner={sub:'a',email:'owner@example.invalid',provider:'google'};
 const ctx={database,databaseReady:true,playerAnalyticsStorageReady:true,isOwnerAdmin,ADMIN_GOOGLE_EMAIL:owner.email,readLogin:x=>x,error:(m,status)=>{throw Object.assign(Error(m),{status});},ratings:new Map(),adminWalletCreditPolicy:{},playerAnalyticsPolicy:policy,
 readAdminWalletBalances:async()=>({currencies:{diamonds:{available:false},magicDust:{available:false}},byAccount:{}}),adminWalletCreditStorageReady:async()=>false,readPlayerAnalytics:async()=>({accounts:{},enabled:true,available:true,retentionDays:30}),adminWalletCreditView:()=>({enabled:false,currencies:{gold:{available:false},diamonds:{available:false},magicDust:{available:false}}})};
 vm.createContext(ctx);vm.runInContext(server.slice(server.indexOf('async function adminApi('),server.indexOf('\nfunction sameSeat(')),ctx);
 assert.equal((await ctx.adminApi('/api/admin/list',{authToken:owner,search:'%_'})).accounts.length,1);
 await database.query("INSERT INTO hero_auction_admin_accounts VALUES('b',true)");assert.equal((await ctx.adminApi('/api/admin/list',{authToken:owner,state:'banned'})).accounts[0].account_id,'b');
 await assert.rejects(ctx.adminApi('/api/admin/ban',{authToken:owner,accountId:'a',banned:true}),e=>e.status===400);
 await assert.rejects(ctx.adminApi('/api/admin/gold',{authToken:owner,accountId:'b',gold:0,expectedGold:900}),e=>e.status===409);
 assert.deepEqual(await snapshot(),before);
 assert.equal(Number((await database.query('SELECT count(*) FROM hero_auction_admin_audit')).rows[0].count),0);
 await database.query("INSERT INTO hero_auction_wallets SELECT 'page-'||n,500 FROM generate_series(1,55) n");
 const first=await ctx.adminApi('/api/admin/list',{authToken:owner}),second=await ctx.adminApi('/api/admin/list',{authToken:owner,offset:50});assert.equal(first.accounts.length,50);assert.equal(first.pagination.total,57);assert.equal(first.pagination.hasMore,true);assert.equal(second.accounts.length,7);
 ctx.playerAnalyticsStorageReady=false;assert.equal((await ctx.adminApi('/api/admin/list',{authToken:owner,activity:'today'})).accounts.length,0);
 return 'PASS: report periods, Istanbul boundaries, distinct accounts, literal search, filters, paging/full CSV, location replay/retention, additive migration, old schema, unchanged wallets/games, owner protection and stale balance rollback';
}
async function main(){
 const expected='postgresql://test:test@127.0.0.1:55432/hero_admin_reports_test';
 if(Object.keys(process.env).some(k=>k==='DATABASE_URL'||/^PG[A-Z_]*$/.test(k))||process.env.HERO_ADMIN_REPORTS_TEST_DB!==expected)throw Error('Requires exact disposable loopback reports fixture.');
 const root=new pg.Client({connectionString:expected,ssl:false});await root.connect();const schema='reports_'+randomUUID().replaceAll('-','');let pool;
 try{assert.ok(Number((await root.query("SELECT current_setting('server_version_num') AS v")).rows[0].v)>=180000);await root.query(`CREATE SCHEMA "${schema}"`);pool=new pg.Pool({connectionString:expected,ssl:false,options:`-c search_path=${schema}`});console.log(await verifyReports(pool));}
 finally{await pool?.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
