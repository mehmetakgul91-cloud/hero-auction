import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createCommanderProfile} from '../arena-commanders.js';

// Real HTTP routes, real auction and live combat. No initial commander profile.
test('post-formation commander choice is authenticated, match-bound, free, immutable and idempotent',{timeout:30000},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const request=async(path,body,method='POST')=>{const response=await fetch(base+path+(method==='GET'?'?'+new URLSearchParams(body):''),method==='GET'?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const ok=async(path,body,method)=>{const result=await request(path,body,method);assert.equal(result.status,200,JSON.stringify(result));return result.body;};
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,40));}assert.ok(ready,logs);
  assert.equal((await ok('/api/info',{},'GET')).matchCommanderSelection,1,'public capability allows onboarding without an upfront profile');
  const players=[];for(let i=0;i<2;i++){const auth=await ok('/api/auth/guest',{name:'Commander Choice '+i});players.push({authToken:auth.authToken});const commander=await ok('/api/commander/get',players[i]);assert.equal(commander.profile,null);assert.equal(commander.changeCost,0,'free menu change is an explicit server capability');}
  const created=await ok('/api/create',players[0]),code=created.room.code;players[0].token=created.token;players[1].token=(await ok('/api/join',{code,...players[1]})).token;
  const choose=(seat,extra={})=>request('/api/battle-auction-commander',{code,...players[seat],commanderId:'magic',...extra});
  assert.equal((await choose(0,{matchKey:'early'})).status,409);
  let room=(await ok('/api/state',{code,...players[0]})).room;
  for(let i=0;room.phase==='auction'&&i<40;i++)room=(await ok('/api/pass',{code,...players[room.turn]})).room;
  assert.equal(room.phase,'finished');
  const views=await Promise.all(players.map(p=>ok('/api/battle-auction-team',{code,...p},'GET'))),matchKey=views[0].preparation.matchKey;
  for(const view of views)assert.deepEqual(view.commanderSelection,{ready:[false,false],profile:null},'team recovery advertises the commander gate before any selection');
  const choices=seat=>ok('/api/battle-auction-commanders',{code,...players[seat],matchKey},'GET');
  assert.equal((await choose(0,{matchKey})).status,409);
  assert.equal((await request('/api/battle-auction-commanders',{code,...players[0],matchKey},'GET')).status,409);
  const balances=await Promise.all(players.map(p=>ok('/api/wallet',p)));
  for(let seat=0;seat<2;seat++){
   const formation=await ok('/api/battle-auction-preview',{code,...players[seat],...views[seat].preparation});
   assert.equal(formation.started,false);assert.deepEqual(formation.commanderSelection.ready,[false,false]);
  }
  const preview=await choices(0);assert.equal(preview.selection,null);assert.equal(preview.options.length,4);
  for(const option of preview.options){assert.deepEqual(option.profile.levels,createCommanderProfile(option.commanderId).levels);assert.equal(option.heroes.length,5);for(const stat of ['attack','defense','maxHp','speed'])assert.equal(option.totals[stat],option.heroes.reduce((sum,h)=>sum+h[stat],0));}
  for(const extra of [{token:'invalid'},{authToken:'invalid'},{authToken:players[1].authToken}])assert.equal((await choose(0,{matchKey,...extra})).status,403);
  assert.equal((await choose(0,{matchKey,commanderId:'unknown'})).status,400);
  for(const key of [undefined,'previous-match'])assert.equal((await choose(0,{matchKey:key})).status,409);
  const duplicates=await Promise.all([choose(0,{matchKey}),choose(0,{matchKey})]);
  for(const selected of duplicates){assert.equal(selected.status,200);assert.equal(selected.body.started,false);assert.deepEqual(selected.body.commanderSelection.ready,[true,false]);assert.deepEqual(selected.body.commanderSelection.profile,createCommanderProfile('magic'));}
  assert.deepEqual(duplicates[0].body,duplicates[1].body);
  assert.equal((await choose(0,{matchKey,commanderId:'attack'})).status,409);
  // A read/reconnect and a menu preference change cannot replace the match lock.
  await ok('/api/commander/change',{...players[0],commanderId:'attack'});
  const reconnected=await choices(0);assert.deepEqual(reconnected.selection,createCommanderProfile('magic'));
  const resumedTeam=await ok('/api/battle-auction-team',{code,...players[0]},'GET');
  assert.deepEqual(resumedTeam.commanderSelection,{ready:[true,false],profile:createCommanderProfile('magic')},'team recovery retains the own match choice');
  const opponentTeam=await ok('/api/battle-auction-team',{code,...players[1]},'GET');
  assert.deepEqual(opponentTeam.commanderSelection,{ready:[true,false],profile:null},'team recovery does not disclose opponent profile');
  const selected=await Promise.all([choose(1,{matchKey,commanderId:'attack'}),choose(1,{matchKey,commanderId:'attack'})]);
  for(const response of selected){assert.equal(response.status,200);assert.equal(response.body.started,true);assert.equal(response.body.result.live,true);assert.deepEqual(response.body.result.commanders.map(p=>p.commanderId),['attack','magic']);}
  assert.deepEqual(selected[0].body,selected[1].body,'duplicate choice returns the one existing combat');
  const live=await ok('/api/experimental/commander-live',{code,...players[0]},'GET');
  assert.equal(live.commanderId,'magic');
  for(let seat=0;seat<2;seat++)assert.equal((await ok('/api/wallet',players[seat])).gold,balances[seat].gold,'choice and preference switch never debit gold');
  const mine=await ok('/api/battle-auction-preview',{code,...players[0]},'GET');
  const expected=preview.options.find(option=>option.commanderId==='magic');
  for(let i=0;i<5;i++)for(const stat of ['attack','defense','maxHp','speed'])assert.equal(mine.result.teams[0][i][stat],expected.heroes[i][stat],`preview exactly matches combat hero ${i} ${stat}`);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref();});}
});
