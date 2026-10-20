import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {applyServerSpecialHeal} from '../commander-live-special-heal.js';
function make(){
 const hero=(id,hp,role='fighter',active=null)=>({id,hp,maxHp:100,attack:100,defense:0,shield:0,role,active,lane:'back',position:0});
 return createLiveCommanderCombat({round:3,abilities:createLiveCommanderAbilities({matchKey:'heal:1',energy:[0,0],now:1000}),teams:[[hero('support',100,'support'),hero('low',20),hero('high',60)],[hero('enemy',100)]],commanders:[{commanderId:'support'},{commanderId:'attack'}]});
}
test('support heals most injured ally on third round without overhealing',()=>{
 const c=make();
 const r=applyServerSpecialHeal(c,{side:0,actorId:'support'});
 assert.equal(c.teams[0][1].hp,72);
 assert.equal(c.teams[0][2].hp,60);
 assert.equal(c.teams[0][0].healing,52);
 assert.equal(r.event.target,'low');
 assert.equal(c.version,1);
});
test('active self-heal is capped by missing HP',()=>{
 const c=make();c.teams[0][1].hp=90;c.teams[0][1].active={effect:'heal'};
 const r=applyServerSpecialHeal(c,{side:0,actorId:'low'});
 assert.equal(r.event.value,10);
 assert.equal(c.teams[0][1].hp,100);
});
test('non-special round or unavailable heal does not mutate combat',()=>{
 const c=make(),before=structuredClone(c.teams);
 assert.throws(()=>applyServerSpecialHeal(c,{side:0,actorId:'high'}),/No applicable special heal/);
 assert.deepEqual(c.teams,before);
 c.round=2;
 assert.throws(()=>applyServerSpecialHeal(c,{side:0,actorId:'support'}),/Invalid special heal turn/);
 assert.equal(c.version,0);
});
