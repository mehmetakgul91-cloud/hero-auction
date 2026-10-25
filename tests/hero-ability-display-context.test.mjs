import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {abilityImpact} from '../public/hero-ability-text.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const roster=JSON.parse(read('../battle-roster.json')).characters.map(hero=>({...hero,power:hero.proposedPower}));
const gallerySource=read('../public/kahramanlar.js');

// A small DOM for the real render/event functions, not a browser layout substitute.
class Element{
 constructor(tag='div'){
  this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};
  this.style={};this.listeners={};this.className='';this.hidden=false;this.value='';
  this._text='';this.open=false;this.scrollTop=0;
  this.classList={add:name=>{this.className+=' '+name},toggle:()=>{}};
 }
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 append(...children){
  for(const child of children){
   if(child.tagName==='#FRAGMENT'){this.append(...child.children);child.children=[];}
   else{child.parent=this;this.children.push(child);}
  }
 }
 replaceChildren(...children){for(const child of this.children)child.parent=null;this.children=[];this._text='';this.append(...children);}
 setAttribute(name,value){this.attributes[name]=String(value);}
 getAttribute(name){return this.attributes[name]??null;}
 addEventListener(name,listener){(this.listeners[name]??=[]).push(listener);}
 dispatch(name,properties={}){
  const event={target:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},...properties};
  for(const listener of this.listeners[name]||[])listener(event);
  return event;
 }
 click(){return this.dispatch('click');}
 focus(){this.focused=true;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
 showModal(){this.open=true;this.showCount=(this.showCount||0)+1;}
 close(){this.open=false;}
 getBoundingClientRect(){return {left:10,top:10,right:300,bottom:500};}
}
const descendants=node=>node.children.flatMap(child=>[child,...descendants(child)]);
const withClass=(node,name)=>descendants(node).filter(child=>child.className.split(/\s+/).includes(name));
const shown=node=>!node.hidden&&(!node.parent||shown(node.parent));

async function gallery(){
 const nodes=new Map(),calls=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 get('hero-role').value='all';
 const context={
  document:{documentElement:{lang:'tr'},getElementById:get,createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('#fragment')},
  abilityImpact:(ability,options)=>{calls.push({ability,options});return abilityImpact(ability,options);},
  heroStoryParagraphs:hero=>[hero.name+' hikâyesi'],heroStoryOverview:hero=>[hero.name+' story'],
  window:{},fetch:async url=>{assert.equal(url,'/api/heroes');return {ok:true,json:async()=>({heroes:roster})};}
 };
 // Await the actual startup load; no second synthetic render or click is needed.
 const executable=gallerySource.replace(/^import .*;\n/gm,'').replace('void loadHeroes();','globalThis.initialLoad=loadHeroes();');
 runInNewContext(executable,context);await context.initialLoad;
 return {get,calls,cards:()=>get('hero-gallery').children};
}
function assertCardDescriptions(card,hero){
 const rows=withClass(card,'gallery-skill');assert.equal(rows.length,2);
 for(const [index,kind]of ['active','passive'].entries()){
  const copy=rows[index].children.find(node=>node.tagName==='STRONG');
  assert.equal(copy.textContent,abilityImpact(hero[kind]),hero.name+' '+kind);
  assert.notEqual(copy.textContent,abilityImpact(hero[kind],{compact:true}),hero.name+' must not use gameplay summary');
  assert.ok(shown(copy),hero.name+' '+kind+' is visible without expanding anything');
  assert.ok(rows[index].title.endsWith(copy.textContent));
 }
}

test('all 50 gallery cards show complete active and passive copy immediately, without opening details',async()=>{
 const h=await gallery();assert.equal(h.cards().length,50);
 assert.equal(h.get('hero-story-dialog').open,false);
 for(const [index,hero]of roster.entries())assertCardDescriptions(h.cards()[index],hero);
 assert.equal(h.calls.length,100);assert.ok(h.calls.every(call=>call.options?.compact!==true));
 assert.equal(h.get('hero-gallery').getAttribute('aria-busy'),'false');
});

test('gallery filters and reset preserve direct full descriptions after repeated renders',async()=>{
 const h=await gallery(),filter=h.get('hero-filters').children.find(node=>node.dataset.rarity==='legendary');
 filter.click();filter.click();
 const legendary=roster.filter(hero=>hero.rarity==='legendary');
 assert.equal(h.cards().length,legendary.length);
 h.cards().forEach((card,index)=>assertCardDescriptions(card,legendary[index]));
 assert.equal(filter.getAttribute('aria-pressed'),'true');
 h.get('hero-search').value='no such hero';h.get('hero-search').dispatch('input');
 assert.equal(h.cards().length,0);assert.equal(h.get('gallery-empty').hidden,false);
 h.get('gallery-reset').click();assert.equal(h.cards().length,50);assert.equal(h.get('hero-search').focused,true);
 h.get('hero-role').value='support';h.get('hero-role').dispatch('change');
 const support=roster.filter(hero=>hero.role==='support');
 assert.equal(h.cards().length,support.length);h.cards().forEach((card,index)=>assertCardDescriptions(card,support[index]));
 h.get('gallery-reset').click();h.get('hero-search').value='kael';h.get('hero-search').dispatch('input');
 assert.equal(h.cards().length,1);assertCardDescriptions(h.cards()[0],roster.find(hero=>hero.name==='Kael'));
 h.get('gallery-reset').click();assert.equal(h.cards().length,50);
});

test('details keep full copy across story tabs, close/reopen and a different hero',async()=>{
 const h=await gallery(),dialog=h.get('hero-story-dialog');
 const assertDetails=hero=>{
  assert.equal(dialog.open,true);assert.equal(h.get('hero-story-title').textContent,hero.name);
  assert.equal(h.get('hero-detail-skills').hidden,false);
  const boxes=withClass(h.get('hero-detail-skills'),'hero-ability-box');assert.equal(boxes.length,2);
  for(const [index,kind]of ['active','passive'].entries()){
   const copy=descendants(boxes[index]).find(node=>node.tagName==='H3');
   assert.equal(copy.textContent,abilityImpact(hero[kind]));assert.ok(shown(copy));
  }
 };
 h.cards()[0].click();assertDetails(roster[0]);
 h.get('hero-lore-tab').click();assert.equal(h.get('hero-detail-skills').hidden,true);assert.equal(h.get('hero-story-text').hidden,false);
 h.get('hero-detail-scroll').scrollTop=300;
 const key=h.get('hero-lore-tab').dispatch('keydown',{key:'Home'});assert.equal(key.defaultPrevented,true);
 assert.equal(h.get('hero-detail-scroll').scrollTop,0);assertDetails(roster[0]);
 h.get('hero-lore-tab').click();h.get('hero-story-close').click();assert.equal(dialog.open,false);
 const kaelIndex=roster.findIndex(hero=>hero.name==='Kael');
 const openKey=h.cards()[kaelIndex].dispatch('keydown',{key:'Enter'});assert.equal(openKey.defaultPrevented,true);
 assertDetails(roster[kaelIndex]);assert.equal(h.get('hero-story-text').hidden,true);
 dialog.dispatch('click',{clientX:0,clientY:0});assert.equal(dialog.open,false);
 h.cards()[0].click();assertDetails(roster[0]);
 assert.ok(h.calls.every(call=>call.options?.compact!==true));
});

test('gallery ability text has wrapping rather than a CSS clamp or collapsed details',()=>{
 const css=read('../public/kahramanlar.css');
 assert.match(css,/\.gallery-skill strong\{[^}]*white-space:normal[^}]*overflow-wrap:anywhere/);
 for(const match of css.matchAll(/\.(?:gallery-skills|gallery-skill(?: strong)?|gallery-card-body|hero-ability-box(?: h3)?)\{([^}]*)\}/g)){
  assert.doesNotMatch(match[1],/line-clamp|text-overflow\s*:\s*ellipsis|max-height\s*:|(?:^|;)height\s*:/);
 }
 assert.match(css,/\.hero-detail-scroll\{[^}]*overflow:auto/);
 assert.doesNotMatch(gallerySource,/compact\s*:\s*true/);
});

function auction(){
 const source=read('../public/app.js'),start=source.indexOf('async function loadHeroInfo(card){'),end=source.indexOf('\nconst socialEsc=',start);
 assert.ok(start>=0&&end>start);
 const nodes=new Map(['hero-description','auction-active','auction-passive','auction-lane-bonuses'].map(id=>[id,new Element()]));
 const calls=[],memo=new Map(),room={phase:'auction',card:null};
 const context={
  document:{documentElement:{lang:'tr'},getElementById:id=>nodes.get(id),querySelector:()=>null},room,infoMemo:memo,
  abilityImpact:(ability,options)=>{calls.push({ability,options});return abilityImpact(ability,options);},
  fetch:()=>{throw Error('Preloaded hero unexpectedly fetched');}
 };
 runInNewContext(source.slice(start,end)+'\nglobalThis.load=loadHeroInfo;',context);
 return {context,nodes,calls,memo,room,load:context.load};
}

test('real gameplay loadHeroInfo selects compact active/passive copy for all 50 heroes and repeat loads',async()=>{
 const h=auction();
 for(const hero of roster){
  h.room.card=hero;h.memo.set(hero.universe+':'+hero.name,hero);
  await h.load(hero);await h.load(hero);
  assert.equal(h.nodes.get('auction-active').textContent,'⚔ Aktif: '+abilityImpact(hero.active,{compact:true}),hero.name);
  assert.equal(h.nodes.get('auction-passive').textContent,'✦ Pasif: '+abilityImpact(hero.passive,{compact:true}),hero.name);
 }
 assert.equal(h.calls.length,200);assert.ok(h.calls.every(call=>call.options?.compact===true));
});

test('late hero-info response cannot replace the current auction summary after navigation',async()=>{
 const h=auction(),first=roster[0],next=roster[1];let resolve;
 h.room.card=first;h.context.fetch=()=>new Promise(done=>{resolve=done;});
 const pending=h.load(first);h.room.card=next;h.memo.set(next.universe+':'+next.name,next);await h.load(next);
 const active=h.nodes.get('auction-active').textContent,passive=h.nodes.get('auction-passive').textContent;
 resolve({ok:true,json:async()=>first});await pending;
 assert.equal(h.nodes.get('auction-active').textContent,active);assert.equal(h.nodes.get('auction-passive').textContent,passive);
 assert.equal(h.calls.length,2);
 h.room.phase='finished';await h.load(next);assert.equal(h.calls.length,2);
});
