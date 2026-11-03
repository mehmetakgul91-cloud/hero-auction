// Run only against this fresh disposable loopback DB. Never production.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {admitBotMatch,cancelIdleBotMatch,settleBotMatch,verifyBotEconomySchema,verifyBotIdleCancellationSchema,recoverBotMatches} from '../bot-economy.js';
const approved='postgresql://test:test@127.0.0.1:5432/hero_bot_idle_test';
if(process.env.HERO_BOT_IDLE_TEST_DB!==approved||process.env.DATABASE_URL){console.error('REFUSED: exact disposable loopback HERO_BOT_IDLE_TEST_DB required; remove DATABASE_URL. No connection attempted.');process.exit(1)}
const {default:pg}=await import('pg');
const pool=new pg.Pool({host:'127.0.0.1',port:5432,database:'hero_bot_idle_test',user:'test',password:'test',ssl:false,max:20,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,options:'-c statement_timeout=10000 -c lock_timeout=5000',application_name:'hero-disposable-bot-idle'});
let serial=100,passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
async function fixture({legacy=false}={}){
 const n=++serial,r={code:String(n),created:n*1000,matchNumber:1,mode:'bot',phase:'auction',difficulty:'medium',players:[{accountId:`synthetic-idle-${n}`},{token:'synthetic-bot'}],series:[0,0]};
 let room;
 if(legacy){
  const matchId=`${r.code}:1:${r.created}`,requestId=randomUUID();room={...r,entryPaid:true,botEconomyVersion:'bot-fixed-v1',botEntry:{matchId,requestId,version:'bot-fixed-v1',difficulty:r.difficulty,entryGold:50}};
  await pool.query('INSERT INTO hero_auction_wallets VALUES($1,450)',[r.players[0].accountId]);
  await pool.query('INSERT INTO hero_auction_bot_entries(match_id,account_id,request_id,difficulty,config_version,entry_gold,gold_before,gold_after,room_state) VALUES($1,$2,$3,$4,$5,50,500,450,$6::jsonb)',[matchId,r.players[0].accountId,requestId,r.difficulty,'bot-fixed-v1',JSON.stringify(room)]);
  await pool.query('INSERT INTO hero_auction_rooms(code,state) VALUES($1,$2::jsonb)',[room.code,JSON.stringify(room)]);
 }else room=(await admitBotMatch({database:pool,accountId:r.players[0].accountId,requestId:randomUUID(),room:r})).room;
 room.playerActivity={match:`${room.code}:${room.created}:1`,at:1000};await pool.query('UPDATE hero_auction_rooms SET state=$2::jsonb WHERE code=$1',[room.code,JSON.stringify(room)]);return room;
}
const cancel=(room,extra={})=>cancelIdleBotMatch({database:pool,room,now:101000,validateLive:()=>true,...extra});
const gold=async r=>(await pool.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1',[r.players[0].accountId])).rows[0].gold;
function lostCommit(){let armed=true;return{async connect(){const c=await pool.connect();return{async query(...args){const result=await c.query(...args);if(args[0]==='COMMIT'&&armed){armed=false;throw Error('Lost COMMIT response')}return result},release:()=>c.release()}}}}
try{
 assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'hero_bot_idle_test');
 assert.equal(Number((await pool.query("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n),0,'Fresh empty disposable DB required; never reset existing data.');
 await pool.query('CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL CHECK(gold>=0)); CREATE TABLE hero_auction_magic_dust_wallets(account_id TEXT PRIMARY KEY REFERENCES hero_auction_wallets(account_id),magic_dust INTEGER NOT NULL CHECK(magic_dust>=0)); CREATE TABLE hero_auction_rooms(code VARCHAR(3) PRIMARY KEY,state JSONB NOT NULL,updated_at TIMESTAMPTZ DEFAULT NOW());');
 for(const filename of ['009-bot-fixed-economy.sql','010-bot-free-entry.sql'])await pool.query(await readFile(new URL('../migrations/'+filename,import.meta.url),'utf8'));
 const legacy=await fixture({legacy:true}),migration=await readFile(new URL('../migrations/011-bot-idle-cancellation.sql',import.meta.url),'utf8');
 await check('new verifier fails before migration; DDL rollback retains old schema',async()=>{
  await assert.rejects(verifyBotIdleCancellationSchema(pool));const c=await pool.connect();try{await c.query('BEGIN');await c.query(migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));await assert.rejects(c.query('SELECT 1/0'));await c.query('ROLLBACK')}finally{c.release()}
  await assert.rejects(verifyBotIdleCancellationSchema(pool));assert.equal(await verifyBotEconomySchema(pool),true);assert.equal(await gold(legacy),450);
 });
 await pool.query(migration);assert.equal(await verifyBotIdleCancellationSchema(pool),true);assert.equal(await verifyBotEconomySchema(pool),true);
 await check('legacy paid idle cancellation is no refund and no loss',async()=>{const result=await cancel(legacy);assert.equal(await gold(legacy),450);assert.equal(result.receipt.outcome,'idle_cancelled');assert.deepEqual(result.room.series,[0,0]);});
 await check('parallel cancellation serializes to one terminal receipt',async()=>{const r=await fixture(),results=await Promise.all(Array.from({length:16},()=>cancel(r)));assert.equal(results.filter(x=>!x.replayed).length,1);assert.equal(await gold(r),500);assert.equal(Number((await pool.query('SELECT count(*) AS n FROM hero_auction_bot_settlements WHERE match_id=$1',[r.botEntry.matchId])).rows[0].n),1);});
 await check('normal settlement and cancellation cannot both commit',async()=>{const r=await fixture(),results=await Promise.allSettled([cancel(r),settleBotMatch({database:pool,room:{...r,phase:'finished',battleSync:{result:{winner:0,live:true,finished:true}}},winner:0})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const row=(await pool.query('SELECT outcome FROM hero_auction_bot_settlements WHERE match_id=$1',[r.botEntry.matchId])).rows[0];assert.equal(await gold(r),row.outcome==='win'?625:500);});
 await check('durable changed activity and arena reject without economic changes',async()=>{const r=await fixture();await pool.query("UPDATE hero_auction_rooms SET state=jsonb_set(state,'{playerActivity,at}','2000') WHERE code=$1",[r.code]);await assert.rejects(cancel(r));assert.equal(await gold(r),500);const a=await fixture();a.battleSync={result:{live:true}};await pool.query('UPDATE hero_auction_rooms SET state=$2 WHERE code=$1',[a.code,a]);await assert.rejects(cancel(a));assert.equal(await gold(a),500);});
 await check('lost COMMIT replays and restart sees closed receipt',async()=>{const r=await fixture();await assert.rejects(cancel(r,{database:lostCommit()}),e=>e.uncertain===true);assert.equal((await cancel(r)).replayed,true);assert.equal((await recoverBotMatches(pool)).find(x=>x.match_id===r.botEntry.matchId).room.phase,'cancelled');assert.equal(await gold(r),500);});
 await check('one-shot migration repeat fails atomically without changing readiness or receipts',async()=>{const before=JSON.stringify((await pool.query('SELECT * FROM hero_auction_bot_settlements ORDER BY match_id')).rows);const client=await pool.connect();try{await assert.rejects(client.query(migration));await client.query('ROLLBACK')}finally{client.release()}assert.equal(await verifyBotEconomySchema(pool),true);assert.equal(await verifyBotIdleCancellationSchema(pool),true);assert.equal(JSON.stringify((await pool.query('SELECT * FROM hero_auction_bot_settlements ORDER BY match_id')).rows),before);});
 await check('schema prevents phantom idle refunds or rewards for both versions',async()=>{for(const r of [legacy,await fixture()]){await cancel(r);for(const column of ['gold','magic_dust'])await assert.rejects(pool.query(`UPDATE hero_auction_bot_settlements SET ${column}_amount=50,${column}_after=${column}_before+50 WHERE match_id=$1`,[r.botEntry.matchId]),e=>e.code==='23514');}});
 console.log(`PASS ${passed} PostgreSQL bot idle checks`);
}finally{await pool.end()}
