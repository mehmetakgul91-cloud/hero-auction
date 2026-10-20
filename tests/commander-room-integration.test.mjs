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

test('a completed battle rejects further commands without changing its result',()=>{
 const {room,bound}=setup();
 for(let round=1;round<=15&&!bound.session.finished;round++){
  submitRoomCommanderTurn(room,bound,{token:'player-a',round,command:'pass'});
  submitRoomCommanderTurn(room,bound,{token:'player-b',round,command:'pass'});
 }
 assert.equal(bound.session.finished,true);
 const turnsBefore=structuredClone(bound.session.turns);
 const resultBefore=structuredClone(bound.session.result);
 assert.throws(()=>submitRoomCommanderTurn(room,bound,{token:'player-a',round:bound.session.round,command:'pass'}),/Battle already finished/);
 assert.deepEqual(bound.session.turns,turnsBefore);
 assert.deepEqual(bound.session.result,resultBefore);
});
test('finished result is visible from each player perspective only at completion',()=>{
 const {room,bound}=setup();
 assert.equal(viewRoomCommanderSession(room,bound,'player-a').result,null);
 for(let round=1;round<=15&&!bound.session.finished;round++){
  submitRoomCommanderTurn(room,bound,{token:'player-a',round,command:'pass'});
  submitRoomCommanderTurn(room,bound,{token:'player-b',round,command:'pass'});
 }
 const a=viewRoomCommanderSession(room,bound,'player-a');
 const b=viewRoomCommanderSession(room,bound,'player-b');
 assert.equal(a.finished,true);
 assert.equal(b.finished,true);
 assert.ok(a.result);
 assert.ok(b.result);
 if(a.result.winner!==null){
  assert.equal(a.result.winner+b.result.winner,1);
 }else assert.equal(b.result.winner,null);
});
test('rematch starts at round one with fresh energy and no previous result',()=>{
 const {room,bound}=setup();
 submitRoomCommanderTurn(room,bound,{token:'player-a',round:1,command:'pass'});
 submitRoomCommanderTurn(room,bound,{token:'player-b',round:1,command:'pass'});
 room.matchNumber=2;
 const next=createRoomCommanderSession(room,{cardsA:cards('a'),cardsB:cards('b'),commanders:[createCommanderProfile('attack'),createCommanderProfile('defense')]});
 const fresh=viewRoomCommanderSession(room,next,'player-a');
 assert.equal(fresh.round,1);
 assert.equal(fresh.energy,12);
 assert.equal(fresh.result,null);
 assert.deepEqual(fresh.submitted,[false,false]);
 assert.throws(()=>viewRoomCommanderSession(room,bound,'player-a'),/expired/);
});

test('both players receive the same completed round events only after both submit',()=>{
 const {room,bound}=setup();
 const initial=viewRoomCommanderSession(room,bound,'player-a');
 assert.equal(initial.completedRound,0);
 assert.deepEqual(initial.roundEvents,[]);
 submitRoomCommanderTurn(room,bound,{token:'player-a',round:1,command:'pass'});
 assert.equal(viewRoomCommanderSession(room,bound,'player-b').completedRound,0);
 assert.deepEqual(viewRoomCommanderSession(room,bound,'player-b').roundEvents,[]);
 submitRoomCommanderTurn(room,bound,{token:'player-b',round:1,command:'pass'});
 const a=viewRoomCommanderSession(room,bound,'player-a');
 const b=viewRoomCommanderSession(room,bound,'player-b');
 assert.equal(a.completedRound,1);
 assert.equal(b.completedRound,1);
 assert.deepEqual(a.roundEvents,b.roundEvents);
 assert.ok(a.roundEvents.every(event=>event.round===1));
});

test('round-end HP snapshots are identical for both seats and absent before resolution',()=>{
 const {room,bound}=setup();
 assert.equal(viewRoomCommanderSession(room,bound,'player-a').roundTeams,null);
 submitRoomCommanderTurn(room,bound,{token:'player-a',round:1,command:'pass'});
 assert.equal(viewRoomCommanderSession(room,bound,'player-a').roundTeams,null);
 submitRoomCommanderTurn(room,bound,{token:'player-b',round:1,command:'pass'});
 const a=viewRoomCommanderSession(room,bound,'player-a');
 const b=viewRoomCommanderSession(room,bound,'player-b');
 assert.deepEqual(a.roundTeams,b.roundTeams);
 assert.equal(a.roundTeams.length,2);
 assert.equal(a.roundTeams[0].length,5);
 assert.ok(a.roundTeams.flat().every(hero=>Number.isFinite(hero.hp)&&Number.isFinite(hero.maxHp)));
});
