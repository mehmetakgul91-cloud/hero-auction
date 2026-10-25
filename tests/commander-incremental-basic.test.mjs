import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';
import {stepBasicHeroCombat,advanceBasicCombatRound} from '../commander-incremental-basic.js';
import {selectBattleTarget} from '../battle-target-selection.js';
function make(){
 const teams=[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:100,maxHp:100,attack:30,defense:0,shield:0,lane:i<2?'front':'back',position:i})));
 const abilities=createLiveCommanderAbilities({matchKey:'step:1',energy:[40,40],now:1000});
 return createLiveCommanderCombat({abilities,teams,commanders:[{commanderId:'defense'},{commanderId:'attack'}]});
}
test('basic attack observes shield applied by intervening commander cast',()=>{
 const c=make();
 const cast=castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'shield_001',matchKey:'step:1',now:2000});
 assert.equal(cast.version,1);
 const target=selectBattleTarget(c.teams[0],c.teams[1][0],c.round);
 const before=target.hp,shield=target.shield;
 assert.ok(shield>0);
 stepBasicHeroCombat(c,{side:1,actorId:'1-0'});
 assert.equal(c.teams[0].find(u=>u.id===target.id).hp,before-Math.max(0,30-shield));
 assert.equal(c.version,2);
});
test('basic target selection prefers surviving frontline',()=>{
 const c=make();
 c.teams[1][0].hp=0;
 stepBasicHeroCombat(c,{side:0,actorId:'0-0'});
 assert.equal(c.teams[1][1].hp,70);
 assert.equal(c.teams[1][2].hp,100);
});
test('new round grants energy without requiring commander choice',()=>{
 const c=make();
 advanceBasicCombatRound(c);
 assert.equal(c.round,2);
 assert.deepEqual(c.abilities.energy,[52,52]);
 assert.equal(c.abilities.casts.length,0);
});
test('special heroes are rejected rather than silently losing abilities',()=>{
 const c=make();
 c.teams[0][0].active={effect:'special'};
 assert.throws(()=>stepBasicHeroCombat(c,{side:0,actorId:'0-0'}),/Special hero mechanics/);
 assert.equal(c.version,0);
});

test('magic weakens only the next actual basic attack',()=>{
 const c=make();
 c.commanders[0]={commanderId:'magic'};
 c.abilities.energy[0]=100;c.abilities.ultimateEnergy[0]=100;
 castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'weaken_hit_01',targetIds:['1-0'],matchKey:'step:1',now:2000});
 const weakened=c.teams[1].find(u=>u.commanderWeaken>0);
 assert.ok(weakened);
 assert.equal(weakened.commanderWeaken,.35);
 for(let round=1;round<=3;round++){
  if(round>1)advanceBasicCombatRound(c);
  const target=selectBattleTarget(c.teams[0],weakened,c.round);
  const before=target.hp;
  stepBasicHeroCombat(c,{side:1,actorId:weakened.id});
  assert.equal(before-c.teams[0].find(u=>u.id===target.id).hp,round===1?20:30);
 }
 advanceBasicCombatRound(c);
 assert.equal(c.teams[1].find(u=>u.id===weakened.id).commanderWeaken,undefined);
 const target=selectBattleTarget(c.teams[0],weakened,c.round);
 const before=target.hp;
 stepBasicHeroCombat(c,{side:1,actorId:weakened.id});
 assert.equal(before-c.teams[0].find(u=>u.id===target.id).hp,30);
});
test('ultimate magic doubles selected ally basic damage for three rounds without changing base attack',()=>{
 const c=make();
 c.commanders[0]={commanderId:'magic'};
 c.abilities.energy[0]=100;c.abilities.ultimateEnergy[0]=100;
 castLiveCommanderCombat(c,{side:0,ability:'ultimate',requestId:'surge_ult_01',targetIds:['0-0'],matchKey:'step:1',now:2000});
 for(let round=1;round<=4;round++){
  if(round>1)advanceBasicCombatRound(c);
  const actor=c.teams[0][0];
  const target=selectBattleTarget(c.teams[1],actor,c.round);
  const before=target.hp;
  stepBasicHeroCombat(c,{side:0,actorId:actor.id});
  assert.equal(before-c.teams[1].find(u=>u.id===target.id).hp,Math.min(before,round<=3?60:30));
  assert.equal(c.teams[0][0].attack,30);
 }
});
