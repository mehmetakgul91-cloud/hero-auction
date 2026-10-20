import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';
import {stepBasicHeroCombat,advanceBasicCombatRound} from '../commander-incremental-basic.js';
function make(){
 const teams=[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:100,maxHp:100,attack:30,defense:0,shield:0,lane:i<2?'front':'back',position:i})));
 const abilities=createLiveCommanderAbilities({matchKey:'step:1',energy:[40,40],now:1000});
 return createLiveCommanderCombat({abilities,teams,commanders:[{commanderId:'defense'},{commanderId:'attack'}]});
}
test('basic attack observes shield applied by intervening commander cast',()=>{
 const c=make();
 const cast=castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'shield_001',matchKey:'step:1',now:2000});
 assert.equal(cast.version,1);
 const before=c.teams[0][0].hp,shield=c.teams[0][0].shield;
 assert.ok(shield>0);
 stepBasicHeroCombat(c,{side:1,actorId:'1-0'});
 assert.equal(c.teams[0][0].hp,before-Math.max(0,30-shield));
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
