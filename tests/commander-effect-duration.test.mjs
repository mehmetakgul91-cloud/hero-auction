import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,applyServerHeroAction,beginServerCombatRound} from '../commander-live-combat.js';
function combat(commanderId){
 const teams=[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:100,maxHp:100,attack:20,defense:0,shield:0,lane:i<2?'front':'back',position:i})));
 return createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'effects:1',energy:[100,100],now:1000}),teams,commanders:[{commanderId},{commanderId:'defense'}]});
}
test('attack commander inflicts immediate damage but no repeated round damage',()=>{
 const c=combat('attack');
 castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'attack_once_01',matchKey:'effects:1',now:2000});
 const hp=c.teams[1].map(u=>u.hp);
 assert.ok(hp.every(n=>n<100));
 beginServerCombatRound(c,2);
 assert.deepEqual(c.teams[1].map(u=>u.hp),hp);
});
test('support commander heals once, retains HP next round and never exceeds max HP',()=>{
 const c=combat('support');
 applyServerHeroAction(c,{side:1,actorId:'1-0',targetId:'0-0',value:50});
 assert.equal(c.teams[0][0].hp,50);
 castLiveCommanderCombat(c,{side:0,ability:'ultimate',requestId:'heal_once_001',matchKey:'effects:1',now:2000});
 const hp=c.teams[0][0].hp;
 assert.ok(hp>50&&hp<=100);
 beginServerCombatRound(c,2);
 assert.equal(c.teams[0][0].hp,hp);
});
test('magic weakening remains recorded across round boundary pending duration decision',()=>{
 const c=combat('magic');
 castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'magic_once_01',matchKey:'effects:1',now:2000});
 const weakened=c.teams[1].filter(u=>u.commanderWeaken>0);
 assert.equal(weakened.length,1);
 beginServerCombatRound(c,2);
 assert.equal(c.teams[1].filter(u=>u.commanderWeaken>0).length,1);
});
