// Exact disposable loopback fixture only. Never connects with production credentials.
import assert from 'node:assert/strict';
import pg from 'pg';
import {cancelPaidMatches,cancellationCandidate,cancellationReceiptKey} from '../paid-match-cancellation.js';
const expected='postgresql://test:test@127.0.0.1:55432/hero_admin_cancel_test';
if(process.env.HERO_ADMIN_CANCEL_TEST_DB!==expected||Object.keys(process.env).some(k=>k==='DATABASE_URL'||/^PG[A-Z_]*$/.test(k)))throw Error('Exact disposable cancellation fixture required; ambient credentials refused');
const schema='hero_admin_cancel_fixture';
const pool=new pg.Pool({host:'127.0.0.1',port:55432,user:'test',password:'test',database:'hero_admin_cancel_test',ssl:false,max:8,connectionTimeoutMillis:5000,query_timeout:15000,options:`-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=5000`});
let groups=0;
const check=async(name,fn)=>{await fn();groups++;console.log('PASS '+name)};
const room=(index)=>({code:String(101+index),created:1000+index,matchNumber:1,phase:'finished',mode:'friend',entryPaid:true,matchSettled:false,battleSettlementPending:true,battleSync:{key:'1:'+(1000+index),result:null,ready:[null,null]},players:[0,1].map(seat=>({accountId:'cancel-fixture-'+index+'-'+seat,team:[]})),history:[{text:'kept'}],series:[4,2],lastActivity:2000});
const q=(sql,args=[])=>pool.query(sql,args);
async function fixture(){
 await q('TRUNCATE hero_auction_wallets,hero_auction_gold_awards,hero_auction_admin_audit,hero_auction_rooms,hero_auction_social');
 const rooms=[0,1,2,3].map(room),plans=new Map(rooms.map(r=>{const p=cancellationCandidate(r,r);return[p.id,p]})),selections=[...plans.values()].map(({id,digest})=>({id,digest}));
 for(const r of rooms){await q('INSERT INTO hero_auction_rooms(code,state) VALUES($1,$2)',[r.code,r]);for(const p of r.players)await q('INSERT INTO hero_auction_wallets VALUES($1,450)',[p.accountId]);}
 await q('INSERT INTO hero_auction_social VALUES($1,$2)',['economy-maintenance',{version:1,paused:true,revision:1,uncertainLegacyEntry:false}]);
 return{rooms,plans,selections};
}
const snapshot=async()=>({wallets:(await q('SELECT * FROM hero_auction_wallets ORDER BY account_id')).rows,rooms:(await q('SELECT * FROM hero_auction_rooms ORDER BY code')).rows,awards:(await q('SELECT * FROM hero_auction_gold_awards ORDER BY award_id')).rows,audits:(await q('SELECT account_id,actor_id,action,old_gold,new_gold FROM hero_auction_admin_audit ORDER BY id')).rows});
const run=(f,n,database=pool)=>cancelPaidMatches({database,plans:f.plans,selections:f.selections.slice(0,n),actorId:'synthetic-admin',expectedRevision:1,now:()=>5000});
try{
 const i=(await q("SELECT current_database() db,current_user role,inet_server_port() port,current_setting('server_version_num') version")).rows[0];
 assert.equal(i.db,'hero_admin_cancel_test');assert.equal(i.role,'test');assert.ok([5432,55432].includes(i.port));assert.ok(Number(i.version)>=180000&&Number(i.version)<190000);
 assert.equal((await q('SELECT to_regnamespace($1) name',[schema])).rows[0].name,null,'Fixture schema must be absent; no reset of an unknown database');
 await q(`CREATE SCHEMA ${schema}; CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL CHECK(gold>=0)); CREATE TABLE hero_auction_gold_awards(award_id TEXT PRIMARY KEY,account_id TEXT NOT NULL,amount INTEGER NOT NULL); CREATE TABLE hero_auction_admin_audit(id BIGSERIAL PRIMARY KEY,account_id TEXT,actor_id TEXT,action TEXT,old_gold INTEGER,new_gold INTEGER); CREATE TABLE hero_auction_rooms(code VARCHAR(3) PRIMARY KEY,state JSONB NOT NULL,updated_at TIMESTAMPTZ DEFAULT NOW()); CREATE TABLE hero_auction_social(id TEXT PRIMARY KEY,state JSONB NOT NULL);`);
 for(const n of [1,2,3]){
  const f=await fixture();
  await check(n+' explicitly selected rooms refund exactly two paid seats each and preserve all others',async()=>{
   const outcome=await run(f,n);assert.equal(outcome.result.refundGold,n*100);assert.equal(outcome.rooms.length,n);
   const s=await snapshot();assert.equal(s.awards.length,n*2);assert.equal(s.audits.length,n*2);
   for(let index=0;index<4;index++){
    const stored=s.rooms.find(x=>x.code===f.rooms[index].code).state;
    if(index<n){assert.equal(stored.matchSettled,true);assert.equal(stored.goldRefunds.length,2);assert.deepEqual(stored.history,f.rooms[index].history);assert.deepEqual(stored.series,f.rooms[index].series);assert.equal(stored.battleSync.result,null);}
    else assert.deepEqual(stored,f.rooms[index]);
    for(const p of f.rooms[index].players)assert.equal(s.wallets.find(w=>w.account_id===p.accountId).gold,index<n?500:450);
   }
  });
  await check(n+' room receipt replay keeps canonical keys, audit and balances unchanged',async()=>{
   const before=await snapshot(),outcome=await run(f,n);assert.equal(outcome.result.replayed,true);assert.equal(outcome.result.refundGold,n*100);assert.deepEqual(await snapshot(),before);
   const receipt=(await q('SELECT state FROM hero_auction_social WHERE id=$1',[cancellationReceiptKey(f.selections.slice(0,n))])).rows[0].state;assert.equal(receipt.rooms.length,n);assert.equal(receipt.version,1);
  });
 }
 await check('eight concurrent single-room requests produce only one durable refund',async()=>{
  const f=await fixture(),results=await Promise.all(Array.from({length:8},()=>run(f,1)));assert.equal(results.filter(x=>!x.result.replayed).length,1);const s=await snapshot();assert.equal(s.awards.length,2);assert.equal(s.audits.length,2);
 });
 await check('lost COMMIT response is reconciled by same single-room receipt without a second refund',async()=>{
  const f=await fixture();let lose=true;
  const database={async connect(){const c=await pool.connect();return{release:()=>c.release(),async query(...args){const result=await c.query(...args);if(args[0]==='COMMIT'&&lose){lose=false;throw Error('Injected reply loss after durable commit')}return result}}}};
  await assert.rejects(run(f,1,database),e=>e.uncertain===true);const before=await snapshot();assert.equal((await run(f,1)).result.replayed,true);assert.deepEqual(await snapshot(),before);
 });
 await check('audit failure rolls back single-room wallet, room and award changes atomically',async()=>{
  const f=await fixture(),before=await snapshot();await q(`CREATE FUNCTION reject_cancel_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit fault'; END $$; CREATE TRIGGER reject_cancel_audit BEFORE INSERT ON hero_auction_admin_audit FOR EACH ROW EXECUTE FUNCTION reject_cancel_audit();`);
  try{await assert.rejects(run(f,1),e=>e.code==='P0001');assert.deepEqual(await snapshot(),before);}finally{await q('DROP TRIGGER reject_cancel_audit ON hero_auction_admin_audit; DROP FUNCTION reject_cancel_audit()');}
 });
 console.log('PASS '+groups+' real PostgreSQL bounded cancellation groups; only synthetic fixture data changed.');
}catch(error){console.error(error);process.exitCode=1}finally{await pool.end()}
