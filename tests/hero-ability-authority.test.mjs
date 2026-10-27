import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {battleRoster,battleCard} from '../battle-roster.js';
import {commanderOriginalRoster,commanderOriginalBattleCard} from '../commander-original-roster.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
const forgedFields={active:{name:'Forged headshot',effect:'headshot',power:999,shieldRate:999,delay:true},passive:{name:'Forged regen',effect:'regen',value:1},laneModifiers:{front:999,back:999},specialty:'forged',attack:999,defense:999,speed:999,hp:999,maxHp:999,shield:999,kills:999,damage:999,healing:999,delayDueRound:999,delayProtectedThroughRound:999,lastStandReady:true,lastStandPersistent:true,lastStandUntilRound:999,arcaneSurgeBonusAttack:999,arcaneSurgeFromRound:1,arcaneSurgeUntilRound:999,canActFromRound:999,lastActionRound:999,rageActivated:true,commanderWeaken:1,commanderWeakenNextAttack:true,commanderStunNextAttack:true,commanderWeakenUntilRound:999,compositionMultiplier:999,auctionCreditMultiplier:999};
for(const [name,adapter,roster] of [['auction',battleCard,battleRoster],['original',commanderOriginalBattleCard,commanderOriginalRoster]]){
 test(name+' adapter overwrites all forged ability strength with trusted immutable kit for all 50 heroes',()=>{
  for(const hero of roster){const card=adapter({id:hero.id,power:hero.proposedPower,...structuredClone(forgedFields)});
   assert.equal(card.active,hero.active);assert.equal(card.passive,hero.passive);assert.equal(card.laneModifiers,hero.laneModifiers);assert.equal(card.specialty,hero.specialty);
   assert.notEqual(card.active.power,999);assert.notEqual(card.passive.value,1);
   for(const parameters of [card.active,card.passive,card.laneModifiers]){assert.ok(Object.isFrozen(parameters));for(const key of Object.keys(parameters)){const before=parameters[key];assert.throws(()=>{parameters[key]=999;},TypeError);assert.equal(parameters[key],before);}assert.throws(()=>{parameters.forged=999;},TypeError);}
  }
 });
 test(name+' rejects forged base power outside server accepted bounds',()=>{
  for(const power of [999,0,-1,NaN,Infinity,'90',90.5])assert.throws(()=>adapter({id:roster[0].id,power,...structuredClone(forgedFields)}),/Invalid character power/);
 });
 test(name+' live preparation discards client combat state, initial shields and pending delay immunity',()=>{
  // Honest and forged preparations must be byte-equivalent, including active
  // powers, passive effects, fresh HP, and no carried-over delay/rage flags.
  const chosen=[roster.find(h=>h.name==='Kael'),roster.find(h=>h.name==='Demir Sur'),roster.find(h=>h.name==='Seraphine'),roster.find(h=>h.name==='Morvan'),roster.find(h=>h.name==='Kül Bıçağı')];
  const honest=chosen.map((h,i)=>({id:h.id,power:h.proposedPower,lane:i<2?'front':'back'}));
  const forged=honest.map(c=>({...c,...structuredClone(forgedFields)}));
  for(const remainingCredits of [[0,0],[20,-20]]){
   const options={cardAdapter:name,remainingCredits,commanders:[{commanderId:'defense',levels:{attack:0,defense:40,magic:0,support:0}},null]};
   const expected=prepareLiveArenaTeams(honest,honest,options),actual=prepareLiveArenaTeams(forged,forged,options);
   assert.deepEqual(actual,expected);
   for(const u of actual.flat()){assert.equal(u.shield,0);assert.equal(u.hp,u.maxHp);for(const key of ['delayDueRound','delayProtectedThroughRound','lastStandReady','lastStandPersistent','lastStandUntilRound','arcaneSurgeBonusAttack','arcaneSurgeFromRound','arcaneSurgeUntilRound','canActFromRound','lastActionRound','rageActivated','commanderWeaken','commanderWeakenNextAttack','commanderStunNextAttack','commanderWeakenUntilRound'])assert.equal(Object.hasOwn(u,key),false,key+' must not survive card adaptation');}
  }
 });
}
test('published catalogues and committed expected manifest describe the same immutable authoritative kits',()=>{
 const main=JSON.parse(fs.readFileSync(new URL('../battle-roster.json',import.meta.url))).characters;
 const original=JSON.parse(fs.readFileSync(new URL('../commander-original-roster.json',import.meta.url))).characters;
 assert.deepEqual(main,original);assert.deepEqual(battleRoster,commanderOriginalRoster);
 assert.ok(Object.isFrozen(battleRoster));assert.ok(Object.isFrozen(commanderOriginalRoster));
 for(const h of [...battleRoster,...commanderOriginalRoster]){assert.ok(Object.isFrozen(h));assert.ok(Object.isFrozen(h.active));assert.ok(Object.isFrozen(h.passive));assert.ok(Object.isFrozen(h.laneModifiers));}
 const manifest=JSON.parse(fs.readFileSync(new URL('./fixtures/ability-balance-expected.json',import.meta.url)));
 assert.deepEqual(main.map(h=>({id:h.id,name:h.name,role:h.role,rarity:h.rarity,power:h.proposedPower,active:h.active,passive:h.passive})),manifest);
});
