import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APPROVED_DIAMOND_EXCHANGE_CONFIG,createDiamondExchangePolicy,diamondExchangeView,exchangeDiamondsForGold} from '../paid-diamond-exchange.js';

const flags={HERO_DIAMONDS_ENABLED:'1',HERO_DIAMOND_EXCHANGE_ENABLED:'1'};
const policy=createDiamondExchangePolicy(flags);
const request=(extra={})=>({requestId:'isolated-exchange-0001',diamondsToSpend:10,expectedRate:500,pricingVersion:'diamonds-to-gold-500-v1',...extra});
// Isolated SQL transaction/row-lock model. No production data, real credits or
// live migration execution. Tests verify code paths, not PostgreSQL deployment.
function fixture({gold=1000,diamonds=20,failAt=null,missingSchema=false,lostCommit=false}={}){
 const state={gold,diamonds,receipts:new Map()};const queries=[];
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
   assert.equal(args[0],'isolated-account');
   if(sql==='SELECT gold FROM hero_auction_wallets WHERE account_id=$1 FOR UPDATE'){
    const previous=lock;lock=new Promise(resolve=>{unlock=resolve});await previous;
    staged=structuredClone(state);return{rows:staged.gold===null?[]:[{gold:staged.gold}]};
   }
   assert.ok(staged,'account gold row lock must precede other wallet/receipt actions');
   if(failAt&&sql.startsWith(failAt))throw Error('Injected persistence failure');
   if(sql.startsWith('SELECT diamonds_spent')){
    if(missingSchema)throw Object.assign(Error('missing relation'),{code:'42P01'});
    return{rows:staged.receipts.has(args[1])?[staged.receipts.get(args[1])]:[]};
   }
   if(sql.startsWith('SELECT diamonds FROM'))return{rows:staged.diamonds===null?[]:[{diamonds:staged.diamonds}]};
   if(sql.startsWith('UPDATE hero_auction_diamond_wallets')){
    assert.match(sql,/diamonds=diamonds-\$2.*diamonds>=\$2 RETURNING diamonds/);
    if(staged.diamonds<args[1])return{rows:[]};staged.diamonds-=args[1];return{rows:[{diamonds:staged.diamonds}]};
   }
   if(sql.startsWith('UPDATE hero_auction_wallets')){
    assert.match(sql,/gold=gold\+\$2.*gold<=\$3 RETURNING gold/);
    if(staged.gold>args[2])return{rows:[]};staged.gold+=args[1];return{rows:[{gold:staged.gold}]};
   }
   if(sql.startsWith('INSERT INTO hero_auction_diamond_exchanges')){
    assert.equal(staged.receipts.has(args[1]),false);
    assert.equal(args[3],args[2]*args[4]);assert.equal(args[7],args[6]-args[2]);assert.equal(args[9],args[8]+args[3]);
    assert.ok(args[7]>=0&&args[9]<=2147483647);
    staged.receipts.set(args[1],{diamonds_spent:args[2],gold_granted:args[3],exchange_rate:args[4],pricing_version:args[5],diamond_balance_before:args[6],diamond_balance_after:args[7],gold_balance_before:args[8],gold_balance_after:args[9]});return{};
   }
   throw Error('Unexpected SQL: '+sql);
  }};
 }};
 return{state,queries,releases:()=>releases,run:(body=request(),p=policy,accountId='isolated-account')=>exchangeDiamondsForGold({database,accountId,request:body,policy:p})};
}

test('both flags opt in exactly; approved 1 diamond → 500 gold is not activation',()=>{
 assert.deepEqual(APPROVED_DIAMOND_EXCHANGE_CONFIG,{rate:500,version:'diamonds-to-gold-500-v1'});
 for(const env of [{},{HERO_DIAMONDS_ENABLED:'1'},{HERO_DIAMOND_EXCHANGE_ENABLED:'1'},{...flags,HERO_DIAMOND_EXCHANGE_ENABLED:'true'},{...flags,HERO_DIAMONDS_ENABLED:1}]){
  const p=createDiamondExchangePolicy(env);assert.equal(p.enabled,false);assert.equal(diamondExchangeView(p).available,false);assert.equal(diamondExchangeView(p).reason,'disabled');
 }
 assert.deepEqual(diamondExchangeView(policy),{enabled:true,available:true,rate:500,pricingVersion:'diamonds-to-gold-500-v1',reason:null});
});
test('unconfigured or invalid rate is unavailable, never a zero-cost fallback',async()=>{
 for(const config of [null,{}, {rate:0,version:'v1'},{rate:-1,version:'v1'},{rate:1.5,version:'v1'},{rate:2147483648,version:'v1'},{rate:500,version:''}]){
  const p=createDiamondExchangePolicy(flags,config),f=fixture(),before=structuredClone(f.state);
  assert.equal(diamondExchangeView(p).available,false);assert.equal(diamondExchangeView(p).reason,'rate_unconfigured');
  await assert.rejects(f.run(request(),p),e=>e.status===503);assert.deepEqual(f.state,before);assert.equal(f.queries.some(q=>q.startsWith('UPDATE')),false);
 }
});
test('10 diamonds → exactly 5000 gold atomically, ignoring forged account and credit fields',async()=>{
 const f=fixture();const result=await f.run(request({accountId:'someone-else',goldGranted:99999999,gold:2147483647,diamonds:99999999,rate:100000}));
 assert.equal(result.gold,6000);assert.equal(result.diamonds,10);assert.equal(result.goldGranted,5000);assert.equal(result.diamondsSpent,10);assert.equal(result.replayed,false);
 assert.deepEqual(f.state.receipts.get('isolated-exchange-0001'),{diamonds_spent:10,gold_granted:5000,exchange_rate:500,pricing_version:'diamonds-to-gold-500-v1',diamond_balance_before:20,diamond_balance_after:10,gold_balance_before:1000,gold_balance_after:6000});
 assert.equal(f.releases(),1);assert.equal(f.queries.at(-1),'COMMIT');
});
test('rate/version quote mismatch rejects without changing either balance',async()=>{
 for(const patch of [{expectedRate:100},{pricingVersion:'another-approved-version'}]){
  const f=fixture(),before=structuredClone(f.state);await assert.rejects(f.run(request(patch)),e=>e.status===409&&/oranı değişti/.test(e.message));assert.deepEqual(f.state,before);
 }
});
for(const diamonds of [0,9,null])test(`insufficient or absent diamond balance ${diamonds} cannot create currency`,async()=>{
 const f=fixture({diamonds}),before=structuredClone(f.state);await assert.rejects(f.run(),e=>e.status===409&&e.message==='Yetersiz elmas.');assert.deepEqual(f.state,before);assert.equal(f.queries.some(q=>q.startsWith('UPDATE')),false);
});
for(const failAt of ['UPDATE hero_auction_diamond_wallets','UPDATE hero_auction_wallets','INSERT INTO hero_auction_diamond_exchanges'])test(`${failAt} failure rolls back debit, credit and ledger`,async()=>{
 const f=fixture({failAt}),before=structuredClone(f.state);await assert.rejects(f.run(),/Injected persistence/);assert.deepEqual(f.state,before);assert.equal(f.releases(),1);assert.equal(f.queries.at(-1),'ROLLBACK');
});
test('identical requests and concurrent repeats charge/credit once',async()=>{
 const f=fixture();const results=await Promise.all([f.run(),f.run(),f.run()]);
 assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal(results.filter(r=>r.replayed).length,2);assert.equal(f.state.gold,6000);assert.equal(f.state.diamonds,10);assert.equal(f.state.receipts.size,1);
});
test('distinct concurrent requests serialize balances and never overdraw diamonds',async()=>{
 const f=fixture({diamonds:15});const results=await Promise.allSettled([f.run(),f.run(request({requestId:'isolated-exchange-0002'}))]);
 assert.deepEqual(results.map(r=>r.status).sort(),['fulfilled','rejected']);assert.equal(f.state.gold,6000);assert.equal(f.state.diamonds,5);assert.equal(f.state.receipts.size,1);
 const enough=fixture({diamonds:20});await Promise.all([enough.run(),enough.run(request({requestId:'isolated-exchange-0002'}))]);assert.equal(enough.state.gold,11000);assert.equal(enough.state.diamonds,0);assert.equal(enough.state.receipts.size,2);
});
test('same key with changed amount/rate/version conflicts and never converts again',async()=>{
 const f=fixture();await f.run();const before=structuredClone(f.state);
 for(const patch of [{diamondsToSpend:1},{expectedRate:100},{pricingVersion:'v2'}])await assert.rejects(f.run(request(patch)),e=>e.status===409&&/kimliği/.test(e.message));
 assert.deepEqual(f.state,before);
});
test('lost COMMIT response is recoverable with same key and fresh current balances',async()=>{
 const f=fixture({lostCommit:true});await assert.rejects(f.run(),/Lost COMMIT/);assert.equal(f.state.gold,6000);assert.equal(f.state.diamonds,10);
 await f.run(request({requestId:'isolated-exchange-0002',diamondsToSpend:1}));
 const recovered=await f.run();assert.equal(recovered.replayed,true);assert.equal(recovered.gold,6500);assert.equal(recovered.diamonds,9);assert.equal(f.state.receipts.size,2);
});
test('receipt replays survive changed or missing current pricing without any new credit',async()=>{
 const f=fixture();await f.run();const before=structuredClone(f.state);
 for(const config of [null,{rate:600,version:'new-version'}]){
  const result=await f.run(request(),createDiamondExchangePolicy(flags,config));assert.equal(result.replayed,true);assert.equal(result.goldGranted,5000);assert.deepEqual(f.state,before);
 }
});
test('integer overflow is rejected before any wallet mutation; exact maximum is accepted',async()=>{
 const overflow=fixture({gold:2147483647,diamonds:20}),before=structuredClone(overflow.state);await assert.rejects(overflow.run(),e=>e.status===409&&/sınırını/.test(e.message));assert.deepEqual(overflow.state,before);
 const product=fixture({gold:0,diamonds:2147483647});await assert.rejects(product.run(request({diamondsToSpend:2147483647})),e=>e.status===409);assert.equal(product.state.diamonds,2147483647);assert.equal(product.state.gold,0);
 const exact=fixture({gold:2147483147,diamonds:1});const result=await exact.run(request({diamondsToSpend:1}));assert.equal(result.gold,2147483647);assert.equal(result.diamonds,0);
});
test('invalid requests, missing authenticated account and disabled feature do not query storage',async()=>{
 for(const patch of [{requestId:'small'},{diamondsToSpend:0},{diamondsToSpend:-1},{diamondsToSpend:1.5},{diamondsToSpend:NaN},{diamondsToSpend:'10'},{expectedRate:Infinity},{expectedRate:0},{pricingVersion:null}]){
  const f=fixture();await assert.rejects(f.run(request(patch)),e=>e.status===400);assert.equal(f.queries.length,0);
 }
 const unauthorized=fixture();await assert.rejects(unauthorized.run(request(),policy,''),e=>e.status===401);assert.equal(unauthorized.queries.length,0);
 const disabled=fixture();await assert.rejects(disabled.run(request(),createDiamondExchangePolicy()),e=>e.status===503);assert.equal(disabled.queries.length,0);
});
test('missing schema/wallet and malformed balances fail closed and release connections',async()=>{
 const missing=fixture({missingSchema:true});await assert.rejects(missing.run(),e=>e.status===503&&/altyapısı/.test(e.message));assert.equal(missing.state.gold,1000);assert.equal(missing.state.diamonds,20);assert.equal(missing.releases(),1);
 const noGold=fixture({gold:null});await assert.rejects(noGold.run(),e=>e.status===503);assert.equal(noGold.state.diamonds,20);
 for(const value of [-1,1.2,NaN,Infinity,2147483648,'']){
  const f=fixture({diamonds:value});await assert.rejects(f.run(),e=>e.status===503);assert.equal(f.state.gold,1000);assert.equal(f.releases(),1);
 }
});
test('draft schema stores exact two-currency movement and never changes existing balances',()=>{
 const schema=readFileSync(new URL('../migrations/002-diamond-exchange.sql',import.meta.url),'utf8');
 const source=readFileSync(new URL('../paid-diamond-exchange.js',import.meta.url),'utf8');
 assert.match(schema,/PRIMARY KEY\(account_id,request_id\)/);assert.match(schema,/CHECK\(diamonds_spent>0\)/);assert.match(schema,/CHECK\(gold_granted>0\)/);
 assert.match(schema,/gold_granted::bigint=diamonds_spent::bigint\*exchange_rate::bigint/);
 assert.doesNotMatch(schema,/\bUPDATE\b|\bINSERT\b|\bDELETE\b/);
 assert.doesNotMatch(source,/SET diamonds=diamonds\+|INSERT INTO hero_auction_diamond_wallets|function (?:purchase|checkout)/);
});
