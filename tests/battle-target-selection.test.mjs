import test from 'node:test';
import assert from 'node:assert/strict';
import {selectBattleTarget} from '../battle-target-selection.js';
const enemies=[{id:'front0',hp:100,lane:'front',position:0},{id:'front1',hp:100,lane:'front',position:1},{id:'rear',hp:100,lane:'back',position:2}];
test('frontline is preferred for ordinary heroes with round-dependent rotation',()=>{
 assert.equal(selectBattleTarget(enemies,{role:'fighter',position:0},1).id,'front1');
 assert.equal(selectBattleTarget(enemies,{role:'fighter',position:0},2).id,'front0');
});
test('assassin bypasses frontline on every third round',()=>{
 assert.equal(selectBattleTarget(enemies,{role:'assassin',position:0},3).id,'front0');
 assert.equal(selectBattleTarget(enemies,{role:'assassin',position:2},3).id,'rear');
});
test('dead frontline units are excluded, and no survivors returns null',()=>{
 const defeated=enemies.map(x=>({...x,hp:x.lane==='front'?0:100}));
 assert.equal(selectBattleTarget(defeated,{role:'fighter',position:0},1).id,'rear');
 assert.equal(selectBattleTarget(defeated.map(x=>({...x,hp:0})),{role:'fighter',position:0},1),null);
});
