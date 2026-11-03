import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('authenticated account recovery returns same seat/state without entry debit; other account cannot take over',{timeout:15000},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const call=async(path,body={})=>{const r=await fetch(`http://127.0.0.1:${port}`+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,...await r.json()}};
 const post=async(path,body)=>{const r=await call(path,body);assert.equal(r.status,200,JSON.stringify(r));return r};
 try{
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(`http://127.0.0.1:${port}/api/info`)).ok)break}catch{}await delay(40)}
  const people=[];for(const name of ['Recovery A','Recovery B','Unrelated C'])people.push(await post('/api/auth/guest',{name}));const auth=i=>({authToken:people[i].authToken});
  assert.equal((await call('/api/room/current')).status,401);
  const first=await post('/api/create',auth(0));assert.equal((await post('/api/room/current',auth(0))).resumeStage,'waiting');
  const second=await post('/api/join',{...auth(1),code:first.room.code});const before=(await post('/api/wallet',auth(0))).gold;
  for(let i=0;i<4;i++){const got=await post('/api/room/current',auth(0));assert.equal(got.token,first.token);assert.equal(got.room.code,first.room.code);assert.equal(got.resumeStage,'auction');assert.equal(got.room.round,second.room.round);}
  assert.equal((await post('/api/wallet',auth(0))).gold,before);
  const unrelated=await post('/api/room/current',{...auth(2),code:first.room.code,token:first.token,accountId:people[0].user.sub});assert.equal(unrelated.room,null);assert.equal(unrelated.token,undefined);
  const opponent=await post('/api/room/current',auth(1));assert.equal(opponent.token,second.token);assert.notEqual(opponent.token,first.token);
  assert.equal((await call('/api/state',{...auth(2),code:first.room.code,token:first.token})).status,403);
  let snapshot=opponent.room;for(let i=0;snapshot.phase==='auction'&&i<40;i++){const seat=snapshot.turn;snapshot=(await post('/api/pass',{...auth(seat),code:first.room.code,token:seat===0?first.token:second.token})).room;}
  assert.equal((await post('/api/room/current',auth(0))).resumeStage,'formation');
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve)});}
});
