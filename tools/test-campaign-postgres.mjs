// Disposable PostgreSQL 18 fixture only. Never accepts production credentials.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createCampaignPolicy,attributeCampaign,recordCampaignIntro,readCampaignFunnel,cleanupCampaignMeasurement,deleteCampaignMeasurement,preflightCampaignMeasurement} from '../campaign-measurement.js';
const expected='postgresql://test:test@127.0.0.1:55432/hero_campaign_test';
if(Object.keys(process.env).some(k=>k==='DATABASE_URL'||/^PG[A-Z_]*$/.test(k)))throw Error('Refusing inherited DATABASE_URL or PG overrides.');
if(process.env.HERO_CAMPAIGN_TEST_DB!==expected)throw Error('Requires exact disposable loopback campaign fixture URL.');
const schema='campaign_fixture_'+randomUUID().replaceAll('-','');
const root=new pg.Client({connectionString:expected,ssl:false,connectionTimeoutMillis:5000});let pool,created=false;
try{
 await root.connect();const who=(await root.query("SELECT current_database() AS db,current_user AS username,inet_server_port() AS port,current_setting('server_version_num') AS version")).rows[0];
 assert.equal(who.db,'hero_campaign_test');assert.equal(who.username,'test');assert.ok([5432,55432].includes(who.port));assert.ok(Number(who.version)>=180000&&Number(who.version)<190000);
 await root.query(`CREATE SCHEMA "${schema}"`);created=true;
 pool=new pg.Pool({connectionString:expected,ssl:false,options:`-c search_path=${schema}`,max:8,connectionTimeoutMillis:5000});
 await pool.query(`CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER DEFAULT 500);
 CREATE TABLE hero_auction_commanders(account_id TEXT PRIMARY KEY,profile JSONB);
 CREATE TABLE hero_auction_gold_awards(account_id TEXT);
 CREATE TABLE hero_auction_victory_chest_receipts(account_id TEXT);
 CREATE TABLE hero_auction_rooms(code TEXT PRIMARY KEY,state JSONB);
 CREATE TABLE hero_auction_social(id TEXT PRIMARY KEY,state JSONB);
 CREATE TABLE hero_auction_bot_entries(match_id TEXT PRIMARY KEY,account_id TEXT,difficulty TEXT,entry_gold INTEGER,config_version TEXT,created_at TIMESTAMPTZ DEFAULT clock_timestamp());
 CREATE TABLE hero_auction_bot_settlements(match_id TEXT PRIMARY KEY,account_id TEXT,outcome TEXT,room_state JSONB,created_at TIMESTAMPTZ DEFAULT clock_timestamp());`);
 // The sole transformation binds the checked-in migration's search path to the
 // random disposable schema, never public. All DDL/checks remain unchanged.
 let migration=readFileSync(new URL('../migrations/012-campaign-measurement.sql',import.meta.url),'utf8');assert.ok(migration.includes('SET LOCAL search_path=public,pg_catalog;'));
 migration=migration.replace('SET LOCAL search_path=public,pg_catalog;',`SET LOCAL search_path="${schema}",pg_catalog;`);await pool.query(migration);assert.equal(await preflightCampaignMeasurement(pool),true);
 const policy=createCampaignPolicy({HERO_PLAYER_ANALYTICS_ENABLED:'1',HERO_CAMPAIGN_MEASUREMENT_ENABLED:'1',HERO_CAMPAIGNS:JSON.stringify([{id:'launch',source:'instagram',medium:'social',campaign:'launch'},{id:'other',source:'youtube',medium:'video',campaign:'other'}])});
 const user=id=>({sub:'guest:'+id,provider:'guest'});
 const add=async id=>{await pool.query('INSERT INTO hero_auction_wallets(account_id) VALUES($1)',[user(id).sub]);return user(id);};
 const attr=(identity,campaignId='launch')=>attributeCampaign({database:pool,policy,identity,request:{campaignId}});
 const event=(identity,name)=>recordCampaignIntro({database:pool,policy,identity,request:{event:name}});
 const entry=async(id,match,difficulty='easy',version='bot-free-v2')=>pool.query('INSERT INTO hero_auction_bot_entries(match_id,account_id,difficulty,entry_gold,config_version) VALUES($1,$2,$3,$4,$5)',[match,user(id).sub,difficulty,version==='bot-free-v2'?0:50,version]);
 const settle=(id,match,outcome,room)=>pool.query('INSERT INTO hero_auction_bot_settlements(match_id,account_id,outcome,room_state) VALUES($1,$2,$3,$4)',[match,user(id).sub,outcome,room]);
 const report=async()=>{const result=await readCampaignFunnel({database:pool,policy,days:30});assert.doesNotMatch(JSON.stringify(result),/guest:|account_id|room_state/);return result.campaigns.find(c=>c.campaignId==='launch');};
 const fresh=await add('fresh');await Promise.all(Array.from({length:8},()=>attr(fresh)));assert.equal((await pool.query('SELECT count(*)::int AS n FROM hero_auction_campaign_funnel')).rows[0].n,1);
 const first=(await pool.query('SELECT attributed_at FROM hero_auction_campaign_funnel WHERE account_id=$1',[fresh.sub])).rows[0].attributed_at;
 assert.equal((await attr(fresh,'other')).accepted,false);await Promise.all(Array.from({length:8},()=>event(fresh,'intro_viewed')));await event(fresh,'intro_completed');await event(fresh,'intro_skipped');
 assert.equal((await report()).intro_viewed,1);assert.deepEqual((await pool.query('SELECT attributed_at FROM hero_auction_campaign_funnel WHERE account_id=$1',[fresh.sub])).rows[0].attributed_at,first);
 // Existing commander, paid bot, legacy room and social history all fail closed.
 const old=await add('old');await pool.query('INSERT INTO hero_auction_commanders VALUES($1,$2)',[old.sub,{}]);assert.equal((await attr(old)).accepted,false);
 const paid=await add('paid');await entry('paid','paid-old','easy','bot-fixed-v1');assert.equal((await attr(paid)).accepted,false);
 const legacy=await add('legacy');await pool.query('INSERT INTO hero_auction_rooms VALUES($1,$2)',['legacy',{players:[{accountId:legacy.sub}]}]);assert.equal((await attr(legacy)).accepted,false);
 const social=await add('social');await pool.query('INSERT INTO hero_auction_social VALUES($1,$2)',['global',{matches:[['m',{participants:[{id:social.sub}]}]],ratings:[]}]);assert.equal((await attr(social)).accepted,false);
 // A non-easy first entry cannot be replaced by a later easy rematch.
 const wrong=await add('wrong');await attr(wrong);await entry('wrong','wrong-hard','hard');await entry('wrong','wrong-easy');await pool.query("UPDATE hero_auction_bot_entries SET created_at=(SELECT created_at+interval '1 millisecond' FROM hero_auction_bot_entries WHERE match_id='wrong-hard') WHERE match_id='wrong-easy'");
 const ambiguous=await add('ambiguous');await attr(ambiguous);await entry('ambiguous','a-easy');await entry('ambiguous','z-hard','hard');await pool.query("UPDATE hero_auction_bot_entries SET created_at=(SELECT attributed_at+interval '1 millisecond' FROM hero_auction_campaign_funnel WHERE account_id=$1) WHERE account_id=$1",[ambiguous.sub]);
 await entry('fresh','first');await settle('fresh','first','win',{battleSync:{result:{finished:true}}});
 const states=[['loss','loss',{battleSync:{result:{finished:true}}}],['tie','tie',{battleSync:{result:{finished:true}}}],['forfeit','loss',{disconnectForfeit:{winner:1},battleSync:{result:{finished:true}}}],['failure','server_failure',{}],['idle','idle_cancelled',{}],['unknown','loss',{}],['pending',null,null]];
 for(const [id,outcome,room]of states){const identity=await add(id);await attr(identity);await entry(id,id);if(outcome)await settle(id,id,outcome,room);}
 let r=await report();assert.equal(r.authenticated,10);assert.equal(r.first_bot_started,8);assert.equal(r.first_bot_completed,3);assert.equal(r.forfeited,1);assert.equal(r.server_failures,1);assert.equal(r.idle_cancelled,1);assert.equal(r.other_terminal,1);assert.equal(r.pending,1);
 await assert.rejects(event(fresh,'first_bot_completed'));r=await report();assert.equal(r.first_bot_completed,3);
 // Expiry deletes only analytics, even with collection flags no longer enabled.
 await pool.query("UPDATE hero_auction_campaign_funnel SET attributed_at=clock_timestamp()-interval '31 days' WHERE account_id=$1",[fresh.sub]);
 assert.equal((await cleanupCampaignMeasurement({database:pool})).deleted,1);assert.equal((await pool.query('SELECT count(*)::int AS n FROM hero_auction_bot_entries WHERE account_id=$1',[fresh.sub])).rows[0].n,1);
 assert.equal((await deleteCampaignMeasurement({database:pool,accountIds:[user('tie').sub]})).deleted,1);
 await pool.query('DELETE FROM hero_auction_wallets WHERE account_id=$1',[user('pending').sub]);assert.equal((await pool.query('SELECT count(*)::int AS n FROM hero_auction_campaign_funnel WHERE account_id=$1',[user('pending').sub])).rows[0].n,0);
 assert.equal((await pool.query('SELECT SUM(gold)::int AS amount FROM hero_auction_wallets')).rows[0].amount,6500);
 console.log('PASS campaign SQL: concurrent immutable attribution, history rejection, client dedupe, first-entry ordering, authoritative terminal classification, expiry and deletion; economy unchanged.');
}finally{await pool?.end();if(created)await root.query(`DROP SCHEMA "${schema}" CASCADE`);await root.end();}
