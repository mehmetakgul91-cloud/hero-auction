import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeBattle,orientBattleSummary} from '../public/battle-summary-data.js';

const teams=[[{id:'a',name:'A'},{id:'healer',name:'Healer'}],[{id:'b',name:'B'},{id:'c',name:'C'}]];
test('counts normal attacks without damageType, absorbed shields and execute damage',()=>{
 const summary=summarizeBattle(teams,[
  {version:1,round:1,side:0,actor:'a',action:'attack',target:'b',value:30,absorbed:8},
  {version:2,round:1,side:1,actor:'b',action:'special',target:'a',value:20,executedDamage:7,damageType:'special',absorbed:4}
 ]);
 assert.deepEqual(summary.teams[0][0],{id:'a',name:'A',dealt:30,taken:27,blocked:4,healing:0});
 assert.deepEqual(summary.teams[1][0],{id:'b',name:'B',dealt:27,taken:30,blocked:8,healing:0});
 assert.equal(summary.actionCount,2);
});
test('splash, drain and status events belong to one action; passive healing is not a turn',()=>{
 const log=[
  {version:1,round:3,side:0,actor:'a',action:'special',target:'b',value:40,damageType:'special'},
  {version:1,round:3,side:0,actor:'a',action:'splash',target:'c',value:10,damageType:'splash'},
  {version:1,round:3,side:0,actor:'a',action:'heal',target:'a',value:6},
  {version:1,round:3,side:0,actor:'a',action:'armor-break',target:'b',value:0},
  {version:2,round:3,side:0,actor:'healer',action:'heal',target:'a',value:20},
  {version:3,round:4,side:0,actor:'a',action:'passive-heal',value:3},
  {version:3,round:4,action:'round-start'}
 ];
 for(const events of [log,log.map(({version,...event})=>event)]){
  const summary=summarizeBattle(teams,events);
  assert.equal(summary.actionCount,2);
  assert.equal(summary.teams[0][0].dealt,50);
  assert.equal(summary.teams[0][0].healing,9);
  assert.equal(summary.teams[0][1].healing,20);
  assert.equal(summary.teams[1][0].taken,40);
 }
});
test('commander damage and protection are separate from heroes and not double counted',()=>{
 const summary=summarizeBattle(teams,[
  {version:1,side:0,actor:'commander:0',action:'commander-hit',target:'b',value:20,absorbed:5,damageType:'commander'},
  {version:1,side:0,actor:'commander:0',action:'commander-hit',target:'c',value:15,damageType:'commander'},
  {version:1,side:0,actor:'commander:0',action:'commander-attack-ultimate',value:35},
  {version:2,side:1,actor:'commander:1',action:'commander-support-normal',value:12},
  {version:3,side:1,actor:'commander:1',action:'commander-defense-normal',value:18}
 ]);
 assert.equal(summary.actionCount,3);
 assert.deepEqual(summary.commanders,[{casts:1,dealt:35,healing:0,shield:0},{casts:2,dealt:0,healing:12,shield:18}]);
 assert.equal(summary.teams[0][0].dealt,0);
 assert.equal(summary.teams[1][0].taken,20);
 assert.equal(summary.teams[1][0].blocked,5);
 const reversed=orientBattleSummary(summary,1);
 assert.deepEqual(reversed.teams,[summary.teams[1],summary.teams[0]]);
 assert.equal(reversed.commanders[0].healing,12);
 assert.equal(reversed.actionCount,3);
 assert.equal(summary.teams[0][0].id,'a');
});
test('identical hero IDs on opposing teams remain separate',()=>{
 const summary=summarizeBattle([[{id:'same',name:'Own'}],[{id:'same',name:'Rival'}]],[{version:1,side:1,actor:'same',action:'attack',target:'same',value:19}]);
 assert.equal(summary.teams[0][0].taken,19);assert.equal(summary.teams[0][0].dealt,0);
 assert.equal(summary.teams[1][0].taken,0);assert.equal(summary.teams[1][0].dealt,19);
});
