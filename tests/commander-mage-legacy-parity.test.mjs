import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
import {battleCard} from '../battle-roster.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';

const profile=(commanderId,level)=>({commanderId,levels:{attack:0,defense:0,magic:0,support:0,[commanderId]:level}});
const casterIds=['original:01','original:05','original:expansion-01','original:expansion-08','original:08'];
const defenderIds=['original:02','original:03','original:15','original:expansion-05','original:expansion-07'];
const cards=ids=>ids.map((id,i)=>({id,power:65+i*5,lane:i<2?'front':'back'}));
const options=(level)=>({seed:'mage-legacy-parity',remainingCredits:[10000,10000],commanders:[profile('magic',level),profile('defense',0)],partial:true});
const spellEvents=events=>events.filter(e=>e.actor==='commander:0').map(({round,side,actor,action,target,value,absorbed,rawDamage,damageType,impacts,commanderLevel,abilityBonusPercent})=>({
 round,side,actor,action,target,value,absorbed,rawDamage,damageType,impacts,commanderLevel,abilityBonusPercent
}));

// Deliberately calculate the expected starting attack without calling the
// production magic-budget or snapshot helpers. This fixture has two energy
// heroes (no duplicate penalty), both with focus and a rear-lane specialty.
function expectedMagicPower(roster,level,credits){
 return roster.filter(card=>card.role==='energy').reduce((sum,card)=>{
  const laneAttack=Math.round(card.power*(1+card.laneModifiers[card.lane]));
  const creditAttack=Math.round(laneAttack*(1+credits*.01));
  const commanderAttack=Number((creditAttack*(1+level*.005)).toFixed(6));
  return sum+Math.round(commanderAttack*(1+card.passive.value));
 },0);
}
for(const [round,level] of [[2,40],[3,15]])test('legacy and live mage normal match prepared auction cards at round '+round,()=>{
 const a=cards(casterIds),b=cards(defenderIds),opts=options(level);
 const expandedA=a.map(battleCard),expandedB=b.map(battleCard);
 const prepared=prepareLiveArenaTeams(a,b,{...opts,cardAdapter:'auction'});
 const expectedPower=expectedMagicPower(expandedA,level,opts.remainingCredits[0]);
 assert.equal(prepared[0].filter(h=>h.role==='energy').reduce((sum,h)=>sum+h.attack,0),expectedPower);
 const main=Math.round(level+expectedPower*.05),area=Math.round(main*.25);
 const targetId=defenderIds[3]; // Rear center: both fronts and both rear neighbors.
 const before=simulateBattle(expandedA,expandedB,{...opts,maxRounds:round-1});
 assert.ok(before.teams.flat().every(h=>h.hp>0),'fixture keeps all ten slots alive');
 const energy=Math.min(100,before.commanderEnergy[0]+12+Math.floor(level/2));
 assert.ok(energy>=60,'scripted cast has enough natural round energy');
 const live=createLiveCommanderCombat({
  teams:prepared,commanders:opts.commanders,round,
  abilities:createLiveCommanderAbilities({matchKey:'mage-parity',energy:[energy,100],now:0})
 });
 assert.equal(live.commanderMagicNormalPower[0],expectedPower);
 // Continue from the identical completed legacy round without recapturing any
 // starting power or formation. No fixture passive changes at round start here.
 live.teams=structuredClone(before.teams);
 const output=castLiveCommanderCombat(live,{side:0,ability:'normal',targetIds:[targetId],requestId:'mage-normal-parity',matchKey:'mage-parity',now:10000});
 const legacy=simulateBattle(expandedA,expandedB,{...opts,maxRounds:round,commanderActions:[{round,side:0,ability:'normal',targetIds:[targetId]}]});
 assert.deepEqual(spellEvents(output.events),spellEvents(legacy.log));
 const hits=output.events.filter(e=>e.action==='commander-hit');
 assert.deepEqual(hits.map(e=>[e.target,e.rawDamage]),[[targetId,main],...defenderIds.filter(id=>id!==targetId).map(id=>[id,area])]);
 const cast=output.events.find(e=>e.action==='commander-magic-normal');
 assert.deepEqual(cast.impacts.filter(i=>i.kind==='stun'),[{target:targetId,kind:'stun',value:1,nextAction:true}]);
 assert.equal(legacy.commanderEnergy[0],energy-60);
 assert.equal(output.energy,energy-60);
 const skips=legacy.log.filter(e=>e.action==='stun-skip');
 assert.deepEqual(skips.map(e=>[e.round,e.actor,e.stunScope]),[[round,targetId,'action']]);
 assert.equal(legacy.log.some(e=>e.round===round&&e.actor===targetId&&e.action!=='stun-skip'),false);
});

test('live magic power stays at post-bonus prepared values after attack, role and living membership changes',()=>{
 const a=cards(casterIds),b=cards(defenderIds),opts=options(40);
 const prepared=prepareLiveArenaTeams(a,b,{...opts,cardAdapter:'auction'});
 const expectedPower=expectedMagicPower(a.map(battleCard),40,10000);
 const live=createLiveCommanderCombat({teams:prepared,commanders:opts.commanders,round:2,abilities:createLiveCommanderAbilities({matchKey:'fixed-mage',energy:[100,100],now:0})});
 const energies=live.teams[0].filter(h=>h.role==='energy');
 energies[0].attack=1;energies[0].hp=0;energies[1].attack=999999;energies[1].role='fighter';
 const output=castLiveCommanderCombat(live,{side:0,ability:'normal',targetIds:[defenderIds[3]],requestId:'fixed-mage-normal',matchKey:'fixed-mage',now:10000});
 assert.equal(live.commanderMagicNormalPower[0],expectedPower);
 assert.equal(output.events.find(e=>e.action==='commander-hit').rawDamage,Math.round(40+expectedPower*.05));
});

for(const [name,active] of [
 ['hybrid shield/heal',{effect:'shield',name:'hybrid',supportHybrid:true,allyShieldRate:.28,healRate:.52}],
 ['pure healer',{effect:'heal',name:'heal',healRate:.52}],
 ['no-skill support',null]
])test('legacy '+name+' loses its round-three healing action to the selected mage stun',()=>{
 const a=Array.from({length:5},(_,i)=>({id:'a'+i,power:60,role:'fighter',lane:i<2?'front':'back'}));
 const b=Array.from({length:5},(_,i)=>({id:'b'+i,power:60,role:i===3?'support':'fighter',lane:i<2?'front':'back',active:i===3?active:null}));
 const opts={...options(15),maxRounds:3};
 const control=simulateBattle(a,b,opts);
 assert.ok(control.log.some(e=>e.round===3&&e.actor==='b3'&&e.action==='heal'),'control proves a healing turn exists');
 if(name==='hybrid shield/heal')assert.ok(control.log.some(e=>e.round===3&&e.actor==='b3'&&e.action==='shield'));
 const cast=simulateBattle(a,b,{...opts,commanderActions:[{round:3,side:0,ability:'normal',targetIds:['b3']}]});
 assert.deepEqual(cast.log.filter(e=>e.round===3&&e.actor==='b3').map(e=>[e.action,e.stunScope]),[['stun-skip','action']]);
 const spell=cast.log.find(e=>e.action==='commander-magic-normal');
 assert.deepEqual(spell.impacts.filter(i=>i.kind==='stun').map(i=>i.target),['b3']);
});
test('legacy captures magic power after start focus but before later weakening',()=>{
 const a=Array.from({length:5},(_,i)=>({id:'mage'+i,power:60,role:'energy',lane:i<2?'front':'back',passive:{effect:'focus',value:.06}}));
 const b=Array.from({length:5},(_,i)=>({id:'weakener'+i,power:60,role:'fighter',lane:i<2?'front':'back',active:{effect:'weaken',name:'weaken',power:1.12,weakenRate:.14}}));
 const opts=options(40);
 // Five copies incur the capped 10% composition penalty, followed by credits,
 // the selected level's 20% role bonus and finally the 6% starting focus.
 const initialAttack=Math.round(Math.round(Math.round(60*.9)*101)*1.2*1.06);
 const before=simulateBattle(a,b,{...opts,maxRounds:3});
 assert.ok(before.teams[0].some(h=>h.attack<initialAttack),'enemy specials actually weakened the casting team');
 const result=simulateBattle(a,b,{...opts,maxRounds:4,commanderActions:[{round:4,side:0,ability:'normal',targetIds:['weakener3']}]});
 const hits=result.log.filter(e=>e.action==='commander-hit');
 assert.equal(hits[0].rawDamage,Math.round(40+5*initialAttack*.05));
 assert.ok(hits.slice(1).every(e=>e.rawDamage===Math.round(hits[0].rawDamage*.25)));
});
