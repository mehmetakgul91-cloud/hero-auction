import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
test('HTTP identity comes from authenticated accounts, updates waiting rooms, and survives reconnect',{timeout:15000},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;
 const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,30))}assert.ok(ready);
  const a=await post('/api/auth/guest',{name:'Identity host'}),b=await post('/api/auth/guest',{name:'Identity guest'});
  const first=await post('/api/create',{authToken:a.authToken,commander:{commanderId:'magic',levels:{magic:40}}});assert.equal(first.room.players[0].commander,null);
  await post('/api/commander/select',{authToken:a.authToken,commanderId:'attack'});
  const state=await post('/api/state',{authToken:a.authToken,code:first.room.code,token:first.token});assert.deepEqual(state.room.players[0].commander,{commanderId:'attack'});
  await post('/api/commander/select',{authToken:b.authToken,commanderId:'support'});
  const joined=await post('/api/join',{authToken:b.authToken,code:first.room.code,commanderId:'defense',commander:{commanderId:'magic',levels:{magic:40}}});
  assert.deepEqual(joined.room.players.map(p=>p.commander),[{commanderId:'attack'},{commanderId:'support'}]);assert.doesNotMatch(JSON.stringify(joined.room),/levels|progression/);
  const reconnected=await post('/api/state',{authToken:b.authToken,code:first.room.code,token:joined.token});assert.deepEqual(reconnected.room.players.map(p=>p.commander),joined.room.players.map(p=>p.commander));
  const c=await post('/api/auth/guest',{name:'Identity bot human'});await post('/api/commander/select',{authToken:c.authToken,commanderId:'defense'});
  const bot=await post('/api/bot',{authToken:c.authToken,difficulty:'hard',commander:{commanderId:'magic'},botCommander:{commanderId:'invalid'}});assert.deepEqual(bot.room.players[0].commander,{commanderId:'defense'});assert.ok(['attack','defense','magic','support'].includes(bot.room.players[1].commander.commanderId));assert.deepEqual(Object.keys(bot.room.players[1].commander),['commanderId']);assert.doesNotMatch(JSON.stringify(bot.room),/levels|progression/);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
