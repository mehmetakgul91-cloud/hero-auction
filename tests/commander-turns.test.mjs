import test from 'node:test';
import assert from 'node:assert/strict';
import {createTurnSubmissionState,submitTurnCommand,validateTurnCommand,resolveTurnSubmissions,calculateNextTurnEnergy} from '../commander-turns.js';

test('two players must both submit before a turn is ready',()=>{
 const state=createTurnSubmissionState(4);
 assert.equal(submitTurnCommand(state,{side:0,round:4,command:'normal',energy:48,commanderId:'attack'}).ready,false);
 assert.equal(submitTurnCommand(state,{side:1,round:4,command:'pass',energy:48,commanderId:'defense'}).ready,true);
 assert.deepEqual(state.submissions[0],{side:0,round:4,ability:'normal'});
 assert.equal(state.submissions[1],null);
});
test('rejects an unauthorized duplicate submission',()=>{
 const state=createTurnSubmissionState(4);
 const request={side:0,round:4,command:'normal',energy:48,commanderId:'attack'};
 submitTurnCommand(state,request);
 assert.throws(()=>submitTurnCommand(state,request),/already submitted/);
});
test('rejects a stale turn',()=>{
 assert.throws(()=>submitTurnCommand(createTurnSubmissionState(4),{side:0,round:3,command:'pass',energy:48,commanderId:'attack'}),/Stale or future/);
});
test('rejects insufficient energy and missing commander',()=>{
 assert.throws(()=>validateTurnCommand('ultimate',{side:0,round:9,energy:100,ultimateEnergy:74,commanderId:'attack'}),/Insufficient/);
 assert.throws(()=>validateTurnCommand('normal',{side:0,round:4,energy:48,commanderId:null}),/not selected/);
});
test('accepts support ultimate at 100 energy',()=>{
 assert.equal(validateTurnCommand('ultimate',{side:1,round:9,energy:0,ultimateEnergy:100,commanderId:'support'}).ability,'ultimate');
});

test('turn cannot resolve until both players submit',()=>{
 const state=createTurnSubmissionState(4);
 submitTurnCommand(state,{side:0,round:4,command:'pass',energy:48,commanderId:'attack'});
 assert.throws(()=>resolveTurnSubmissions(state),/Both players/);
 submitTurnCommand(state,{side:1,round:4,command:'normal',energy:48,commanderId:'defense'});
 assert.deepEqual(resolveTurnSubmissions(state),[{side:1,round:4,ability:'normal'}]);
});
test('next turn energy accounts for skill cost and hero losses',()=>{
 assert.equal(calculateNextTurnEnergy(48,{ability:'normal'}),20);
 assert.equal(calculateNextTurnEnergy(90,{ability:'normal'},{lostHeroes:2}),82);
 assert.equal(calculateNextTurnEnergy(100,null,{lostHeroes:5}),100);
});
test('invalid energy calculations are rejected',()=>{
 assert.throws(()=>calculateNextTurnEnergy(20,{ability:'normal'}),/unaffordable/);
 assert.throws(()=>calculateNextTurnEnergy(40,{ability:'normal'},{lostHeroes:6}),/Invalid hero loss/);
});
