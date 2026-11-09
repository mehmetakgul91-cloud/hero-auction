import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,viewLiveCommanderCombat} from '../commander-live-combat.js';
import {createBasicTurnSession,stepBasicTurn} from '../commander-basic-turn-session.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
import {stepParityEnergySplash} from '../commander-parity-energy-splash.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
import {stepParityStatSpecial} from '../commander-parity-stat-special.js';
import {grantLastStand} from '../battle-hp-damage.js';
import {battleRoster} from '../battle-roster.js';
import {describeBattleEvent} from '../public/battle-event-text.js';

const hero=(id,extra={})=>({id,role:'fighter',hp:100,maxHp:100,attack:1,defense:0,speed:1,position:0,lane:'back',shield:0,damage:0,kills:0,healing:0,...extra});
const skill={effect:'splash',power:1,splashRate:.3};
const flags={parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true};
function make({side=0,primary={},secondary={},actor={}}={}){
 const teams=[];
 // 74 × .97 (energy role) × .7 = 50.246, rounded down to 50.
 teams[side]=[hero('mage',{role:'energy',attack:74,speed:100,active:skill,...actor})];
 teams[1-side]=[hero('primary',{lane:'front',...primary}),hero('secondary',secondary)];
 return createLiveCommanderCombat({teams,round:3,abilities:createLiveCommanderAbilities({matchKey:'splash-shield',energy:[0,0]}),commanders:[{commanderId:'attack'},{commanderId:'defense'}]});
}
const attack=(combat,side=0)=>stepParityDamageSpecial(combat,{side,actorId:'mage'});
const hits=events=>events.filter(e=>['special','splash'].includes(e.damageType));

for(const side of [0,1])test(`seat ${side}: primary shield never reduces the 50 × 30% splash basis`,()=>{
 for(const [shield,absorbed,hpDamage] of [[0,0,50],[20,20,30],[100,35,15]]){
  const combat=make({side,primary:{shield}});
  const {events}=attack(combat,side);
  assert.deepEqual(hits(events).map(e=>[e.target,e.rawDamage,e.absorbed,e.value]),[['primary',50,absorbed,hpDamage],['secondary',15,0,15]]);
  assert.equal(combat.teams[1-side][0].shield,shield-absorbed);
  assert.equal(combat.teams[1-side][1].hp,85);
  assert.equal(combat.teams[side][0].damage,hpDamage+15);
 }
});

test('each secondary shield absorbs its own splash after the raw 30% calculation',()=>{
 for(const primaryShield of [0,20,100])for(const [shield,absorbed,hpDamage] of [[0,0,15],[6,6,9],[20,10,5]]){
  const combat=make({primary:{shield:primaryShield},secondary:{shield}});
  const splash=attack(combat).events.find(e=>e.damageType==='splash');
  assert.deepEqual([splash.rawDamage,splash.absorbed,splash.value],[15,absorbed,hpDamage]);
  assert.equal(combat.teams[1][1].hp,100-hpDamage);
  assert.equal(combat.teams[1][1].shield,shield-absorbed);
 }
});

test('primary overkill and Last Bastion do not reduce splash',()=>{
 for(const guarded of [false,true]){
  const combat=make({primary:{hp:10,shield:20}});
  if(guarded)grantLastStand(combat.teams[1][0],3);
  const [primary,splash]=hits(attack(combat).events);
  assert.deepEqual([primary.rawDamage,primary.absorbed,primary.value],[50,20,guarded?9:10]);
  assert.deepEqual([splash.rawDamage,splash.value],[15,15]);
  assert.equal(combat.teams[0][0].kills,guarded?0:1);
  assert.equal(combat.abilities.energy[1],guarded?0:10);
 }
});

test('secondary overkill and Last Bastion preserve raw splash and damage accounting',()=>{
 for(const guarded of [false,true]){
  const combat=make({primary:{shield:20},secondary:{hp:3,shield:6}});
  if(guarded)grantLastStand(combat.teams[1][1],3);
  const splash=attack(combat).events.find(e=>e.damageType==='splash');
  assert.deepEqual([splash.rawDamage,splash.absorbed,splash.value],[15,6,guarded?2:3]);
  assert.equal(combat.teams[0][0].damage,30+(guarded?2:3));
  assert.equal(combat.teams[0][0].kills,guarded?0:1);
  assert.equal(combat.abilities.energy[1],guarded?0:10);
 }
});

test('secondary defenses are not applied a second time to percentage splash',()=>{
 const combat=make({primary:{shield:20},secondary:{defense:1000}});
 const splash=attack(combat).events.find(e=>e.damageType==='splash');
 assert.deepEqual([splash.rawDamage,splash.value],[15,15]);
});

for(const [effect,step] of [[null,stepParityEnergySplash],['drain',stepParityShieldDrain],['weaken',stepParityStatSpecial],['burst',stepParityDamageSpecial]])test(`${effect??'energy-role'}: fallback 15% splash also uses pre-shield damage`,()=>{
 const actor={active:effect?{effect,power:1}:null};
 const results=[0,20,100].map(shield=>{
  const combat=make({primary:{shield},actor});
  const events=step(combat,{side:0,actorId:'mage'}).events;
  const [primary,splash]=hits(events);
  assert.equal(splash.rawDamage,Math.max(1,Math.floor(primary.rawDamage*.15)));
  return [primary.rawDamage,splash.rawDamage,splash.value];
 });
 assert.deepEqual(results[1],results[0]);
 assert.deepEqual(results[2],results[0]);
});

test('every real splash hero retains raw basis through the live scheduler and snapshots',()=>{
 for(const h of battleRoster.filter(h=>h.active?.effect==='splash'))for(const shield of [0,20,100]){
  const combat=make({primary:{shield},secondary:{shield:6},actor:{active:h.active,passive:h.passive}});
  const session=createBasicTurnSession(combat,flags);
  stepBasicTurn(session);
  const [primary,splash]=hits(combat.events);
  assert.equal(splash.rawDamage,Math.max(1,Math.floor(primary.rawDamage*h.active.splashRate)),h.name);
  const absorbed=Math.min(6,Math.floor(splash.rawDamage*7/10));
  assert.equal(splash.absorbed,absorbed);
  assert.equal(splash.value,splash.rawDamage-absorbed);
  const snapshot=viewLiveCommanderCombat(combat);
  assert.deepEqual(hits(snapshot.events),[primary,splash]);
  assert.equal(snapshot.teams[1][1].hp,100-splash.value);
 }
});

test('the displayed 9 is health damage only when that secondary target absorbs 6',()=>{
 const combat=make({primary:{shield:20},secondary:{shield:6}});
 const [primary,splash]=hits(attack(combat).events);
 assert.deepEqual([primary.rawDamage,primary.value,splash.rawDamage,splash.value],[50,30,15,9]);
 assert.match(describeBattleEvent(splash),/Alan hasarı · 9 hasar · 6 kalkan engelledi/);
 assert.match(describeBattleEvent(splash,{english:true}),/Area hit · 9 damage · 6 blocked by shield/);
});
