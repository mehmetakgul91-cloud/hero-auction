import test from 'node:test';import assert from 'node:assert/strict';
import {roomReturnStatus} from '../public/room-return-status.js';
const room=extra=>({phase:'auction',me:0,mode:'friend',presence:{candidate:0,deadline:121000,serverNow:1000,seats:[{connected:true},{connected:false}]},...extra});
test('server-relative countdown tolerates client clock skew and never awards early',()=>{
 assert.match(roomReturnStatus(room(),{now:10000000,receivedAt:10000000}),/120 saniye/);
 assert.match(roomReturnStatus(room(),{now:10030000,receivedAt:10000000}),/90 saniye/);
 assert.match(roomReturnStatus(room(),{now:10200000,receivedAt:10000000}),/sunucu tarafından doğrulanması/);
});
test('only present candidate sees countdown, not arena or terminal rooms',()=>{
 for(const extra of [{me:1},{mode:'bot'},{phase:'closed'},{idleClosed:{}},{forfeit:{}},{presence:{candidate:null}},{presence:{arenaExempt:true}}])assert.equal(roomReturnStatus(room(extra)),'');
});
test('English and formation use same authoritative rule without inventing result',()=>{
 assert.match(roomReturnStatus(room({phase:'finished'}),{now:0,receivedAt:0,english:true}),/120 seconds.*neither player wins/);
});
