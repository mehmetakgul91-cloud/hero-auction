import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('30-second transport absence recovers the same paid seat; 100-second absence recovers the terminal result',{timeout:20000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['--import','./tests/fixtures/room-idle-clock.mjs','server.js'],{
  cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1',HERO_VICTORY_CHESTS_ENABLED:'0',HERO_DIAMONDS_ENABLED:'0',HERO_LOGIN_REWARDS_ENABLED:'0'},stdio:['ignore','pipe','pipe','ipc']
 });
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const base='http://127.0.0.1:'+port,readers=new Set();
 const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json();assert.equal(response.status,200,JSON.stringify(result)+' '+logs);return result;};
 const tick=async at=>{await new Promise(resolve=>{child.once('message',resolve);child.send({kind:'clock',at});});await delay(600);};
 const connect=async auth=>{const response=await fetch(base+'/api/events?'+new URLSearchParams(auth));assert.equal(response.status,200);const reader=response.body.getReader();readers.add(reader);await reader.read();return reader;};
 const disconnect=async reader=>{await reader.cancel();readers.delete(reader);await delay(50);};
 try{
  for(let i=0;i<120;i++){try{if((await fetch(base+'/api/info')).ok)break;}catch{}if(child.exitCode!==null)throw Error(logs);await delay(25);}
  const now=Date.now();await tick(now);
  const people=[];for(const name of ['Short return A','Short return B'])people.push(await post('/api/auth/guest',{name}));
  const auth=seat=>({authToken:people[seat].authToken});
  const first=await post('/api/create',auth(0)),second=await post('/api/join',{...auth(1),code:first.room.code});
  const seats=[first,second].map((entry,seat)=>({...auth(seat),code:first.room.code,token:entry.token}));
  const paid=await Promise.all([0,1].map(async seat=>(await post('/api/wallet',auth(seat))).gold));
  const absent=await connect(seats[0]),survivor=await connect(seats[1]);await disconnect(absent);
  await tick(now+30_000);
  const returning=await post('/api/room/current',{...auth(0),automaticReturn:true});
  assert.equal(returning.room.presence.serverNow,now+30_000,'the real server clock advanced exactly 30 seconds');
  assert.equal(returning.room.code,first.room.code);assert.equal(returning.token,first.token);assert.equal(returning.room.matchKey,second.room.matchKey);
  assert.equal(returning.resumeStage,'auction');assert.equal(returning.room.idleClosed,null);assert.equal(returning.room.forfeit,null);
  assert.equal(returning.room.presence.remainingMs,70_000,'the short return is inside the existing 100-second grace');
  const reconnected=await connect(seats[0]);
  assert.equal((await post('/api/room/current',auth(0))).room.presence.candidate,null,'reconnection cancels the pending forfeit');
  for(let i=0;i<3;i++){const recovered=await post('/api/room/current',auth(0));assert.equal(recovered.token,first.token);assert.equal(recovered.room.matchKey,returning.room.matchKey);}
  assert.deepEqual(await Promise.all([0,1].map(async seat=>(await post('/api/wallet',auth(seat))).gold)),paid,'return and repeated recovery cannot charge a second entry');
  await disconnect(reconnected);await disconnect(survivor);
  await tick(now+130_000);
  for(const at of [now+130_000,now+3_630_000]){
   await tick(at);
   for(const [route,body] of [['/api/room/current',auth(0)],['/api/state',seats[0]]]){
    assert.deepEqual(await post(route,{...body,automaticReturn:true}),{room:null,returnExpired:true});
   }
  }
  const terminal=await post('/api/room/current',auth(0));
  assert.equal(terminal.room.code,first.room.code);assert.equal(terminal.token,first.token);assert.equal(terminal.resumeStage,'result');assert.ok(terminal.room.idleClosed);assert.equal(terminal.room.forfeit,null);
  assert.deepEqual(await Promise.all([0,1].map(async seat=>(await post('/api/wallet',auth(seat))).gold)),paid,'closed auction recovery neither debits nor refunds');
  // A legacy tab can keep its SSE open and poll /state after the phone is locked.
  // Neither the open transport nor those background reads prove a new visit.
  const another=await post('/api/create',auth(0));
  const visible={...auth(0),code:another.room.code,token:another.token};
  await connect(visible);
  await post('/api/state',{...visible,foreground:true});
  const since=now+3_630_000;
  await tick(since+99_999);
  assert.equal((await post('/api/room/current',{...auth(0),automaticReturn:true})).token,another.token);
  await tick(since+100_000);
  await post('/api/state',visible);
  assert.equal((await post('/api/room/current',{...auth(0),automaticReturn:true})).returnExpired,true);
 }finally{
  for(const reader of readers)await reader.cancel().catch(()=>{});
  child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});
 }
});
