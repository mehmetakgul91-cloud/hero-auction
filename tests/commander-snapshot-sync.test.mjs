import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommanderSnapshotSync,acceptCommanderSnapshot} from '../commander-snapshot-sync.js';
const payload=(version,hp)=>({version,teams:[[{id:'a',hp,maxHp:100}],[{id:'b',hp:100,maxHp:100}]],events:[{version,action:'commander-hit',value:100-hp}],finished:false});
test('newer snapshot replaces health without stacking damage',()=>{
 const state=createCommanderSnapshotSync();
 assert.equal(acceptCommanderSnapshot(state,payload(1,80)).accepted,true);
 assert.equal(acceptCommanderSnapshot(state,payload(1,80)).accepted,false);
 assert.equal(state.teams[0][0].hp,80);
 assert.equal(state.events.length,1);
});
test('out of order updates never roll health back',()=>{
 const state=createCommanderSnapshotSync();
 acceptCommanderSnapshot(state,payload(3,45));
 assert.equal(acceptCommanderSnapshot(state,payload(2,70)).accepted,false);
 assert.equal(state.teams[0][0].hp,45);
});
test('missed versions recover from latest full snapshot',()=>{
 const state=createCommanderSnapshotSync();
 acceptCommanderSnapshot(state,payload(1,90));
 const result=acceptCommanderSnapshot(state,payload(5,30));
 assert.equal(result.version,5);
 assert.equal(state.teams[0][0].hp,30);
 assert.equal(state.events.length,2);
});
test('received snapshots are copied, not shared with caller',()=>{
 const state=createCommanderSnapshotSync(),incoming=payload(1,60);
 acceptCommanderSnapshot(state,incoming);
 incoming.teams[0][0].hp=0;
 assert.equal(state.teams[0][0].hp,60);
});
