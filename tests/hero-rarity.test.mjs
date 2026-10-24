import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {battleRoster} from '../battle-roster.js';
import {heroRarity,normalizeHeroRarity,heroRarityLabel,applyHeroRarity} from '../public/hero-rarity.js';

test('every active roster hero retains actual rarity by ID and preview name, never combat power',()=>{
 const seen=new Set();
 for(const hero of battleRoster){
  seen.add(hero.rarity);
  assert.equal(heroRarity({id:hero.id,name:'',power:0,rarity:'incorrect'}),hero.rarity,hero.id);
  assert.equal(heroRarity({name:hero.name,power:999}),hero.rarity,hero.name);
 }
 assert.deepEqual([...seen].sort(),['advanced','legendary','rare']);
});
test('English and Turkish rarity aliases normalize safely',()=>{
 for(const [input,expected] of [[' SIRADAN ','common'],['Sıradan','common'],['GELİŞMİŞ','advanced'],['gelismis','advanced'],['NADİR','rare'],['efsanevi','legendary'],['LEGENDARY','legendary']])assert.equal(normalizeHeroRarity(input),expected,input);
 for(const value of [undefined,null,'bogus','<script>'])assert.equal(normalizeHeroRarity(value),null);
 assert.equal(heroRarity({rarity:'Gelişmiş'}),'advanced');
 assert.equal(heroRarity({power:100}),'common');
 assert.equal(heroRarityLabel('rare','en'),'Rare');assert.equal(heroRarityLabel('rare'),'Nadir');
});
test('three distinct static SVG cues, common no badge; changes remove old cues and repeat does not allocate',()=>{
 const shapes=new Set();let created=0;
 const document={documentElement:{lang:'en'},createElement(){created++;return {setAttribute(){},remove(){this.removed=true;}}}};
 const portrait={dataset:{},append(node){this.last=node;}};
 for(const rarity of ['advanced','rare','legendary']){
  assert.equal(applyHeroRarity(document,portrait,{rarity}),heroRarityLabel(rarity,'en'));
  const badge=portrait._rarityBadge;shapes.add(badge.innerHTML);
  applyHeroRarity(document,portrait,{rarity});assert.equal(portrait._rarityBadge,badge);
 }
 assert.equal(shapes.size,3);assert.equal(created,3);
 const badge=portrait._rarityBadge;applyHeroRarity(document,portrait,{rarity:'common'});
 assert.equal(badge.removed,true);assert.equal(portrait._rarityBadge,null);
});
test('preparation uses shared rarity in accessible names without extra visible text or gameplay changes',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(source,/applyHeroRarity\(document,portrait,\{name:demoA\[heroIndex\]\[0\]/);
 assert.match(source,/setAttribute\('aria-label',demoA\[heroIndex\]\[0\]\+' · '\+rarityLabel/);
 assert.match(source,/portrait.title=demoA\[heroIndex\]\[0\]\+' · '\+rarityLabel/);
});
test('rarity CSS matches auction frame palette, is static and stays inside portraits',()=>{
 const css=readFileSync(new URL('../public/battle-preview.css',import.meta.url),'utf8').split('/* Static inner rarity frame;')[1];
 const auction=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 for(const [key,color] of Object.entries({common:'#aab0bb',advanced:'#4faeff',rare:'#b56bff',legendary:'#ffca50'})){
  assert.ok(css.includes(`[data-rarity="${key}"]{--hero-rarity:${color}}`));
  assert.ok(auction.includes(`.rarity-frame-${key}{--rarity-frame:${color}`));
 }
 assert.match(css,/inset:2px/);assert.match(css,/pointer-events:none/);
 assert.doesNotMatch(css,/animation:|@keyframes|\.hp\s*\{|\.arena-shield\s*\{/);
});

test('result portrait sources match all 50 active local assets; unknown heroes never load arbitrary URLs',async()=>{
 const {heroPortraitSource}=await import('../public/hero-rarity.js');
 for(const hero of battleRoster){
  assert.equal(heroPortraitSource(hero),hero.portrait);
  assert.match(heroPortraitSource(hero),/^\/images\/[a-zA-Z0-9/_-]+\.(?:png|webp|jpg)$/);
  assert.ok(readFileSync(new URL('../public'+heroPortraitSource(hero),import.meta.url)).length>0);
 }
 assert.equal(heroPortraitSource({id:'not-a-hero',portrait:'https://example.test/tracker'}),null);
});
test('result cell uses safe text, labeled rarity and persistent fallback on absent/broken images',async()=>{
 const {createSummaryHeroIdentity}=await import('../public/hero-rarity.js');
 class Element{
  children=[];dataset={};attributes={};classList={toggle(){}};
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  setAttribute(k,v){this.attributes[k]=v;}
 }
 const images=[];const document={documentElement:{lang:'tr'},createElement(tag){const el=new Element();if(tag==='img')images.push(el);return el;}};
 const hero=battleRoster[0],cell=createSummaryHeroIdentity(document,hero),portrait=cell.children[0],name=cell.children[1];
 assert.equal(name.textContent,hero.name);assert.equal(name.attributes.translate,'no');assert.match(portrait.attributes['aria-label'],/Efsanevi/);
 assert.equal(portrait.children.at(-1).className,'portrait-fallback');
 images[0].onerror();assert.equal(portrait.children.at(-1).className,'portrait-fallback');
 images[0].onload();assert.equal(portrait.children.at(-1).className,'summary-hero-image');
 assert.equal(images[0].alt,'');
 const unknown=createSummaryHeroIdentity(document,{id:'unknown',name:'<img onerror=alert(1)>'});
 assert.equal(unknown.children[1].textContent,'<img onerror=alert(1)>');assert.equal(images.length,1);
 assert.equal(unknown.children[0].children.at(-1).className,'portrait-fallback');
});
test('result integration replaces only hero name cell; statistic ordering and ranking stay intact',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(source,/line.append\(createSummaryHeroIdentity\(document,hero\)\)/);
 assert.match(source,/sort\(\(a,b\)=>b.dealt-a.dealt\|\|a.index-b.index\)/);
 assert.match(source,/\[\['Hasar',dealt\],\['Alınan',taken\],\['Kalkan',blocked\],\['Şifa',healing\]\]/);
});
