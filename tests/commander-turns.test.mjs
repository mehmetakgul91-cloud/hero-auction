import test from 'node:test';
import assert from 'node:assert/strict';
import {createTurnSubmissionState,submitTurnCommand,validateTurnCommand} from '../commander-turns.js';

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
 assert.throws(()=>validateTurnCommand('ultimate',{side:0,round:9,energy:99,commanderId:'attack'}),/Insufficient/);
 assert.throws(()=>validateTurnCommand('normal',{side:0,round:4,energy:48,commanderId:null}),/not selected/);
});
test('accepts ultimate at 100 energy',()=>{
 assert.equal(validateTurnCommand('ultimate',{side:1,round:9,energy:100,commanderId:'support'}).ability,'ultimate');
});
