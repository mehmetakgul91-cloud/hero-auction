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
test('rejects stale turns and duplicate submissions',()=>{
 const session=make();
 submitCommanderMatchTurn(session,{side:0,round:1,command:'pass'});
 assert.throws(()=>submitCommanderMatchTurn(session,{side:0,round:1,command:'pass'}),/already submitted/);
 assert.throws(()=>submitCommanderMatchTurn(session,{side:1,round:2,command:'pass'}),/Stale or future/);
});
test('invalid ability does not commit a round',()=>{
 const session=make();
 submitCommanderMatchTurn(session,{side:0,round:1,command:'normal'});
 assert.throws(()=>submitCommanderMatchTurn(session,{side:1,round:1,command:'pass'}),/Insufficient commander energy/);
 assert.equal(session.turns.length,0);
 assert.equal(session.round,1);
 assert.equal(session.pending[1],undefined);
 assert.deepEqual(session.pending[0],{command:'normal'});
});

test('invalid command can be corrected without trapping the opponent',()=>{
 const session=make();
 submitCommanderMatchTurn(session,{side:0,round:1,command:'normal'});
 assert.throws(()=>submitCommanderMatchTurn(session,{side:1,round:1,command:'pass'}),/Insufficient commander energy/);
 assert.equal(session.pending[1],undefined);
 // The invalid side must correct its pending command before the turn can proceed.
 assert.throws(()=>submitCommanderMatchTurn(session,{side:0,round:1,command:'pass'}),/already submitted/);
});
