import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createWebInvite} from '../public/web-invite.js';

test('normal web invite over isolated HTTP: consent, single debit, full/missing room errors',{timeout:15000},async()=>{
 const socket=createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve)});
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
 const base='http://127.0.0.1:'+port;
 const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error);return data;};
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('Local server exited: '+logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,30))}assert.ok(ready,logs);
  const players=[];
  for(let i=0;i<3;i++){const auth=await post('/api/auth/guest',{name:'Isolated invite '+i});const player={authToken:auth.authToken};await post('/api/commander/select',{...player,commanderId:'attack'});players.push(player)}
  const gold=async player=>(await post('/api/wallet',player)).gold;
  const before=await Promise.all(players.map(gold));
  const created=await post('/api/create',players[0]);
  const makeInvite=(code,player)=>{
   let state,requests=0,cleared=0,saved=null;
   const invite=createWebInvite({url:base+'/?join='+code,view:value=>state=value,identity:()=>({ready:true,authToken:player.authToken}),validate:async()=>{await post('/api/auth/check',player);return true},savedRoom:async()=>null,join:async target=>{requests++;return post('/api/join',{...player,code:target})},save:(token,room)=>saved={token,room},clearUrl:()=>cleared++,restore:()=>{}});
   return {invite,get state(){return state},get requests(){return requests},get cleared(){return cleared},get saved(){return saved}};
  };
  const guest=makeInvite(created.room.code,players[1]);
  guest.invite.sync();guest.invite.sync();
  assert.equal(guest.requests,0,'loading or refreshing invite view never joins');
  assert.deepEqual(await Promise.all(players.map(gold)),before,'opening invitation does not debit either account');
  assert.equal((await post('/api/state',{...players[0],code:created.room.code,token:created.token})).room.phase,'waiting');
  await Promise.all([guest.invite.accept(),guest.invite.accept(),guest.invite.accept()]);
  assert.equal(guest.requests,1,'rapid repeated taps emit one paid request');
  assert.equal(guest.cleared,1);assert.equal(guest.invite.pending,false);
  assert.equal(guest.saved.room.code,created.room.code);assert.equal(guest.saved.room.phase,'auction');
  assert.deepEqual(await Promise.all(players.map(gold)),[before[0]-50,before[1]-50,before[2]],'each participant debited exactly once');
  await guest.invite.accept();assert.equal(guest.requests,1,'success cannot be accepted again');
  const full=makeInvite(created.room.code,players[2]);await full.invite.accept();
  assert.match(full.state.error,/Oda dolu/);assert.equal(full.invite.pending,true);assert.equal(full.cleared,0);assert.equal(full.saved,null);
  let absent='000';if(absent===created.room.code)absent='001';
  const missing=makeInvite(absent,players[2]);await missing.invite.accept();
  assert.match(missing.state.error,/Oda bulunamadı/);assert.equal(missing.invite.pending,true);assert.equal(missing.cleared,0);assert.equal(missing.saved,null);
  assert.deepEqual(await Promise.all(players.map(gold)),[before[0]-50,before[1]-50,before[2]],'failed joins never debit');
 }finally{
  child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()});
 }
});
