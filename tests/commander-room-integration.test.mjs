import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomCommanderSession,submitRoomCommanderTurn,viewRoomCommanderSession} from '../commander-room-bridge.js';
import {createCommanderProfile} from '../arena-commanders.js';

const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,name:p+i,power:75,role:i<2?'tank':'support',lane:i<2?'front':'back'}));
function setup(){
 const room={code:'583',created:987,matchNumber:1,phase:'finished',players:[{token:'player-a'},{token:'player-b'}]};
 const bound=createRoomCommanderSession(room,{cardsA:cards('a'),cardsB:cards('b'),commanders:[createCommanderProfile('attack'),createCommanderProfile('defense')]});
 return {room,bound};
}
test('two players submit independently; round resolves exactly once',async()=>{
 const {room,bound}=setup();
 const [a,b]=await Promise.all([
  Promise.resolve().then(()=>submitRoomCommanderTurn(room,bound,{token:'player-a',round:1,command:'pass'})),
  Promise.resolve().then(()=>submitRoomCommanderTurn(room,bound,{token:'player-b',round:1,command:'pass'}))
 ]);
 assert.equal([a.ready,b.ready].filter(Boolean).length,1);
 assert.equal(bound.session.turns.length,1);
 assert.equal(bound.session.round,2);
 assert.deepEqual(bound.session.turns[0],[{command:'pass'},{command:'pass'}]);
});
test('duplicate delayed command cannot overwrite next round',()=>{
 const {room,bound}=setup();
 submitRoomCommanderTurn(room,bound,{token:'player-a',round:1,command:'pass'});
 submitRoomCommanderTurn(room,bound,{token:'player-b',round:1,command:'pass'});
 assert.throws(()=>submitRoomCommanderTurn(room,bound,{token:'player-a',round:1,command:'pass'}),/Stale or future/);
 assert.equal(bound.session.turns.length,1);
 assert.equal(bound.session.round,2);
});
test('one player cannot use the other player token to select side via side field',()=>{
 const {room,bound}=setup();
 submitRoomCommanderTurn(room,bound,{token:'player-a',side:1,round:1,command:'pass'});
 assert.deepEqual(bound.session.pending,[{command:'pass'},undefined]);
 assert.equal(viewRoomCommanderSession(room,bound,'player-b').yourCommand,null);
});
test('an invalid ability leaves the other player pending choice intact',()=>{
 const {room,bound}=setup();
 submitRoomCommanderTurn(room,bound,{token:'player-a',round:1,command:'pass'});
 assert.throws(()=>submitRoomCommanderTurn(room,bound,{token:'player-b',round:1,command:'ultimate'}),/Insufficient commander energy/);
 assert.deepEqual(bound.session.pending,[{command:'pass'},undefined]);
 assert.equal(bound.session.turns.length,0);
});
test('new rematch rejects old commands and creates isolated turn state',()=>{
 const {room,bound}=setup();
 submitRoomCommanderTurn(room,bound,{token:'player-a',round:1,command:'pass'});
 room.matchNumber=2;
 assert.throws(()=>submitRoomCommanderTurn(room,bound,{token:'player-b',round:1,command:'pass'}),/expired/);
 const next=createRoomCommanderSession(room,{cardsA:cards('a'),cardsB:cards('b'),commanders:[createCommanderProfile('attack'),createCommanderProfile('defense')]});
 assert.deepEqual(next.session.pending,[undefined,undefined]);
 assert.equal(next.session.round,1);
 assert.notEqual(next.session.seed,bound.session.seed);
});
