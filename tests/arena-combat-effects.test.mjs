import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {combatEffectKind,combatEffectActors,createCombatEffects} from '../public/arena-combat-effects.js';
const roster=JSON.parse(readFileSync(new URL('../battle-roster.json',import.meta.url))).characters;
test('committed actions distinguish support heal, shield and fallback damage',()=>{
 const support={role:'support'};
 assert.equal(combatEffectKind({action:'heal'},support),'heal');
 assert.equal(combatEffectKind({action:'passive-heal'},support),'heal');
 for(const action of ['shield','tank-front-shield','tank-self-shield','thorns-shield'])assert.equal(combatEffectKind({action},support),'shield');
 assert.equal(combatEffectKind({action:'attack',damageType:'normal'},support),'strike');
 for(const action of ['haste','rage','weaken','armor-break','delay','stun-skip','round-start','commander-support-normal'])assert.equal(combatEffectKind({action,value:25},support),null,action);
 // Ability display names are not semantic effect IDs.
 assert.equal(combatEffectKind({action:'shield-name',damageType:'special'},{role:'energy'}),'magic');
});
test('lightning is mapped to real roster identities, not translated event text',()=>{
 for(const id of ['original:14','original:expansion-01','original:expansion-29']){
  const hero=roster.find(h=>h.id===id);assert.ok(hero);
  assert.equal(combatEffectKind({action:hero.active.name,damageType:'special'},hero),'lightning');
 }
 assert.equal(combatEffectKind({action:'attack',damageType:'normal'},roster.find(h=>h.id==='original:expansion-29')),'strike');
 assert.equal(combatEffectKind({action:'splash',damageType:'splash'},roster.find(h=>h.id==='original:expansion-01')),'lightning');
 assert.equal(combatEffectKind({action:'attack',damageType:'normal'},{role:'energy'}),'magic');
 assert.equal(combatEffectKind({action:'attack'},{id:'original:08',role:'fighter'}),'arrow');
});
test('same hero on opposing teams resolves by committed side, including friendly effects',()=>{
 const teams=[0,1].map(side=>['same','friend'].map(id=>({side,dataset:{heroId:id}})));
 const document={querySelectorAll:()=>teams.flat(),getElementById:id=>({querySelectorAll:()=>teams[id==='team-a'?0:1]})};
 assert.equal(combatEffectActors(document,{actor:'same'},'heal').actor,undefined);
 for(const side of [0,1]){
  const event={side,actorId:'same',targetId:'same'};
  assert.deepEqual(combatEffectActors(document,event,'strike'),{actor:teams[side][0],target:teams[1-side][0]});
  assert.deepEqual(combatEffectActors(document,event,'heal'),{actor:teams[side][0],target:teams[side][0]});
  assert.deepEqual(combatEffectActors(document,{side,actor:'same',action:'passive-heal'},'heal'),{actor:teams[side][0],target:teams[side][0]});
 }
});
function harness(maxResources=80){
 let next=0;const timers=new Map(),nodes=[];
 const element=()=>({children:[],classes:new Set(),style:{setProperty(){}},setAttribute(){},append(n){this.children.push(n)},querySelector(){return null},remove(){this.removed=true},getBoundingClientRect(){return {left:10,top:10,width:60,height:80}},get classList(){return {add:n=>this.classes.add(n),remove:n=>this.classes.delete(n)}}});
 const body=element(),document={body,createElement(){const n=element();nodes.push(n);return n}};
 const effects=createCombatEffects({document,maxResources,setTimer(fn){timers.set(++next,fn);return next},clearTimer(id){timers.delete(id)}});
 return {effects,element,body,timers,nodes,flush(){for(const fn of [...timers.values()])fn()}};
}
test('repeated particles, beams and overlays have a hard resource bound and deterministic cleanup',()=>{
 const h=harness(12),target=h.element();
 for(let i=0;i<100;i++){h.effects.accent(target,'magic');h.effects.beam(target,target,'lightning',500)}
 assert.equal(h.effects.size,12);assert.equal(h.timers.size,12);
 assert.ok(h.nodes.filter(n=>n.className).length===200);
 h.effects.clear();assert.equal(h.effects.size,0);assert.equal(h.timers.size,0);
 assert.ok(h.nodes.filter(n=>n.className).every(n=>n.removed));
 h.effects.accent(target,'heal');h.flush();assert.equal(h.effects.size,0);
});
test('older repeated class cleanup cannot remove the newer cast and interrupted animations cancel',()=>{
 const h=harness(),target=h.element();let cancelled=0;
 h.effects.mark(target,['attack-energy'],700);const old=[...h.timers.values()][0];
 h.effects.mark(target,['attack-energy'],700);old();assert.ok(target.classes.has('attack-energy'));
 target.animate=()=>({cancel(){cancelled++}});h.effects.animate(target,[],{duration:500});
 h.effects.clear();assert.equal(target.classes.size,0);assert.equal(cancelled,1);assert.equal(h.timers.size,0);
});
test('integration registers interruption/motion cleanup and remains web-only',()=>{
 const code=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 for(const event of ['pagehide','popstate','heroarena:route-change','heroarena:connection-lost','heroarena:ready','visibilitychange'])assert.ok(code.includes(event));
 assert.match(code,/clearCombatPresentation\(\);stop\(\);if\(victoryPendingTimer/);
 assert.match(code,/if\(!motion\(\)\)return/);
 assert.doesNotMatch(readFileSync(new URL('../public/arena-combat-effects.js',import.meta.url),'utf8'),/\.hp\s*=|\.energy\s*=|\.winner\s*=/);
});
