import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createArenaTeamRenderer,arenaShieldMeter} from '../public/arena-team-renderer.js';

class Element {
 children=[];parent=null;dataset={};style={setProperty(key,value){this[key]=value;}};attributes={};classes=new Set();
 classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),add:name=>this.classes.add(name)};
 get isConnected(){return this.root||!!this.parent?.isConnected;}
 append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node);}}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null;}}
 replaceChildren(...nodes){for(const node of [...this.children])node.remove();this.append(...nodes);}
 insertBefore(node,before){node.remove();node.parent=this;this.children.splice(before?this.children.indexOf(before):this.children.length,0,node);}
 setAttribute(key,value){this.attributes[key]=value;}
 removeAttribute(key){delete this.attributes[key];}
 set src(value){this.url=value;this.naturalWidth=100;this.naturalHeight=150;this.onload?.();}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 let created=0,artLoads=0;const fallen=[];
 const document={createElement(){created++;return new Element();}};
 const renderer=createArenaTeamRenderer({document,loadArt:unit=>{artLoads++;return '/art/'+unit.id;},onDefeated:card=>fallen.push(card)});
 const parents=[new Element(),new Element()];parents.forEach(parent=>parent.root=true);
 const teams=parents.map(()=>Array.from({length:5},(_,index)=>({id:'hero:'+index,name:'Hero '+index,role:'fighter',lane:index<2?'front':'back',hp:100,maxHp:100})));
 const update=(side=0)=>renderer.update(parents[side],teams[side],{side,rows:3,laneRows:{front:[2,4],back:[2,3,4]},fittedRows:{front:[1,3],back:[1,2,3]},roleNames:{fighter:'Savaşçı'}});
 return {renderer,parents,teams,update,fallen,counts:()=>({created,artLoads})};
}
test('1000 live updates reuse exactly ten cards and ten portraits, preserving animations and target selection',async()=>{
 const h=fixture();h.update(0);h.update(1);await flush();
 const original=h.parents.map(parent=>parent.children.slice()),counts=h.counts();
 original[0][0].classList.add('magic-target-selected');original[0][1].classList.add('attack-melee');
 for(let tick=0;tick<1000;tick++)for(let side=0;side<2;side++){h.teams[side][0].hp=100-tick%100;h.update(side);}
 await flush();assert.deepEqual(h.counts(),counts);assert.equal(counts.artLoads,10);
 for(let side=0;side<2;side++)assert.deepEqual(h.parents[side].children,original[side]);
 assert.notEqual(original[0][0],original[1][0]);
 assert.equal(original[0][0].children[2].children[0].style.width,'1%');
 assert.ok(original[0][0].classes.has('magic-target-selected'));assert.ok(original[0][1].classes.has('attack-melee'));
 h.teams[0][0].hp=0;h.update();h.update();assert.deepEqual(h.fallen,[original[0][0]]);
 assert.equal(h.teams[1][0].hp,1);
});
test('roster changes and rematches release old cards and cannot attach delayed portraits to them',async()=>{
 const h=fixture();h.update();const old=h.parents[0].children.slice();
 h.teams[0].reverse();h.update();assert.equal(h.parents[0].children[0],old[4]);
 h.teams[0].pop();h.update();assert.equal(old[0].isConnected,false);
 h.renderer.reset();h.update();await flush();
 assert.ok(old.every(node=>!node.isConnected));assert.equal(h.parents[0].children.length,4);
 assert.equal(old[1].children[0].children[0].className,'portrait-fallback');
});

const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
test('returning after a long pause yields after four moves and suppresses catch-up effects without losing events',()=>{
 let cursor=0,timer=1,replayDueAt=1,now=100000,finished=0,animated=0;const classes=new Set(),events=Array.from({length:101});
 const document={hidden:false,body:{classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)}}};
 const context={document,window:{matchMedia:()=>({matches:false})},$ :()=>({checked:true}),Date:{now:()=>now},duration:()=>100,events,arenaWakeLock:{},arenaFinaleActive:false,
  step:()=>{cursor++;if(context.motion())animated++;},stop:()=>timer=null,showVictoryReveal:()=>finished++};
 for(const [key,get,set] of [['cursor',()=>cursor,v=>cursor=v],['timer',()=>timer,v=>timer=v],['replayDueAt',()=>replayDueAt,v=>replayDueAt=v]])Object.defineProperty(context,key,{get,set});
 const code=source.slice(source.indexOf('const motion='),source.indexOf('const duration='))+source.slice(source.indexOf('function advanceReplay(){'),source.indexOf('function startReplay(){'));
 runInNewContext(code+';this.motion=motion;this.advance=advanceReplay;',context);
 context.advance();assert.equal(cursor,4);assert.equal(animated,0);assert.equal(classes.size,0);
 for(let tick=0;tick<30;tick++)context.advance();
 assert.equal(cursor,101);assert.equal(timer,null);assert.equal(finished,1);assert.equal(animated,0);
 assert.equal(context.motion(),true);document.hidden=true;assert.equal(context.motion(),false);
});
test('match completion releases wake lock, stops music, and never reacquires on a late response or focus',async()=>{
 let requested=0,released=0,stopped=0,resolveRequest;const listeners=new Map();
 const context={states:[],document:{hidden:false},navigator:{wakeLock:{request:()=>{requested++;return new Promise(resolve=>resolveRequest=resolve);}}},window:{addEventListener:(name,fn)=>listeners.set(name,fn)},Date,setTimeout,
  stopArenaMusic:()=>stopped++};
 const active=source.slice(source.indexOf('const arenaActive='),source.indexOf('// Original procedural'));
 const wake=source.slice(source.indexOf('let arenaWakeLock='),source.indexOf('function stop(){'));
 runInNewContext('let battlePresentationFinished=false,leavingBattle=false,arenaMode=true,timer=null;'+active+wake+';this.request=requestArenaWakeLock;',context);
 const pending=context.request();assert.equal(requested,1);
 listeners.get('heroarena:battle-finished')();assert.equal(stopped,1);
 resolveRequest({release:async()=>released++,addEventListener(){}});await pending;
 assert.equal(released,1);await context.request();assert.equal(requested,1);
 assert.doesNotMatch(source,/captureStream|arenaKeepAwakeVideo/);
});

test('shield meter reads authoritative current shield, distinguishes uncapped reference and handles zero',()=>{
 assert.deepEqual(arenaShieldMeter({shield:25,maxHp:100}),{current:25,reference:100,percent:25,label:'Kalkan 25 · ölçek: 100 can'});
 assert.equal(arenaShieldMeter({shield:25,maxHp:100,shieldCap:50}).percent,50);
 assert.equal(arenaShieldMeter({shield:25,maxHp:100,shieldKnown:false}).label,'Kalkan bilgisi bekleniyor');
 assert.equal(arenaShieldMeter({shield:0,maxHp:100,shieldCap:0}).percent,0);
 assert.equal(arenaShieldMeter({shield:200,maxHp:100}).percent,100);
 for(const shield of [undefined,-1,NaN,Infinity])assert.equal(arenaShieldMeter({shield,maxHp:100}).current,0);
});
test('every hero has a stable distinct shield meter below unchanged HP across live and replay updates',()=>{
 const h=fixture();
 for(let side=0;side<2;side++){
  h.teams[side].forEach((unit,index)=>{unit.shield=index*10;});h.update(side);
  h.parents[side].children.forEach((card,index)=>{
   const hp=card.children[2],shield=card.children[3];
   assert.equal(hp.className,'hp');assert.equal(hp.children[0].style.width,'100%');
   assert.equal(shield.className,'arena-shield');assert.equal(shield.attributes.role,'meter');
   assert.equal(shield.children[0].style.width,index*10+'%');assert.equal(shield.attributes['aria-valuenow'],String(index*10));
  });
 }
 const card=h.parents[0].children[1],meter=card.children[3];
 h.teams[0][1].shield=7;h.update();assert.equal(parseFloat(meter.children[0].style.width),7);
 h.teams[0][1].shield=0;h.update();assert.equal(card.children[3],meter);assert.equal(meter.children[0].style.width,'0%');
 assert.equal(card.children[2].children[0].style.width,'100%');
 h.teams[0][1].shieldKnown=false;h.update();assert.equal(meter.attributes['aria-valuenow'],undefined);assert.equal(meter.attributes['aria-valuetext'],'Kalkan bilgisi bekleniyor');
});
test('bot playback consumes server shield snapshots and live snapshots retain shield without guessing from event text',()=>{
 assert.match(source,/initialShields/);assert.match(source,/last\.shieldSnapshot/);
 assert.match(source,/Object\.assign\(unit,live\)/);
 const css=readFileSync(new URL('../public/battle-preview.css',import.meta.url),'utf8');
 assert.match(css,/grid-template-rows:minmax\(0,1fr\) 11px 5px 4px/);
 assert.match(css,/prefers-reduced-motion:reduce\)\{\.arena-shield/);
});
test('replay groups authoritative hero actions so shield absorption and the hit appear together',()=>{
 const code=source.slice(source.indexOf(' const first=events[cursor];'),source.indexOf(' const last=batch[batch.length-1];'));
 const events=[{actionId:'3:0:a',action:'shield'},{actionId:'3:0:a',damageType:'special'},{actionId:'3:1:b',damageType:'normal'}];
 const context={events,cursor:0};runInNewContext(code+';this.batch=batch;',context);
 assert.equal(context.cursor,2);assert.equal(context.batch.length,2);
 const old={events:[{actorId:'a',round:3,damageType:'splash'},{actorId:'a',round:3,damageType:'special'}],cursor:0};
 runInNewContext(code+';this.batch=batch;',old);assert.equal(old.cursor,2);assert.equal(old.batch.length,2);
});

test('rarity remains roster-correct on both teams through live stat changes, death and rematch',()=>{
 const h=fixture();
 for(let side=0;side<2;side++){
  Object.assign(h.teams[side][0],{id:'original:01',name:'Obsidyen Muhafız',power:1,rarity:'common'});
  h.update(side);
  const portrait=h.parents[side].children[0].children[0];
  assert.equal(portrait.dataset.rarity,'legendary');
  assert.match(portrait.attributes['aria-label'],/Efsanevi/);
  assert.equal(portrait._rarityBadge.attributes['aria-hidden'],'true');
 }
 const portrait=h.parents[0].children[0].children[0],badge=portrait._rarityBadge;
 h.teams[0][0].hp=0;h.teams[0][0].power=1000;h.update();
 assert.equal(portrait._rarityBadge,badge);assert.equal(portrait.dataset.rarity,'legendary');
 assert.match(portrait.attributes['aria-label'],/Yenildi/);
 h.renderer.reset();h.update();assert.notEqual(h.parents[0].children[0].children[0],portrait);
 assert.equal(h.parents[0].children[0].children[0].dataset.rarity,'legendary');
});
