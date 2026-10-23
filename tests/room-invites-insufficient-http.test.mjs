import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

// Private preview process only. No database, real accounts, wallet writes or reward shortcuts.
test('invitation insufficient-funds and forged-access HTTP regressions',{timeout:30000},async t=>{
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
  await t.test('insufficient recipient balance does not debit host and failed invitation cannot charge on retry',async()=>{
   const {host,guest}=await pair();let spentRoom;
   // Spend preview credits only through ten ordinary paid admissions, never a test wallet setter.
   for(let i=0;i<10;i++){spentRoom=await post('/api/create',guest);const opponent=await user();await post('/api/join',{...opponent,code:spentRoom.room.code})}
   assert.equal(await gold(guest),0);await post('/api/room/detach',{...guest,code:spentRoom.room.code,token:spentRoom.token});
   const {id}=await invite(host,guest);await accept(guest,id);const failed=await find(guest,id);assert.equal(failed.status,'failed');assert.match(failed.reason,/50 altın/);assert.deepEqual(await Promise.all([host,guest].map(gold)),[500,0]);await accept(guest,id);assert.deepEqual(await Promise.all([host,guest].map(gold)),[500,0]);
  });
  await t.test('nonfriends, strangers, forged IDs and missing auth cannot send, respond, cancel or acknowledge',async()=>{
   const {host,guest}=await pair(),stranger=await user(),{target,id}=await invite(host,guest);
   await post('/api/friend/invite',{...host,code:target.room.code,token:target.token,playerId:stranger.playerId},403);
   await post('/api/friend/invite',{...stranger,code:target.room.code,token:target.token,playerId:guest.playerId},403);
   await post('/api/friend/invite/respond',{...stranger,inviteId:id,response:'accept',consent:true,expectedCost:50},404);
   await post('/api/friend/invite/cancel',{...stranger,inviteId:id},404);
   await post('/api/friend/invite/cancel',{...guest,inviteId:'forged-id'},404);
   await post('/api/friend/invite/ack',{...stranger,inviteId:id},404);
   for(const path of ['/api/friend/invitations','/api/friend/invite','/api/friend/invite/respond','/api/friend/invite/cancel','/api/friend/invite/ack'])await post(path,{inviteId:id},401);
   assert.equal((await find(guest,id)).status,'pending');assert.deepEqual(await Promise.all([host,guest,stranger].map(gold)),[500,500,500]);
  });
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
