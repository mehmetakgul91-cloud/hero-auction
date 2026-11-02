import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('real HTTP idle lifecycle: authenticated recovery, polls do not reset action clock, preauction no fee, both absent no winner',{timeout:20000},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['--import','./tests/fixtures/room-idle-clock.mjs','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1',HERO_VICTORY_CHESTS_ENABLED:'0',HERO_DIAMONDS_ENABLED:'0',HERO_LOGIN_REWARDS_ENABLED:'0'},stdio:['ignore','pipe','pipe','ipc']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);const base='http://127.0.0.1:'+port;
 const post=async(path,body)=>{const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();assert.equal(res.status,200,JSON.stringify(data)+' '+logs);return data;};
 const tick=async at=>{await new Promise(resolve=>{child.once('message',resolve);child.send({kind:'clock',at});});await delay(600);};
 try{
  for(let i=0;i<120;i++){try{if((await fetch(base+'/api/info')).ok)break;}catch{}if(child.exitCode!==null)throw Error(logs);await delay(25);}
  const now=Date.now();await tick(now);
  const a=await post('/api/auth/guest',{name:'Idle A'}),b=await post('/api/auth/guest',{name:'Idle B'});
  const waiting=await post('/api/create',{authToken:a.authToken}),auth={authToken:a.authToken,code:waiting.room.code,token:waiting.token};
  const before=(await post('/api/wallet',{authToken:a.authToken})).gold;
  await tick(now+119999);assert.equal((await post('/api/state',auth)).room.phase,'waiting');
  await tick(now+120000);const closed=(await post('/api/state',auth)).room;assert.ok(closed.idleClosed);assert.equal(closed.idleClosed.refundGold,0);assert.equal((await post('/api/wallet',{authToken:a.authToken})).gold,before);
  const recovered=await post('/api/room/current',{authToken:a.authToken});assert.equal(recovered.room.code,auth.code);assert.equal(recovered.resumeStage,'result');
  assert.equal((await post('/api/room/current',{authToken:b.authToken})).room,null);
  const next=await post('/api/create',{authToken:a.authToken});const join=await post('/api/join',{authToken:b.authToken,code:next.room.code});
  const aa={authToken:a.authToken,code:next.room.code,token:next.token},bb={authToken:b.authToken,code:next.room.code,token:join.token};
  const paid=(await post('/api/wallet',{authToken:a.authToken})).gold;
  await post('/api/room/detach',aa);await post('/api/room/detach',bb);
  await tick(now+239999);assert.equal((await post('/api/room/current',{authToken:a.authToken})).room,null,'explicit detach is not automatic resume');
  await tick(now+240000);const ended=(await post('/api/state',aa)).room;assert.ok(ended.idleClosed);assert.equal(ended.forfeit,null);assert.equal(ended.idleClosed.refundGold,0);assert.equal((await post('/api/wallet',{authToken:a.authToken})).gold,paid,'postauction timeout cannot refund');

  const last=await post('/api/create',{authToken:a.authToken}),lastJoin=await post('/api/join',{authToken:b.authToken,code:last.room.code});
  const la={authToken:a.authToken,code:last.room.code,token:last.token},lb={authToken:b.authToken,code:last.room.code,token:lastJoin.token};
  const stream=await fetch(base+'/api/events?'+new URLSearchParams(la)),reader=stream.body.getReader();await reader.read();
  await post('/api/room/detach',lb);
  await tick(now+359999);const grace=(await post('/api/state',la)).room;assert.equal(grace.forfeit,null);assert.equal(grace.presence.candidate,0);assert.equal(grace.presence.remainingMs,1);
  await tick(now+360000);const won=(await post('/api/state',la)).room;assert.equal(won.forfeit.winner,0);assert.equal(won.series[0],1);assert.equal(won.idleClosed,null);assert.equal(won.phase,'finished');
  const replay=(await post('/api/state',la)).room;assert.equal(replay.series[0],1,'repeated reads do not settle twice');const forbidden=await fetch(base+'/api/battle-auction-preview?'+new URLSearchParams(la));assert.equal(forbidden.status,409,'forfeit cannot subsequently start an arena');await reader.cancel();
 }finally{child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(r,2000).unref();});}
});
