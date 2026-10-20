import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';
import {stepBasicHeroCombat,advanceBasicCombatRound} from '../commander-incremental-basic.js';
import {selectBattleTarget} from '../battle-target-selection.js';
function make(){
 const teams=[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:200,maxHp:200,attack:20,defense:0,shield:0,lane:i<2?'front':'back',position:i})));
 const abilities=createLiveCommanderAbilities({matchKey:'shield:1',energy:[100,100],now:1000});
 return createLiveCommanderCombat({abilities,teams,commanders:[{commanderId:'defense'},{commanderId:'attack'}]});
}
test('commander shield persists into later rounds without regeneration',()=>{
 const c=make();
 advanceBasicCombatRound(c);advanceBasicCombatRound(c);advanceBasicCombatRound(c);
 castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'shield_at_four',matchKey:'shield:1',now:2000});
 const shield=c.teams[0][0].shield;
 assert.ok(shield>0);
 advanceBasicCombatRound(c);
 assert.equal(c.teams[0][0].shield,shield);
 stepBasicHeroCombat(c,{side:1,actorId:'1-0'});
 const selected=selectBattleTarget(c.teams[0],c.teams[1][0],c.round);
 const expected=selected.id==='0-0'?Math.max(0,shield-20):shield;
 const after=c.teams[0][0].shield;
 assert.equal(after,expected);
 advanceBasicCombatRound(c);
 assert.equal(c.teams[0][0].shield,after);
});
test('second commander cast adds shield only when explicitly used',()=>{
 const c=make();
 castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'shield_first_01',matchKey:'shield:1',now:2000});
 const initial=c.teams[0][0].shield;
 advanceBasicCombatRound(c);
 assert.equal(c.teams[0][0].shield,initial);
 castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'shield_second_02',matchKey:'shield:1',now:7000});
 assert.equal(c.teams[0][0].shield,initial*2);
});
test('shield is consumed before HP across subsequent rounds',()=>{
 const c=make();
 castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'shield_early_01',matchKey:'shield:1',now:2000});
 const initial=c.teams[0][0].shield;
 const expected=new Map(c.teams[0].map(u=>[u.id,{shield:u.shield,hp:u.hp}]));
 for(let round=1;round<=3;round++){
  const target=selectBattleTarget(c.teams[0],c.teams[1][0],c.round);
  const state=expected.get(target.id);
  const absorbed=Math.min(state.shield,20);
  state.shield-=absorbed;
  state.hp-=20-absorbed;
  stepBasicHeroCombat(c,{side:1,actorId:'1-0'});
  if(round<3)advanceBasicCombatRound(c);
 }
 for(const u of c.teams[0]){
  assert.equal(u.shield,expected.get(u.id).shield);
  assert.equal(u.hp,expected.get(u.id).hp);
 }
 assert.ok(initial>0);
});
