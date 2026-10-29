import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BOT_ECONOMY,admitBotMatch,settleBotMatch,findBotAdmission,recoverBotMatches} from '../bot-economy.js';
const room=(difficulty='medium')=>({code:'123',created:1000,matchNumber:1,mode:'bot',phase:'auction',difficulty,players:[{accountId:'fixture-human',token:'fixture-human-token'},{token:'fixture-bot-token'}],series:[0,0]});
// Deterministic transaction model, NOT PostgreSQL concurrency/isolation proof.
function fixture({gold=500,dust=0,loseCommit=0,failAt=''}={}){
 const state={wallets:new Map([['fixture-human',{gold,dust}]]),entries:new Map(),settlements:new Map(),rooms:new Map()};
 let tail=Promise.resolve(),commits=0;const queries=[];
 const execute=async(sql,a,draft)=>{
  queries.push(sql);if(failAt&&sql.startsWith(failAt))throw Error('Injected write failure');
  if(sql.startsWith('SELECT e.match_id'))return{rows:[...draft.entries.values()].filter(r=>r.account_id===a[0]&&!draft.settlements.has(r.match_id)).map(r=>({match_id:r.match_id}))};
  if(sql.startsWith('SELECT e.*'))return{rows:[...draft.entries.values()].map(r=>({...r,settled_room_state:draft.settlements.get(r.match_id)?.room_state,outcome:draft.settlements.get(r.match_id)?.outcome}))};
  if(sql.startsWith('SELECT * FROM hero_auction_bot_entries'))return{rows:[...draft.entries.values()].filter(r=>sql.includes('account_id=$1')?r.account_id===a[0]&&r.request_id===a[1]:r.match_id===a[0])};
  if(sql.startsWith('SELECT * FROM hero_auction_bot_settlements'))return{rows:draft.settlements.has(a[0])?[draft.settlements.get(a[0])]:[]};
  if(sql.startsWith('SELECT state FROM hero_auction_rooms'))return{rows:draft.rooms.has(a[0])?[{state:draft.rooms.get(a[0])}]:[]};
  if(sql.startsWith('SELECT gold FROM'))return{rows:draft.wallets.has(a[0])?[{gold:draft.wallets.get(a[0]).gold}]:[]};
  if(sql.startsWith('SELECT magic_dust FROM'))return{rows:[{magic_dust:draft.wallets.get(a[0]).dust}]};
  if(sql.startsWith('INSERT INTO hero_auction_wallets')){if(!draft.wallets.has(a[0]))draft.wallets.set(a[0],{gold:500,dust:0});return{rows:[]}};
  if(sql.startsWith('INSERT INTO hero_auction_magic_dust_wallets'))return{rows:[]};
  if(sql.startsWith('UPDATE hero_auction_wallets')){draft.wallets.get(a[0]).gold+=sql.includes('gold-50')?-50:a[1];return{rows:[]}};
  if(sql.startsWith('UPDATE hero_auction_magic_dust_wallets')){draft.wallets.get(a[0]).dust+=a[1];return{rows:[]}};
  if(sql.startsWith('INSERT INTO hero_auction_bot_entries')){const names=['match_id','account_id','request_id','difficulty','config_version','gold_before','gold_after','room_state'];const row=Object.fromEntries(names.map((n,i)=>[n,n==='room_state'?JSON.parse(a[i]):a[i]]));draft.entries.set(a[0],row);return{rows:[]}};
  if(sql.startsWith('INSERT INTO hero_auction_bot_settlements')){const names=['match_id','account_id','config_version','outcome','gold_amount','magic_dust_amount','gold_before','gold_after','magic_dust_before','magic_dust_after','room_state'];const row=Object.fromEntries(names.map((n,i)=>[n,n==='room_state'?JSON.parse(a[i]):a[i]]));draft.settlements.set(a[0],row);return{rows:[]}};
  if(sql.startsWith('INSERT INTO hero_auction_rooms')){const next=JSON.parse(a[1]),old=draft.rooms.get(a[0]);if(old){const same=old.created===next.created&&old.players[0].accountId===next.players[0].accountId;const fallback=['matching','bot_offer'].includes(old.phase)&&(old.matchNumber||1)===(next.matchNumber||1);const rematch=old.phase==='finished'&&(old.matchNumber||1)+1===(next.matchNumber||1)&&(old.matchSettled||draft.settlements.has(`${old.code}:${old.matchNumber||1}:${old.created}`));if(!same||!fallback&&!rematch)return{rows:[]}}draft.rooms.set(a[0],next);return{rows:[{code:a[0]}]}};
  if(sql.startsWith('UPDATE hero_auction_rooms')){const old=draft.rooms.get(a[0]);if(old&&String(old.created)===a[2]&&String(old.matchNumber||1)===a[3])draft.rooms.set(a[0],JSON.parse(a[1]));return{rows:[]}};
  throw Error('Unhandled SQL '+sql);
 };
 const database={query:(s,a=[])=>execute(s,a,state),async connect(){let draft,unlock;return{release(){},async query(sql,a=[]){
  if(sql==='BEGIN'){const prev=tail;tail=new Promise(r=>unlock=r);await prev;draft=structuredClone(state);return{rows:[]}}
  if(sql==='COMMIT'){Object.assign(state,draft);draft=null;unlock();unlock=null;if(++commits===loseCommit)throw Error('Lost COMMIT response');return{rows:[]}}
  if(sql==='ROLLBACK'){draft=null;unlock?.();unlock=null;return{rows:[]}}
  if(sql.startsWith('SELECT pg_advisory'))return{rows:[]};return execute(sql,a,draft);
 }}}};
 const id=randomUUID();const admit=(r=room(),requestId=id)=>admitBotMatch({database,accountId:'fixture-human',requestId,room:r});
 const finish=async(winner=0,options={})=>{const entry=[...state.entries.values()][0];const r={...entry.room_state,phase:'finished',battleSync:{result:{live:true,finished:true,winner}}};return settleBotMatch({database,room:r,winner,...options})};
 return{state,database,queries,admit,finish,id};
}
test('approved fixed amounts and levels, no diamond or random rewards',()=>{
 assert.deepEqual(BOT_ECONOMY,{version:'bot-fixed-v1',entryGold:50,difficulties:{easy:{level:15,gold:100,magicDust:0},medium:{level:25,gold:125,magicDust:2},hard:{level:40,gold:175,magicDust:5}}});assert.ok(Object.isFrozen(BOT_ECONOMY.difficulties.hard));
});
test('parallel same-request admission takes one entry and returns same room/token',async()=>{
 const f=fixture();const results=await Promise.all(Array.from({length:20},()=>f.admit()));assert.equal(f.state.wallets.get('fixture-human').gold,450);assert.equal(f.state.entries.size,1);assert.equal(results.filter(x=>!x.replayed).length,1);assert.ok(results.every(x=>x.room.players[0].token==='fixture-human-token'));
});
test('distinct requests cannot start concurrent unresolved matches',async()=>{
 const f=fixture();const results=await Promise.allSettled(Array.from({length:12},(_,i)=>f.admit({...room(),code:String(200+i)},randomUUID())));assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.state.wallets.get('fixture-human').gold,450);
});
for(const difficulty of ['easy','medium','hard'])for(const winner of [0,1,null])test(`${difficulty} ${winner} exactly-once durable settlement`,async()=>{
 const f=fixture();await f.admit(room(difficulty));const values=await Promise.all(Array.from({length:10},()=>f.finish(winner)));const reward=winner===0?BOT_ECONOMY.difficulties[difficulty]:{gold:winner===null?50:0,magicDust:0};
 assert.deepEqual(f.state.wallets.get('fixture-human'),{gold:450+reward.gold,dust:reward.magicDust});assert.equal(f.state.settlements.size,1);assert.equal(values.filter(x=>!x.replayed).length,1);assert.ok(values.every(x=>x.receipt.rewards.diamonds===0&&x.room.matchSettled));assert.deepEqual(values[0].room.series,winner===0?[1,0]:winner===1?[0,1]:[0,0]);assert.equal(!!values[0].room.victoryChestReceipt,winner===0);assert.equal(f.state.wallets.size,1);
});
test('insufficient funds and invalid request/difficulty/bot account never charge',async()=>{
 const f=fixture({gold:49});await assert.rejects(f.admit(),/50/);assert.equal(f.state.entries.size,0);assert.equal(f.state.wallets.get('fixture-human').gold,49);
 const g=fixture();for(const r of [{...room(),difficulty:'cheat'},{...room(),players:[{accountId:'fixture-human'},{accountId:'bot'}]}])await assert.rejects(g.admit(r));await assert.rejects(g.admit(room(),'bad'));assert.equal(g.state.entries.size,0);
 await assert.rejects(admitBotMatch({database:null,accountId:'fixture-human',requestId:randomUUID(),room:room()}),/Kalıcı/);
});
test('lost entry and settlement COMMIT responses replay committed receipts',async()=>{
 for(const loseCommit of [1,2]){const f=fixture({loseCommit});if(loseCommit===1)await assert.rejects(f.admit(),e=>e.uncertain&&e.status===503);else await f.admit();if(loseCommit===1)await f.admit();if(loseCommit===2)await assert.rejects(f.finish(),e=>e.uncertain);else await f.finish();await f.finish();assert.deepEqual(f.state.wallets.get('fixture-human'),{gold:575,dust:2});assert.equal(f.state.entries.size,1);assert.equal(f.state.settlements.size,1)}
});
for(const failAt of ['INSERT INTO hero_auction_bot_entries','INSERT INTO hero_auction_rooms'])test('entry write rollback '+failAt,async()=>{const f=fixture({failAt});await assert.rejects(f.admit(),/Injected/);assert.equal(f.state.wallets.get('fixture-human').gold,500);assert.equal(f.state.entries.size,0)});
for(const failAt of ['UPDATE hero_auction_magic_dust_wallets','INSERT INTO hero_auction_bot_settlements','UPDATE hero_auction_rooms'])test('settlement write rollback '+failAt,async()=>{const f=fixture({failAt});await f.admit();await assert.rejects(f.finish(),/Injected/);assert.deepEqual(f.state.wallets.get('fixture-human'),{gold:450,dust:0});assert.equal(f.state.settlements.size,0)});
test('restart recovery and find admission return durable terminal receipt; outcomes immutable',async()=>{
 const f=fixture();await f.admit();await f.finish();const found=await findBotAdmission({database:f.database,accountId:'fixture-human',requestId:f.id});assert.equal(found.room.botSettlementReceipt.outcome,'win');assert.equal(found.room.matchSettled,true);const recovered=await recoverBotMatches(f.database);assert.equal(recovered[0].settled,true);assert.deepEqual(recovered[0].room,found.room);await assert.rejects(f.finish(1),/kesinleşti/);assert.equal(await findBotAdmission({database:f.database,accountId:'other',requestId:f.id}),null);
});
test('old free matches cannot settle; trusted failure refunds and forfeit loses',async()=>{
 const f=fixture();await assert.rejects(settleBotMatch({database:f.database,room:{...room(),phase:'finished'},winner:0}));await f.admit();const result=await f.finish(null,{serverFailure:'server_restart'});assert.equal(result.receipt.outcome,'server_failure');assert.equal(f.state.wallets.get('fixture-human').gold,500);assert.equal(result.room.victoryChestReceipt,undefined);
 const g=fixture();await g.admit();const r={...[...g.state.entries.values()][0].room_state,phase:'finished',battleSync:{result:{winner:null,live:true,finished:false}}};await assert.rejects(settleBotMatch({database:g.database,room:r,winner:1}));await settleBotMatch({database:g.database,room:r,winner:1,forfeit:true});assert.equal(g.state.wallets.get('fixture-human').gold,450);
});
test('no diamond SQL, no bot wallet, safe overflow rolls back, lock order gold then dust',async()=>{
 const f=fixture({dust:2147483647});await f.admit();await assert.rejects(f.finish(),/sınırını/);assert.equal(f.state.settlements.size,0);assert.equal(f.state.wallets.get('fixture-human').gold,450);assert.ok(f.queries.every(s=>!s.includes('diamond')));const locks=f.queries.filter(s=>s.includes('FOR UPDATE'));assert.match(locks.at(-2),/SELECT gold/);assert.match(locks.at(-1),/SELECT magic_dust/);
});

test('durable unrelated/newer room collision rolls back wallet and entry; same identity rematch succeeds',async()=>{
 const f=fixture();await f.admit();await f.finish(1);const before=structuredClone(f.state);
 await assert.rejects(f.admit({...room(),created:2000},randomUUID()),/Oda kimliği/);assert.deepEqual(f.state,before);
 await assert.rejects(f.admit({...room(),matchNumber:3},randomUUID()),/Oda kimliği/);assert.deepEqual(f.state,before);
 const next=await f.admit({...room(),matchNumber:2},randomUUID());assert.equal(next.room.matchNumber,2);assert.equal(f.state.wallets.get('fixture-human').gold,400);assert.equal(f.state.entries.size,2);
});
test('fallback preserves matching identity; lost settlement cannot overwrite newer room',async()=>{
 const f=fixture();f.state.rooms.set('123',{...room(),phase:'bot_offer'});const admitted=await f.admit();assert.equal(admitted.room.phase,'auction');
 const newer={...room(),created:2000};f.state.rooms.set('123',newer);await f.finish();assert.deepEqual(f.state.rooms.get('123'),newer);assert.equal(f.state.settlements.size,1);
});

test('admission reconciliation ignores stale uncharged fallback snapshot and prefers terminal receipt',async()=>{
 const f=fixture();await f.admit();f.state.rooms.set('123',{...room(),phase:'bot_offer'});
 const recovered=await findBotAdmission({database:f.database,accountId:'fixture-human',requestId:f.id});assert.equal(recovered.room.phase,'auction');assert.equal(recovered.room.botEntry.entryGold,50);
 await f.finish();f.state.rooms.set('123',{...recovered.room,matchSettled:false});const replay=await f.admit();assert.equal(replay.room.matchSettled,true);assert.equal(replay.room.botSettlementReceipt.outcome,'win');
});
