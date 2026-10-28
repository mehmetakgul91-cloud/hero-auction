import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DIAMOND_SIGNUP_BONUS,createDiamondSignupPolicy,registerDiamondMember} from '../diamond-signup-bonus.js';

const flags={HERO_DIAMONDS_ENABLED:'1',HERO_DIAMOND_SIGNUP_BONUS_ENABLED:'1'},policy=createDiamondSignupPolicy(flags);
// Isolated serialization/rollback model, never a real provider or production DB.
function fixture({gold=null,diamonds=null,profile=false,commander=false,admin=false,registration=null,receipt=null,failAt=null,missingTable=null,lostCommit=false,goldConflict=false,profileConflict=false}={}){
 const state={gold,diamonds,profile,commander,admin,registration,receipt};const queries=[];
 let lock=Promise.resolve(),releases=0,loseCommit=lostCommit;
 const database={async connect(){
  let staged,unlock;
  return{release(){releases++},async query(sql,args=[]){
   queries.push(sql);
   if(sql==='BEGIN')return{};
   if(sql==='ROLLBACK'){staged=null;unlock?.();unlock=null;return{}};
   if(sql==='COMMIT'){
    assert.ok(staged);Object.assign(state,staged);staged=null;unlock?.();unlock=null;
    if(loseCommit){loseCommit=false;throw Error('Lost COMMIT response')}
    return{};
   }
   if(sql.startsWith('SELECT pg_advisory_xact_lock')){
    const previous=lock;lock=new Promise(resolve=>{unlock=resolve});await previous;staged=structuredClone(state);return{};
   }
   assert.ok(staged,'account serialization precedes all registration operations');
   if(failAt&&sql.startsWith(failAt))throw Error('Injected persistence failure');
   if(missingTable&&sql.includes(missingTable))throw Object.assign(Error('missing table'),{code:'42P01'});
   if(sql.startsWith('SELECT provider,eligible'))return{rows:staged.registration?[structuredClone(staged.registration)]:[]};
   if(sql.startsWith('SELECT amount FROM'))return{rows:staged.receipt?[structuredClone(staged.receipt)]:[]};
   if(sql.startsWith('SELECT diamonds FROM'))return{rows:staged.diamonds===null?[]:[{diamonds:staged.diamonds}]};
   if(sql.startsWith('SELECT gold FROM'))return{rows:staged.gold===null?[]:[{gold:staged.gold}]};
   if(sql.startsWith('SELECT EXISTS'))return{rows:[{existing:staged.gold!==null||staged.profile||staged.commander||staged.admin}]};
   if(sql.startsWith('INSERT INTO hero_auction_user_profiles')){
    assert.match(sql,/VALUES\(\$1,'Oyuncu'\) ON CONFLICT DO NOTHING RETURNING account_id/);
    if(profileConflict){staged.profile=true;return{rows:[]}};
    if(staged.profile)return{rows:[]};staged.profile=true;return{rows:[{account_id:args[0]}]};
   }
   if(sql.startsWith('INSERT INTO hero_auction_wallets')){
    assert.match(sql,/VALUES\(\$1,500\) ON CONFLICT DO NOTHING RETURNING gold/);
    if(goldConflict){staged.gold=321;return{rows:[]}};
    if(staged.gold!==null)return{rows:[]};staged.gold=500;return{rows:[{gold:500}]};
   }
   if(sql.startsWith('INSERT INTO hero_auction_diamond_registrations')){
    assert.equal(staged.registration,null);staged.registration={provider:args[1],eligible:args[2]};return{};
   }
   if(sql.startsWith('INSERT INTO hero_auction_diamond_wallets')){
    assert.match(sql,/VALUES\(\$1,0\) ON CONFLICT DO NOTHING RETURNING diamonds/);
    if(staged.diamonds!==null)return{rows:[]};staged.diamonds=0;return{rows:[{diamonds:0}]};
   }
   if(sql.startsWith('UPDATE hero_auction_diamond_wallets')){
    assert.match(sql,/diamonds=diamonds\+10.*AND diamonds=0 RETURNING diamonds/);assert.equal(args.length,1);
    if(staged.diamonds!==0)return{rows:[]};staged.diamonds=10;return{rows:[{diamonds:10}]};
   }
   if(sql.startsWith('INSERT INTO hero_auction_diamond_signup_receipts')){
    assert.match(sql,/VALUES\(\$1,'signup_bonus',10,0,10\)/);assert.equal(args.length,1);assert.equal(staged.receipt,null);
    staged.receipt={amount:10};return{};
   }
   throw Error('Unexpected SQL '+sql);
  }};
 }};
 return{state,queries,releases:()=>releases,run:(extra={})=>registerDiamondMember({database,accountId:'verified-google-sub',provider:'google',policy,...extra})};
}

test('both flags must be exact1; disabled gift hook does not access the DB',async()=>{
 assert.equal(DIAMOND_SIGNUP_BONUS,10);
 for(const env of [{},{HERO_DIAMONDS_ENABLED:'1'},{HERO_DIAMOND_SIGNUP_BONUS_ENABLED:'1'},{...flags,HERO_DIAMONDS_ENABLED:1},{...flags,HERO_DIAMOND_SIGNUP_BONUS_ENABLED:'true'}]){
  const f=fixture();assert.deepEqual(await f.run({policy:createDiamondSignupPolicy(env)}),{enabled:false,eligible:false,awarded:0,replayed:false,reason:'disabled'});assert.equal(f.queries.length,0);
 }
});
test('new verified Google member receives fixed10 once with ordinary initial500 gold',async()=>{
 const f=fixture();const result=await f.run({amount:999999,diamonds:999999,verified:true});
 assert.deepEqual(result,{enabled:true,eligible:true,awarded:10,replayed:false,diamonds:10,reason:null});
 assert.equal(f.state.gold,500);assert.equal(f.state.diamonds,10);assert.deepEqual(f.state.registration,{provider:'google',eligible:true});assert.deepEqual(f.state.receipt,{amount:10});assert.equal(f.releases(),1);
});
test('only verified Google members qualify; even verified CrazyGames accounts and all guests are rejected',async()=>{
 for(const values of [{accountId:'crazygames:game-1:member_2',provider:'crazygames'},{accountId:'guest:random'},{accountId:'guest:random',provider:'crazygames'},{accountId:'crazygames:game:user',provider:'google'},{accountId:'raw-member',provider:'crazygames'},{provider:'guest'},{provider:'facebook'},{accountId:''},{accountId:null},{accountId:'id with spaces'}]){
  const f=fixture();await assert.rejects(f.run(values),e=>e.status===401);assert.equal(f.queries.length,0);
 }
});
for(const previous of [{gold:0},{gold:500},{profile:true},{commander:true},{admin:true},{gold:700,diamonds:123},{diamonds:0}])test(`existing account ${JSON.stringify(previous)} never gets retroactive gift`,async()=>{
 const f=fixture(previous);const before=structuredClone(f.state),result=await f.run();
 assert.equal(result.eligible,false);assert.equal(result.awarded,0);assert.equal(result.reason,'existing_account');
 assert.equal(f.state.gold,before.gold);assert.equal(f.state.diamonds,before.diamonds);assert.equal(f.state.receipt,null);assert.deepEqual(f.state.registration,{provider:'google',eligible:false});
 const repeated=await f.run();assert.equal(repeated.replayed,true);assert.equal(repeated.awarded,0);assert.equal(f.queries.some(q=>q.startsWith('UPDATE')),false);
});
test('concurrently-created old gold wallet is not overwritten or granted diamonds',async()=>{
 const f=fixture({goldConflict:true});const result=await f.run();assert.equal(result.eligible,false);assert.equal(result.awarded,0);assert.equal(f.state.gold,321);assert.equal(f.state.diamonds,null);assert.equal(f.state.receipt,null);
});
test('legacy profile insertion racing eligibility check prevents gift and new wallet creation',async()=>{
 const f=fixture({profileConflict:true});const result=await f.run();assert.equal(result.eligible,false);assert.equal(result.awarded,0);assert.equal(f.state.gold,null);assert.equal(f.state.diamonds,null);assert.equal(f.state.receipt,null);assert.equal(f.queries.some(q=>q.startsWith('INSERT INTO hero_auction_wallets')),false);
});
test('repeat, refresh-equivalent and concurrent first-logins grant one gift',async()=>{
 const f=fixture();const results=await Promise.all([f.run(),f.run(),f.run()]);
 assert.equal(results.filter(r=>r.awarded===10).length,1);assert.equal(results.filter(r=>r.replayed).length,2);assert.equal(f.state.diamonds,10);
 f.state.diamonds=0;const spentReplay=await f.run();assert.equal(spentReplay.awarded,0);assert.equal(spentReplay.diamonds,0);assert.equal(f.state.diamonds,0);
});
test('lost COMMIT retry finds account-primary-key receipt instead of minting again',async()=>{
 const f=fixture({lostCommit:true});await assert.rejects(f.run(),/Lost COMMIT/);assert.equal(f.state.diamonds,10);
 const replay=await f.run();assert.equal(replay.replayed,true);assert.equal(replay.awarded,0);assert.equal(f.state.diamonds,10);
});
for(const failAt of ['INSERT INTO hero_auction_user_profiles','INSERT INTO hero_auction_wallets','INSERT INTO hero_auction_diamond_registrations','INSERT INTO hero_auction_diamond_wallets','UPDATE hero_auction_diamond_wallets','INSERT INTO hero_auction_diamond_signup_receipts'])test(`failure at ${failAt} rolls back new-account/gift/receipt together`,async()=>{
 const f=fixture({failAt}),before=structuredClone(f.state);await assert.rejects(f.run(),/Injected persistence/);assert.deepEqual(f.state,before);assert.equal(f.releases(),1);assert.equal(f.queries.at(-1),'ROLLBACK');
});
for(const missingTable of ['hero_auction_diamond_registrations','hero_auction_diamond_signup_receipts','hero_auction_diamond_wallets'])test(`missing ${missingTable} fails before ANY wallet/profile write`,async()=>{
 const f=fixture({missingTable}),before=structuredClone(f.state);await assert.rejects(f.run(),e=>e.status===503);assert.deepEqual(f.state,before);assert.equal(f.queries.some(q=>q.startsWith('INSERT')||q.startsWith('UPDATE')),false);
});
test('incomplete receipts, mismatched provider and invalid balances never trigger recovery grants',async()=>{
 for(const config of [{registration:{provider:'google',eligible:true},receipt:null,gold:500,diamonds:10},{registration:{provider:'google',eligible:true},receipt:{amount:9},gold:500,diamonds:9},{registration:{provider:'crazygames',eligible:true},receipt:{amount:10},gold:500,diamonds:10},{registration:{provider:'google',eligible:false},receipt:{amount:10},gold:500,diamonds:10},{receipt:{amount:10},gold:500,diamonds:10},{gold:500,diamonds:-1}]){
  const f=fixture(config),before=structuredClone(f.state);await assert.rejects(f.run(),e=>e.status===503);assert.deepEqual(f.state,before);assert.equal(f.queries.some(q=>q.startsWith('UPDATE')),false);
 }
});
test('draft schema is fixed10 and unique per account; no backfill/mass grant or runtime migration',()=>{
 const sql=readFileSync(new URL('../migrations/003-diamond-signup-bonus.sql',import.meta.url),'utf8');
 const source=readFileSync(new URL('../diamond-signup-bonus.js',import.meta.url),'utf8');
 assert.match(sql,/account_id TEXT PRIMARY KEY REFERENCES hero_auction_diamond_registrations/);assert.match(sql,/CHECK\(amount=10\)/);assert.match(sql,/CHECK\(balance_before=0\)/);assert.match(sql,/CHECK\(balance_after=10\)/);
 assert.match(sql,/CHECK\(provider='google'\)/);
 assert.doesNotMatch(sql,/INSERT INTO|UPDATE hero_auction/);assert.doesNotMatch(source,/request\.|CREATE TABLE|readFile/);
});
