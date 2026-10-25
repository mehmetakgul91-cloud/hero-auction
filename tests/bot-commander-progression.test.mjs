import test from 'node:test';
import assert from 'node:assert/strict';
import {createBotCommanderProfile,chooseBotCommander} from '../bot-strategy.js';
import {COMMANDER_STATS,createCommanderProfile,previewCommanderUpgrade,commanderUpgradeCost} from '../arena-commanders.js';
import {commanderAbilityStats,commanderAbilityDescription,getCommanderAbilityCost} from '../public/commander-ability-rules.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {battleRoster} from '../battle-roster.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,beginServerCombatRound} from '../commander-live-combat.js';
const teams=()=>[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:2500,maxHp:5000,attack:1000,defense:100,shield:0,speed:50,position:i,lane:i<2?'front':'back'})));
for(const [difficulty,level,gain] of [['easy',5,14],['medium',10,17],['hard',15,19]])for(const id of COMMANDER_STATS){
 test(`${difficulty} ${id}: legal independent branches, UI rules, live energy and all abilities`,()=>{
  const profile=createBotCommanderProfile(id,difficulty);
  let earned=createCommanderProfile(id),cost=0;
  for(const stat of COMMANDER_STATS)for(let n=0;n<level;n++){
   cost+=commanderUpgradeCost(n);
   earned=previewCommanderUpgrade(earned,stat,commanderUpgradeCost(n)).profile;
  }
  assert.deepEqual(profile,earned,'exactly reachable through human branch upgrade rules');
  assert.equal(cost,4*({5:1489,10:5194,15:14412}[level]),'approved exponential gold curve; bots still spend no currency');
  assert.equal(commanderAbilityStats(profile).level,level);
  assert.equal(commanderAbilityStats(profile).energyPerRound,gain);
  assert.equal(commanderAbilityStats(profile).bonusPercent,level);
  assert.ok(commanderAbilityDescription(profile).length>20);
  const cards=['fighter','assassin','tank','energy','support'].map(role=>({...battleRoster.find(h=>h.role===role),power:80}));
  const baseline=prepareLiveArenaTeams(cards,cards,{commanders:[createCommanderProfile('attack'),createCommanderProfile(id)],cardAdapter:'auction'});
  const prepared=prepareLiveArenaTeams(cards,cards,{commanders:[createCommanderProfile('attack'),profile],cardAdapter:'auction'});
  assert.deepEqual(prepared[0],baseline[0],'human team receives no bot upgrades');
  for(let i=0;i<5;i++){
   const stat=['attack','attack','defense','attack','maxHp'][i];
   assert.ok(prepared[1][i][stat]>baseline[1][i][stat],cards[i].role+' has its real branch bonus');
  }
  const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'energy',now:0}),teams:teams(),commanders:[createCommanderProfile('attack'),profile]});
  assert.deepEqual(combat.abilities.energy,[30,30]);beginServerCombatRound(combat,2);
  assert.deepEqual(combat.abilities.energy,[42,30+gain]);
  for(const ability of ['normal','ultimate']){
   const castAt=p=>{
    const castTeams=teams();if(id==='support'&&ability==='ultimate')castTeams[1][4].hp=0;
    const c=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'cast',energy:[100,100],now:0}),teams:castTeams,commanders:[createCommanderProfile('attack'),p]});
    const out=castLiveCommanderCombat(c,{side:1,ability,requestId:'test-cast-01',matchKey:'cast',now:1000,targetIds:id==='magic'?(ability==='normal'?['0-0']:['1-0']):id==='support'&&ability==='ultimate'?['1-4']:id==='attack'&&ability==='ultimate'?['0-0']:undefined});
    assert.equal(c.abilities[ability==='ultimate'?'ultimateEnergy':'energy'][1],100-getCommanderAbilityCost(id,ability));assert.equal(c.abilities[ability==='ultimate'?'energy':'ultimateEnergy'][1],100);assert.equal(c.abilities.cooldownUntil[1],ability==='normal'?6000:0);
    return out;
   };
   const base=castAt(createCommanderProfile(id)),upgraded=castAt(profile);
   assert.equal(upgraded.events.at(-1).commanderLevel,level);
   assert.equal(upgraded.events.at(-1).abilityBonusPercent,level);
   if(id==='magic'&&ability==='normal')assert.equal(upgraded.teams[0][0].commanderWeaken,commanderAbilityStats(profile).normalRate);
   else if(ability==='ultimate'&&id==='magic'){
    assert.equal(upgraded.teams[1][0].attack,1000);assert.equal(upgraded.teams[1][0].arcaneSurgeBonusAttack,1000);assert.equal(upgraded.teams[1][0].arcaneSurgeFromRound,1);assert.equal(upgraded.teams[1][0].arcaneSurgeUntilRound,3);
    assert.equal(upgraded.events.at(-1).value,base.events.at(-1).value,'surge utility duration and snapshot multiplier do not grow with level');
   }else if(ability==='ultimate'&&id==='support'){
    assert.equal(upgraded.teams[1][4].hp,2000);assert.equal(upgraded.teams[1][4].canActFromRound,2);assert.equal(upgraded.teams[1][4].shield,0);
    assert.equal(upgraded.events.at(-1).value,base.events.at(-1).value,'revival is a fixed bounded 40% life, not level-scaled resurrection');
   }else if(ability==='ultimate'&&id==='attack'){
    assert.equal(upgraded.teams[0][0].commanderFocusUntilDeath,true);assert.ok(upgraded.teams[0].every(u=>u.hp===2500));
    assert.equal(upgraded.events.at(-1).value,base.events.at(-1).value,'focus orders do not add level-scaled bonus attacks');
   }else{
    assert.ok(upgraded.events.at(-1).value>base.events.at(-1).value,'numeric shield/healing/normal damage scale with level');
    if(id==='defense'&&ability==='ultimate')assert.equal(upgraded.teams[1].filter(u=>u.lastStandReady).length,1);
   }
  }
 });
}
test('selection applies difficulty to every archetype, excludes previous, and returns independent profiles',()=>{
 for(const difficulty of ['easy','medium','hard']){
  const ids=new Set();
  for(let n=0;n<4;n++){
   const p=chooseBotCommander(undefined,()=>n/4,difficulty);ids.add(p.commanderId);
   assert.deepEqual(p,createBotCommanderProfile(p.commanderId,difficulty));
   assert.notEqual(chooseBotCommander(p.commanderId,()=>0,difficulty).commanderId,p.commanderId);
   p.levels.attack=40;assert.notEqual(createBotCommanderProfile(p.commanderId,difficulty).levels.attack,40);
  }
  assert.equal(ids.size,4);
 }
 assert.deepEqual(createBotCommanderProfile('magic','invalid'),createBotCommanderProfile('magic','medium'));
});
test('nonzero human profile and its prepared stats survive bot creation, difficulty changes and rematch rotation',()=>{
 const human={commanderId:'support',levels:{attack:3,defense:8,magic:2,support:11}};
 const saved=structuredClone(human);
 const cards=['fighter','assassin','tank','energy','support'].map(role=>({...battleRoster.find(h=>h.role===role),power:80}));
 const baseline=prepareLiveArenaTeams(cards,cards,{commanders:[human,createCommanderProfile('attack')],cardAdapter:'auction'})[0];
 let previous;
 for(const difficulty of ['easy','medium','hard','hard']){
  const bot=chooseBotCommander(previous,()=>.5,difficulty);previous=bot.commanderId;
  const prepared=prepareLiveArenaTeams(cards,cards,{commanders:[human,bot],cardAdapter:'auction'});
  assert.deepEqual(human,saved);assert.deepEqual(prepared[0],baseline);
  const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'human',now:0}),teams:prepared,commanders:[human,bot]});
  assert.deepEqual(combat.commanders[0],saved);
  beginServerCombatRound(combat,2);assert.equal(combat.abilities.energy[0],47);
  assert.deepEqual(human,saved);
 }
});
