import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {simulateBattle} from '../battle-engine.js';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';

const roster=JSON.parse(fs.readFileSync(new URL('../battle-roster.json',import.meta.url),'utf8')).characters;
const names=[
 ['Mor Hilal','Astral Kâhin','Kış Kraliçesi','Alev Zırhı','Seraphine'],
 ['Sancak Bekçisi','Ruh Dokuyucu','Kadim Koruyucu','Kaya Titanı','Alev Zırhı']
];
const surgeFields=['arcaneSurgeBonusAttack','arcaneSurgeFromRound','arcaneSurgeUntilRound'];

test('legacy primary then successive splash casualties replay transfers in actual settlement order',()=>{
 const cards=names.map(team=>team.map((name,index)=>{
  const hero=roster.find(entry=>entry.name===name);assert.ok(hero,name);
  // This historical casualty chain tests replay ordering, not current balance.
  // Keep its original Mor Hilal stats; current lane data and live preparation
  // are independently covered by assassin-lane-bonuses.test.mjs.
  const laneModifiers=hero.id==='original:expansion-26'?{front:.06,back:-.03}:hero.laneModifiers;
  return {...structuredClone(hero),laneModifiers:{...laneModifiers},power:hero.proposedPower,lane:index<2?'front':'back'};
 }));
 const result=simulateBattle(...cards,{
  seed:'chain:3698',maxRounds:6,
  commanders:[null,{commanderId:'magic',levels:{attack:0,defense:0,magic:40,support:0}}],
  commanderActions:[{round:4,side:1,ability:'ultimate',targetIds:['original:07']}]
 });
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
