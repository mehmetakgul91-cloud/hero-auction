import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createCommanderProfile,commanderStatBonus} from '../arena-commanders.js';
import {APPROVED_DIAMOND_PRICING,createDiamondPolicy,diamondUpgradeCost,commanderProgression,readDiamondBalance,upgradeCommanderWithDiamonds} from '../paid-diamonds.js';

const enabled=createDiamondPolicy({HERO_DIAMONDS_ENABLED:'1'});
const profileAt=(level=20)=>({...createCommanderProfile('attack'),levels:{attack:level,defense:20,magic:3,support:1}});
const request=(extra={})=>({stat:'attack',commanderId:'attack',expectedCurrentLevel:20,requestId:'isolated-request-0001',...extra});
// An isolated transactional model with serialized profile row locks. This is
// failure/concurrency testing, not a claim of live PostgreSQL migration QA.
function fixture({gold=1000000,diamonds=1000,profile=profileAt(),failAt=null,lostCommit=false}={}){
 const state={gold,diamonds,profile:structuredClone(profile),receipts:new Map(),ledger:[]};
 const sql=[];let lock=Promise.resolve(),releases=0,loseCommit=lostCommit;
 const database={async connect(){
  let staged,unlock;
  return{release(){releases++},async query(query,args=[]){
   sql.push(query);
   if(query==='BEGIN')return{};
   if(query==='ROLLBACK'){staged=null;unlock?.();unlock=null;return{}};
   if(query==='COMMIT'){
    assert.ok(staged);Object.assign(state,staged);staged=null;unlock?.();unlock=null;
    if(loseCommit){loseCommit=false;throw Error('Lost COMMIT response')}
    return{};
   }
   assert.equal(args[0],'isolated-account');
   if(query==='SELECT profile FROM hero_auction_commanders WHERE account_id=$1 FOR UPDATE'){
    const previous=lock;lock=new Promise(resolve=>{unlock=resolve});await previous;
    staged=structuredClone(state);return{rows:staged.profile?[{profile:structuredClone(staged.profile)}]:[]};
   }
   assert.ok(staged,'all persistence follows the profile lock');
   if(failAt&&query.startsWith(failAt))throw Error('Injected storage failure');
   if(query.startsWith('SELECT commander_id,stat'))return{rows:staged.receipts.has(args[1])?[staged.receipts.get(args[1])]:[]};
   if(query.startsWith('SELECT gold'))return{rows:staged.gold===null?[]:[{gold:staged.gold}]};
   if(query.startsWith('INSERT INTO hero_auction_diamond_wallets')){assert.match(query,/VALUES\(\$1,0\)/);staged.diamonds??=0;return{}};
   if(query.startsWith('SELECT diamonds'))return{rows:[{diamonds:staged.diamonds}]};
   if(query.startsWith('UPDATE hero_auction_wallets')){
    assert.match(query,/gold>=\$2 RETURNING gold/);
    if(staged.gold<args[1])return{rows:[]};staged.gold-=args[1];return{rows:[{gold:staged.gold}]};
   }
   if(query.startsWith('UPDATE hero_auction_diamond_wallets')){
    assert.match(query,/diamonds>=\$2 RETURNING diamonds/);
    if(staged.diamonds<args[1])return{rows:[]};staged.diamonds-=args[1];return{rows:[{diamonds:staged.diamonds}]};
   }
   if(query.startsWith('INSERT INTO hero_auction_upgrade_receipts')){
    assert.equal(staged.receipts.has(args[1]),false);
    staged.receipts.set(args[1],{commander_id:args[2],stat:args[3],from_level:args[4],gold_cost:args[6],diamond_cost:args[7],pricing_version:args[8]});return{};
   }
   if(query.startsWith('INSERT INTO hero_auction_diamond_ledger')){
    assert.ok(args[2]<0);assert.equal(args[3]+args[2],args[4]);assert.ok(args[4]>=0);staged.ledger.push([...args]);return{};
   }
   if(query.startsWith('UPDATE hero_auction_commanders')){staged.profile=JSON.parse(args[1]);return{}};
   throw Error('Unexpected SQL: '+query);
  }};
 }};
 return{state,sql,releases:()=>releases,run:(body=request(),policy=enabled)=>upgradeCommanderWithDiamonds({database,accountId:'isolated-account',request:body,policy})};
}

test('feature is opt-in only; approved diamond costs use exact rational ceil from base',()=>{
 for(const value of [undefined,'0','false','true',true,1])assert.equal(createDiamondPolicy({HERO_DIAMONDS_ENABLED:value}).enabled,false);
 assert.equal(enabled.enabled,true);
 assert.deepEqual(Array.from({length:20},(_,i)=>diamondUpgradeCost(i+20)),[10,12,15,18,21,25,30,36,43,52,62,75,90,107,129,155,185,222,267,320]);
 assert.equal(diamondUpgradeCost(0),0);assert.equal(diamondUpgradeCost(19),0);
 assert.throws(()=>diamondUpgradeCost(40));assert.throws(()=>diamondUpgradeCost(20.5));
});
test('missing, malformed and overflowing prices fail closed; no fallback formula',()=>{
 for(const pricing of [null,{}, {...APPROVED_DIAMOND_PRICING,base:0},{...APPROVED_DIAMOND_PRICING,base:1.5},{...APPROVED_DIAMOND_PRICING,numerator:12},{...APPROVED_DIAMOND_PRICING,base:2147483647}])assert.equal(diamondUpgradeCost(39,pricing),null);
 const f=fixture(),before=structuredClone(f.state);
 return assert.rejects(f.run(request(),createDiamondPolicy({HERO_DIAMONDS_ENABLED:'1'},null)),e=>e.status===503).then(()=>{assert.deepEqual(f.state,before);assert.equal(f.sql.some(q=>q.startsWith('UPDATE')),false)});
});
test('OFF quote preserves gold-only upgrade and does not expose a pretend diamond balance',()=>{
 const view=commanderProgression(profileAt(),{gold:7668,diamonds:null},createDiamondPolicy());
 assert.equal(view.diamondsEnabled,false);assert.equal(view.requestIdRequired,false);assert.equal(view.purchaseAvailable,false);
 assert.deepEqual(view.branches.attack,{currentLevel:20,nextLevel:21,cap:40,gold:7668,diamonds:0,requiresDiamonds:false,canUpgrade:true,reason:null});
});
test('quotes cover threshold, missing prices, insufficient currencies and preserved side caps',()=>{
 const quote=(profile,gold,diamonds,policy=enabled)=>commanderProgression(profile,{gold,diamonds},policy).branches;
 assert.equal(quote(profileAt(19),6390,0).attack.diamonds,0);
 assert.equal(quote(profileAt(20),7668,0).attack.reason,'insufficient_diamonds');
 assert.equal(quote(profileAt(20),7667,10).attack.reason,'insufficient_gold');
 assert.equal(quote(profileAt(20),7668,10).attack.canUpgrade,true);
 assert.equal(quote(profileAt(20),7668,10).defense.reason,'maximum_level');
 assert.equal(quote(profileAt(40),7668,10).attack.nextLevel,null);
 assert.equal(quote(profileAt(20),100000,1000,createDiamondPolicy({HERO_DIAMONDS_ENABLED:'1'},null)).attack.reason,'pricing_unavailable');
 for(const diamonds of [-1,1.5,NaN,Infinity,2147483648])assert.throws(()=>quote(profileAt(),100000,diamonds));
});
test('19→20 spends gold only and creates no diamond award or ledger credit',async()=>{
 const f=fixture({gold:6390,diamonds:null,profile:profileAt(19)});
 const result=await f.run(request({expectedCurrentLevel:19}));
 assert.equal(result.profile.levels.attack,20);assert.equal(result.gold,0);assert.equal(result.diamonds,0);assert.equal(result.diamondCost,0);assert.equal(f.state.ledger.length,0);
});
test('20→21 atomically debits exactly both server costs and ignores forged client claims',async()=>{
 const f=fixture({gold:7668,diamonds:10});
 const result=await f.run(request({cost:0,diamondCost:0,gold:999999,diamonds:999999,accountId:'someone-else',profile:profileAt(0)}));
 assert.equal(result.profile.levels.attack,21);assert.equal(result.cost,7668);assert.equal(result.diamondCost,10);assert.equal(result.gold,0);assert.equal(result.diamonds,0);
 assert.deepEqual(f.state.ledger,[['isolated-account','isolated-request-0001',-10,10,0]]);assert.equal(f.state.receipts.size,1);assert.equal(f.releases(),1);
});
for(const balances of [{gold:7667,diamonds:10},{gold:7668,diamonds:9},{gold:0,diamonds:0},{gold:7668,diamonds:null}])test(`insufficient balances ${JSON.stringify(balances)} change nothing`,async()=>{
 const f=fixture(balances),before=structuredClone(f.state);
 await assert.rejects(f.run(),e=>e.status===409);assert.deepEqual(f.state,before);assert.equal(f.sql.at(-1),'ROLLBACK');
});
for(const failAt of ['UPDATE hero_auction_diamond_wallets','INSERT INTO hero_auction_upgrade_receipts','INSERT INTO hero_auction_diamond_ledger','UPDATE hero_auction_commanders'])test(`failure at ${failAt} rolls back all writes`,async()=>{
 const f=fixture({failAt}),before=structuredClone(f.state);await assert.rejects(f.run(),/Injected/);assert.deepEqual(f.state,before);assert.equal(f.releases(),1);
});
test('same key retries, concurrent duplicates and lost COMMIT never double-charge',async()=>{
 for(const lostCommit of [false,true]){
  const f=fixture({lostCommit});
  if(lostCommit)await assert.rejects(f.run(),/Lost COMMIT/);else await f.run();
  const result=await f.run();assert.equal(result.replayed,true);assert.equal(f.state.gold,992332);assert.equal(f.state.diamonds,990);assert.equal(f.state.receipts.size,1);assert.equal(f.state.ledger.length,1);
 }
 const f=fixture();const results=await Promise.all([f.run(),f.run(),f.run()]);assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal(f.state.diamonds,990);
});
test('different keys for one expected level charge only once; reused key cannot change payload',async()=>{
 const f=fixture();const results=await Promise.allSettled([f.run(),f.run(request({requestId:'isolated-request-0002'}))]);
 assert.deepEqual(results.map(r=>r.status).sort(),['fulfilled','rejected']);assert.equal(f.state.diamonds,990);
 for(const change of [{stat:'magic'},{commanderId:'magic'},{expectedCurrentLevel:21}])await assert.rejects(f.run(request(change)),e=>e.status===409);
 assert.equal(f.state.receipts.size,1);
});
test('old successful receipt returns current progression, not an outdated snapshot',async()=>{
 const f=fixture();await f.run();await f.run(request({expectedCurrentLevel:21,requestId:'isolated-request-0002'}));
 const replay=await f.run();assert.equal(replay.replayed,true);assert.equal(replay.profile.levels.attack,22);assert.equal(replay.diamonds,978);assert.equal(replay.progression.branches.attack.currentLevel,22);assert.equal(f.state.ledger.length,2);
});
test('grandfathered 21–40 levels and other branches are never reset or retrocharged',async()=>{
 for(const level of [21,30,39]){
  const f=fixture({profile:profileAt(level)});const result=await f.run(request({expectedCurrentLevel:level}));
  assert.equal(result.profile.levels.attack,level+1);assert.equal(result.diamondCost,diamondUpgradeCost(level));assert.equal(result.profile.levels.defense,20);assert.equal(result.profile.levels.magic,3);assert.equal(f.state.ledger.length,1);
 }
 for(const profile of [profileAt(40),{...profileAt(40),commanderId:'magic'}]){
  const f=fixture({profile}),before=structuredClone(f.state);await assert.rejects(f.run(request({commanderId:profile.commanderId,expectedCurrentLevel:39})),e=>e.status===409);assert.deepEqual(f.state,before);
 }
 assert.equal(commanderStatBonus(profileAt(40),'attack'),.2);
});
test('side branch caps, missing profiles, malformed balances and requests fail without debit',async()=>{
 const capped=fixture();await assert.rejects(capped.run(request({stat:'defense'})),e=>e.status===409);assert.equal(capped.state.diamonds,1000);
 for(const profile of [null]){const f=fixture({profile});await assert.rejects(f.run(),e=>e.status===409);assert.equal(f.state.diamonds,1000)}
 for(const value of [-1,1.5,NaN,2147483648]){const f=fixture({diamonds:value});await assert.rejects(f.run(),e=>e.status===503);assert.equal(f.state.gold,1000000)}
 for(const change of [{requestId:'tiny'},{requestId:null},{expectedCurrentLevel:20.5},{commanderId:'unknown'},{stat:'__proto__'}]){const f=fixture();await assert.rejects(f.run(request(change)),e=>e.status===400);assert.equal(f.sql.length,0)}
 const off=fixture();await assert.rejects(off.run(request(),createDiamondPolicy()),e=>e.status===503);assert.equal(off.sql.length,0);
});
test('missing wallets start at zero and missing schema reports unavailable, never grants diamonds',async()=>{
 assert.equal(await readDiamondBalance({query:async()=>({rows:[]})},'new-account'),0);
 await assert.rejects(readDiamondBalance({query:async()=>{throw Object.assign(Error('missing'),{code:'42P01'})}},'new-account'),e=>e.status===503);
});
test('schema is explicit and creditless; server has no diamond purchase or reward route',()=>{
 const schema=readFileSync(new URL('../migrations/001-paid-diamonds-foundation.sql',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const module=readFileSync(new URL('../paid-diamonds.js',import.meta.url),'utf8');
 assert.match(schema,/DEFAULT 0 CHECK\(diamonds>=0\)/);assert.match(schema,/CHECK\(delta<0\)/);assert.match(schema,/PRIMARY KEY\(account_id,request_id\)/);
 assert.doesNotMatch(server,/migrations\/001-paid-diamonds|CREATE TABLE.*hero_auction_diamond/);
 assert.doesNotMatch(server,/\/api\/(?:purchase|checkout)|\/api\/diamonds?\/(?:purchase|credit|grant|mint)/);
 assert.deepEqual([...server.matchAll(/url==='(\/api\/diamonds\/[^']+)'/g)].map(match=>match[1]),['/api/diamonds/exchange']);
 assert.doesNotMatch(module,/SET diamonds=diamonds\+/);
 assert.match(server,/accountId:user\.sub,request:b,policy:diamondPolicy/);
});
test('diamond preflight failure rejects before selection/change mutation; unauthorized calls cannot read balances',async()=>{
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const wrapper=source.slice(source.indexOf('async function api(url,b,requestContext)'),source.indexOf('async function apiAction(url,b,requestContext)'));
 let mutations=0,reads=0;
 const context=vm.createContext({requireModerationForInteraction:()=>{},moderationReady:true,diamondPolicy:enabled,magicDustPolicy:{enabled:false},database:{},databaseReady:true,
  readLogin:token=>token?{sub:'isolated-account'}:null,readDiamondBalance:async()=>{reads++;throw Object.assign(Error('schema unavailable'),{status:503})},
  apiAction:async()=>{mutations++;return{}},error:(message,status)=>{throw Object.assign(Error(message),{status})}});
 vm.runInContext(wrapper,context);
 for(const path of ['/api/commander/select','/api/commander/change','/api/commander/upgrade'])await assert.rejects(context.api(path,{authToken:'isolated-token'}),e=>e.status===503);
 assert.equal(mutations,0);assert.equal(reads,3);
 await assert.rejects(context.api('/api/commander/get',{}),e=>e.status===401);assert.equal(reads,3);
});
