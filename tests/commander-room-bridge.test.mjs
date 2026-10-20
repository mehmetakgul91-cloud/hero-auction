import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomCommanderSession,roomCommanderSeat,submitRoomCommanderTurn,viewRoomCommanderSession} from '../commander-room-bridge.js';
import {createCommanderProfile} from '../arena-commanders.js';
const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,name:p+i,power:75,role:i<2?'tank':'support',lane:i<2?'front':'back'}));
const room=()=>({code:'123',phase:'finished',created:100,matchNumber:1,players:[{token:'alice'},{token:'bob'}]});
const make=r=>createRoomCommanderSession(r,{cardsA:cards('a'),cardsB:cards('b'),commanders:[createCommanderProfile('attack'),createCommanderProfile('defense')]});
test('room tokens determine seat and reject unknown token',()=>{
 const r=room();
 assert.equal(roomCommanderSeat(r,'bob'),1);
 assert.equal(roomCommanderSeat(r,'alice'),0);
 assert.equal(roomCommanderSeat(r,'unknown'),-1);
});
test('each room player submits only their own commander command',()=>{
 const r=room(),bound=make(r);
 assert.equal(submitRoomCommanderTurn(r,bound,{token:'alice',round:1,command:'pass',side:1}).ready,false);
 assert.equal(submitRoomCommanderTurn(r,bound,{token:'bob',round:1,command:'pass',side:0}).ready,true);
 assert.equal(viewRoomCommanderSession(r,bound,'bob').round,2);
});
test('unknown player and expired rematch are rejected',()=>{
 const r=room(),bound=make(r);
 assert.throws(()=>submitRoomCommanderTurn(r,bound,{token:'fake',round:1,command:'pass'}),/Unauthorized/);
 r.matchNumber=2;
 assert.throws(()=>submitRoomCommanderTurn(r,bound,{token:'alice',round:1,command:'pass'}),/expired/);
});
test('room view exposes only caller pending command',()=>{
 const r=room(),bound=make(r);
 submitRoomCommanderTurn(r,bound,{token:'alice',round:1,command:'pass'});
 const bob=viewRoomCommanderSession(r,bound,'bob');
 assert.equal(bob.yourCommand,null);
 assert.deepEqual(bob.submitted,[true,false]);
 assert.equal(viewRoomCommanderSession(r,bound,'alice').yourCommand,'pass');
});
