import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APPROVED_VICTORY_CHEST_CONFIG,createVictoryChestPolicy,rollVictoryChest,eligibleVictory,victoryMatchId,persistVictoryChestIntent,creditVictoryChest,victoryChestView} from '../victory-chests.js';
const policy=createVictoryChestPolicy({HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1',HERO_VICTORY_CHESTS_ENABLED:'1'});
const room=()=>({code:'123',matchNumber:1,created:1000,phase:'finished',mode:'friend',entryPaid:true,matchSettled:false,players:[{accountId:'winner',token:'secret-a'},{accountId:'loser',token:'secret-b'}],battleSync:{result:{winner:0,live:true,finished:true}},victoryChestWinner:0,victoryChestPending:true});
const sequence=values=>{let index=0;return max=>{assert.ok(index<values.length);const next=values[index++];assert.ok(next<max);return next}};
// SQL transaction model only. Actual PostgreSQL proof is a separate guarded
// disposable integration tool; this model cannot establish DB isolation.
function fixture({gold=450,diamonds=0,magicDust=0,failAt=null,loseCommitAt=0,legacy=false}={}){
 const state={wallets:{winner:{gold,diamonds,magicDust},loser:{gold:450,diamonds:0,magicDust:0}},intents:new Map(),receipts:new Map(),awards:new Map(legacy?[['123:1:1000',{account_id:'winner',amount:120}]]:[])};
 const queries=[];let tail=Promise.resolve(),commits=0;
 const database={async connect(){let draft,unlock;return{release(){},async query(sql,args=[]){
  queries.push(sql);
  if(sql==='BEGIN')return{rows:[]};
  if(sql==='ROLLBACK'){draft=null;unlock?.();unlock=null;return{rows:[]}};
  if(sql==='COMMIT'){assert.ok(draft);Object.assign(state,draft);draft=null;unlock?.();unlock=null;if(++commits===loseCommitAt)throw Error('Lost COMMIT response');return{rows:[]}};
  if(sql.startsWith('SELECT pg_advisory')){const prev=tail;tail=new Promise(r=>unlock=r);await prev;draft=structuredClone(state);return{rows:[]}};
  assert.ok(draft,'serialized at match advisory lock');
  if(failAt&&sql.startsWith(failAt))throw Error('Injected storage failure');
  if(sql.startsWith('SELECT * FROM hero_auction_victory_chest_intents'))return{rows:draft.intents.has(args[0])?[draft.intents.get(args[0])]:[]};
  if(sql.startsWith('SELECT * FROM hero_auction_victory_chest_receipts'))return{rows:draft.receipts.has(args[0])?[draft.receipts.get(args[0])]:[]};
  if(sql.startsWith('SELECT award_id'))return{rows:draft.awards.has(args[0])?[{award_id:args[0]}]:[]};
  if(sql.startsWith('INSERT INTO hero_auction_victory_chest_intents')){const names=['match_id','account_id','winner_seat','config_version','gold_amount','magic_dust_amount','diamond_amount','room_state'];const row=Object.fromEntries(names.map((name,i)=>[name,i===7?JSON.parse(args[i]):args[i]]));assert.equal(draft.intents.has(args[0]),false);draft.intents.set(args[0],row);return{rows:[row]}};
  if(sql.startsWith('SELECT gold '))return{rows:draft.wallets[args[0]]?[{gold:draft.wallets[args[0]].gold}]:[]};
  if(sql.startsWith('SELECT diamonds '))return{rows:[{diamonds:draft.wallets[args[0]].diamonds}]};
  if(sql.startsWith('SELECT magic_dust '))return{rows:[{magic_dust:draft.wallets[args[0]].magicDust}]};
  if(sql.startsWith('INSERT INTO hero_auction_diamond_wallets')){draft.wallets[args[0]].diamonds??=0;return{rows:[]}};
  if(sql.startsWith('INSERT INTO hero_auction_magic_dust_wallets')){draft.wallets[args[0]].magicDust??=0;return{rows:[]}};
  if(sql.startsWith('UPDATE hero_auction_wallets')){draft.wallets[args[0]].gold+=args[1];return{rows:[]}};
  if(sql.startsWith('UPDATE hero_auction_diamond_wallets')){draft.wallets[args[0]].diamonds+=args[1];return{rows:[]}};
  if(sql.startsWith('UPDATE hero_auction_magic_dust_wallets')){draft.wallets[args[0]].magicDust+=args[1];return{rows:[]}};
  if(sql.startsWith('INSERT INTO hero_auction_victory_chest_receipts')){const names=['match_id','account_id','config_version','gold_amount','magic_dust_amount','diamond_amount','gold_before','gold_after','magic_dust_before','magic_dust_after','diamonds_before','diamonds_after'];const row=Object.fromEntries(names.map((n,i)=>[n,args[i]]));assert.equal(draft.receipts.has(args[0]),false);draft.receipts.set(args[0],row);return{rows:[row]}};
  if(sql.startsWith('INSERT INTO hero_auction_gold_awards')){if(draft.awards.has(args[0]))return{rows:[]};draft.awards.set(args[0],{account_id:args[1],amount:args[2]});return{rows:[{award_id:args[0]}]}};
  throw Error('Unexpected SQL '+sql);
 }}}};
 const persist=(r=room(),randomInt=sequence([4,3999,2,999]))=>persistVictoryChestIntent({database,room:r,winner:0,policy,randomInt});
 const credit=()=>creditVictoryChest({database,matchId:'123:1:1000'});
 return{state,queries,database,persist,credit};
}

test('all flags explicit and dependencies fail closed; config validated and frozen',()=>{
 for(const flags of [{},{HERO_VICTORY_CHESTS_ENABLED:'1'},{HERO_VICTORY_CHESTS_ENABLED:'1',HERO_DIAMONDS_ENABLED:'1'}])assert.equal(createVictoryChestPolicy(flags).enabled,false);
 assert.equal(policy.enabled,true);assert.ok(Object.isFrozen(policy.config.gold));
 for(const bad of [null,{}, {...APPROVED_VICTORY_CHEST_CONFIG,goldWeights:[0,1,1,1,1]},{...APPROVED_VICTORY_CHEST_CONFIG,magicDustChance:10001},{...APPROVED_VICTORY_CHEST_CONFIG,gold:[100,120]}])assert.equal(createVictoryChestPolicy({HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1',HERO_VICTORY_CHESTS_ENABLED:'1'},bad).enabled,false);
});
test('five equal-weight gold results; dust40% and diamond10% independent, all3 can coexist',()=>{
 for(let i=0;i<5;i++)assert.deepEqual(rollVictoryChest(undefined,sequence([i,3999,2,999])),{gold:100+i*5,magicDust:5,diamonds:1});
 assert.deepEqual(rollVictoryChest(undefined,sequence([0,4000,0,1000])),{gold:100,magicDust:0,diamonds:0});
 assert.deepEqual(rollVictoryChest(undefined,sequence([0,0,1,9999])),{gold:100,magicDust:4,diamonds:0});
 assert.deepEqual(rollVictoryChest(undefined,sequence([0,9999,0,0])),{gold:100,magicDust:0,diamonds:1});
 for(const quantity of [0,1,2])assert.equal(rollVictoryChest(undefined,sequence([0,0,quantity,9999])).magicDust,3+quantity);
 let dust=0,diamond=0;for(let i=0;i<10000;i++){const r=rollVictoryChest(undefined,sequence([0,i,0,i]));dust+=r.magicDust>0;diamond+=r.diamonds>0;}assert.equal(dust,4000);assert.equal(diamond,1000);
});
test('server weights configurable without changing allowed amounts; RNG invalid values fail',()=>{
 const config={...APPROVED_VICTORY_CHEST_CONFIG,version:'weighted-v2',goldWeights:[2,1,1,1,1]};assert.equal(rollVictoryChest(config,sequence([1,9999,0,9999])).gold,100);assert.equal(rollVictoryChest(config,sequence([2,9999,0,9999])).gold,105);
 for(const n of [-1,5,NaN,.5])assert.throws(()=>rollVictoryChest(undefined,()=>n));
});
test('bot, draw, unpaid, unfinished and missing winner never qualify',async()=>{
 for(const [r,winner] of [[{...room(),mode:'bot'},0],[room(),null],[{...room(),entryPaid:false},0],[{...room(),phase:'auction'},0],[{...room(),players:[]},0]])assert.equal(eligibleVictory(r,winner),false);
 const f=fixture();for(const r of [{...room(),mode:'bot'},{...room(),battleSync:{result:{winner:1,live:true,finished:true}}},{...room(),battleSync:{result:{winner:0,live:true,finished:false}}}])await assert.rejects(f.persist(r));assert.equal(f.queries.length,0);
 await assert.rejects(persistVictoryChestIntent({database:f.database,room:room(),winner:0,policy:createVictoryChestPolicy()}));assert.equal(f.queries.length,0);
});
test('intent rolls once and is durable before credit; parallel retries use same outcome',async()=>{
 const f=fixture();const results=await Promise.all(Array.from({length:12},()=>f.persist()));assert.equal(f.state.intents.size,1);assert.equal(f.state.receipts.size,0);assert.equal(f.state.wallets.winner.gold,450);assert.ok(results.every(r=>r.gold_amount===120&&r.magic_dust_amount===5&&r.diamond_amount===1));
 const old=structuredClone(f.state);await f.persist(room(),()=>{throw Error('must not reroll')});assert.deepEqual(f.state,old);
});
test('concurrent credit grants exactlyonce3currencies, replaces120 namespace and isolates loser',async()=>{
 const f=fixture();await f.persist();const results=await Promise.all(Array.from({length:12},()=>f.credit()));assert.equal(results.filter(r=>!r.replayed).length,1);assert.deepEqual(f.state.wallets.winner,{gold:570,diamonds:1,magicDust:5});assert.deepEqual(f.state.wallets.loser,{gold:450,diamonds:0,magicDust:0});assert.equal(f.state.receipts.size,1);assert.equal(f.state.awards.get('123:1:1000').amount,120);
 assert.deepEqual(results[0].receipt,{matchId:'123:1:1000',receiptId:'123:1:1000',configVersion:policy.config.version,rewards:{gold:120,magicDust:5,diamonds:1}});
 const locks=f.queries.filter(s=>s.endsWith('FOR UPDATE')).slice(0,3).map(s=>s.split(' FROM ')[1].split(' ')[0]);assert.deepEqual(locks,['hero_auction_wallets','hero_auction_diamond_wallets','hero_auction_magic_dust_wallets']);
});
for(const failAt of ['UPDATE hero_auction_wallets','UPDATE hero_auction_diamond_wallets','UPDATE hero_auction_magic_dust_wallets','INSERT INTO hero_auction_victory_chest_receipts','INSERT INTO hero_auction_gold_awards'])test('credit fault rolls back all wallets/receipt; stable intent retained: '+failAt,async()=>{
 const f=fixture({failAt});await f.persist();const before=structuredClone(f.state);await assert.rejects(f.credit(),/Injected/);assert.deepEqual(f.state,before);
});
test('lost intentCOMMIT response returns original outcome onretry, lost creditCOMMIT cannot grant twice',async()=>{
 for(const loseCommitAt of [1,2]){
  const f=fixture({loseCommitAt});if(loseCommitAt===1){await assert.rejects(f.persist(),/Lost COMMIT/);await f.persist(room(),()=>{throw Error('reroll')});}else await f.persist();
  if(loseCommitAt===2)await assert.rejects(f.credit(),/Lost COMMIT/);else await f.credit();
  const replay=await f.credit();assert.equal(replay.replayed,true);assert.deepEqual(f.state.wallets.winner,{gold:570,diamonds:1,magicDust:5});assert.equal(f.state.receipts.size,1);
 }
});
test('legacy rewarded matches cannot also getchest; conflict afterintent rollscreditback',async()=>{
 const f=fixture({legacy:true});await assert.rejects(f.persist(),/zaten/);assert.equal(f.state.intents.size,0);
 const g=fixture();await g.persist();g.state.awards.set('123:1:1000',{account_id:'winner',amount:120});const before=structuredClone(g.state);await assert.rejects(g.credit(),/başka işlem/);assert.deepEqual(g.state,before);
 const h=fixture();await assert.rejects(h.persist({...room(),goldAward:{id:'123:1:1000'}}));assert.equal(h.state.intents.size,0);
});
test('winner conflict, missingintent and wallet overflow cannot create rewards',async()=>{
 const f=fixture();await f.persist();const changed=room();changed.players[0].accountId='loser';await assert.rejects(f.persist(changed),/kazananı farklı/);
 await assert.rejects(fixture().credit(),/bulunamadı/);
 for(const balances of [{gold:2147483647},{diamonds:2147483647},{magicDust:2147483647}]){const g=fixture(balances);await g.persist();const before=structuredClone(g.state);await assert.rejects(g.credit(),/sınırını/);assert.deepEqual(g.state,before);}
});
test('only winner sees committedreceipt; pending reveals no amounts/token/account, rematchkeydiffers',async()=>{
 const f=fixture(),r=room();assert.deepEqual(victoryChestView(r,0),{matchId:'123:1:1000',victoryChest:null,victoryChestPending:true});assert.equal(victoryChestView(r,1).victoryChestPending,false);
 await f.persist();r.victoryChestReceipt=(await f.credit()).receipt;r.victoryChestPending=false;assert.ok(victoryChestView(r,0).victoryChest);assert.equal(victoryChestView(r,1).victoryChest,null);assert.equal(victoryChestView(r,-1).victoryChest,null);assert.doesNotMatch(JSON.stringify(victoryChestView(r,0)),/secret|winner|accountId/);
 const next={...r,matchNumber:2};assert.notEqual(victoryMatchId(next),victoryMatchId(r));assert.equal(victoryChestView(next,0).victoryChest,null);
});
test('migration is additive, credit ledger separate from existing negative diamond ledger',()=>{
 const sql=readFileSync(new URL('../migrations/005-victory-chests-magic-dust.sql',import.meta.url),'utf8');assert.match(sql,/magic_dust_cost INTEGER NOT NULL DEFAULT 0 CHECK/);assert.doesNotMatch(sql,/UPDATE hero_auction_|DELETE FROM|DROP TABLE|ALTER TABLE hero_auction_diamond_ledger/i);assert.match(sql,/FOREIGN KEY\(match_id,account_id,config_version,gold_amount,magic_dust_amount,diamond_amount\)/);
});
