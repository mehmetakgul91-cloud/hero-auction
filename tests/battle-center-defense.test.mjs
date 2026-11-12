import test from 'node:test';
import {battleRoster} from '../battle-roster.js';
import assert from 'node:assert/strict';
import {initializeCenterDefenseBonus as initialize} from '../battle-center-defense.js';
import {selectBattleTarget} from '../battle-target-selection.js';
import {calculateHeroRawDamage} from '../battle-damage-formula.js';
import {applyHeroDamage} from '../battle-hp-damage.js';
import {reviveCommanderAlly} from '../commander-ultimate-status.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
const team=(front=2)=>Array.from({length:5},(_,i)=>({id:`h${i}`,name:`h${i}`,position:i,lane:i<front?'front':'back',role:'fighter',attack:100,defense:100,hp:1000,maxHp:1000,speed:50,shield:0,damage:0,kills:0}));
test('only original 2+3 rear center gets rounded defense once; all other stats remain unchanged',()=>{
 for(let front=0;front<=5;front++){
  const units=team(front),expected=structuredClone(units);initialize(units);
  if(front===2){expected[3].defense=115;expected[3].centerDefenseBonus={version:1,multiplier:1.15};}
  assert.deepEqual(units,expected);initialize(units);assert.deepEqual(units,expected);
 }
 const reordered=team();[reordered[2],reordered[3]]=[reordered[3],reordered[2]];initialize(reordered);
 assert.equal(reordered[3].id,'h2');assert.equal(reordered[3].defense,115);
 const odd=team();odd[3].defense=51;initialize(odd);assert.equal(odd[3].defense,59);
});
test('fresh live preparation adds defense after other stats and ignores client bonus fields',()=>{
 const cards=battleRoster.slice(0,5).map((u,i)=>({...u,power:100,lane:i<2?'front':'back',centerDefenseBonus:{version:1,multiplier:999}}));
 const prepared=prepareLiveArenaTeams(cards,cards,{cardAdapter:'auction'})[0];
 const baseline=prepareLiveArenaTeams(cards.map((u,i)=>({...u,lane:i<3?'front':'back'})),cards,{cardAdapter:'auction'})[0];
 assert.equal(prepared[3].defense,Math.round(baseline[3].defense*1.15));
 assert.equal(prepared[3].attack,baseline[3].attack);
 assert.equal(prepared.filter(u=>u.centerDefenseBonus).length,1);
 const changed=cards.map((u,i)=>({...u,lane:i<3?'front':'back'}));
 assert.equal(prepareLiveArenaTeams(changed,changed,{cardAdapter:'auction'})[0].some(u=>u.centerDefenseBonus),false);
});
test('all living roles retain lane priority and center is automatically targetable immediately',()=>{
 const units=initialize(team());
 for(const role of ['fighter','tank','support','energy','assassin']){
  const targets=Array.from({length:15},(_,i)=>selectBattleTarget(units,{role,position:0},i+1));
  assert.ok(targets.every(u=>u.lane===(role==='assassin'?'back':'front')));
  if(role==='assassin')assert.ok(targets.some(u=>u.id==='h3'));
 }
});
test('death of every ally, own death, revival and snapshots retain defense without stacking',()=>{
 const units=initialize(team());
 for(const unit of units){applyHeroDamage(unit,10000,{round:1,allies:units});assert.equal(units[3].defense,115);}
 for(const unit of units)reviveCommanderAlly(unit,2);
 initialize(units);assert.equal(units[3].defense,115);
 const restored=JSON.parse(JSON.stringify(units));initialize(restored);assert.deepEqual(restored,units);
});
test('ordinary and piercing hits use actual increased defense, not a flat damage reduction',()=>{
 const units=initialize(team()),actor={...team()[0],role:'assassin'},plain={...units[3],defense:100};
 for(const skill of [null,{effect:'pierce',power:1,pierceRate:.35}]){
  const raw=calculateHeroRawDamage({unit:actor,target:units[3],skill});
  assert.ok(raw<calculateHeroRawDamage({unit:actor,target:plain,skill}));
 }
});
test('primary center special hits use bonus while area damage follows existing primary-based formula',()=>{
 const actor={...team()[0],id:'actor',position:1,role:'assassin',active:{effect:'splash',name:'Area',power:1.2,splashRate:.25}};
 const run=units=>{
  const combat=createLiveCommanderCombat({teams:[[actor],units],round:3,commanders:[{commanderId:'attack'},{commanderId:'support'}],abilities:createLiveCommanderAbilities({matchKey:'defense-test'})});
  const result=stepParityDamageSpecial(combat,{side:0,actorId:'actor',round:3,critical:false});
  return {combat,...result};
 };
 const boosted=run(initialize(team())),plain=run(team());
 const primary=result=>result.events.find(e=>e.damageType==='special');
 assert.equal(primary(boosted).target,'h3');assert.ok(primary(boosted).rawDamage<primary(plain).rawDamage);
 for(const event of boosted.events.filter(e=>e.damageType==='splash'))assert.equal(event.rawDamage,Math.max(1,Math.floor(primary(boosted).rawDamage*.25)));
 assert.equal(boosted.combat.teams[1][3].defense,115);
});
test('legacy saved targeting marks and malformed teams are not upgraded',()=>{
 for(const units of [team().slice(1),team().map(u=>({...u,id:'same'})),team().map((u,i)=>({...u,hp:i===0?0:1000})),team().map((u,i)=>({...u,defense:i===3?NaN:100}))]){
  initialize(units);assert.equal(units.some(u=>u.centerDefenseBonus),false);
 }
 const legacy=team();legacy[3].centerProtection={version:1,protectorIds:['h0','h1','h2','h4'],broken:false};
 initialize(legacy);assert.equal(legacy[3].defense,100);assert.equal(legacy[3].centerDefenseBonus,undefined);
});
