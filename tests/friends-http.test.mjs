import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

test('isolated friends HTTP: auth, consent, public match IDs, presence, cancellation and no wallet changes',{timeout:20000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 const post=async(path,body={},status=200)=>{const response=await fetch('http://127.0.0.1:'+port+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data};
 try{
  let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch('http://127.0.0.1:'+port+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,30))}assert.ok(ready,logs);
  for(const path of ['/api/friends','/api/friend/add','/api/friend/accept','/api/friend/decline','/api/friend/remove','/api/friends/presence'])await post(path,{},401);
  const users=[];for(const name of ['Alice','Bob','Cecil']){const auth=await post('/api/auth/guest',{name});users.push({authToken:auth.authToken})}
  const [a,b,c]=users;const self=await Promise.all(users.map(u=>post('/api/friends',u)));const [aid,bid,cid]=self.map(s=>s.playerId);
  assert.match(aid,/^HA-/);assert.equal(self[0].guest,true);assert.equal(self[0].persistent,false);
  assert.equal((await post('/api/friends',a)).playerId,aid);
  await post('/api/friend/add',{...a,accountId:bid},404);await post('/api/friend/add',{...a,playerId:aid},404);
  await post('/api/friend/add',{...a,playerId:bid.toLowerCase()});await post('/api/friend/add',{...a,playerId:bid});
  await post('/api/friends/presence',{...b,sessionId:'bob-session',online:true});
  let as=await post('/api/friends',a);assert.equal(as.outgoing.length,1);assert.ok(!('online' in as.outgoing[0]));assert.equal(as.friends.length,0);
  await post('/api/friend/accept',{...c,playerId:aid},404);await post('/api/friend/accept',{...b,playerId:aid});
  as=await post('/api/friends',a);assert.equal(as.friends[0].online,true);assert.equal(as.friends[0].name,'Bob');assert.equal((await post('/api/friends',c)).friends.length,0);
  assert.doesNotMatch(JSON.stringify(as),/guest:|authToken|email|expires|lastSeen/);
  await post('/api/friends/presence',{...b,sessionId:'bob-session',online:false});assert.equal((await post('/api/friends',a)).friends[0].online,false);
  assert.deepEqual(await Promise.all(users.map(async u=>(await post('/api/wallet',u)).gold)),[500,500,500]);
  const room=await post('/api/create',a);assert.equal(room.room.players[0].playerId,aid);const joined=await post('/api/join',{...b,code:room.room.code});assert.equal(joined.room.players[0].playerId,aid);assert.equal(joined.room.players[1].playerId,bid);
  const spectate=await post('/api/spectate',{...c,code:room.room.code});assert.ok(spectate.room.players.every(p=>p.playerId===null));
  const bot=await post('/api/bot',c);assert.equal(bot.room.players[1].playerId,null);
  await post('/api/friend/remove',{...a,playerId:bid});assert.equal((await post('/api/friends',b)).friends.length,0);
  await post('/api/friend/add',{...a,playerId:cid});await post('/api/friend/remove',{...a,playerId:cid});assert.equal((await post('/api/friends',c)).incoming.length,0);
  await post('/api/friend/add',{...a,playerId:cid});await post('/api/friend/decline',{...c,playerId:aid});assert.equal((await post('/api/friends',a)).outgoing.length,0);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
