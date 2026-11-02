import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {botTerms,botTermsCopy,createBotEntryConsent,botSettlementCopy} from '../public/bot-entry.js';
import {crazyGamesSource} from '../crazygames-build.js';
import {victoryChestReceipt} from '../public/victory-chest.js';
const capability={available:true,version:'bot-free-v2',entryGold:0,difficulties:{easy:{level:15,gold:100,magicDust:0},medium:{level:25,gold:125,magicDust:2},hard:{level:40,gold:175,magicDust:5}}};
function fixture({confirm=()=>true,cap=capability,fetch}={}){
 const memory=new Map();let ids=0,confirms=0;
 const consent=createBotEntryConsent({fetch:fetch||(async()=>({ok:true,json:async()=>({botEconomy:cap})})),confirm:copy=>{confirms++;return confirm(copy)},storage:{getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},uuid:()=>`request-${++ids}`,english:()=>true});
 return {consent,memory,confirms:()=>confirms};
}
test('fixed disclosures have exact approved level, entry, win and refund amounts',()=>{
 for(const [difficulty,rule] of Object.entries(capability.difficulties)){
  const terms=botTerms(capability,difficulty);assert.deepEqual(terms,{difficulty,...rule,entryGold:0});
  for(const english of [true,false]){const copy=botTermsCopy(terms,english);assert.ok(copy.includes(String(rule.level)));assert.ok(copy.includes(String(rule.gold)));assert.match(copy,english?/free/:/ücretsiz/);assert.doesNotMatch(copy,/50 gold|50 altın/);}
 }
 assert.equal(botTerms({...capability,entryGold:50},'easy'),null);
 assert.equal(botTerms(capability,'impossible'),null);
 assert.equal(botTerms({...capability,version:'old'},'easy'),null);
});
test('cancel creates neither approval nor admission id; unavailable durable storage never offers a game',async()=>{
 const f=fixture({confirm:()=>false});assert.equal(await f.consent.request('account:direct','easy'),null);assert.equal(f.memory.size,0);
 const unavailable=fixture({cap:{...capability,available:false}});await assert.rejects(unavailable.consent.request('a','easy'),/unavailable/);assert.equal(unavailable.confirms(),0);
});
test('retries retain admission id but re-confirm; success clears the id; unresolved difficulty changes fail closed',async()=>{
 const f=fixture();const first=await f.consent.request('a:direct','hard');
 assert.deepEqual(await f.consent.request('a:direct','hard'),first);assert.equal(f.confirms(),2);
 const other=await f.consent.request('b:direct','hard');assert.notEqual(other.requestId,first.requestId);
 f.consent.complete('a:direct');assert.notEqual((await f.consent.request('a:direct','hard')).requestId,first.requestId);
 await assert.rejects(f.consent.request('a:direct','easy'),/earlier entry difficulty/);
});
test('concurrent clicks cannot create a second consent prompt or request',async()=>{
 let release;const response=new Promise(resolve=>release=resolve);
 const f=fixture({fetch:()=>response});const first=f.consent.request('a','easy');assert.equal(await f.consent.request('a','easy'),null);
 release({ok:true,json:async()=>({botEconomy:capability})});assert.ok(await first);assert.equal(f.confirms(),1);
});
test('bot chest accepts only fixed no-diamond tuples and preserves PvP schema',()=>{
 const receipt=rewards=>({matchId:'123:1:1',receiptId:'123:1:1',configVersion:'bot-fixed-v1',rewards});
 for(const [gold,magicDust] of [[100,0],[125,2],[175,5]])assert.ok(victoryChestReceipt(receipt({gold,magicDust,diamonds:0}),'123:1:1'));
 for(const rewards of [{gold:175,magicDust:5,diamonds:1},{gold:125,magicDust:0,diamonds:0},{gold:120,magicDust:4,diamonds:0}])assert.equal(victoryChestReceipt(receipt(rewards),'123:1:1'),null);
});
test('all bot entry surfaces call explicit consent; fallback cancel only detaches',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),battle=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(app,/botEntryConsent\.request\(scope,difficulty\)/);
 assert.match(app,/enterBotGame\('\/api\/bot-accept'/);
 assert.match(app,/\$\('bot-offer-cancel'\)\.onclick=\(\)=>\$\('leave'\)\.click\(\)/);
 assert.match(battle,/state\.room\?\.mode==='bot'\?await botEntryConsent\.request/);
});

test('portal admission request identifiers use isolated storage',()=>{const source=readFileSync(new URL('../public/bot-entry.js',import.meta.url),'utf8');assert.match(crazyGamesSource(source,'.js'),/hero-auction-cg-bot-entry/);});

test('refund copy requires a matching committed 50 gold zero-dust receipt',()=>{
 const receipt={matchId:'123:1:1',receiptId:'123:1:1',configVersion:'bot-fixed-v1',outcome:'tie',rewards:{gold:50,magicDust:0,diamonds:0}};
 assert.match(botSettlementCopy(receipt,'123:1:1',true),/refunded/);
 assert.equal(botSettlementCopy(receipt,'other',true),null);
 assert.equal(botSettlementCopy({...receipt,rewards:{gold:0,magicDust:0,diamonds:0}},'123:1:1',true),null);
});

test('corrupt or unreadable recovery storage cannot mint a new admission id',async()=>{
 const f=fixture();f.memory.set('hero-auction-bot-entry:a','broken');await assert.rejects(f.consent.request('a','easy'),/verify the earlier/);
 const consent=createBotEntryConsent({fetch:async()=>({ok:true,json:async()=>({botEconomy:capability})}),confirm:()=>true,storage:{getItem(){throw Error('blocked')},setItem(){throw Error('must not write')}},uuid:()=>{throw Error('must not mint')},english:()=>true});
 await assert.rejects(consent.request('a','easy'),/verify the earlier/);
});

test('visible entry controls disable while the guarded operation is pending and restore on exit',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/entryButtons=\['bot','bot-offer-accept','rematch','bot-recovery-rematch'\]/);
 assert.match(app,/button\.disabled=true;button\.setAttribute\('aria-busy','true'\)/);
 assert.match(app,/if\(button\.isConnected\)\{button\.disabled=false;button\.removeAttribute\('aria-busy'\)/);
});

test('free bot receipts never advertise a refund and still require exact no-reward tuples',()=>{
 const matchId='123:1:1',base={matchId,receiptId:matchId,configVersion:'bot-free-v2',rewards:{gold:0,magicDust:0,diamonds:0}};
 for(const outcome of ['loss','tie','server_failure'])for(const english of [false,true]){
  const copy=botSettlementCopy({...base,outcome},matchId,english);
  assert.match(copy,english?/Entry was free/:/Giriş ücretsizdi/);
  assert.doesNotMatch(copy,/50|refunded|iade edildi/);
 }
 for(const rewards of [{gold:50,magicDust:0,diamonds:0},{gold:0,magicDust:1,diamonds:0},{gold:0,magicDust:0,diamonds:1}])assert.equal(botSettlementCopy({...base,outcome:'tie',rewards},matchId),null);
 assert.equal(botSettlementCopy({...base,outcome:'win'},matchId),null);
});

test('new free bot victory receipts preserve approved tuples and legacy paid receipts',()=>{
 for(const configVersion of ['bot-fixed-v1','bot-free-v2'])for(const [gold,magicDust] of [[100,0],[125,2],[175,5]]){
  const value={matchId:'123:1:1',receiptId:'123:1:1',configVersion,rewards:{gold,magicDust,diamonds:0}};
  assert.ok(victoryChestReceipt(value,'123:1:1'));
  assert.equal(victoryChestReceipt({...value,rewards:{...value.rewards,diamonds:1}},'123:1:1'),null);
 }
});

test('old unresolved admission request id is recovered using free terms without minting a new request',async()=>{
 const f=fixture();f.memory.set('hero-auction-bot-entry:a:direct',JSON.stringify({difficulty:'hard',requestId:'old-paid-request'}));
 assert.deepEqual(await f.consent.request('a:direct','hard'),{difficulty:'hard',requestId:'old-paid-request',botTermsVersion:'bot-free-v2'});
 assert.equal(f.memory.size,1);
});

test('all bot labels advertise free entry while PvP entry remains 50 gold',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(app,/Computer games are free/);assert.match(app,/Giriş ücretsiz\. Ödül yalnız galibiyette/);
 assert.match(html,/Bilgisayar maçına giriş ücretsiz/);
 assert.match(html,/Oyunculu maç: kişi başı 50 altın/);
 assert.doesNotMatch(app+html,/Computer games cost 50|Bilgisayar maçı 50 altın|Bilgisayar maçına giriş 50 altın|Giriş: 50 altın · Galibiyet/);
});
