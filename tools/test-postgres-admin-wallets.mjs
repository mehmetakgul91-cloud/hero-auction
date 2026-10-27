// Disposable PostgreSQL18 only. Never falls back to production configuration.
// Creates an absent dedicated fixture schema; never resets/drops existing data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createAdminWalletCreditPolicy,creditAdminWallet,readAdminWalletCreditReceipt,readAdminWalletCredits,adminWalletCreditStorageReady,readAdminWalletBalances} from '../admin-wallet-credits.js';
import {createCommanderProfile,commanderUpgradeCost} from '../arena-commanders.js';
import {createDiamondPolicy,diamondUpgradeCost,upgradeCommanderWithDiamonds} from '../paid-diamonds.js';
import {createMagicDustPolicy,magicDustUpgradeCost} from '../magic-dust.js';
import {createDiamondExchangePolicy,exchangeDiamondsForGold} from '../paid-diamond-exchange.js';

const APPROVED='postgresql://test:test@127.0.0.1:55432/hero_admin_test';
if(process.env.HERO_ADMIN_TEST_DB!==APPROVED||process.env.DATABASE_URL){
 console.error('REFUSED: exact dedicated loopback HERO_ADMIN_TEST_DB required, with no DATABASE_URL. No connection attempted.');process.exit(1);
}
const SCHEMA='hero_admin_wallet_test';
const pool=new pg.Pool({host:'127.0.0.1',port:55432,database:'hero_admin_test',user:'test',password:'test',ssl:false,max:20,
 connectionTimeoutMillis:5000,idleTimeoutMillis:1000,application_name:'hero-disposable-admin-wallet-test',
 options:`-c search_path=${SCHEMA} -c statement_timeout=15000 -c lock_timeout=10000`});
const ownerEmail='fixture-owner@example.test',user={provider:'google',sub:'fixture-owner',email:ownerEmail};
const flags={HERO_ADMIN_WALLET_CREDITS_ENABLED:'1',HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1',HERO_DIAMOND_EXCHANGE_ENABLED:'1'};
const policy=createAdminWalletCreditPolicy(flags);
const query=(sql,args=[])=>pool.query(sql,args);
let checks=0,sequence=0;
const req=(accountId,patch={})=>({requestId:'pg-admin-credit-'+String(++sequence).padStart(6,'0'),accountId,currency:'diamonds',amount:17,reason:'Disposable fixture correction',...patch});
const credit=(request,database=pool,extra={})=>creditAdminWallet({database,user,ownerEmail,request,policy,...extra});
async function check(label,run){await run();checks++;console.log('PASS '+label)}
async function member(id,{gold=100000,diamonds=100,magicDust=100,level=20}={}){
 await query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,$2)',[id,gold]);
 await query('INSERT INTO hero_auction_user_profiles(account_id,display_name) VALUES($1,$2)',[id,'Disposable fixture']);
 if(diamonds!==null)await query('INSERT INTO hero_auction_diamond_wallets(account_id,diamonds) VALUES($1,$2)',[id,diamonds]);
 if(magicDust!==null)await query('INSERT INTO hero_auction_magic_dust_wallets(account_id,magic_dust) VALUES($1,$2)',[id,magicDust]);
 const profile=createCommanderProfile('attack');profile.levels.attack=level;
 await query('INSERT INTO hero_auction_commanders(account_id,profile) VALUES($1,$2::jsonb)',[id,JSON.stringify(profile)]);
}
async function snapshot(id){return(await query(`SELECT w.gold,d.diamonds,m.magic_dust AS "magicDust",
 (SELECT count(*)::int FROM hero_auction_admin_wallet_credits a WHERE a.account_id=w.account_id) AS credits
 FROM hero_auction_wallets w LEFT JOIN hero_auction_diamond_wallets d USING(account_id) LEFT JOIN hero_auction_magic_dust_wallets m USING(account_id) WHERE w.account_id=$1`,[id])).rows[0]}
async function migration(source){const client=await pool.connect();try{await client.query(source)}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
async function rejectSQL(code,sql,args=[]){const client=await pool.connect();try{await client.query('BEGIN');await assert.rejects(client.query(sql,args),error=>error.code===code)}finally{await client.query('ROLLBACK');client.release()}}
function loseCommit(){let armed=true;return{async connect(){const client=await pool.connect();return{release:()=>client.release(),async query(...args){const result=await client.query(...args);if(args[0]==='COMMIT'&&armed){armed=false;throw Error('Injected lost COMMIT response')}return result}}}}}
async function rejectWrite(table,event,id,run){
 assert.ok(['hero_auction_admin_wallet_credits','hero_auction_diamond_wallets'].includes(table));assert.ok(['INSERT','UPDATE'].includes(event));assert.match(id,/^[a-z0-9-]+$/);
 await query(`CREATE FUNCTION fixture_reject_credit_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated wallet write fault'; END $$;
 CREATE TRIGGER fixture_credit_failure BEFORE ${event} ON ${table} FOR EACH ROW WHEN (NEW.account_id='${id}') EXECUTE FUNCTION fixture_reject_credit_write();`);
 try{await run()}finally{await query(`DROP TRIGGER fixture_credit_failure ON ${table}; DROP FUNCTION fixture_reject_credit_write();`)}
}
try{
 const identity=(await query("SELECT current_database() AS db,current_user AS role,inet_server_port() AS port,current_setting('server_version_num') AS version")).rows[0];
 assert.equal(identity.db,'hero_admin_test');assert.equal(identity.role,'test');assert.equal(identity.port,55432);assert.ok(Number(identity.version)>=180000&&Number(identity.version)<190000);
 assert.equal((await query('SELECT to_regnamespace($1) AS name',[SCHEMA])).rows[0].name,null,'REFUSED: fixture schema already exists; no reset/drop attempted');
 await query('CREATE SCHEMA hero_admin_wallet_test');
 assert.equal((await query('SELECT current_schema() AS name')).rows[0].name,SCHEMA);
 console.log('Verified disposable PostgreSQL '+identity.version+' / '+SCHEMA+'; no production configuration used.');
 await query(`CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0));
 CREATE TABLE hero_auction_user_profiles(account_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE hero_auction_commanders(account_id TEXT PRIMARY KEY,profile JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
 const files=await Promise.all(['001-paid-diamonds-foundation.sql','002-diamond-exchange.sql','003-diamond-signup-bonus.sql','004-login-rewards.sql','005-victory-chests-magic-dust.sql','006-admin-wallet-credits.sql'].map(name=>readFile(new URL('../migrations/'+name,import.meta.url),'utf8')));
 for(const source of files)await migration(source);
 await check('additive migration applies and preflight verifies expected columns',async()=>{
  assert.equal(await adminWalletCreditStorageReady(pool),true);
  const constraints=(await query("SELECT c.contype,c.convalidated,c.conenforced FROM pg_constraint c WHERE c.conrelid='hero_auction_admin_wallet_credits'::regclass")).rows;
  assert.ok(constraints.some(row=>row.contype==='p'));assert.ok(constraints.some(row=>row.contype==='f'));assert.ok(constraints.every(row=>row.convalidated&&row.conenforced));
 });
 await check('12 simultaneous same-key retries grant exactly once',async()=>{
  await member('pgwallet-replay');const request=req('pgwallet-replay'),results=await Promise.all(Array.from({length:12},()=>credit(request)));
  assert.equal(results.filter(result=>!result.replayed).length,1);assert.deepEqual(await snapshot('pgwallet-replay'),{gold:100000,diamonds:117,magicDust:100,credits:1});
  assert.ok(results.every(result=>result.receipt.requestId===request.requestId));
 });
 await check('global key conflict across accounts, currencies, actors and payload is safe',async()=>{
  await member('pgwallet-key-a');await member('pgwallet-key-b');const request=req('pgwallet-key-a');
  const outcomes=await Promise.allSettled([credit(request),credit({...request,accountId:'pgwallet-key-b'})]);
  assert.deepEqual(outcomes.map(value=>value.status).sort(),['fulfilled','rejected']);
  const receipt=(await readAdminWalletCreditReceipt({database:pool,user,ownerEmail,requestId:request.requestId})).receipt;
  const winner={...request,accountId:receipt.accountId},before=await snapshot(receipt.accountId);
  for(const patch of [{amount:18},{reason:'Different fixture reason'},{currency:'gold'}])await assert.rejects(credit({...winner,...patch}),error=>error.status===409);
  await assert.rejects(credit(winner,pool,{user:{...user,sub:'different-owner'}}),error=>error.status===409);
  assert.deepEqual(await snapshot(receipt.accountId),before);
  assert.equal((await snapshot('pgwallet-key-a')).diamonds+(await snapshot('pgwallet-key-b')).diamonds,217);
 });
 await check('three currencies stay separate and absent optional wallets start at zero',async()=>{
  await member('pgwallet-separate',{diamonds:null,magicDust:null});
  for(const currency of ['gold','diamonds','magicDust'])await credit(req('pgwallet-separate',{currency}));
  assert.deepEqual(await snapshot('pgwallet-separate'),{gold:100017,diamonds:17,magicDust:17,credits:3});
  const before=(await query('SELECT count(*)::int AS count FROM hero_auction_wallets')).rows[0].count;
  await assert.rejects(credit(req('pgwallet-does-not-exist')),error=>error.status===404);
  assert.equal((await query('SELECT count(*)::int AS count FROM hero_auction_wallets')).rows[0].count,before);
 });
 await check('credits race safely with commander upgrades and diamond exchange',async()=>{
  const id='pgwallet-accounting';await member(id);const goldBefore=100000;
  const upgrade=upgradeCommanderWithDiamonds({database:pool,accountId:id,policy:createDiamondPolicy(flags),magicDustPolicy:createMagicDustPolicy(flags),request:{requestId:'pgwallet-upgrade-0001',commanderId:'attack',stat:'attack',expectedCurrentLevel:20}});
  const exchange=exchangeDiamondsForGold({database:pool,accountId:id,policy:createDiamondExchangePolicy(flags),request:{requestId:'pgwallet-exchange-0001',diamondsToSpend:3,expectedRate:500,pricingVersion:'diamonds-to-gold-500-v1'}});
  await Promise.all([upgrade,exchange,...['gold','diamonds','magicDust'].map(currency=>credit(req(id,{currency})))]);
  assert.deepEqual(await snapshot(id),{gold:goldBefore-commanderUpgradeCost(20)+1500+17,diamonds:100-diamondUpgradeCost(20)-3+17,magicDust:100-magicDustUpgradeCost(20)+17,credits:3});
  const ledger=(await query('SELECT delta FROM hero_auction_diamond_ledger WHERE account_id=$1',[id])).rows;
  assert.deepEqual(ledger,[{delta:-diamondUpgradeCost(20)}]);
 });
 await check('distinct concurrent credits do not lose increments',async()=>{
  const id='pgwallet-concurrent';await member(id);await Promise.all(Array.from({length:18},(_,i)=>credit(req(id,{currency:['gold','diamonds','magicDust'][i%3]}))));
  assert.deepEqual(await snapshot(id),{gold:100102,diamonds:202,magicDust:202,credits:18});
 });
 await check('real SQL write faults roll back optional wallet creation, movement and audit',async()=>{
  await member('pgwallet-audit-fail',{diamonds:null});const before=await snapshot('pgwallet-audit-fail');
  await rejectWrite('hero_auction_admin_wallet_credits','INSERT','pgwallet-audit-fail',async()=>{await assert.rejects(credit(req('pgwallet-audit-fail')),/isolated wallet write fault/)});
  assert.deepEqual(await snapshot('pgwallet-audit-fail'),before);
  await member('pgwallet-update-fail');const updateBefore=await snapshot('pgwallet-update-fail');
  await rejectWrite('hero_auction_diamond_wallets','UPDATE','pgwallet-update-fail',async()=>{await assert.rejects(credit(req('pgwallet-update-fail')),/isolated wallet write fault/)});
  assert.deepEqual(await snapshot('pgwallet-update-fail'),updateBefore);
 });
 await check('lost COMMIT response reconciles with same immutable receipt, no second grant',async()=>{
  await member('pgwallet-uncertain');const request=req('pgwallet-uncertain');
  await assert.rejects(credit(request,loseCommit()),error=>error.status===503&&error.uncertain);
  assert.equal((await snapshot(request.accountId)).diamonds,117);
  const receipt=(await readAdminWalletCreditReceipt({database:pool,user,ownerEmail,requestId:request.requestId})).receipt;
  assert.equal(receipt.balanceBefore,100);assert.equal(receipt.balanceAfter,117);
  await credit(req(request.accountId,{amount:1}));const retried=await credit(request);
  assert.equal(retried.replayed,true);assert.deepEqual(retried.receipt,receipt);assert.equal((await snapshot(request.accountId)).diamonds,118);
 });
 await check('database enforces positive integer amount, currency, bounds, target and accounting equation',async()=>{
  const sql='INSERT INTO hero_auction_admin_wallet_credits(request_id,account_id,actor_id,currency,amount,reason,balance_before,balance_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8)';
  const base=['pgwallet-invalid-001','pgwallet-replay',user.sub,'gold',5,'Constraint fixture',10,15];
  for(const [index,value]of [[0,'short'],[0,'pgwallet-invalid-001\n'],[3,'cash'],[4,0],[4,-1],[4,1000001],[5,'ab'],[6,-1],[7,14]]){const args=[...base];args[index]=value;await rejectSQL('23514',sql,args)}
  const missing=[...base];missing[1]='missing-fixture-account';await rejectSQL('23503',sql,missing);
  await member('pgwallet-ceiling',{diamonds:2147483647});const before=await snapshot('pgwallet-ceiling');
  await assert.rejects(credit(req('pgwallet-ceiling',{amount:1})),error=>error.status===409);assert.deepEqual(await snapshot('pgwallet-ceiling'),before);
 });
 await check('owner checks and disabled features reject without state change; reads reconcile while disabled',async()=>{
  const before=await snapshot('pgwallet-replay');
  await assert.rejects(credit(req('pgwallet-replay'),pool,{user:{...user,provider:'crazygames'}}),error=>error.status===403);
  await assert.rejects(credit(req('pgwallet-replay'),pool,{policy:createAdminWalletCreditPolicy()}),error=>error.status===503);
  const history=await readAdminWalletCredits({database:pool,user,ownerEmail});assert.ok(history.credits.length>0&&history.credits.length<=100);
  const balances=await readAdminWalletBalances(pool,['pgwallet-replay'],createAdminWalletCreditPolicy({...flags,HERO_ADMIN_WALLET_CREDITS_ENABLED:'0'}));
  assert.equal(balances.byAccount['pgwallet-replay'].diamonds,117);assert.deepEqual(await snapshot('pgwallet-replay'),before);
 });
 await check('reapplying additive migration preserves every wallet and financial receipt',async()=>{
  const wallets=(await query('SELECT * FROM hero_auction_wallets ORDER BY account_id')).rows,receipts=(await query('SELECT * FROM hero_auction_admin_wallet_credits ORDER BY request_id')).rows;
  await migration(files.at(-1));assert.deepEqual((await query('SELECT * FROM hero_auction_wallets ORDER BY account_id')).rows,wallets);assert.deepEqual((await query('SELECT * FROM hero_auction_admin_wallet_credits ORDER BY request_id')).rows,receipts);
 });
 console.log(`PASS ${checks} real PostgreSQL admin-wallet checks. Fixture schema retained for inspection: ${SCHEMA}.`);
}catch(error){console.error(error);process.exitCode=1}finally{await pool.end()}
