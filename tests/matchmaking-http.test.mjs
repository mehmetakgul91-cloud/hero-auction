import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

test('find opponent creates and joins an auction without rarity quotas',{timeout:15000},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;
 const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,30))}assert.ok(ready);
  const players=[];for(let i=0;i<2;i++){const auth=await post('/api/auth/guest',{name:'Local match test '+i});players.push({authToken:auth.authToken});await post('/api/commander/select',{...players[i],commanderId:'attack'})}
  const first=await post('/api/match',players[0]);assert.equal(first.room.phase,'matching');players[0].token=first.token;
  const second=await post('/api/match',players[1]);assert.equal(second.room.code,first.room.code);assert.equal(second.room.phase,'auction');players[1].token=second.token;
  let room=second.room;
  for(let n=0;room.phase==='auction'&&n<40;n++)room=(await post('/api/pass',{code:room.code,...players[room.turn]})).room;
  assert.equal(room.phase,'finished');assert.deepEqual(room.final.map(p=>p.team.length),[5,5]);
  const names=room.final.flatMap(p=>p.team.map(c=>c.name));assert.equal(new Set(names).size,10);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
