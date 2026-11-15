import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MELEE_SPRITES} from '../public/hero-melee-sprites-data.js';
import {meleeSpriteProfile,meleeSpritePose,appendMeleeSprite} from '../public/hero-melee-sprites.js';
import {heroCombatPresentation} from '../public/hero-combat-presentation.js';
import {playHeroAttack,createHeroAttackPlayer} from '../public/hero-attack-effects.js';
import {createCombatEffects} from '../public/arena-combat-effects.js';

test('every current melee hero has independent full-body artwork and the actual ability identity',()=>{
 const roster=JSON.parse(readFileSync(new URL('../battle-roster.json',import.meta.url))).characters;
 const melee=roster.filter(h=>['tank','fighter','assassin'].includes(h.role)&&!heroCombatPresentation(h).stationary);
 assert.equal(melee.length,28);
 assert.deepEqual(Object.keys(MELEE_SPRITES).sort(),melee.map(h=>h.id).sort());
 const hashes=new Set();
 for(const hero of melee){
  const profile=meleeSpriteProfile(hero);
  assert.equal(profile.effect,hero.active.effect,hero.id);
  const file=readFileSync(new URL('../public'+profile.src,import.meta.url));
  assert.equal(file.subarray(8,12).toString(),'WEBP',hero.id);
  assert.ok(file.length>50000,hero.id);
  hashes.add(createHash('sha256').update(file).digest('hex'));
  for(const point of [profile.contact,profile.specialContact])assert.ok(point.every(n=>Number.isFinite(n)&&n>0&&n<1),hero.id);
 }
 assert.equal(hashes.size,28,'heroes must not share a generic pose sheet');
 for(const hero of roster.filter(h=>heroCombatPresentation(h).stationary))assert.equal(meleeSpriteProfile(hero),null);
});

test('normal and special use distinct painted pose rows and hold their finishing pose',()=>{
 for(const special of [false,true]){
  const first=meleeSpritePose(0,special),last=meleeSpritePose(1,special);
  assert.equal(first.from,special?3:0);
  assert.equal(first.blend,0);
  assert.equal(last.to,special?5:2);
  assert.equal(last.blend,1);
  assert.deepEqual(meleeSpritePose(4,special),last);
 }
});

function fixture(){
 let now=0,serial=0;
 const frames=new Map(),timers=new Map(),nodes=[];
 const gradient={addColorStop(){}};
 const ctx=new Proxy({}, {get:(_,key)=>['createLinearGradient','createRadialGradient'].includes(key)?()=>gradient:()=>{}});
 function element(tag){
  return {tag,className:'',children:[],style:{setProperty(){}},classList:{add(){},contains(){return false}},width:1152,height:768,
   complete:true,naturalWidth:1152,setAttribute(){},removeAttribute(){},append(n){this.children.push(n)},
   getContext:()=>ctx,remove(){this.removed=true},cloneNode(){return element('img')},
   querySelector:()=>null,getBoundingClientRect:()=>({left:30,top:50,width:54,height:54})};
 }
 const body=element('body');body.append=n=>nodes.push(n);
 const document={body,createElement:element,defaultView:{
  requestAnimationFrame(fn){const id=++serial;frames.set(id,fn);return id},
  cancelAnimationFrame(id){frames.delete(id)}
 }};
 const setTimer=(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:now+ms});return id};
 const clearTimer=id=>timers.delete(id);
 const effects=createCombatEffects({document,maxResources:12,setTimer,clearTimer});
 function advance(time){
  now=time;
  const pending=[...frames.entries()];frames.clear();for(const [,fn] of pending)fn();
  for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn()}
 }
 return {document,effects,nodes,frames,timers,advance,clock:()=>now,element,setTimer,clearTimer};
}

test('full-body normal and special casts reach contact once and fade there in both directions',()=>{
 for(const special of [false,true])for(const direction of [-1,1]){
  const h=fixture();
  const result=appendMeleeSprite({...h,hero:{id:'original:14'},from:{x:150,y:100},to:{x:150+direction*300,y:240},width:54,arrival:600,special});
  assert.equal(result,true);
  assert.equal(h.nodes.length,1);
  h.advance(600);
  const node=h.nodes[0],contact={x:node.style.left,y:node.style.top};
  h.advance(710);
  assert.equal(node.style.left,contact.x);
  assert.equal(node.style.top,contact.y);
  h.effects.clear();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);assert.equal(node.removed,true);
 }
});

test('Kael special remains a physical body strike while lightning contact emits exactly one damage callback',()=>{
 const h=fixture(),actor=h.element('div'),target=h.element('div');
 actor.querySelector=selector=>selector==='.arena-portrait-image'?h.element('img'):null;
 target.getBoundingClientRect=()=>({left:320,top:50,width:54,height:54});
 let hits=0;
 const timing=playHeroAttack({...h,actor,target,hero:{id:'original:14',role:'fighter'},kind:'lightning',special:true,onImpact(){hits++}});
 assert.equal(timing.painted,true);
 assert.ok(h.nodes.some(n=>n.className==='hero-melee-sprite is-special'));
 assert.ok(h.nodes.every(n=>!n.className.includes('hero-fx-flight')&&!n.className.includes('hero-fx-swing')));
 h.advance(timing.arrival-1);assert.equal(hits,0);
 h.advance(timing.arrival);assert.equal(hits,1);
 h.advance(timing.arrival+100);assert.equal(hits,1);
 h.effects.clear();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
});


test('self shield and drain-healing events cannot suppress the following physical special pose',()=>{
 for(const [id,role,kind] of [['original:01','tank','shield'],['original:expansion-04','fighter','heal']]){
  const h=fixture(),actor=h.element('div'),target=h.element('div');
  actor.querySelector=selector=>selector==='.arena-portrait-image'?h.element('img'):null;
  target.getBoundingClientRect=()=>({left:320,top:50,width:54,height:54});
  const player=createHeroAttackPlayer(h);
  const immediate=player.play({actor,target:actor,hero:{id,role},kind,special:true,castKey:37});
  assert.equal(immediate.arrival,0);
  let hits=0;
  const strike=player.play({actor,target,hero:{id,role},kind:'strike',special:true,castKey:37,onImpact(){hits++}});
  assert.equal(strike.arrival,840);
  assert.equal(strike.painted,true);
  h.advance(839);assert.equal(hits,0);
  h.advance(840);assert.equal(hits,1);
  player.clear();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
 }
});
