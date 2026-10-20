import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createBasicTurnSession,stepBasicTurn} from '../commander-basic-turn-session.js';
import {commanderOriginalRoster} from '../commander-original-roster.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
const effects=['burst','pierce','splash','headshot'];
function make(effect,round){
 const hero=(id,active=null,speed=40)=>({id,role:'fighter',active,hp:1000,maxHp:1000,attack:80,defense:20,speed,position:0,lane:'front',shield:0,damage:0,kills:0,healing:0});
 return createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'normal-special-regression',now:0}),teams:[[hero('actor',{effect,name:effect,power:1.2},120)],[hero('target',null,10)]],commanders:[{commanderId:'attack'},{commanderId:'defense'}],round});
}
for(const effect of effects){
 test(effect+' has normal attacks in rounds 1 and 2 and a special in round 3',()=>{
  for(const round of [1,2,3]){
   const combat=make(effect,round);
   const session=createBasicTurnSession(combat,{parity:true,damageSpecial:true});
   const outcome=stepBasicTurn(session);
   assert.ok(outcome.result.version>=1);
   assert.ok(combat.teams[1][0].hp<1000);
   assert.ok(combat.events.some(e=>e.actor==='actor'));
   if(round===3)assert.ok(combat.events.some(e=>e.damageType==='special'));
   else assert.ok(combat.events.every(e=>e.damageType!=='special'));
  }
 });
}
test('all experimental team cards come from original universe',()=>{
 assert.ok(commanderOriginalRoster.length>=50);
 assert.ok(commanderOriginalRoster.every(h=>h.universe==='original'));
 const cards=commanderOriginalRoster.slice(0,5).map(h=>({id:h.id,power:75}));
 assert.equal(prepareLiveArenaTeams(cards,cards)[0].length,5);
 for(const invalid of ['marvel:hulk','dc:superman'])assert.throws(()=>prepareLiveArenaTeams([{id:invalid,power:75},...cards.slice(1)],cards),/original-only/);
});
