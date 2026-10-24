import test from 'node:test';
import assert from 'node:assert/strict';
import {createFriendsService,FRIEND_PRESENCE_TTL} from '../friends-service.js';

async function fixture(options={}){const service=createFriendsService(options);const a=await service.register('account-a','Alice'),b=await service.register('account-b','Bob'),c=await service.register('account-c','Cecil');return{service,a,b,c}}
test('public IDs are opaque, stable after restore, and snapshots exclude presence',async()=>{
 const {service,a,b}=await fixture();assert.match(a.playerId,/^HA-[A-F0-9]{16}$/);assert.notEqual(a.playerId,b.playerId);
 await service.action('account-a','add',b.playerId);service.heartbeat('account-a','session-a',true);
 const restored=createFriendsService();restored.restore(JSON.parse(JSON.stringify(service.snapshot())));
 assert.deepEqual(await restored.register('account-a','Alice'),a);assert.equal(restored.state('account-b').incoming[0].name,'Alice');
 assert.doesNotMatch(JSON.stringify(service.state('account-a')),/account-a|account-b|session-a/);
 assert.doesNotMatch(JSON.stringify(service.snapshot()),/session-a/);
});
test('requests require recipient acceptance; crossed requests do not grant presence',async()=>{
 const {service,a,b,c}=await fixture();service.heartbeat('account-b','session-b',true);
 await Promise.all([service.action('account-a','add',b.playerId),service.action('account-a','add',b.playerId)]);
 assert.equal(service.state('account-a').outgoing.length,1);assert.equal(service.state('account-b').incoming.length,1);
 assert.ok(!('online' in service.state('account-a').outgoing[0]));
 await assert.rejects(service.action('account-a','accept',b.playerId),{status:404});
 await assert.rejects(service.action('account-c','accept',a.playerId),{status:404});
 await service.action('account-b','add',a.playerId);assert.equal(service.state('account-a').friends.length,0);
 await service.action('account-b','accept',a.playerId);await service.action('account-b','accept',a.playerId);
 assert.equal(service.state('account-a').friends[0].online,true);assert.equal(service.state('account-b').outgoing.length,0);
 assert.equal(service.state('account-c').friends.length,0);
 await service.action('account-a','remove',b.playerId);await service.action('account-a','remove',b.playerId);
 assert.equal(service.state('account-b').friends.length,0);
 await service.action('account-a','add',b.playerId);await service.action('account-b','decline',a.playerId);
 assert.equal(service.state('account-a').outgoing.length,0);
 await assert.rejects(service.action('account-a','add',a.playerId),{status:404});
 await assert.rejects(service.action('account-a','add','account-b'),{status:404});
 await assert.rejects(service.action('account-a','add','HA-0000000000000000'),{status:404});
});
test('presence expires, offline is scoped to tab, and restart is offline',async()=>{
 let time=100;const {service,a,b}=await fixture({now:()=>time});await service.action('account-a','add',b.playerId);await service.action('account-b','accept',a.playerId);
 service.heartbeat('account-b','session-one',true);service.heartbeat('account-b','session-two',true);
 service.heartbeat('account-b','session-one',false);assert.equal(service.state('account-a').friends[0].online,true);
 time+=FRIEND_PRESENCE_TTL;assert.equal(service.state('account-a').friends[0].online,false);
 service.heartbeat('account-b','session-two',true);assert.equal(service.state('account-a').friends[0].online,true);
 const copy=createFriendsService();copy.restore(service.snapshot());assert.equal(copy.state('account-a').friends[0].online,false);
 service.heartbeat('account-b','session-two',false);assert.equal(service.state('account-a').friends[0].online,false);
 assert.throws(()=>service.heartbeat('account-b','x',true),{status:400});assert.throws(()=>service.heartbeat('account-b','session-two','true'),{status:400});
});
test('legacy unilateral links migrate to requests, reciprocal links stay accepted',()=>{
 const service=createFriendsService();service.migrate([['a',['b','c']],['b',['a']]],new Map([['a',{name:'A'}],['b',{name:'B'}],['c',{name:'C'}]]));
 assert.equal(service.state('a').friends[0].name,'B');assert.equal(service.state('a').outgoing[0].name,'C');assert.equal(service.state('c').friends.length,0);
});
test('failed persistence rolls mutation back and later operations continue',async()=>{
 let broken=false;const {service,a,b}=await fixture({persist:async()=>{if(broken)throw Error('storage failed')}});
 broken=true;await assert.rejects(service.register('account-a','Changed name'),/storage failed/);assert.equal(service.snapshot().players.find(([id])=>id==='account-a')[1].name,'Alice');await assert.rejects(service.action('account-a','add',b.playerId),/storage failed/);assert.equal(service.state('account-a').outgoing.length,0);
 broken=false;await service.action('account-a','add',b.playerId);assert.equal(service.state('account-b').incoming.length,1);
});
test('lookup attempts are rate bounded including unknown IDs',async()=>{
 let time=0;const {service,b}=await fixture({now:()=>time});for(let i=0;i<20;i++)await assert.rejects(service.action('account-a','add','invalid'),{status:404});
 assert.throws(()=>service.action('account-a','add',b.playerId),{status:429});time=60000;await service.action('account-a','add',b.playerId);
});

 test('background social saves wait for failed writes to roll back',async()=>{
 let rejectSave,block=false;const persisted=[];
 const service=createFriendsService({persist:async()=>{if(block)await new Promise((resolve,reject)=>{rejectSave=reject})}});
 const a=await service.register('a','A'),b=await service.register('b','B');block=true;
 const action=service.action('a','add',b.playerId);await new Promise(resolve=>setImmediate(resolve));
 const background=service.afterMutations(()=>persisted.push(service.snapshot()));
 rejectSave(Error('failed'));await assert.rejects(action,/failed/);await background;
 assert.deepEqual(persisted[0].requests,[]);
 });

test('outgoing request count is bounded even across rate windows',async()=>{
 let time=0;const service=createFriendsService({now:()=>time});await service.register('a','A');
 const targets=[];for(let i=0;i<51;i++)targets.push(await service.register('target-'+i,'Target '+i));
 for(let i=0;i<50;i++){time+=60000;await service.action('a','add',targets[i].playerId)}
 time+=60000;await assert.rejects(service.action('a','add',targets[50].playerId),{status:409});assert.equal(service.state('a').outgoing.length,50);
});
