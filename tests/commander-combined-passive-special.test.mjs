import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createBasicTurnSession,stepBasicTurn} from '../commander-basic-turn-session.js';
const hero=(id,passive,active)=>({id,hp:100,maxHp:100,attack:70,defense:25,speed:50,position:0,lane:'front',role:'fighter',shield:0,damage:0,kills:0,healing:0,passive,active});
function combat(effect){
 const key='parity-combined';
 return createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:key,energy:[100,100],now:0}),teams:[[hero('a',{effect:'rage',value:.1},{name:'Special',effect,power:1.3})],[hero('b',null,null)]],commanders:[{commanderId:'attack'},{commanderId:'defense'}],round:3});
}
for(const effect of ['sunder','weaken','haste','execute']){
 test('round passive plus '+effect+' special uses authoritative action',()=>{
  const state=combat(effect);
  const session=createBasicTurnSession(state,{parity:true,roundPassives:true,statSpecial:true,executeSpecial:true});
  const action=stepBasicTurn(session);
  assert.equal(action.result.version>=1,true);
  assert.ok(state.events.some(e=>e.actor==='a'));
  assert.ok(state.teams[1][0].hp<100);
 });
}
test('passive-enabled basic attack does not bypass skill validation',()=>{
 const state=combat('headshot');
 assert.throws(()=>createBasicTurnSession(state,{parity:true,roundPassives:true,statSpecial:true,executeSpecial:true}),/Special hero mechanics/);
});
