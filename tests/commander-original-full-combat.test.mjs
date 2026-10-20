import test from 'node:test';
import assert from 'node:assert/strict';
import {commanderOriginalRoster,commanderOriginalFighter} from '../commander-original-roster.js';
import {auditIncrementalRoster} from '../commander-roster-parity-audit.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createBasicTurnSession,peekBasicTurn,stepBasicTurn,advanceBasicTurnSession} from '../commander-basic-turn-session.js';
const options={parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true};
const supported=new Set(auditIncrementalRoster().rows.filter(x=>x.ready).map(x=>x.id));
function combatFor(hero){
 const opponent=commanderOriginalRoster.find(h=>h.id!==hero.id&&supported.has(h.id))||hero;
 const teams=[[commanderOriginalFighter({id:hero.id,power:75},0)],[commanderOriginalFighter({id:opponent.id,power:75},0)]];
 for(const team of teams)for(const unit of team){unit.maxHp=4000;unit.hp=4000;}
 return createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'roster-round-'+hero.id,now:0}),teams,commanders:[{commanderId:'attack'},{commanderId:'defense'}]});
}
function check(combat){
 assert.ok(Number.isSafeInteger(combat.version)&&combat.version>=0);
 for(const team of combat.teams)for(const u of team){
  assert.ok(Number.isFinite(u.hp)&&u.hp>=0&&u.hp<=u.maxHp,u.id+': invalid HP');
  assert.ok(Number.isFinite(u.shield)&&u.shield>=0,u.id+': invalid shield');
  assert.ok(Number.isFinite(u.attack)&&u.attack>=0,u.id+': invalid attack');
 }
}
for(const hero of commanderOriginalRoster){
 test('original hero full 3-round combat: '+hero.id,()=>{
  const combat=combatFor(hero);
  // Audit reports conservative compatibility candidates, not a runtime gate.
  // The authoritative session is the source of truth for whether a combination can run.
  let session;
  try{session=createBasicTurnSession(combat,options)}catch(error){
   assert.match(String(error.message),/Special hero mechanics/);
   assert.equal(combat.version,0);
   return;
  }
  for(let round=1;round<=3&&!combat.finished;round++){
   let actions=0;
   while(peekBasicTurn(session)&&!combat.finished){
    const before=combat.version;
    stepBasicTurn(session);
    assert.ok(combat.version>before);
    check(combat);
    if(++actions>2)throw Error('Action scheduler did not advance');
   }
   if(round<3&&!combat.finished){advanceBasicTurnSession(session);check(combat);}
  }
  assert.ok(combat.events.some(e=>e.actor===hero.id),'Hero did not act');
  assert.ok(combat.events.some(e=>e.round===1),'Missing first-round event');
 });
}
test('no licensed heroes in experimental catalogue',()=>{
 assert.ok(commanderOriginalRoster.length>=50);
 assert.ok(commanderOriginalRoster.every(x=>x.universe==='original'&&!x.id.startsWith('marvel:')&&!x.id.startsWith('dc:')));
});
