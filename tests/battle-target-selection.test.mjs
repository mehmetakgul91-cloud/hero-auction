import test from 'node:test';
import assert from 'node:assert/strict';
import {selectBattleTarget} from '../battle-target-selection.js';
import {battleRoster,battleCard} from '../battle-roster.js';
import {fighterFromCard,simulateBattle} from '../battle-engine.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createBasicTurnSession,stepBasicTurn} from '../commander-basic-turn-session.js';
const enemies=[{id:'front0',hp:100,lane:'front',position:0},{id:'front1',hp:100,lane:'front',position:1},{id:'rear',hp:100,lane:'back',position:2}];
test('frontline is preferred for ordinary heroes with round-dependent rotation',()=>{
 assert.equal(selectBattleTarget(enemies,{role:'fighter',position:0},1).id,'front1');
 assert.equal(selectBattleTarget(enemies,{role:'fighter',position:0},2).id,'front0');
});
test('assassins prioritize living rear enemies on every normal and special round',()=>{
 for(let round=1;round<=15;round++)for(let position=0;position<5;position++){
  assert.equal(selectBattleTarget(enemies,{role:'assassin',position},round).id,'rear');
 }
});
test('assassins skip dead rear enemies and switch to the front only after the last rear enemy dies',()=>{
 const team=[...enemies,{id:'rear2',hp:100,lane:'back',position:3}],actor={role:'assassin',position:1};
 for(let round=1;round<=15;round++)assert.equal(selectBattleTarget(team,actor,round).lane,'back');
 team[2]={...team[2],hp:0};
 for(let round=1;round<=15;round++)assert.equal(selectBattleTarget(team,actor,round).id,'rear2');
 team[3]={...team[3],hp:0};
 for(let round=1;round<=15;round++)assert.equal(selectBattleTarget(team,actor,round).lane,'front');
});
test('rear priority is deterministic, leaves source teams unchanged and does not affect other roles',()=>{
 const team=[...enemies,{id:'rear2',hp:100,lane:'back',position:3}],before=structuredClone(team);
 for(let round=1;round<=15;round++){
  const actor={role:'assassin',position:2};
  assert.equal(selectBattleTarget(team,actor,round).id,selectBattleTarget([...team].reverse(),actor,round).id);
  for(const role of ['fighter','tank','energy','support'])assert.equal(selectBattleTarget(team,{role,position:2},round).lane,'front');
 }
 assert.deepEqual(team,before);
});
test('dead frontline units are excluded, and no survivors returns null',()=>{
 const defeated=enemies.map(x=>({...x,hp:x.lane==='front'?0:100}));
 assert.equal(selectBattleTarget(defeated,{role:'fighter',position:0},1).id,'rear');
 assert.equal(selectBattleTarget(defeated.map(x=>({...x,hp:0})),{role:'fighter',position:0},1),null);
});

const assassins=battleRoster.filter(hero=>hero.role==='assassin');
for(const hero of assassins){
 test(hero.name+' targets the rear, then the front through live normal and special handlers on either team',()=>{
  for(const side of [0,1])for(const round of [1,3])for(const deadRear of [0,1,3]){
   const actor={...fighterFromCard(battleCard({id:hero.id,power:70}),0),speed:1000};
   const opponents=Array.from({length:5},(_,position)=>({
    ...fighterFromCard({id:'enemy'+position,role:'fighter',power:70},position),
    speed:1,maxHp:1000,hp:position>=2&&position<2+deadRear?0:1000
   }));
   const teams=side===0?[[actor],opponents]:[opponents,[actor]];
   const abilities=createLiveCommanderAbilities({matchKey:'assassin-priority',now:1000});
   const combat=createLiveCommanderCombat({abilities,teams,round,commanders:[{commanderId:'attack'},{commanderId:'attack'}]});
   const session=createBasicTurnSession(combat,{parity:true,roundPassives:true,damageSpecial:true,statSpecial:true,executeSpecial:true,shieldDrain:true});
   const {result}=stepBasicTurn(session);
   const hits=(result.events||[result.event]).filter(event=>event.actor===hero.id&&event.rawDamage>0);
   assert.equal(hits.length,1,'one primary attack per turn');
   const targetBefore=opponents.find(enemy=>enemy.id===hits[0].target);
   assert.ok(targetBefore.hp>0,'never attack a defeated rear hero');
   assert.equal(targetBefore.lane,deadRear===3?'front':'back');
   assert.ok(combat.teams[1-side].find(enemy=>enemy.id===targetBefore.id).hp<targetBefore.hp,'selected target actually takes damage');
  }
 });
}

test('simulated battles kill all rear heroes before assassins begin attacking the front',()=>{
 for(const side of [0,1]){
  const attackers=assassins.slice(side*5,side*5+5).map(hero=>battleCard({id:hero.id,power:100}));
  const defenders=Array.from({length:5},(_,position)=>({id:'enemy'+position,role:'fighter',power:position<2?100:5}));
  const teams=side===0?[attackers,defenders]:[defenders,attackers];
  const result=simulateBattle(...teams,{seed:'assassin-rear-priority',maxRounds:15});
  const rearHp=new Map(result.teams[1-side].filter(hero=>hero.lane==='back').map(hero=>[hero.id,hero.maxHp]));
  let rearHits=0,frontHits=0;
  for(const event of result.log.filter(event=>event.side===side&&event.rawDamage>0)){
   if(rearHp.has(event.target)){
    rearHits++;
    rearHp.set(event.target,Math.max(0,rearHp.get(event.target)-event.value));
   }else{
    frontHits++;
    assert.ok([...rearHp.values()].every(hp=>hp===0),'front attacks only after every rear hero is defeated');
   }
  }
  assert.ok(rearHits>=3&&frontHits>0,'battle exercises both rear priority and front fallback');
 }
});
