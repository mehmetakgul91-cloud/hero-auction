import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createBasicTurnSession,stepBasicTurn} from '../commander-basic-turn-session.js';
import {calculateHeroRawDamage} from '../battle-damage-formula.js';
const hero=(id,role='fighter',active=null,passive=null)=>({id,role,active,passive,hp:120,maxHp:120,attack:90,defense:20,speed:id==='a'?100:20,position:0,lane:'front',shield:0,damage:0,kills:0,healing:0});
function make(effect,role='fighter'){
 const key='damage-special-test';
 return createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:key,now:0}),teams:[[hero('a',role,{effect,name:effect,power:1.5},{effect:'focus',value:.1})],[hero('b'),hero('c')]],commanders:[{commanderId:'attack'},{commanderId:'defense'}],round:3});
}
for(const effect of ['burst','pierce','splash','headshot']){
 test(effect+' executes with passive and legacy special metadata',()=>{
  const combat=make(effect);
  const session=createBasicTurnSession(combat,{parity:true,damageSpecial:true,roundPassives:true});
  const result=stepBasicTurn(session);
  assert.equal(result.result.version,1);
  assert.ok(combat.events.some(e=>e.actor==='a'&&e.damageType==='special'),JSON.stringify(combat.events));
  assert.ok(combat.teams[1].some(u=>u.hp<120));
  if(effect==='splash')assert.ok(combat.events.some(e=>e.action==='splash'),JSON.stringify(combat.events));
 });
}
test('headshot uses full current HP and shield, not a client supplied number',()=>{
 const combat=make('headshot');
 for(const enemy of combat.teams[1])enemy.shield=30;
 const actor=combat.teams[0][0],target=combat.teams[1][0];
 assert.equal(calculateHeroRawDamage({unit:actor,target,skill:actor.active,special:true}),150);
 const session=createBasicTurnSession(combat,{parity:true,damageSpecial:true,roundPassives:true});
 stepBasicTurn(session);
 assert.ok(combat.teams[1].some(u=>u.hp===0&&u.shield===0));
});
test('tank special applies legacy front shields',()=>{
 const combat=make('burst','tank');
 const session=createBasicTurnSession(combat,{parity:true,damageSpecial:true,roundPassives:true});
 stepBasicTurn(session);
 assert.ok(combat.teams[0][0].shield>0);
});
