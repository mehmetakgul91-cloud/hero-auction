import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

// Private preview process only. No database, real accounts, wallet writes or reward shortcuts.
test('invitation HTTP edge cases preserve consent, membership and both wallets',{timeout:30000},async t=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 const post=async(path,body={},status=200)=>{const response=await fetch('http://127.0.0.1:'+port+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,status,path+': '+JSON.stringify(data));return data};
 let sequence=0;
 const user=async()=>{const auth=await post('/api/auth/guest',{name:'Invitation fixture '+(++sequence)});const result={authToken:auth.authToken};await post('/api/commander/select',{...result,commanderId:'attack'});result.playerId=(await post('/api/friends',result)).playerId;return result};
 const gold=async u=>(await post('/api/wallet',u)).gold;
 const pair=async()=>{const host=await user(),guest=await user();await post('/api/friend/add',{...host,playerId:guest.playerId});await post('/api/friend/accept',{...guest,playerId:host.playerId});return {host,guest}};
 const invite=async(host,guest)=>{const target=await post('/api/create',host);const result=await post('/api/friend/invite',{...host,code:target.room.code,token:target.token,playerId:guest.playerId});return {target,id:result.outgoing.at(-1).id}};
 const accept=(guest,id,extra={})=>post('/api/friend/invite/respond',{...guest,inviteId:id,response:'accept',consent:true,expectedCost:50,...extra});
 const find=async(guest,id)=>(await post('/api/friend/invitations',guest)).incoming.find(i=>i.id===id);
 try{
  let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch('http://127.0.0.1:'+port+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,30))}assert.ok(ready,logs);
  await t.test('host moving to another room invalidates old pending invitation without debit',async()=>{
   const {host,guest}=await pair(),{target,id}=await invite(host,guest);const moved=await post('/api/create',host);assert.notEqual(moved.room.code,target.room.code);
   assert.equal((await find(guest,id)).status,'failed');await accept(guest,id);assert.equal((await find(guest,id)).status,'failed');assert.deepEqual(await Promise.all([host,guest].map(gold)),[500,500]);
  });
  await t.test('explicit host detach cancels the invitation, preserving balances',async()=>{
   const {host,guest}=await pair(),{target,id}=await invite(host,guest);await post('/api/room/detach',{...host,code:target.room.code,token:target.token});assert.equal((await find(guest,id)).status,'cancelled');await accept(guest,id);assert.deepEqual(await Promise.all([host,guest].map(gold)),[500,500]);
  });
  await t.test('declining never queues, charges or prevents creating another room',async()=>{
   const {host,guest}=await pair(),{id}=await invite(host,guest);await post('/api/friend/invite/respond',{...guest,inviteId:id,response:'decline'});assert.equal((await find(guest,id)).status,'declined');await post('/api/create',guest);assert.deepEqual(await Promise.all([host,guest].map(gold)),[500,500]);
  });
  await t.test('recipient can cancel a queued invitation and then create again without a second debit',async()=>{
   const {host,guest}=await pair(),{id}=await invite(host,guest),opponent=await user();const source=await post('/api/create',opponent),joined=await post('/api/join',{...guest,code:source.room.code});
   await accept(guest,id,{sourceCode:source.room.code,sourceToken:joined.token});assert.equal((await find(guest,id)).status,'queued');await post('/api/create',guest,409);
   await post('/api/friend/invite/cancel',{...guest,inviteId:id});assert.equal((await find(guest,id)).status,'cancelled');await post('/api/create',guest);assert.deepEqual(await Promise.all([host,guest].map(gold)),[500,450]);
  });
  await t.test('a target filled by another player never charges the invited recipient',async()=>{
   const {host,guest}=await pair(),{target,id}=await invite(host,guest),other=await user();await post('/api/join',{...other,code:target.room.code});const before=await Promise.all([host,guest,other].map(gold));
   assert.deepEqual(before,[450,500,450]);await accept(guest,id);assert.equal((await find(guest,id)).status,'failed');await Promise.all(Array.from({length:3},()=>find(guest,id)));assert.deepEqual(await Promise.all([host,guest,other].map(gold)),before);
  });
  await t.test('transferring out of private waiting room prevents later stale-room debit',async()=>{
   const {host,guest}=await pair(),old=await post('/api/create',guest),{id}=await invite(host,guest);assert.equal((await accept(guest,id)).incoming.find(i=>i.id===id).status,'joined');const stranger=await user();await post('/api/join',{...stranger,code:old.room.code},409);assert.deepEqual(await Promise.all([guest,stranger].map(gold)),[450,500]);
  });
  await t.test('transferring out of random waiting room prevents abandoned matchmaking debit',async()=>{
   const {host,guest}=await pair(),old=await post('/api/match',guest),{id}=await invite(host,guest);assert.equal(old.room.phase,'matching');await accept(guest,id);const stranger=await user(),next=await post('/api/match',stranger);assert.equal(next.room.phase,'matching');assert.notEqual(next.room.code,old.room.code);assert.deepEqual(await Promise.all([guest,stranger].map(gold)),[450,500]);await post('/api/room/detach',{...stranger,code:next.room.code,token:next.token});
  });
  await t.test('unacknowledged handoff blocks newer entry and detach; acknowledged old invite cannot replay',async()=>{
   const {host,guest}=await pair(),{id}=await invite(host,guest);const joined=(await accept(guest,id)).incoming.find(i=>i.id===id);
   await post('/api/create',guest,409);await post('/api/room/detach',{...guest,code:joined.room.code,token:joined.token},409);
   await post('/api/friend/invite/ack',{...guest,inviteId:id});const newer=await post('/api/create',guest);assert.notEqual(newer.room.code,joined.room.code);assert.ok(!('token' in (await find(guest,id))));
  });
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
