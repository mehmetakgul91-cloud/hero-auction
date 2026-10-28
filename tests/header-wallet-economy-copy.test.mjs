import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {victoryChestReceipt} from '../public/victory-chest.js';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('let victoryChestCapability=null;'),app.indexOf('function showGold(value)'));
const configured={enabled:true,available:true,goldOptions:[100,105,110,115,120],goldWeights:[1,1,1,1,1],magicDustOptions:[3,4,5],magicDustChance:40,diamondChance:10};
function fixture(lang='tr'){
 const nodes=Object.fromEntries(['play-reward-label','play-reward-prefix','play-reward-odds','home-guide-economy','home-guide-prize-value','home-guide-prize-kind','home-guide-reward-detail'].map(id=>[id,{textContent:'',hidden:true}]));
 const context=vm.createContext({victoryChestReceipt,auctionMatchKey:r=>r.matchId,document:{documentElement:{lang}},$:id=>nodes[id]});vm.runInContext(source,context);
 return {context,nodes,lobby:config=>context.renderLobbyEconomy(config),result:(room={},tied=false,iWon=true)=>context.legacyRewardCopy(room,tied,iWon)};
}
const receipt={matchId:'123:1:10',receiptId:'victory:123:1:10',configVersion:'approved-v1',rewards:{gold:105,magicDust:4,diamonds:1}};

test('flags OFF preserves120; flags ON shows chest with server odds instead of an extra120',()=>{
 const f=fixture();f.lobby({enabled:false,available:false});assert.equal(f.nodes['play-reward-label'].textContent,'120 altın');assert.equal(f.nodes['play-reward-odds'].hidden,true);
 f.lobby(configured);assert.equal(f.nodes['play-reward-label'].textContent,'Zafer sandığı');assert.match(f.nodes['home-guide-economy'].textContent,/Kazanana zafer sandığı/);assert.doesNotMatch(f.nodes['home-guide-economy'].textContent,/120/);assert.match(f.nodes['play-reward-odds'].textContent,/Altın garantili: 100 \/ 105 \/ 110 \/ 115 \/ 120 \(her biri %20\)/);assert.match(f.nodes['play-reward-odds'].textContent,/%40 ihtimalle 3–5 büyü tozu, %10 ihtimalle 1 elmas/);assert.match(f.nodes['play-reward-odds'].textContent,/Bağımsız çekilişler/);
});
test('unavailable or unknown policy never advertises an active chest or assumes120',()=>{
 const f=fixture();f.lobby({...configured,available:false});assert.equal(f.nodes['play-reward-label'].textContent,'Sandık hazırlanıyor');assert.match(f.nodes['play-reward-odds'].textContent,/giriş bekletiliyor/);assert.doesNotMatch(f.nodes['play-reward-odds'].textContent,/%40|garantili/);
 f.lobby(null);assert.equal(f.nodes['play-reward-label'].textContent,'Ödül bilgisi alınamadı');assert.equal(f.nodes['play-reward-odds'].hidden,true);assert.doesNotMatch(JSON.stringify(f.result()),/120/);
});
test('odds are server values; missing weights do not invent equal probability',()=>{
 const f=fixture();f.lobby({...configured,goldWeights:undefined,magicDustChance:25,diamondChance:5});assert.doesNotMatch(f.nodes['play-reward-odds'].textContent,/%20|%40|%10/);assert.match(f.nodes['play-reward-odds'].textContent,/%25|%5/);
 f.lobby({...configured,magicDustChance:'40'});assert.equal(f.nodes['play-reward-odds'].hidden,true);
});
test('committed legacy result lists only actual receipt rewards, never adds120',()=>{
 const f=fixture();f.lobby(configured);let copy=f.result({matchId:receipt.matchId,victoryChest:receipt});assert.equal(copy.headline,'ZAFER SANDIĞI DOĞRULANDI');assert.equal(copy.detail,'Cüzdanına eklendi: 105 altın · 4 büyü tozu · 1 elmas');assert.doesNotMatch(JSON.stringify(copy),/120/);
 copy=f.result({matchId:receipt.matchId,victoryChest:{...receipt,rewards:{gold:100,magicDust:0,diamonds:0}}});assert.equal(copy.detail,'Cüzdanına eklendi: 100 altın');assert.doesNotMatch(copy.detail,/tozu|elmas/);
});
test('pending, malformed or wrong-match receipt never claims credit or120',()=>{
 const f=fixture();f.lobby(configured);
 for(const room of [{victoryChestPending:true},{matchId:'other',victoryChest:receipt},{matchId:receipt.matchId,victoryChest:{...receipt,rewards:{gold:120,magicDust:999,diamonds:999}}}]){
  const copy=f.result(room);assert.match(copy.headline,/DOĞRULANIYOR/);assert.doesNotMatch(JSON.stringify(copy),/eklendi|120|999/);
 }
});
test('loser cannot present a winner receipt; bots stay zero and draws explicitly refund50',()=>{
 const f=fixture();f.lobby(configured);
 const loser=f.result({matchId:receipt.matchId,victoryChest:receipt},false,false);assert.match(loser.headline,/KAZANANA/);assert.doesNotMatch(loser.detail,/105|eklendi|120/);
 for(const tied of [false,true]){const bot=f.result({mode:'bot',victoryChest:receipt},tied,true);assert.equal(bot.headline,'ANTRENMAN · 0 ALTIN');assert.doesNotMatch(JSON.stringify(bot),/120|İADE|eklendi/);}
 assert.match(f.result({},true,true).headline,/50 ALTIN İADESİ/);assert.match(f.result({},true,false).detail,/Her oyuncunun 50 altın/);
});
test('existing committed or pending chest stays honest after flags are turnedOFF',()=>{
 const f=fixture();f.lobby({enabled:false});assert.match(f.result().headline,/120/);assert.match(f.result({victoryChestPending:true}).headline,/DOĞRULANIYOR/);assert.match(f.result({matchId:receipt.matchId,victoryChest:receipt}).detail,/105 altın/);
});
test('English labels and trusted-event refresh work without portal postMessage or event money',()=>{
 const f=fixture('en');f.lobby(configured);assert.equal(f.nodes['play-reward-label'].textContent,'Victory chest');assert.match(f.nodes['play-reward-odds'].textContent,/each 20%|Independent rolls/);assert.match(f.result({matchId:receipt.matchId,victoryChest:receipt}).detail,/105 gold · 4 magic dust · 1 diamond/);
 assert.match(app,/window.addEventListener\('hero:wallet-refresh',\(\)=>void refreshGold\(\)\)/);assert.doesNotMatch(app,/postMessage\(/);assert.match(app,/pageshow',event=>\{if\(event.persisted\)void refreshGold\(\)/);
});

test('tutorial prize badge and detail follow server policy instead of advertising fixed120',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/120 <small>ALTIN/);
 for(const lang of ['tr','en']){
  const f=fixture(lang);f.lobby(configured);
  assert.equal(f.nodes['home-guide-prize-value'].textContent,'✦');
  assert.match(f.nodes['home-guide-reward-detail'].textContent,/100 \/ 105 \/ 110 \/ 115 \/ 120/);
  assert.match(f.nodes['home-guide-reward-detail'].textContent,/40/);assert.match(f.nodes['home-guide-reward-detail'].textContent,/10/);
  f.lobby({...configured,magicDustChance:25,diamondChance:5});assert.match(f.nodes['home-guide-reward-detail'].textContent,/25/);
  f.lobby(null);assert.equal(f.nodes['home-guide-prize-value'].textContent,'—');assert.doesNotMatch(f.nodes['home-guide-reward-detail'].textContent,/100|120|40/);
  f.lobby({enabled:false});assert.equal(f.nodes['home-guide-prize-value'].textContent,'120');
 }
});
