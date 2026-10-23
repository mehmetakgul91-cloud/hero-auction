import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {translate,localizeNode,phrases} from '../public/crazygames-en.js';
import {uiPhrases,translateAuctionHistory} from '../public/crazygames-ui-phrases.js';
import {crazyGamesSource} from '../crazygames-build.js';
test('every UI source phrase and complete instruction translates before fragments',()=>{
 for(const [tr,en] of Object.entries(uiPhrases)){assert.equal(translate(tr),en,tr);assert.equal(translate(en),en,tr)}
 for(const tr of ['Teklif ver, 20 kredinle 5 kahraman topla.','Her 2 ana dal seviyesinde tur enerjisi +1.'])assert.equal(translate(tr),phrases[tr]);
 assert.equal(translate('🎴 Teklif ver, 20 kredinle 5 kahraman topla. →'),'🎴 Bid for 5 heroes with your 20 credits. →');
 assert.equal(translate(' kahraman'),' heroes');assert.equal(translate('1’e 1'),'1 vs 1');assert.equal(translate(' düello'),' duel');assert.equal(translate('kredi'),'credits');
 assert.equal(translate('Misafir · Saldırı Komutanı · Sv. 0'),'Guest · Attack Commander · Lv. 0');
 assert.equal(translate('Gerçek savaş motoru hazır · 12 tur'),'Battle engine ready · 12 rounds');
});
test('auction logs preserve names while translating templates and remain stable',()=>{
 const samples={
  'Can 3 kredi teklif etti.':'Can bid 3 credits.',
  'Can Savaşçı karakterini 3 krediye aldı.':'Can Savaşçı — recruited for 3 credits.',
  'Bilgisayar pas geçti.':'Computer passed.',
  'Oyun henüz başlamadı.':'The game has not started yet.',
  'Sıra Can oyuncusuna geçti.':"It is now Can's turn."
 };
 for(const [tr,en] of Object.entries(samples)){assert.equal(translateAuctionHistory(tr),en);assert.equal(translateAuctionHistory(en),en)}
});
test('native leave and commander confirmations use display locale without changing rules',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(source,/confirm\(uiText\('Bu cihazda odadan ayrılmak istiyor musun\?'\)\)/);
 assert.match(source,/Spend 5,000 gold to switch to/);
 assert.match(source,/const uiText=text=>document.documentElement.lang==='en'\?translate\(text\):text/);
 const web=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(web,/<html lang="tr">/);assert.doesNotMatch(web,/crazygames-en\.js/);
 assert.match(crazyGamesSource(web,'.html'),/<html lang="en">/);
 const locale=readFileSync(new URL('../public/crazygames-en.js',import.meta.url),'utf8');
 assert.match(locale,/typeof document!=='undefined'&&document.documentElement.lang==='en'/);
});

test('all 50 English lore overviews and descriptions preserve the complete Turkish canon',async()=>{
 const {HERO_STORIES,heroStoryParagraphs}=await import('../public/hero-stories.js');
 const {HERO_STORY_OVERVIEWS_EN,heroStoryOverview,heroDescriptionEnglish}=await import('../public/hero-stories-en.js');
 const roster=JSON.parse(readFileSync(new URL('../battle-roster.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(HERO_STORY_OVERVIEWS_EN).sort(),Object.keys(HERO_STORIES).sort());
 assert.equal(Object.keys(HERO_STORIES).length,50);
 for(const hero of roster.characters.filter(h=>Object.hasOwn(HERO_STORIES,h.id))){
  assert.equal(heroStoryParagraphs(hero).length,6);
  assert.equal(heroStoryOverview(hero).length,1);
  assert.equal(heroStoryOverview({name:hero.name})[0],heroStoryOverview(hero)[0]);
  assert.ok(heroStoryOverview(hero)[0].startsWith(heroDescriptionEnglish(hero)));
 }
 const gallery=readFileSync(new URL('../public/kahramanlar.js',import.meta.url),'utf8');
 assert.match(gallery,/Story overview/);
 assert.match(gallery,/document.documentElement.lang==='en'\?heroStoryOverview\(hero\):heroStoryParagraphs\(hero\)/);
});


test('real auction credit rows prefer full phrases over whitespace-prefixed units',()=>{
 for(const n of [0,1,20,23]){
  assert.equal(translate(`💸 ${n} kredi kullanıldı`),`💸 ${n} credits spent`);
  assert.equal(translate(`${n} kredi kullanıldı`),`${n} credits spent`);
  assert.equal(translate(`${n} kredi`),`${n} credits`);
  assert.equal(translate(`${n} kalan kredi`),`${n} credits remaining`);
  assert.equal(translate(`✓ ${n} altın harcandı.`),`✓ ${n} gold spent.`);
 }
 assert.equal(translate('Rol'),'Role');
 assert.equal(translate(' kredi'),' credits');
 assert.equal(translate('kredi kullanıldı'),'credits spent');
 assert.equal(translate('💸 0 credits spent'),'💸 0 credits spent');
});


test('every phrase keeps its exact translation inside real label prefixes',()=>{
 for(const [tr,en] of Object.entries(phrases)){
  for(const wrap of [x=>'💸 '+x,x=>' '+x+' ',x=>'12 '+x]){
   assert.equal(translate(wrap(tr)),wrap(en),tr);
  }
 }
});


test('tail allocation uses contextual Computer display without renaming human players',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const helper=source.match(/const displayPlayerName=([^;]+);/)[1];
 const render=english=>vm.runInNewContext(helper,{document:{documentElement:{lang:english?'en':'tr'}},uiText:translate});
 assert.equal(render(true)({name:'Bilgisayar'},true),'Computer');
 assert.equal(render(false)({name:'Bilgisayar'},true),'Bilgisayar');
 for(const name of ['Bilgisayar','Can','Oyuncu'])assert.equal(render(true)({name},false),name);
 const tail=source.slice(source.indexOf("const startAfter=previousFlights.then"),source.indexOf("offeredAwards.forEach(receiveCard)"));
 assert.match(tail,/displayPlayerName\(p,r.mode==='bot'&&seat===1\)/);
});


test('live shield tooltips and commander cinematic alt text are English',async()=>{
 const {arenaShieldMeter}=await import('../public/arena-team-renderer.js');
 assert.equal(translate(arenaShieldMeter({shield:0,maxHp:166}).label),'Shield 0 · scale: 166 health');
 assert.equal(translate(arenaShieldMeter({shieldKnown:false}).label),'Waiting for shield information');
 for(const amount of [0,74,166])assert.equal(translate(`Kalkan ${amount} · ölçek: 166 can`),`Shield ${amount} · scale: 166 health`);
 const node={nodeType:1,tagName:'IMG',childNodes:[],attrs:{alt:'SAVUNMA komutanı'},closest:()=>null,matches:q=>q.split(',').includes('.commander-cinematic-portrait'),hasAttribute(k){return Object.hasOwn(this.attrs,k)},getAttribute(k){return this.attrs[k]},setAttribute(k,v){this.attrs[k]=v}};
 localizeNode(node);assert.equal(node.attrs.alt,'DEFENSE commander');
 assert.equal(translate('Shield 0 · scale: 166 health'),'Shield 0 · scale: 166 health');
 assert.equal(translate('You can play immediately as a guest.'),'You can play immediately as a guest.');
 node.attrs['aria-valuetext']='Kalkan 0 · ölçek: 166 can';localizeNode(node);assert.equal(node.attrs['aria-valuetext'],'Shield 0 · scale: 166 health');
});
