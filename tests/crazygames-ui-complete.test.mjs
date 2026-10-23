import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
