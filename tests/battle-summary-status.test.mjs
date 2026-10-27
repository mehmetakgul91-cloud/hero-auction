import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {finalHeroStatus,applySummaryHeroStatus,captureFinalHeroHealth} from '../public/battle-summary-status.js';
import {createSummaryHeroIdentity} from '../public/hero-rarity.js';
import {summarizeBattle,orientBattleSummary} from '../public/battle-summary-data.js';
import {simulateRosterBattle,battleRoster} from '../battle-roster.js';

class Element{
 children=[];dataset={};attributes={};className='';textContent='';
 classList={toggle:(name,on)=>{const names=new Set(this.className.split(' ').filter(Boolean));if(on)names.add(name);else names.delete(name);this.className=[...names].join(' ');},add:()=>{},remove:()=>{}};
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);}
 setAttribute(name,value){this.attributes[name]=value;}
 querySelector(selector){const name=selector.slice(1);for(const node of this.children){if(node.className.split(' ').includes(name))return node;const found=node.querySelector(selector);if(found)return found;}return null;}
 scrollIntoView(){}
}
const doc=(lang='tr')=>({documentElement:{lang},createElement:()=>new Element(),body:new Element()});
function row(document,hero){const row=new Element();row.className='battle-hero-stat-row';row.append(createSummaryHeroIdentity(document,hero));for(let i=0;i<4;i++){const number=new Element();number.textContent='123';row.append(number);}return row;}

test('only finite final HP establishes defeated/alive status; missing and malformed HP stay unknown',()=>{
 for(const hp of [0,-1,-0])assert.equal(finalHeroStatus({hp}),'defeated');
 for(const hp of [0.001,1,100])assert.equal(finalHeroStatus({hp}),'alive');
 for(const hp of [undefined,null,'',false,true,'0',NaN,Infinity,-Infinity])assert.equal(finalHeroStatus({hp}),'unknown');
 assert.equal(finalHeroStatus(null),'unknown');assert.equal(finalHeroStatus({alive:false,taken:999,winner:1}),'unknown');
});

test('TR/EN casualty badge uses safe text; values remain present and no disabled semantics',()=>{
 for(const [lang,label] of [['tr','Öldü'],['en','Defeated']]){
  const document=doc(lang),hero={id:'unknown',name:'<Hero>',hp:0},line=row(document,hero);
  applySummaryHeroStatus(document,line,hero);
  assert.match(line.className,/--defeated/);assert.equal(line.dataset.heroStatus,'defeated');
  const badge=line.querySelector('.battle-stat-status');assert.equal(badge.textContent,label);assert.equal(badge.attributes.translate,'no');
  assert.equal(line.querySelector('.battle-stat-name').textContent,'<Hero>');
  assert.deepEqual(line.children.slice(1).map(node=>node.textContent),['123','123','123','123']);
  assert.equal(line.attributes['aria-disabled'],undefined);assert.equal(line.hidden,undefined);
 }
});

test('repeat renders, revived heroes and rematch replacement clear old casualty class and badge',()=>{
 const document=doc(),line=row(document,{name:'A',hp:0});
 applySummaryHeroStatus(document,line,{hp:0});applySummaryHeroStatus(document,line,{hp:0});
 assert.equal(line.querySelector('.battle-stat-name').children.length,1);
 applySummaryHeroStatus(document,line,{hp:40});
 assert.equal(line.dataset.heroStatus,'alive');assert.equal(line.querySelector('.battle-stat-status'),null);assert.doesNotMatch(line.className,/--defeated/);
 applySummaryHeroStatus(document,line,{hp:0});applySummaryHeroStatus(document,line,undefined);
 assert.equal(line.dataset.heroStatus,'unknown');assert.equal(line.querySelector('.battle-stat-status'),null);assert.doesNotMatch(line.className,/--defeated/);
});

const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
function renderSummary(result,{lang='tr',replayTeams=result.teams}={}){
 const document=doc(lang),elements=new Map();
 const $=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 document.querySelector=()=>new Element();
 const context={document,$,finalResult:result,states:replayTeams,events:[],auctionMode:false,finishCommanderControls(){},showVictoryChest(){},createSummaryHeroIdentity,applySummaryHeroStatus,summarizeBattle};
 vm.runInNewContext(source.slice(source.indexOf('function showBattleSummary(){'),source.indexOf('let arenaFinaleTimer='))+';showBattleSummary();',context);
 return {panel:$('battle-summary'),stats:$('battle-summary').querySelector('.battle-hero-stats')};
}
const teams=[[{id:'same',name:'Own dead',hp:0},{id:'other',name:'Own alive',hp:20}],[{id:'same',name:'Rival alive',hp:3},{id:'other',name:'Rival dead',hp:0}]];
const summary={actionCount:2,teams:teams.map(team=>team.map((hero,index)=>({id:hero.id,dealt:index?40:10,taken:999,blocked:10,healing:5}))),commanders:[{},{}]};

test('actual result renderer joins casualties by side+ID after damage sorting, independent of winner and replay HP',()=>{
 const replayTeams=teams.map(team=>team.map(hero=>({...hero,hp:100})));
 const {stats}=renderSummary({teams,summary,winner:0},{replayTeams});
 for(const [side,expected] of [[0,['alive','defeated']],[1,['defeated','alive']]]){
  const rows=stats.children[side].children.filter(node=>node.className.includes('battle-hero-stat-row'));
  assert.deepEqual(rows.map(node=>node.dataset.heroStatus),expected);
  assert.deepEqual(rows.map(node=>node.children[1].textContent),['40','10']);
 }
});

test('second-seat orientation reverses teams and summary together without transferring death across IDs',()=>{
 const {stats}=renderSummary({teams:[teams[1],teams[0]],summary:orientBattleSummary(summary,1),winner:1},{lang:'en'});
 const own=stats.children[0].children.filter(node=>node.className.includes('battle-hero-stat-row'));
 assert.deepEqual(own.map(node=>node.dataset.heroStatus),['defeated','alive']);
 assert.equal(own[0].querySelector('.battle-stat-status').textContent,'Defeated');
});

test('live terminal snapshot wins over reconstructed/coerced states; absent or null HP is not death',()=>{
 const finalHealthTeams=[[{id:'same',hp:null}],[{id:'other',hp:8}]];
 const {stats}=renderSummary({teams,summary,finalHealthTeams,winner:1,live:true});
 const rows=stats.children.flatMap(team=>team.children.filter(node=>node.className.includes('battle-hero-stat-row')));
 assert.deepEqual(rows.map(node=>node.dataset.heroStatus),['unknown','unknown','alive','unknown']);
 assert.match(source,/finalHealthTeams:captureFinalHeroHealth\(snapshot\)/);
 assert.match(source,/if\(liveArenaMode&&e\.detail\.finished\)/);
});

test('real server battle result exposes final HP and drives casualties without mutating result or battle stats',()=>{
 const cards=battleRoster.slice(0,10).map(hero=>({id:hero.id,power:75}));
 const result=simulateRosterBattle(cards.slice(0,5),cards.slice(5),{seed:'summary-casualties',maxRounds:15});
 const before=JSON.stringify(result),{stats}=renderSummary(result);
 for(let side=0;side<2;side++){
  const rows=stats.children[side].children.filter(node=>node.className.includes('battle-hero-stat-row'));
  assert.equal(rows.length,5);
  for(const line of rows){const name=line.querySelector('.battle-stat-name').textContent;const hero=result.teams[side].find(hero=>hero.name===name);assert.equal(line.dataset.heroStatus,hero.hp<=0?'defeated':'alive');}
 }
 assert.equal(JSON.stringify(result),before);
});

test('casualty styling does not lower full-row or number opacity; light text retains AA contrast',()=>{
 const css=readFileSync(new URL('../public/battle-preview.css',import.meta.url),'utf8');
 const theme=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');
 assert.match(css,/--defeated \.summary-hero-portrait\{filter:grayscale\(1\);opacity:\.5\}/);
 assert.doesNotMatch(css,/--defeated\{[^}]*opacity:/);
 assert.match(theme,/--defeated>span\{color:#5a6570\}/);
 const luminance=hex=>{const c=hex.match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 assert.ok((luminance('f0f2ee')+.05)/(luminance('5a6570')+.05)>4.5);
});

test('terminal health copy is immutable against later animation changes and tolerates missing teams',()=>{
 const teams=[[{id:'a',hp:0},null],undefined];
 const captured=captureFinalHeroHealth(teams);teams[0][0].hp=20;
 assert.deepEqual(captured,[[{id:'a',hp:0}],[]]);
 assert.deepEqual(captureFinalHeroHealth(null),[]);
});
