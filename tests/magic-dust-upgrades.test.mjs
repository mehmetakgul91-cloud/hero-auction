import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCommanderProfile,commanderUpgradeCost} from '../arena-commanders.js';
import {createDiamondPolicy,commanderProgression,upgradeCommanderWithDiamonds} from '../paid-diamonds.js';
import {APPROVED_MAGIC_DUST_PRICING,createMagicDustPolicy,magicDustUpgradeCost,readMagicDustBalance} from '../magic-dust.js';
import {commanderBranchView,renderCommanderDevelopment} from '../public/commander-profile-view.js';

const diamondPolicy=createDiamondPolicy({HERO_DIAMONDS_ENABLED:'1'});
const dustPolicy=createMagicDustPolicy({HERO_MAGIC_DUST_ENABLED:'1',HERO_DIAMONDS_ENABLED:'1'});
const profileAt=(level=15)=>({...createCommanderProfile('attack'),levels:{attack:level,defense:20,magic:3,support:1}});
const request=(level=15,extra={})=>({stat:'attack',commanderId:'attack',expectedCurrentLevel:level,requestId:'dust-request-000001',...extra});
// This serialized transactional model proves failure/retry behavior, not real
// PostgreSQL isolation. Disposable PostgreSQL coverage is maintained separately.
function fixture({gold=1_000_000,diamonds=1000,magicDust=1000,profile=profileAt(),failAt=null,failCode=null,lostCommit=false,legacyReceipt=null}={}){
 const state={gold,diamonds,magicDust,profile:structuredClone(profile),receipts:new Map(legacyReceipt?[['dust-request-000001',legacyReceipt]]:[]),diamondLedger:[],dustLedger:[]};
 const sql=[];let lock=Promise.resolve(),loseCommit=lostCommit;
 const database={async connect(){
  let staged,unlock;
  return{release(){},async query(query,args=[]){
   sql.push(query);
   if(query==='BEGIN')return{};
   if(query==='ROLLBACK'){staged=null;unlock?.();unlock=null;return{}};
   if(query==='COMMIT'){
    assert.ok(staged);Object.assign(state,staged);staged=null;unlock?.();unlock=null;
    if(loseCommit){loseCommit=false;throw Error('Lost COMMIT response')}
    return{};
   }
   assert.equal(args[0],'dust-test-account');
   if(query.startsWith('SELECT profile')){
    const previous=lock;lock=new Promise(resolve=>{unlock=resolve});await previous;
    staged=structuredClone(state);return{rows:staged.profile?[{profile:structuredClone(staged.profile)}]:[]};
   }
   assert.ok(staged,'all persistence follows profile lock');
   if(failAt&&query.startsWith(failAt))throw Object.assign(Error('Injected storage failure'),{code:failCode});
   if(query.startsWith('SELECT commander_id,stat'))return{rows:staged.receipts.has(args[1])?[staged.receipts.get(args[1])]:[]};
   if(query.startsWith('SELECT gold'))return{rows:staged.gold===null?[]:[{gold:staged.gold}]};
   if(query.startsWith('INSERT INTO hero_auction_diamond_wallets')){staged.diamonds??=0;return{}};
   if(query.startsWith('SELECT diamonds'))return{rows:[{diamonds:staged.diamonds}]};
   if(query.startsWith('INSERT INTO hero_auction_magic_dust_wallets')){assert.match(query,/VALUES\(\$1,0\)/);staged.magicDust??=0;return{}};
   if(query.startsWith('SELECT magic_dust'))return{rows:[{magic_dust:staged.magicDust}]};
   const debit=[['hero_auction_wallets','gold','gold'],['hero_auction_diamond_wallets','diamonds','diamonds'],['hero_auction_magic_dust_wallets','magic_dust','magicDust']].find(([table])=>query.startsWith('UPDATE '+table+' '));
   if(debit){
    const [,field,key]=debit;assert.match(query,new RegExp(field+'>=\\$2 RETURNING '+field));
    if(staged[key]<args[1])return{rows:[]};staged[key]-=args[1];return{rows:[{[field]:staged[key]}]};
   }
   if(query.startsWith('INSERT INTO hero_auction_upgrade_receipts')){
    assert.equal(staged.receipts.has(args[1]),false);
    staged.receipts.set(args[1],{commander_id:args[2],stat:args[3],from_level:args[4],gold_cost:args[6],diamond_cost:args[7],pricing_version:args[8],magic_dust_cost:args[9]??0});return{};
   }
   if(query.startsWith('INSERT INTO hero_auction_diamond_ledger')||query.startsWith('INSERT INTO hero_auction_magic_dust_upgrade_ledger')){
    assert.ok(args[2]<0);assert.equal(args[3]+args[2],args[4]);assert.ok(args[4]>=0);
    staged[query.includes('magic_dust')?'dustLedger':'diamondLedger'].push([...args]);return{};
   }
   if(query.startsWith('UPDATE hero_auction_commanders')){staged.profile=JSON.parse(args[1]);return{}};
   throw Error('Unexpected SQL: '+query);
  }};
 }};
 return{state,sql,run:(body=request(profile?.levels.attack??15),magicDustPolicy=dustPolicy)=>upgradeCommanderWithDiamonds({database,accountId:'dust-test-account',request:body,policy:diamondPolicy,magicDustPolicy})};
}

test('dust requires explicit opt-in and diamond dependency, and policy is frozen',()=>{
 for(const value of [undefined,'0','false','true',true,1])assert.equal(createMagicDustPolicy({HERO_MAGIC_DUST_ENABLED:value,HERO_DIAMONDS_ENABLED:'1'}).enabled,false);
 assert.equal(createMagicDustPolicy({HERO_MAGIC_DUST_ENABLED:'1'}).reason,'diamonds_disabled');
 assert.equal(dustPolicy.enabled,true);assert.equal(dustPolicy.reason,null);assert.ok(Object.isFrozen(dustPolicy));assert.ok(Object.isFrozen(dustPolicy.pricing));
});
test('15→16 costs5 then exact from-base ×1.2 ceil; threshold and level caps are exact',()=>{
 assert.deepEqual(Array.from({length:25},(_,i)=>magicDustUpgradeCost(i+15)),[5,6,8,9,11,13,15,18,22,26,31,38,45,54,65,78,93,111,134,160,192,231,277,332,398]);
 for(let level=0;level<15;level++)assert.equal(magicDustUpgradeCost(level),0);
 for(const level of [-1,15.5,40,NaN,Infinity,'15'])assert.throws(()=>magicDustUpgradeCost(level));
});
test('missing, malformed and overflow dust prices fail closed, without debit',async()=>{
 for(const pricing of [null,{}, {...APPROVED_MAGIC_DUST_PRICING,base:0},{...APPROVED_MAGIC_DUST_PRICING,base:1.5},{...APPROVED_MAGIC_DUST_PRICING,numerator:12},{...APPROVED_MAGIC_DUST_PRICING,base:2147483647}])assert.equal(magicDustUpgradeCost(39,pricing),null);
 const f=fixture(),before=structuredClone(f.state);
 await assert.rejects(f.run(request(),createMagicDustPolicy({HERO_MAGIC_DUST_ENABLED:'1',HERO_DIAMONDS_ENABLED:'1'},null)),e=>e.status===503);
 assert.deepEqual(f.state,before);assert.equal(f.sql.some(q=>q.startsWith('UPDATE')),false);
});
test('enabled quotes require actual dust balance; off quotes remain gold/diamond only',()=>{
 const quote=commanderProgression(profileAt(),{gold:100000,diamonds:1000,magicDust:4},diamondPolicy,dustPolicy);
 assert.equal(quote.magicDustEnabled,true);assert.equal(quote.branches.attack.magicDust,5);assert.equal(quote.branches.attack.requiresMagicDust,true);assert.equal(quote.branches.attack.reason,'insufficient_magic_dust');
 assert.equal(quote.branches.magic.requiresMagicDust,false);assert.equal(quote.branches.defense.magicDust,0);assert.equal(quote.branches.defense.reason,'maximum_level');
 assert.equal(commanderProgression(profileAt(14),{gold:100000,diamonds:1000,magicDust:0},diamondPolicy,dustPolicy).branches.attack.magicDust,0);
 for(const magicDust of [null,-1,1.5,NaN,Infinity,2147483648])assert.throws(()=>commanderProgression(profileAt(),{gold:100000,diamonds:1000,magicDust},diamondPolicy,dustPolicy));
 const off=commanderProgression(profileAt(),{gold:100000,diamonds:1000},diamondPolicy);assert.equal(off.magicDustEnabled,false);assert.equal(off.branches.attack.magicDust,undefined);
});
test('15→16 debits only approved gold and5dust; forged amounts ignored, levels preserved',async()=>{
 const f=fixture({gold:commanderUpgradeCost(15),magicDust:5,diamonds:0});
 const result=await f.run(request(15,{magicDust:99999,magicDustCost:0,gold:99999,cost:0,accountId:'other'}));
 assert.equal(result.gold,0);assert.equal(result.magicDust,0);assert.equal(result.magicDustCost,5);assert.equal(result.diamonds,0);assert.equal(result.diamondCost,0);
 assert.equal(result.profile.levels.attack,16);assert.equal(result.profile.levels.defense,20);assert.equal(f.state.diamondLedger.length,0);assert.deepEqual(f.state.dustLedger,[['dust-test-account','dust-request-000001',-5,5,0]]);
 const locks=f.sql.filter(q=>/ FOR UPDATE$/.test(q));assert.deepEqual(locks.map(q=>q.split(' FROM ')[1].split(' ')[0]),['hero_auction_commanders','hero_auction_wallets','hero_auction_diamond_wallets','hero_auction_magic_dust_wallets']);
});
test('20→21 atomically charges gold,10diamonds and13dust; existing levels are not retrocharged',async()=>{
 const f=fixture({profile:profileAt(20),gold:7668,diamonds:10,magicDust:13});const result=await f.run();
 assert.equal(result.cost,7668);assert.equal(result.diamondCost,10);assert.equal(result.magicDustCost,13);assert.equal(result.gold,0);assert.equal(result.diamonds,0);assert.equal(result.magicDust,0);assert.equal(result.profile.levels.attack,21);
 assert.equal(f.state.dustLedger.length,1);assert.equal(f.state.diamondLedger.length,1);assert.equal(f.state.receipts.size,1);
});
for(const balances of [{gold:7667,diamonds:10,magicDust:13},{gold:7668,diamonds:9,magicDust:13},{gold:7668,diamonds:10,magicDust:12},{gold:7668,diamonds:10,magicDust:null}])test(`insufficient three-currency funds ${JSON.stringify(balances)} debit nothing`,async()=>{
 const f=fixture({...balances,profile:profileAt(20)}),before=structuredClone(f.state);await assert.rejects(f.run(),e=>e.status===409);assert.deepEqual(f.state,before);assert.equal(f.sql.some(q=>q.startsWith('UPDATE')),false);
});
for(const failAt of ['UPDATE hero_auction_magic_dust_wallets','INSERT INTO hero_auction_upgrade_receipts','INSERT INTO hero_auction_diamond_ledger','INSERT INTO hero_auction_magic_dust_upgrade_ledger','UPDATE hero_auction_commanders'])test(`failure at ${failAt} rolls back3currencies and level`,async()=>{
 const f=fixture({profile:profileAt(20),failAt}),before=structuredClone(f.state);await assert.rejects(f.run(),/Injected/);assert.deepEqual(f.state,before);
});
test('same key and lost commit retry spend once; concurrent duplicates serialize',async()=>{
 for(const lostCommit of [false,true]){
  const f=fixture({lostCommit});if(lostCommit)await assert.rejects(f.run(),/Lost COMMIT/);else await f.run();
  const result=await f.run();assert.equal(result.replayed,true);assert.equal(f.state.magicDust,995);assert.equal(f.state.receipts.size,1);assert.equal(f.state.dustLedger.length,1);
 }
 const f=fixture();const results=await Promise.all([f.run(),f.run(),f.run()]);assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal(f.state.magicDust,995);
});
test('reused key cannot change payload and different keys for one level cannot buy twice',async()=>{
 const f=fixture();const results=await Promise.allSettled([f.run(),f.run(request(15,{requestId:'dust-request-000002'}))]);assert.deepEqual(results.map(r=>r.status).sort(),['fulfilled','rejected']);
 for(const change of [{stat:'support'},{commanderId:'magic'},{expectedCurrentLevel:16}])await assert.rejects(f.run(request(15,change)),e=>e.status===409);
 assert.equal(f.state.magicDust,995);
});
test('historical pre-dust receipt replays without retrocharge after enable; current balances returned',async()=>{
 const legacyReceipt={commander_id:'attack',stat:'attack',from_level:15,gold_cost:commanderUpgradeCost(15),diamond_cost:0,magic_dust_cost:0,pricing_version:'gold-only'};
 const f=fixture({profile:profileAt(16),magicDust:0,legacyReceipt}),before=structuredClone(f.state);const result=await f.run(request(15));
 assert.equal(result.replayed,true);assert.equal(result.magicDustCost,0);assert.equal(result.magicDust,0);assert.deepEqual(f.state,before);assert.equal(result.profile.levels.attack,16);
});
test('14→15 has no dust debit; off feature does not reference new schema or touch dust',async()=>{
 const f=fixture({profile:profileAt(14),magicDust:null});const result=await f.run();assert.equal(result.magicDustCost,0);assert.equal(result.magicDust,0);assert.equal(f.state.dustLedger.length,0);
 const off=fixture();const r=await off.run(request(),createMagicDustPolicy());assert.equal(r.magicDust,null);assert.equal(r.magicDustCost,0);assert.equal(off.state.magicDust,1000);assert.equal(off.sql.some(q=>/magic_dust/.test(q)),false);
});
test('retained side levels cannot be charged; active old levels charge only the next upgrade',async()=>{
 for(const level of [21,30,39]){const f=fixture({profile:profileAt(level)});const r=await f.run();assert.equal(r.magicDustCost,magicDustUpgradeCost(level));assert.equal(r.profile.levels.attack,level+1);assert.equal(f.state.dustLedger.length,1);}
 const f=fixture({profile:{...profileAt(40),commanderId:'magic'}}),before=structuredClone(f.state);await assert.rejects(f.run(request(39,{commanderId:'magic'})),e=>e.status===409);assert.deepEqual(f.state,before);
});
test('dust reads are nonmutating, absent valid wallet is0 but missing schema is503',async()=>{
 let sql;assert.equal(await readMagicDustBalance({query:async q=>{sql=q;return{rows:[]}}},'account'),0);assert.match(sql,/^SELECT magic_dust FROM/);
 for(const code of ['42P01','42703'])await assert.rejects(readMagicDustBalance({query:async()=>{throw Object.assign(Error('missing'),{code})}},'account'),e=>e.status===503);
 for(const value of [-1,1.5,Infinity,2147483648])await assert.rejects(readMagicDustBalance({query:async()=>({rows:[{magic_dust:value}]})},'account'),e=>e.status===503);
});
test('no dust purchase/grant API, client-side formula or positive upgrade-ledger delta',()=>{
 const source=readFileSync(new URL('../magic-dust.js',import.meta.url),'utf8');assert.doesNotMatch(source,/UPDATE|INSERT|\/api\//);
 const paid=readFileSync(new URL('../paid-diamonds.js',import.meta.url),'utf8');assert.doesNotMatch(paid,/magic_dust=magic_dust\+/);
 const view=readFileSync(new URL('../public/commander-profile-view.js',import.meta.url),'utf8');assert.doesNotMatch(view,/magicDustUpgradeCost|5\s*\*\s*Math\.pow/);
});

class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.attributes={};this.dataset={};this.style={};this.className='';this.text='';}
 set textContent(v){this.text=String(v);this.children=[]}get textContent(){return this.text+this.children.map(c=>c.textContent).join(' ')}
 append(...c){this.children.push(...c)}replaceChildren(...c){this.text='';this.children=c}setAttribute(k,v){this.attributes[k]=String(v)}
}
const document={createElement:tag=>new Element(tag)};
const all=node=>[node,...node.children.flatMap(all)];
function render(p,progression,options={}){const root=new Element();renderCommanderDevelopment(root,p,{document,gold:1000000,diamonds:1000,progression,...options});return root}
test('commander UI shows server dust cost and blocks insufficientdust without fake wallet',()=>{
 const p=profileAt(),quote=commanderProgression(p,{gold:1000000,diamonds:1000,magicDust:4},diamondPolicy,dustPolicy);
 const root=render(p,quote);assert.match(root.textContent,/BÜYÜ TOZU YETERSİZ/);assert.match(root.textContent,/5 BÜYÜ TOZU/);assert.equal(all(root).find(n=>n.className==='cp-upgrade-button').disabled,true);
 const ready=commanderProgression(p,{gold:1000000,diamonds:1000,magicDust:5},diamondPolicy,dustPolicy);assert.equal(commanderBranchView(p,'attack',{gold:1000000,diamonds:1000,progression:ready}).canUpgrade,true);
 const en=render(p,ready,{english:true});assert.match(en.textContent,/5 MAGIC DUST/);assert.doesNotMatch(en.textContent,/BÜYÜ TOZU/);
});
test('dust UI fails closed for stale or missing/zero server price; disabled dust stays hidden',()=>{
 const p=profileAt(),quote=commanderProgression(p,{gold:1000000,diamonds:1000,magicDust:5},diamondPolicy,dustPolicy);
 for(const cost of [undefined,null,0,-1,1.5]){
  const bad=structuredClone(quote);bad.branches.attack.magicDust=cost;
  const view=commanderBranchView(p,'attack',{gold:1000000,diamonds:1000,progression:bad});assert.equal(view.canUpgrade,false);assert.equal(view.reason,'pricing_unavailable');
 }
 const stale=structuredClone(quote);stale.branches.attack.currentLevel=14;assert.equal(commanderBranchView(p,'attack',{gold:1000000,diamonds:1000,progression:stale}).reason,'pricing_unavailable');
 const off=commanderProgression(p,{gold:1000000,diamonds:1000},diamondPolicy);assert.doesNotMatch(render(p,off).textContent,/BÜYÜ TOZU|büyü tozu/);
});

test('missing dust schema/receipt column fails before any debit and keeps the profile unchanged',async()=>{
 for(const [failAt,failCode] of [['SELECT commander_id,stat','42703'],['INSERT INTO hero_auction_magic_dust_wallets','42P01']]){
  const f=fixture({failAt,failCode}),before=structuredClone(f.state);await assert.rejects(f.run(),e=>e.status===503);assert.deepEqual(f.state,before);assert.equal(f.sql.some(q=>q.startsWith('UPDATE')),false);
 }
});
test('replay uses stored dust charge when configured prices later change',async()=>{
 const f=fixture();await f.run();
 const changed=createMagicDustPolicy({HERO_MAGIC_DUST_ENABLED:'1',HERO_DIAMONDS_ENABLED:'1'},{...APPROVED_MAGIC_DUST_PRICING,base:100,version:'future-server-price'});
 const r=await f.run(request(),changed);assert.equal(r.replayed,true);assert.equal(r.magicDustCost,5);assert.equal(r.magicDust,995);assert.equal(r.progression.branches.attack.magicDust,120);assert.equal(f.state.dustLedger.length,1);
 assert.match(f.state.receipts.get('dust-request-000001').pricing_version,/dust-upgrade-5-x1.2-ceil-v1/);
});
test('malformed dust balances fail before any currency debit',async()=>{
 for(const magicDust of [-1,1.5,NaN,Infinity,2147483648]){
  const f=fixture({magicDust});await assert.rejects(f.run(),e=>e.status===503);assert.equal(f.state.gold,1000000);assert.equal(f.sql.some(q=>q.startsWith('UPDATE')),false);
 }
});
