import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveLiveArenaRoomBinding,verifyLiveArenaRoomBinding} from '../commander-live-room-binding.js';
function room(){return {code:'123',mode:'pvp',phase:'finished',created:100,matchNumber:2,players:[{token:'privateA'},{token:'privateB'}],battleSync:{result:{winner:0},commanderInput:{}}}}
test('valid room binds seats to exact match identity',()=>{
 const r=room(),binding=deriveLiveArenaRoomBinding(r);
 assert.equal(binding.matchKey,'123:2:100');
 assert.equal(verifyLiveArenaRoomBinding(r,binding,'privateB'),1);
 assert.throws(()=>verifyLiveArenaRoomBinding(r,binding,'intruder'),/Unauthorized/);
});
test('rematch invalidates previous binding',()=>{
 const r=room(),binding=deriveLiveArenaRoomBinding(r);
 r.matchNumber=3;
 assert.throws(()=>verifyLiveArenaRoomBinding(r,binding,'privateA'),/Expired/);
});
test('token rotation invalidates previous binding',()=>{
 const r=room(),binding=deriveLiveArenaRoomBinding(r);
 r.players[0].token='newToken';
 assert.throws(()=>verifyLiveArenaRoomBinding(r,binding,'privateA'),/Expired/);
});
test('bot and unfinished rooms cannot bind',()=>{
 const r=room();r.mode='bot';
 assert.throws(()=>deriveLiveArenaRoomBinding(r),/not ready/);
 r.mode='pvp';r.phase='auction';
 assert.throws(()=>deriveLiveArenaRoomBinding(r),/not ready/);
});
