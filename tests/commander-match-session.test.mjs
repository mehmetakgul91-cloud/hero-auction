import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommanderMatchSession,submitCommanderMatchTurn} from '../commander-match-session.js';
import {createCommanderProfile} from '../arena-commanders.js';
const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,name:p+i,power:75,role:i<2?'tank':'support',lane:i<2?'front':'back'}));
const make=()=>createCommanderMatchSession({cardsA:cards('a'),cardsB:cards('b'),commanders:[createCommanderProfile('attack'),createCommanderProfile('defense')]});
test('waits for both players and advances one round',()=>{
 const session=make();
 assert.equal(submitCommanderMatchTurn(session,{side:0,round:1,command:'pass'}).ready,false);
 const response=submitCommanderMatchTurn(session,{side:1,round:1,command:'pass'});
 assert.equal(response.ready,true);
 assert.equal(session.turns.length,1);
 assert.equal(session.round,2);
});
test('rejects stale turns and allows changing a pending choice',()=>{
 const session=make();
 submitCommanderMatchTurn(session,{side:0,round:1,command:'pass'});
 assert.equal(submitCommanderMatchTurn(session,{side:0,round:1,command:null}).ready,false);
 assert.deepEqual(session.pending[0],{command:null});
 assert.throws(()=>submitCommanderMatchTurn(session,{side:1,round:2,command:'pass'}),/Stale or future/);
});
test('invalid ability is rejected immediately without mutating the session',()=>{
 const session=make();
 assert.throws(()=>submitCommanderMatchTurn(session,{side:0,round:1,command:'normal'}),/Insufficient commander energy/);
 assert.equal(session.turns.length,0);
 assert.equal(session.pending[0],undefined);
 assert.equal(session.round,1);
});
test('player can correct a pending choice before opponent commits',()=>{
 const session=make();
 submitCommanderMatchTurn(session,{side:0,round:1,command:'pass'});
 submitCommanderMatchTurn(session,{side:0,round:1,command:null});
 assert.deepEqual(session.pending[0],{command:null});
 const response=submitCommanderMatchTurn(session,{side:1,round:1,command:'pass'});
 assert.equal(response.ready,true);
 assert.equal(session.round,2);
});
test('rejects an unaffordable replacement without changing existing choice',()=>{
 const session=make();
 submitCommanderMatchTurn(session,{side:0,round:1,command:'pass'});
 assert.throws(()=>submitCommanderMatchTurn(session,{side:0,round:1,command:'ultimate'}),/Insufficient commander energy/);
 assert.deepEqual(session.pending[0],{command:'pass'});
});
