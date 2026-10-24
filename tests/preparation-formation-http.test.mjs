import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {buildDefaultFormation} from '../public/preparation-formation.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('online and rematch preparation auto-places once, persists lane edits, rejects stale/invalid drafts and waits for Ready',{timeout:30000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--import','./tests/fixtures/fast-live-clock.mjs','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const request=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()}};
 const post=async(path,body)=>{const result=await request(path,body);assert.equal(result.status,200,JSON.stringify(result));return result.body};
 const get=async(path,params)=>{const response=await fetch(base+path+'?'+new URLSearchParams(params));assert.equal(response.status,200);return response.json()};
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await delay(40)}assert.ok(ready,logs);
  const players=[];for(let i=0;i<2;i++){const auth=await post('/api/auth/guest',{name:'Automatic Formation '+i});players.push({authToken:auth.authToken})}
  const created=await post('/api/create',players[0]),code=created.room.code;players[0].token=created.token;
  const joined=await post('/api/join',{code,...players[1]});players[1].token=joined.token;
  assert.equal((await request('/api/battle-auction-formation',{code,token:players[0].token})).status,409,'auction is not yet complete');
  let previousKey;
  for(let match=0;match<2;match++){
   let room=(await post('/api/state',{code,...players[0]})).room;
   for(let i=0;room.phase==='auction'&&i<40;i++)room=(await post('/api/pass',{code,...players[room.turn]})).room;
   assert.equal(room.phase,'finished');
   const views=await Promise.all(players.map(player=>get('/api/battle-auction-team',{code,token:player.token})));
   const first=views[0].preparation,key=first.matchKey;
   assert.notEqual(key,previousKey);assert.equal(first.ready,false);
   for(const [seat,view] of views.entries())assert.deepEqual(view.preparation,{matchKey:key,...buildDefaultFormation(view.teams[seat]),ready:false});
   assert.deepEqual((await get('/api/battle-auction-preview',{code,token:players[0].token})).ready,[false,false]);
   const payload={code,token:players[0].token,...first,lanes:Array(5).fill('back')};
   assert.equal((await request('/api/battle-auction-formation',{...payload,token:'invalid'})).status,403);
   for(const extra of [{positions:[0,0,2,3,4]},{positions:[0,1,2,3,5]},{lanes:['front','front','back','back','middle']},{roles:Array(5).fill('invalid')}])assert.equal((await request('/api/battle-auction-formation',{...payload,...extra})).status,400);
   assert.equal((await request('/api/battle-auction-formation',{...payload,matchKey:previousKey||'wrong'})).status,409);
   assert.equal((await request('/api/battle-auction-preview',{...payload,matchKey:previousKey||'wrong'})).status,409);
   let saved=await post('/api/battle-auction-formation',payload);
   assert.equal(saved.preparation.ready,false);assert.deepEqual(saved.preparation.lanes,payload.lanes);
   for(let i=0;i<3;i++)assert.deepEqual((await get('/api/battle-auction-team',{code,token:players[0].token})).preparation,saved.preparation,'refresh/poll must preserve edits');
   assert.deepEqual((await get('/api/battle-auction-team',{code,token:players[1].token})).preparation,views[1].preparation,'opponent receives only own draft');
   payload.lanes=Array(5).fill('front');saved=await post('/api/battle-auction-formation',payload);
   const waiting=await post('/api/battle-auction-preview',payload);assert.deepEqual(waiting.ready,[true,false]);assert.equal(waiting.started,false);
   assert.equal((await request('/api/battle-auction-formation',{...payload,lanes:Array(5).fill('back')})).status,409,'Ready locks draft');
   const confirmed=await get('/api/battle-auction-team',{code,token:players[0].token});assert.equal(confirmed.preparation.ready,true);assert.deepEqual(confirmed.preparation.lanes,payload.lanes);
   const again=await post('/api/battle-auction-preview',{...payload,lanes:Array(5).fill('back')});assert.equal(again.started,false);
   const started=await post('/api/battle-auction-preview',{code,token:players[1].token,...views[1].preparation});assert.equal(started.started,true);
   assert.deepEqual(started.result.teams[1].map(hero=>hero.lane),payload.lanes,'seat1-oriented result retains seat0 confirmed lanes');
   assert.deepEqual(started.result.teams[1].map(hero=>hero.id),views[0].teams[0].map(hero=>hero.id),'lane-only edits retain deterministic acquisition/combat order');
   for(const player of players)await post('/api/battle-auction-complete',{code,token:player.token});
   if(match===0){await post('/api/rematch',{code,...players[0]});await post('/api/rematch',{code,...players[1]});}
   previousKey=key;
  }
  // Bot defaults are also just a preparation draft, never an implicit human Ready.
  const botAuth=await post('/api/auth/guest',{name:'Automatic Bot Formation'}),bot=await post('/api/bot',{authToken:botAuth.authToken,difficulty:'easy'});
  let room=bot.room;
  for(let i=0;room.phase==='auction'&&i<300;i++){
   if(room.turn===0)room=(await post('/api/pass',{code:room.code,token:bot.token,authToken:botAuth.authToken})).room;
   else{await delay(100);room=(await post('/api/state',{code:room.code,token:bot.token,authToken:botAuth.authToken})).room;}
  }
  assert.equal(room.phase,'finished');
  const view=await get('/api/battle-auction-team',{code:room.code,token:bot.token,authToken:botAuth.authToken});assert.equal(view.preparation.ready,false);
  const botDraft={code:room.code,token:bot.token,...view.preparation,lanes:Array(5).fill('back')};
  await post('/api/battle-auction-formation',botDraft);
  const waiting=await get('/api/battle-auction-preview',{code:room.code,token:bot.token,authToken:botAuth.authToken});assert.deepEqual(waiting.ready,[false,true]);assert.equal(waiting.started,false);
  const started=await post('/api/battle-auction-preview',botDraft);assert.equal(started.started,true);assert.equal(started.result.live,true);
  assert.deepEqual(started.result.teams[0].map(hero=>hero.lane),botDraft.lanes);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
