import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_ADMIN_CREDIT,isOwnerAdmin,createAdminWalletCreditPolicy,adminWalletCreditView,validateAdminWalletCreditRequest,creditAdminWallet,readAdminWalletCreditReceipt,readAdminWalletCredits,adminWalletCreditStorageReady,readAdminWalletBalances} from '../admin-wallet-credits.js';
const ownerEmail='owner@example.test',user={provider:'google',sub:'isolated-owner',email:ownerEmail};
const flags={HERO_ADMIN_WALLET_CREDITS_ENABLED:'1',HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1'},policy=createAdminWalletCreditPolicy(flags);
const request=(patch={})=>({requestId:'isolated-admin-credit-001',accountId:'isolated-player',currency:'diamonds',amount:17,reason:'Fixture owner correction',...patch});
// Deterministic transaction/lock model only, not a claim of real PostgreSQL QA.
function fixture({gold=500,diamonds=10,magicDust=20,failAt='',lostCommit=false,missingSchema=false}={}){
 const state={wallets:new Map([['isolated-player',{gold,diamonds,magicDust}],['other-player',{gold:200,diamonds:5,magicDust:4}]]),receipts:new Map()},queries=[],locks=new Map();
 let connections=0,releases=0,loseCommit=lostCommit;
 async function lock(key){let release;const previous=locks.get(key)||Promise.resolve(),pending=new Promise(resolve=>{release=resolve});locks.set(key,pending);await previous;return()=>{release();if(locks.get(key)===pending)locks.delete(key)}}
 function receiptQuery(sql,args){
  if(missingSchema)throw Object.assign(Error('Missing schema'),{code:'42P01'});
  if(sql.includes('LIMIT 0'))return{rows:[]};
  if(sql.includes('ORDER BY'))return{rows:[...state.receipts.values()].slice(0,args[0])};
  return{rows:state.receipts.has(args[0])?[structuredClone(state.receipts.get(args[0]))]:[]};
 }
 const database={async query(sql,args=[]){
  queries.push(sql);
  if(sql.includes('FROM hero_auction_admin_wallet_credits'))return receiptQuery(sql,args);
  const name=sql.includes('magic_dust')?'magicDust':'diamonds',column=name==='magicDust'?'magic_dust':name;
  return{rows:args[0].flatMap(id=>{const wallet=state.wallets.get(id);return wallet&&wallet[name]!==null?[{account_id:id,[column]:wallet[name]}]:[]})};
 },async connect(){connections++;let stagedWallets=new Map(),stagedReceipts=new Map(),unlock=[];
  const releaseLocks=()=>{for(const fn of unlock.reverse())fn();unlock=[]};
  return{release(){releases++},async query(sql,args=[]){
   queries.push(sql);
   if(sql==='BEGIN')return{};
   if(sql==='ROLLBACK'){stagedWallets.clear();stagedReceipts.clear();releaseLocks();return{}};
   if(sql==='COMMIT'){
    for(const [id,wallet]of stagedWallets)state.wallets.set(id,wallet);
    for(const [id,receipt]of stagedReceipts)state.receipts.set(id,receipt);
    stagedWallets.clear();stagedReceipts.clear();releaseLocks();
    if(loseCommit){loseCommit=false;throw Error('Injected lost COMMIT response')}return{};
   }
   if(failAt&&sql.startsWith(failAt))throw Error('Injected persistence failure');
   if(sql.startsWith('SELECT pg_advisory_xact_lock')){assert.match(sql,/1212236120,hashtext\(\$1\)/);unlock.push(await lock('receipt:'+args[0]));return{}};
   if(sql.includes('FROM hero_auction_admin_wallet_credits'))return receiptQuery(sql,args);
   if(sql==='SELECT gold FROM hero_auction_wallets WHERE account_id=$1 FOR UPDATE'){
    unlock.push(await lock('wallet:'+args[0]));const wallet=state.wallets.get(args[0]);
    if(wallet)stagedWallets.set(args[0],structuredClone(wallet));return{rows:wallet&&wallet.gold!==null?[{gold:wallet.gold}]:[]};
   }
   if(sql.startsWith('INSERT INTO hero_auction_admin_wallet_credits')){
    assert.equal(state.receipts.has(args[0])||stagedReceipts.has(args[0]),false);
    assert.equal(args[7],args[6]+args[4]);
    const row={request_id:args[0],account_id:args[1],actor_id:args[2],currency:args[3],amount:args[4],reason:args[5],balance_before:args[6],balance_after:args[7],created_at:'2026-10-27T00:00:00.000Z'};
    stagedReceipts.set(args[0],row);return{rows:[row]};
   }
   const wallet=stagedWallets.get(args[0]);assert.ok(wallet,'gold must be locked before any currency mutation');
   const name=sql.includes('magic_dust')?'magicDust':sql.includes('diamond')?'diamonds':'gold',column=name==='magicDust'?'magic_dust':name;
   if(sql.startsWith('INSERT INTO')){if(wallet[name]===null)wallet[name]=0;return{rows:[]}};
   if(sql.startsWith('SELECT'))return{rows:wallet[name]===null?[]:[{[column]:wallet[name]}]};
   if(sql.startsWith('UPDATE')){
    assert.match(sql,new RegExp(`SET ${column}=${column}\\+\\$2.*${column}<=\\$3 RETURNING ${column}`));
    if(wallet[name]>args[2])return{rows:[]};wallet[name]+=args[1];return{rows:[{[column]:wallet[name]}]};
   }
   throw Error('Unexpected SQL: '+sql);
  }};
 }};
 return{state,database,queries,connections:()=>connections,releases:()=>releases,run:(body=request(),options={})=>creditAdminWallet({database,user,ownerEmail,request:body,policy,...options})};
}

test('owner requires verified Google session identity and exact configured email',()=>{
 assert.equal(isOwnerAdmin(user,ownerEmail),true);assert.equal(isOwnerAdmin(user,' OWNER@EXAMPLE.TEST '),true);
 for(const value of [null,{}, {...user,provider:'guest'},{...user,provider:'crazygames'},{...user,provider:undefined},{...user,sub:'guest:123'},{...user,sub:'cg:123'},{...user,sub:''},{...user,sub:'bad subject'},{...user,email:'other@example.test'},{...user,email:'OWNER@EXAMPLE.TEST'}])assert.equal(isOwnerAdmin(value,ownerEmail),false);
 assert.equal(isOwnerAdmin(user,''),false);
});
test('dedicated flag defaults off and independently respects diamond/dust flags',()=>{
 assert.equal(MAX_ADMIN_CREDIT,1000000);
 for(const env of [{},{HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1'},{...flags,HERO_ADMIN_WALLET_CREDITS_ENABLED:'true'}])assert.equal(adminWalletCreditView(createAdminWalletCreditPolicy(env)).enabled,false);
 assert.deepEqual(createAdminWalletCreditPolicy({HERO_ADMIN_WALLET_CREDITS_ENABLED:'1'}).currencies,{gold:true,diamonds:false,magicDust:false});
 assert.equal(createAdminWalletCreditPolicy({...flags,HERO_DIAMONDS_ENABLED:'0'}).currencies.magicDust,false);
 assert.deepEqual(adminWalletCreditView(policy).currencies,{gold:{available:true,reason:null},diamonds:{available:true,reason:null},magicDust:{available:true,reason:null}});
});
test('invalid owner, disabled currency and malformed input never touch storage',async()=>{
 for(const patch of [{requestId:'short'},{requestId:'valid-request-id-001\n'},{requestId:'valid-request-id-001\r'},{requestId:'x'.repeat(101)},{accountId:''},{accountId:' spaced '},{currency:'__proto__'},{currency:['gold']},{currency:{toString:'gold'}},{currency:'magic_dust'},{amount:0},{amount:-1},{amount:1.1},{amount:'5'},{amount:NaN},{amount:Infinity},{amount:1000001},{reason:''},{reason:'ab'},{reason:'x'.repeat(301)},{reason:'bad\nreason'}]){
  const f=fixture();await assert.rejects(f.run(request(patch)),e=>e.status===400);assert.equal(f.connections(),0);
 }
 const f=fixture();await assert.rejects(f.run(request(),{user:{...user,provider:'crazygames'}}),e=>e.status===403);assert.equal(f.connections(),0);
 for(const p of [createAdminWalletCreditPolicy(),createAdminWalletCreditPolicy({HERO_ADMIN_WALLET_CREDITS_ENABLED:'1'})])await assert.rejects(f.run(request(),{policy:p}),e=>e.status===503);
 assert.equal(f.connections(),0);assert.equal(validateAdminWalletCreditRequest(request({reason:'  valid note  '})).reason,'valid note');
});
for(const name of ['gold','diamonds','magicDust'])test(`${name} grants preserve the other currencies and record exact movement`,async()=>{
 const f=fixture(),before=structuredClone(f.state.wallets.get('isolated-player')),result=await f.run(request({currency:name}));
 assert.deepEqual(f.state.wallets.get('isolated-player'),{...before,[name]:before[name]+17});
 assert.deepEqual(result.receipt,{requestId:'isolated-admin-credit-001',accountId:'isolated-player',actorId:'isolated-owner',currency:name,amount:17,reason:'Fixture owner correction',balanceBefore:before[name],balanceAfter:before[name]+17,createdAt:'2026-10-27T00:00:00.000Z'});
 assert.equal(result.replayed,false);assert.equal(f.state.receipts.size,1);assert.equal(f.releases(),1);
});
test('missing optional wallet starts at zero but no new player/gold wallet is created',async()=>{
 for(const name of ['diamonds','magicDust']){const f=fixture({[name]:null});const result=await f.run(request({currency:name}));assert.equal(result.receipt.balanceBefore,0);assert.equal(f.state.wallets.get('isolated-player')[name],17)}
 const f=fixture();await assert.rejects(f.run(request({accountId:'unknown'})),e=>e.status===404);assert.equal(f.state.wallets.has('unknown'),false);assert.equal(f.state.receipts.size,0);
});
test('same key concurrent retries grant once and cross-account key reuse conflicts',async()=>{
 const f=fixture(),results=await Promise.all(Array.from({length:12},()=>f.run()));
 assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal(f.state.wallets.get('isolated-player').diamonds,27);assert.equal(f.state.receipts.size,1);
 const before=structuredClone(f.state);
 for(const patch of [{accountId:'other-player'},{currency:'gold'},{amount:18},{reason:'different reason'}])await assert.rejects(f.run(request(patch)),e=>e.status===409);
 await assert.rejects(f.run(request(),{user:{...user,sub:'other-owner'}}),e=>e.status===409);
 assert.deepEqual(f.state,before);
});
test('simultaneous same key targeting two accounts has one winner, never two grants',async()=>{
 const f=fixture(),results=await Promise.allSettled([f.run(),f.run(request({accountId:'other-player'}))]);
 assert.deepEqual(results.map(r=>r.status).sort(),['fulfilled','rejected']);assert.equal(f.state.receipts.size,1);
 assert.equal(f.state.wallets.get('isolated-player').diamonds+f.state.wallets.get('other-player').diamonds,32);
});
test('distinct credits serialize on wallet without losing updates or overwriting other currencies',async()=>{
 const f=fixture();await Promise.all(Array.from({length:18},(_,i)=>f.run(request({requestId:'isolated-concurrent-'+String(i).padStart(3,'0'),currency:['gold','diamonds','magicDust'][i%3]}))));
 assert.deepEqual(f.state.wallets.get('isolated-player'),{gold:602,diamonds:112,magicDust:122});assert.equal(f.state.receipts.size,18);
});
for(const prefix of ['INSERT INTO hero_auction_diamond_wallets','UPDATE hero_auction_diamond_wallets','INSERT INTO hero_auction_admin_wallet_credits'])test(prefix+' failure rolls back wallet and audit together',async()=>{
 const f=fixture({failAt:prefix}),before=structuredClone(f.state);await assert.rejects(f.run(),/Injected persistence/);assert.deepEqual(f.state,before);assert.equal(f.releases(),1);
});
test('lost COMMIT is explicitly uncertain; same-key recovery returns original receipt without another credit',async()=>{
 const f=fixture({lostCommit:true});await assert.rejects(f.run(),e=>e.status===503&&e.uncertain&&e.requestId==='isolated-admin-credit-001');
 assert.equal(f.state.wallets.get('isolated-player').diamonds,27);
 await f.run(request({requestId:'isolated-admin-credit-002',amount:1}));
 const retry=await f.run();assert.equal(retry.replayed,true);assert.equal(retry.receipt.balanceAfter,27);assert.equal(f.state.wallets.get('isolated-player').diamonds,28);assert.equal(f.state.receipts.size,2);
 const result=await readAdminWalletCreditReceipt({database:f.database,user,ownerEmail,requestId:request().requestId});assert.deepEqual(result.receipt,retry.receipt);
});
test('overflow and corrupt balances fail closed; exact integer ceiling and amount bound accepted',async()=>{
 const f=fixture({diamonds:2147483640}),before=structuredClone(f.state);await assert.rejects(f.run(),e=>e.status===409);assert.deepEqual(f.state,before);
 const exact=fixture({diamonds:2147483630});assert.equal((await exact.run()).receipt.balanceAfter,2147483647);
 const max=fixture({gold:0});assert.equal((await max.run(request({currency:'gold',amount:1000000}))).receipt.balanceAfter,1000000);
 for(const value of [-1,Infinity,NaN,'',1.1,2147483648]){const bad=fixture({diamonds:value});await assert.rejects(bad.run(),e=>e.status===503);assert.equal(bad.state.wallets.get('isolated-player').gold,500);assert.equal(bad.state.receipts.size,0)}
});
test('missing schema is safe unavailable and preflight never mutates',async()=>{
 const f=fixture({missingSchema:true});await assert.rejects(f.run(),e=>e.status===503&&/altyapısı/.test(e.message));assert.equal(await adminWalletCreditStorageReady(f.database),false);assert.equal(await adminWalletCreditStorageReady(null),false);
 const good=fixture();assert.equal(await adminWalletCreditStorageReady(good.database),true);assert.equal(good.connections(),0);assert.equal(good.queries.length,1);assert.match(good.queries[0],/LIMIT 0$/);
});
test('receipt/history read paths are owner-only, bounded and never mutate',async()=>{
 const f=fixture();await f.run();const before=structuredClone(f.state);
 const options={database:f.database,user,ownerEmail};
 assert.equal((await readAdminWalletCredits(options)).credits.length,1);
 assert.deepEqual(await readAdminWalletCreditReceipt({...options,requestId:'not-a-record-id-0001'}),{receipt:null});
 await assert.rejects(readAdminWalletCreditReceipt({...options,user:{...user,provider:'guest'},requestId:request().requestId}),e=>e.status===403);
 await assert.rejects(readAdminWalletCredits({...options,limit:101}),e=>e.status===400);
 assert.deepEqual(f.state,before);
});
test('batch balance read respects game flags independently of grant switch; unavailable is not zero',async()=>{
 const f=fixture({magicDust:null});
 const result=await readAdminWalletBalances(f.database,['isolated-player','other-player'],createAdminWalletCreditPolicy({...flags,HERO_ADMIN_WALLET_CREDITS_ENABLED:'0'}));
 assert.deepEqual(result.byAccount,{'isolated-player':{diamonds:10,magicDust:0},'other-player':{diamonds:5,magicDust:4}});
 assert.equal(result.currencies.diamonds.available,true);
 const disabled=await readAdminWalletBalances(f.database,['isolated-player']);assert.deepEqual(disabled.byAccount['isolated-player'],{diamonds:null,magicDust:null});assert.equal(disabled.currencies.diamonds.reason,'disabled');
 const unavailable=await readAdminWalletBalances({query:async()=>{throw Error('offline')}},['isolated-player'],policy);assert.deepEqual(unavailable.byAccount['isolated-player'],{diamonds:null,magicDust:null});assert.equal(unavailable.currencies.magicDust.reason,'storage_unavailable');
});
test('additive migration stores globally unique complete audit, no history backfill or wallet rewrite',()=>{
 const sql=readFileSync(new URL('../migrations/006-admin-wallet-credits.sql',import.meta.url),'utf8');
 assert.match(sql,/request_id VARCHAR\(100\) PRIMARY KEY/);assert.match(sql,/REFERENCES hero_auction_wallets/);assert.match(sql,/amount BETWEEN 1 AND 1000000/);assert.match(sql,/balance_after::bigint=balance_before::bigint\+amount::bigint/);
 assert.doesNotMatch(sql,/\bUPDATE\b|\bINSERT\b|\bDELETE\b|\bALTER\b/);
});
