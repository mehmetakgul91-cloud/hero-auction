import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

test('room invitations wait for authoritative live battle then join once, never on merely opening',{timeout:30000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['--import','./tests/fixtures/fast-live-clock.mjs','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 const post=async(path,body={},status=200)=>{const response=await fetch('http://127.0.0.1:'+port+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data};
 try{
  let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch('http://127.0.0.1:'+port+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,30))}assert.ok(ready,logs);
  const users=[];for(const name of ['Host','Guest','Opponent','Stranger']){const auth=await post('/api/auth/guest',{name});const user={authToken:auth.authToken};await post('/api/commander/select',{...user,commanderId:'attack'});users.push(user)}
  const [host,guest,opponent,stranger]=users;
  const [hid,gid]=await Promise.all([host,guest].map(async u=>(await post('/api/friends',u)).playerId));
  await post('/api/friend/add',{...host,playerId:gid});await post('/api/friend/accept',{...guest,playerId:hid});
  const target=await post('/api/create',host);const send={...host,code:target.room.code,token:target.token,playerId:gid};
  await post('/api/friend/invite',{},401);await post('/api/friend/invite',{...stranger,code:target.room.code,token:target.token,playerId:gid},403);
  const sent=await post('/api/friend/invite',send);const id=sent.outgoing[0].id;
  assert.equal((await post('/api/friend/invite',send)).outgoing.length,1);
  assert.equal((await post('/api/friend/invitations',guest)).incoming[0].status,'pending');
  const gold=async u=>(await post('/api/wallet',u)).gold;
  assert.deepEqual(await Promise.all([host,guest].map(gold)),[500,500]);
  await post('/api/friend/invite/respond',{...stranger,inviteId:id,response:'accept',consent:true,expectedCost:50},404);
  await post('/api/friend/invite/respond',{...guest,inviteId:id,response:'accept'},400);
  const source=await post('/api/create',opponent);const sourceJoin=await post('/api/join',{...guest,code:source.room.code});
  const players=[{...opponent,token:source.token},{...guest,token:sourceJoin.token}];
  const accept={...guest,inviteId:id,response:'accept',consent:true,expectedCost:50,sourceCode:source.room.code,sourceToken:sourceJoin.token};
  await post('/api/friend/invite/respond',{...accept,sourceToken:'forged'},403);
  for(const result of await Promise.all([post('/api/friend/invite/respond',accept),post('/api/friend/invite/respond',accept)]))assert.equal(result.incoming[0].status,'queued');
  assert.deepEqual(await Promise.all([host,guest].map(gold)),[500,450]);
  await post('/api/bot',guest,409);await post('/api/create',guest,409);
  let room=sourceJoin.room;
  for(let n=0;room.phase==='auction'&&n<40;n++)room=(await post('/api/pass',{code:source.room.code,...players[room.turn]})).room;
  assert.equal(room.phase,'finished');
  assert.equal((await post('/api/friend/invitations',guest)).incoming[0].status,'queued','finished auction is not a settled battle');
  const get=async(path,params)=>{const r=await fetch('http://127.0.0.1:'+port+path+'?'+new URLSearchParams(params));assert.equal(r.status,200);return r.json()};
  const {teams}=await get('/api/battle-auction-team',{code:source.room.code,token:source.token});
  for(let i=0;i<2;i++)await post('/api/battle-auction-preview',{code:source.room.code,token:players[i].token,positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roles:teams[i].map(h=>h.role)});
  assert.equal((await post('/api/friend/invitations',guest)).incoming[0].status,'queued');
  let live;for(let i=0;i<250;i++){live=await get('/api/experimental/commander-live',{code:source.room.code,token:source.token});if(live.finished)break;await new Promise(r=>setTimeout(r,40))}assert.equal(live.finished,true);
  const beforeJoin=await Promise.all([host,guest].map(gold));
  const results=await Promise.all(Array.from({length:5},()=>post('/api/friend/invitations',guest)));
  assert.ok(results.every(r=>r.incoming[0].status==='joined'));assert.equal(new Set(results.map(r=>r.incoming[0].token)).size,1);
  assert.deepEqual(await Promise.all([host,guest].map(gold)),beforeJoin.map(g=>g-50));
  const joined=results[0].incoming[0];assert.equal(joined.room.code,target.room.code);assert.equal(joined.room.me,1);
  const hostResult=(await post('/api/friend/invitations',host)).outgoing[0];assert.equal(hostResult.status,'joined');assert.ok(!('token' in hostResult));assert.ok(!('room' in hostResult));
  await post('/api/friend/invite/ack',{...host,inviteId:id},404);await post('/api/friend/invite/ack',{...guest,inviteId:id});assert.ok(!('token' in (await post('/api/friend/invitations',guest)).incoming[0]));
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
