import test from 'node:test';
import assert from 'node:assert/strict';
import {orderHeroActions,nextScheduledHeroAction} from '../battle-action-scheduler.js';
test('hero action order preserves speed, side and position tie breakers',()=>{
 const teams=[[{id:'a0',speed:30,position:1,hp:10},{id:'a1',speed:50,position:0,hp:10}],[{id:'b0',speed:50,position:0,hp:10},{id:'b1',speed:30,position:0,hp:10}]];
 assert.deepEqual(orderHeroActions(teams).map(x=>x.unit.id),['a1','b0','a0','b1']);
});
test('cursor skips defeated actors and never reorders surviving turns',()=>{
 const teams=[[{id:'a',speed:30,position:0,hp:10}],[{id:'b',speed:20,position:0,hp:10}]];
 const order=orderHeroActions(teams);
 assert.equal(nextScheduledHeroAction(order,0).unit.id,'a');
 teams[1][0].hp=0;
 assert.equal(nextScheduledHeroAction(order,1),null);
 assert.equal(nextScheduledHeroAction(order,2),null);
});
test('invalid action cursors are rejected',()=>{
 assert.throws(()=>nextScheduledHeroAction([],1),/Invalid action cursor/);
});
