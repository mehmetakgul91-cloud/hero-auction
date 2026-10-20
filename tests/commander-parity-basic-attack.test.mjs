import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
function make(){
 const teams=[[{id:'a',hp:200,maxHp:200,attack:100,defense:0,shield:0,lane:'front',role:'fighter',position:0}],
 [{id:'b',hp:200,maxHp:200,attack:100,defense:0,shield:0,lane:'front',role:'fighter',position:0}]];
 return createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'parity:1',energy:[40,40],now:1000}),teams,commanders:[{commanderId:'attack'},{commanderId:'defense'}]});
}
test('parity attack uses legacy normal and critical raw damage',()=>{
 const c=make();
 assert.equal(stepParityBasicAttack(c,{side:0,actorId:'a',critical:false}).event.value,70);
 assert.equal(stepParityBasicAttack(c,{side:1,actorId:'b',critical:true}).event.value,91);
 assert.equal(c.teams[0][0].hp,109);
});
test('parity attack respects defense and shields without client damage',()=>{
 const c=make();c.teams[1][0].defense=100;c.teams[1][0].shield=20;
 const r=stepParityBasicAttack(c,{side:0,actorId:'a'});
 assert.equal(r.event.rawDamage,35);
 assert.equal(r.event.absorbed,20);
 assert.equal(c.teams[1][0].hp,185);
});
test('magic debuff reduces parity damage without being consumed on first attack',()=>{
 const c=make();c.teams[0][0].commanderWeaken=.3;c.teams[0][0].commanderWeakenUntilRound=3;
 assert.equal(stepParityBasicAttack(c,{side:0,actorId:'a'}).event.rawDamage,49);
 assert.equal(c.teams[0][0].commanderWeaken,.3);
});
test('special and passive heroes are not silently downgraded',()=>{
 const c=make();c.teams[0][0].active={effect:'splash'};
 assert.throws(()=>stepParityBasicAttack(c,{side:0,actorId:'a'}),/Special hero mechanics/);
 assert.equal(c.version,0);
});
