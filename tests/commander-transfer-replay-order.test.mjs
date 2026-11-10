import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';
import {initializeCenterProtection} from '../battle-center-protection.js';
import {grantArcaneSurge} from '../commander-ultimate-status.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
const surgeFields=['arcaneSurgeBonusAttack','arcaneSurgeFromRound','arcaneSurgeUntilRound'];

test('legacy primary then successive splash casualties replay transfers in actual settlement order',()=>{
 // Preserve this exact pre-cover recording instead of regenerating a historical
 // casualty chain under new targeting rules. Current atomic ordering is tested
 // separately below; old saved matches must still replay their recorded hits.
 const result=JSON.parse(fs.readFileSync(new URL('./fixtures/commander-transfer-legacy-recording.json',import.meta.url),'utf8'));
 assert.equal(result.sourceCommit,'6495f4a2bc9c5be1a4450f3f4b88a2a8af7b397c');
 assert.equal(result.teams.flat().some(hero=>hero.centerProtection),false);
 const action=result.log.filter(event=>event.actionId==='6:0:original:expansion-28');
 const transfers=action.filter(event=>event.arcaneTransfer);
 assert.equal(transfers.length,2,'fixture must exercise primary death and transferred-bearer splash death');
 assert.equal(transfers[0].damageType,'special');
 assert.equal(transfers[1].damageType,'splash');
 assert.deepEqual(transfers.map(event=>[event.arcaneTransfer.sourceId,event.arcaneTransfer.targetId]),[
  ['original:07','original:08'],['original:08','original:03']
 ]);
 assert.ok(action.indexOf(transfers[0])<action.indexOf(transfers[1]),'primary transfer must precede secondary transfer');
 assert.equal(transfers[0].arcaneTransfer.untilRound,6);
 assert.equal(transfers[1].arcaneTransfer.untilRound,6,'secondary death must not refresh shared expiry');
 // Start with no final-state status leakage, then replay the complete real log.
 const initial=result.teams.map(team=>team.map(hero=>{
  const copy={...hero};for(const key of surgeFields)delete copy[key];return copy;
 }));
 const replay=createBattleReplayHealth(initial);
 let hp;
 for(const event of result.log){
  hp=replay.apply(event);
  if(event===transfers[0]){
   const statuses=replay.statusSnapshot()[1];
   assert.deepEqual(statuses[4],{},'original bearer is cleared');
   assert.equal(statuses[2].arcaneSurgeUntilRound,6,'first recipient receives remaining duration');
  }
  if(event===transfers[1]){
   const statuses=replay.statusSnapshot()[1];
   assert.deepEqual(statuses[2],{},'second fallen bearer is cleared');
   assert.equal(statuses[3].arcaneSurgeUntilRound,6,'next recipient receives same remaining duration');
  }
 }
 assert.deepEqual(hp,result.teams.map(team=>team.map(hero=>hero.hp)),'full replay HP must agree with authoritative result');
 assert.deepEqual(replay.statusSnapshot(),result.teams.map(team=>team.map(hero=>Object.fromEntries(surgeFields.filter(key=>Number.isFinite(hero[key])).map(key=>[key,hero[key]])))),'final replay must not resurrect a buff on any fallen bearer');
});

test('new protected formation logs primary death before center splash death and both surge transfers',()=>{
 const hero=(id,hp,position,lane='back',shield=0)=>({id,name:id,hp,maxHp:hp,attack:50,defense:0,speed:50,shield,lane,position,role:'fighter',damage:0,kills:0});
 const defenders=initializeCenterProtection([
  hero('source',100,0,'front'),hero('front',1,1,'front'),hero('survivor',50,2,'back',1000),hero('center',60,3),hero('rear',1,4)
 ]);
 grantArcaneSurge(defenders[0],3);
 const attacker={...hero('attacker',1000,1,'front'),attack:400,role:'energy',active:{name:'Area',effect:'splash',power:1.2,splashRate:.25}};
 const combat=createLiveCommanderCombat({teams:[[attacker],defenders],round:3,commanders:[{commanderId:'attack'},{commanderId:'magic'}],abilities:createLiveCommanderAbilities({matchKey:'new-transfer'})});
 const initial=structuredClone(combat.teams),out=stepParityDamageSpecial(combat,{side:0,actorId:'attacker',round:3,critical:false});
 const transfers=out.events.filter(event=>event.arcaneTransfer);
 assert.deepEqual(transfers.map(event=>[event.damageType,event.arcaneTransfer.sourceId,event.arcaneTransfer.targetId]),[['special','source','center'],['splash','center','survivor']]);
 assert.equal(combat.teams[1][3].centerProtection.broken,true);
 assert.equal(combat.teams[1][2].arcaneSurgeUntilRound,5);
 const replay=createBattleReplayHealth(initial);
 replay.apply({round:3,side:1,action:'commander-magic-ultimate',impacts:[{target:'source',kind:'buff',value:50,fromRound:3,untilRound:5}]});
 let hp;
 for(const event of out.events)hp=replay.apply(event);
 assert.deepEqual(hp,combat.teams.map(team=>team.map(hero=>hero.hp)));
 assert.deepEqual(replay.statusSnapshot(),combat.teams.map(team=>team.map(hero=>Object.fromEntries(surgeFields.filter(key=>Number.isFinite(hero[key])).map(key=>[key,hero[key]])))));
});
