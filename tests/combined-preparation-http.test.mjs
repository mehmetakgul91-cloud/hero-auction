import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

test('combined Ready compares exact unsaved draft, atomically confirms, and preserves legacy clients',{timeout:30000},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base=`http://127.0.0.1:${port}`,child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const request=async(path,body,method='POST')=>{const r=await fetch(base+path+(method==='GET'?'?'+new URLSearchParams(body):''),method==='GET'?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const ok=async(...args)=>{const r=await request(...args);assert.equal(r.status,200,JSON.stringify(r));return r.body;};
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,40));}assert.ok(ready,logs);
  const players=[];for(let i=0;i<2;i++)players.push({authToken:(await ok('/api/auth/guest',{name:'Combined '+i})).authToken});
  const made=await ok('/api/create',players[0]),code=made.room.code;players[0].token=made.token;players[1].token=(await ok('/api/join',{code,...players[1]})).token;
  let room=(await ok('/api/state',{code,...players[0]})).room;
  for(let i=0;room.phase==='auction'&&i<40;i++)room=(await ok('/api/pass',{code,...players[room.turn]})).room;
  assert.equal(room.phase,'finished');
  const team=seat=>ok('/api/battle-auction-team',{code,...players[seat]},'GET');
  const views=await Promise.all([team(0),team(1)]),matchKey=views[0].preparation.matchKey;
  const formation={...views[0].preparation,lanes:Array(5).fill('back')};
  const payload={code,...players[0],matchKey,formation};
  const preview=await ok('/api/battle-auction-commanders',payload);
  assert.equal(preview.preparation.ready,false);assert.deepEqual(preview.preparation.lanes,formation.lanes);
  assert.deepEqual((await team(0)).preparation,views[0].preparation,'preview does not save or lock draft');
  assert.equal((await ok('/api/commander/get',players[0])).profile,null,'preview never creates a default commander');
  for(const option of preview.options)assert.deepEqual(option.heroes.map(h=>h.lane),formation.lanes);
  const confirm={...payload,commanderId:'magic',levels:{magic:40,attack:40}};
  for(const extra of [{commanderId:'bad'},{formation:{...formation,roles:Array(5).fill('wrong')}},{formation:{...formation,positions:[0,0,2,3,4]}},{formation:null}])assert.equal((await request('/api/battle-auction-commander',{...confirm,...extra})).status,400);
  assert.equal((await request('/api/battle-auction-commander',{...confirm,matchKey:'stale'})).status,409);
  assert.equal((await request('/api/battle-auction-commander',{...confirm,authToken:players[1].authToken})).status,403);
  assert.equal((await request('/api/battle-auction-commander',payload)).status,400,'commander cannot be skipped');
  assert.equal((await team(0)).preparation.ready,false,'every rejected combined request leaves formation editable');
  const results=await Promise.all([ok('/api/battle-auction-commander',confirm),ok('/api/battle-auction-commander',confirm)]);
  assert.deepEqual(results[0],results[1]);assert.equal(results[0].preparation.ready,true);assert.deepEqual(results[0].ready,[true,false]);assert.deepEqual(results[0].commanderSelection.ready,[true,false]);assert.equal(results[0].started,false);
  assert.equal(results[0].commanderSelection.profile.levels.magic,0,'client levels ignored');
  const changed={...formation,lanes:Array(5).fill('front')};
  assert.equal((await request('/api/battle-auction-commander',{...confirm,formation:changed})).status,409);
  assert.equal((await request('/api/battle-auction-formation',{...payload,...changed})).status,409);
  const resumed=await ok('/api/battle-auction-commanders',{...payload,formation:changed});
  assert.equal(resumed.preparation.ready,true);assert.deepEqual(resumed.preparation.lanes,formation.lanes,'recovery preview uses authoritative locked formation');
  // An old two-step opponent remains compatible with the new atomic client.
  await ok('/api/battle-auction-preview',{code,...players[1],...views[1].preparation});
  const started=await ok('/api/battle-auction-commander',{code,...players[1],matchKey,commanderId:'attack'});
  assert.equal(started.started,true);assert.equal(Object.hasOwn(started,'preparation'),false,'legacy confirmation response shape stays unchanged');
  const mine=await ok('/api/battle-auction-commander',confirm);
  assert.equal(mine.started,true);
  const expected=preview.options.find(o=>o.commanderId==='magic');
  for(let i=0;i<5;i++)for(const stat of ['attack','defense','maxHp','speed','lane'])assert.equal(mine.result.teams[0][i][stat],expected.heroes[i][stat]);
 }finally{child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(r,2000).unref();});}
});
