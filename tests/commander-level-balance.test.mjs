import test from 'node:test';
import assert from 'node:assert/strict';
import {commanderAbilityStats,commanderRoundEnergy} from '../public/commander-ability-rules.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {applyLiveCommanderEffect} from '../commander-live-effects.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,beginServerCombatRound} from '../commander-live-combat.js';
import {createLiveArenaRegistry} from '../commander-live-arena-registry.js';
const profile=(commanderId,level)=>({commanderId,levels:{attack:0,defense:0,magic:0,support:0,[commanderId]:level}});
const teams=()=>[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:2500,maxHp:5000,attack:1000,defense:100,shield:0,speed:50,position:i,lane:i<2?'front':'back'})));
for(const kind of ['attack','defense','magic','support'])for(const ability of ['normal','ultimate'])test(kind+' '+ability+' scales actual effects with the saved specialty level',()=>{
 const cast=level=>applyLiveCommanderEffect(teams(),{side:0,ability,commanderId:kind,commanderProfile:profile(kind,level),targetIds:ability==='ultimate'?['1-0','1-1']:['1-0']});
 const base=cast(0),upgraded=cast(40);
 if(kind==='magic')assert.equal(upgraded.teams[1][0].commanderWeaken,ability==='ultimate'?.56:.42);
 else assert.equal(upgraded.log.at(-1).value,base.log.at(-1).value*1.4);
 assert.equal(upgraded.log.at(-1).commanderLevel,40);
 assert.equal(upgraded.log.at(-1).abilityBonusPercent,40);
});
test('energy starts at 30 for every level and grows by each saved commander level',()=>{
 for(const [level,gain,firstUltimate] of [[0,12,7],[10,17,6],[20,22,5],[40,32,4]]){
  const commander=profile('support',level);
  const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'energy'}),teams:teams(),commanders:[commander,profile('attack',0)]});
  assert.deepEqual(combat.abilities.energy,[30,30]);
  assert.equal(commanderAbilityStats(commander).energyPerRound,gain);
  let replay=commanderRoundEnergy(0,1,commander);
  for(let round=2;round<=firstUltimate;round++){
   assert.ok(combat.abilities.energy[0]<100);
   beginServerCombatRound(combat,round);
   replay=commanderRoundEnergy(replay,round,commander);
   assert.equal(combat.abilities.energy[0],replay);
   assert.equal(combat.abilities.energy[1],Math.min(100,30+12*(round-1)));
  }
  assert.equal(combat.abilities.energy[0],100);
  assert.ok(combat.teams[0].every(hero=>hero.hp>0));
 }
});
test('support heals the lowest health percentage first, skips dead heroes and caps at full health',()=>{
 const input=teams();input[0][0].hp=0;input[0][1].hp=40;input[0][1].maxHp=100;input[0][2].hp=2500;
 const out=applyLiveCommanderEffect(input,{side:0,ability:'normal',commanderId:'support',commanderProfile:profile('support',20)});
 assert.equal(out.teams[0][0].hp,0);assert.equal(out.teams[0][1].hp,100);
 assert.equal(out.log.at(-1).impacts[0].target,'0-1');assert.equal(out.log.at(-1).impacts[0].value,60);
 assert.ok(out.teams[0].every(hero=>hero.hp<=hero.maxHp));
});
test('empty support cast is rejected atomically without energy, cooldown or request consumption',()=>{
 const initial=teams();for(const hero of initial[0])hero.hp=hero.maxHp;
 const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'heal',energy:[100,100],now:0}),teams:initial,commanders:[profile('support',40),profile('defense',0)]});
 const before=structuredClone(combat);
 assert.throws(()=>castLiveCommanderCombat(combat,{side:0,ability:'ultimate',requestId:'empty_heal_01',matchKey:'heal',now:1000}),/yaralı kahraman yok/);
 assert.deepEqual(combat,before);
});
test('incoming cast values cannot forge level and changing the source profile cannot change the match',()=>{
 const saved=profile('magic',6);
 const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'level',energy:[100,100],now:0}),teams:teams(),commanders:[saved,profile('attack',0)]});
 saved.levels.magic=40;
 const cast=castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'level_cast_01',matchKey:'level',now:1000,targetIds:['1-0'],commanderProfile:saved,commanderLevel:40});
 assert.equal(cast.teams[1][0].commanderWeaken,.318);
 assert.equal(cast.events.at(-1).impacts[0].value,31.8);
 assert.equal(cast.events.at(-1).commanderLevel,6);
 beginServerCombatRound(combat,2);assert.equal(combat.abilities.energy[0],75);
});
test('own seat snapshot exposes the correct level and per-round gain without opponent energy',()=>{
 const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'view'}),teams:teams(),commanders:[profile('support',20),profile('attack',40)]});
 const registry=createLiveArenaRegistry();registry.register({matchKey:'view',tokens:['left','right'],combat});
 const view=registry.snapshot({matchKey:'view',token:'right'});
 assert.equal(view.side,1);assert.equal(view.commanderId,'attack');assert.equal(view.abilityStats.level,40);assert.equal(view.abilityStats.energyPerRound,32);assert.equal(view.abilities[0].energy,null);
});
