import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomInvites,ROOM_INVITE_TTL} from '../room-invites.js';
test('invitation identity, idempotency, recipient auth, explicit consent, decline, cancel and expiry',()=>{
 let time=0;const store=createRoomInvites({now:()=>time}),room={code:'123',created:1};
 const i=store.create('a','b',room);assert.equal(store.create('a','b',room).id,i.id);
 assert.throws(()=>store.respond('c',i.id,'accept',true),{status:404});assert.throws(()=>store.respond('b',i.id,'accept',false),{status:400});
 store.respond('b',i.id,'accept',true);assert.equal(i.status,'queued');store.respond('b',i.id,'accept',true);assert.equal(i.status,'queued');
 const second=store.create('c','b',room);assert.throws(()=>store.respond('b',second.id,'accept',true),{status:409});
 store.cancel('b',i.id);assert.equal(i.status,'cancelled');store.respond('b',second.id,'decline');assert.equal(second.status,'declined');
 const third=store.create('a','b',{code:'123',created:2});assert.notEqual(third.id,i.id);time+=ROOM_INVITE_TTL;store.prune();assert.equal(third.status,'expired');
 const copy=createRoomInvites();copy.restore(JSON.parse(JSON.stringify(store.snapshot())));assert.deepEqual(copy.snapshot(),store.snapshot());
});

test('uncertain or unrelated queued invitations are protected from expiry until receipt reconciliation',()=>{
 let time=0;const store=createRoomInvites({now:()=>time});const i=store.create('a','b',{code:'123',created:1});store.respond('b',i.id,'accept',true);time=ROOM_INVITE_TTL+1;store.prune(item=>item.status==='queued');assert.equal(i.status,'queued');store.prune();assert.equal(i.status,'expired');
});

test('send/cancel spam is rate limited and recipients have bounded pending invitations',()=>{
 let time=0;const store=createRoomInvites({now:()=>time}),room={code:'123',created:1};
 for(let n=0;n<20;n++){const i=store.create('a','b',room);store.cancel('a',i.id)}assert.throws(()=>store.create('a','b',room),{status:429});time=60000;assert.ok(store.create('a','b',room));
 for(let n=0;n<49;n++)store.create('sender-'+n,'b',room);assert.throws(()=>store.create('final-sender','b',room),{status:409});
});
