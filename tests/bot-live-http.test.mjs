import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {battleOutcome} from '../battle-result.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('bot matches run authoritative live combat, accept human casts, settle without gold, and rotate on rematch',{timeout:60000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const base='http://127.0.0.1:'+port;
 // Test-only deterministic deck, commander choices and bidding. Keep cryptographic
 // tokens/auth untouched; room IDs advance so fresh-room checks remain realistic.
 // Preserve bot/hero timer ratios under the existing 30x test clock.
 const botClock='data:text/javascript,'+encodeURIComponent(`
  import crypto from 'node:crypto';
  let roomCode=100;
  crypto.randomInt=(min,max)=>max===undefined?0:(min===100&&max===1000?roomCode++:min);
  Math.random=()=>0;
  const interval=globalThis.setInterval;
  globalThis.setInterval=(fn,ms,...args)=>interval(fn,ms===500?17:ms,...args);
 `);
 const child=spawn(process.execPath,['--import','./tests/fixtures/fast-live-clock.mjs','--import',botClock,'server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 async function request(path,body){
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 async function post(path,body){const response=await request(path,body);assert.equal(response.status,200,JSON.stringify(response.body));return response.body;}
 async function liveGet(code,token){const response=await fetch(base+'/api/experimental/commander-live?'+new URLSearchParams({code,token}));assert.equal(response.status,200);return response.json();}
 try{
  let ready=false;
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await delay(40)}
  assert.ok(ready,'server did not start: '+logs);
  const auth=await post('/api/auth/guest',{name:'Bot Live Test'});
  let player={authToken:auth.authToken};
  await post('/api/commander/select',{...player,commanderId:'defense'});
  const before=await post('/api/wallet',player);
  const created=await post('/api/bot',{...player,difficulty:'hard'});
  let code=created.room.code;player.token=created.token;
  assert.deepEqual(created.room.players.map(p=>[p.credits,p.team.length]),[[20,0],[20,0]]);
  assert.equal(created.room.difficulty,'hard');
  const expectedSeries=[0,0];let previousCommander;
  for(let match=0;match<4;match++){
   let room=(await post('/api/state',{code,...player})).room;
   for(let i=0;room.phase==='auction'&&i<400;i++){
    if(room.turn===0)room=(await post('/api/pass',{code,...player})).room;
    else{await delay(40);room=(await post('/api/state',{code,...player})).room;}
   }
   assert.equal(room.phase,'finished','bot auction must reach formation');
   assert.deepEqual(room.final.map(p=>p.team.length),[5,5]);
   assert.equal(new Set(room.final.flatMap(p=>p.team.map(c=>c.name))).size,10,'only the ten purchased auction heroes enter combat');
   for(const p of room.final)assert.equal(p.credits,20-p.team.reduce((sum,c)=>sum+c.cost,0),'both seats pay the recorded auction prices');
   const teamResponse=await fetch(base+'/api/battle-auction-team?'+new URLSearchParams({code,token:player.token}));
   assert.equal(teamResponse.status,200);const {teams}=await teamResponse.json();
   const formation={code,token:player.token,positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roles:teams[0].map(h=>h.role)};
   const started=await post('/api/battle-auction-preview',formation);
   assert.deepEqual(started.ready,[true,true]);assert.equal(started.result.live,true);assert.equal(started.result.winner,null);
   const commander=started.result.commanders[1];assert.ok(['attack','defense','magic','support'].includes(commander.commanderId));
   assert.deepEqual(commander.levels,{attack:0,defense:0,magic:0,support:0},'difficulty does not create stat bonuses');
   if(previousCommander)assert.notEqual(commander.commanderId,previousCommander,'rematches and new bot rooms select a different commander');
   if(match===3)assert.deepEqual(started.result.commanders[0],{commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}},'a guest without a saved commander can still play live training');
   previousCommander=commander.commanderId;
   assert.equal((await request('/api/battle-auction-complete',{code,token:player.token})).status,409,'cannot acknowledge an unfinished live battle');
   assert.notEqual((await request('/api/rematch',{code,...player})).status,200,'cannot skip live combat with rematch');
   const denied=await fetch(base+'/api/experimental/commander-live?'+new URLSearchParams({code,token:'invalid'}));assert.equal(denied.status,403);
   assert.equal((await request('/api/experimental/commander-live',{code,token:'invalid',ability:'normal',requestId:'bot-test-denied'})).status,403);
   const rejoined=await post('/api/battle-auction-preview',{...formation,positions:[4,3,2,1,0]});
   assert.deepEqual(rejoined.result.commanders,started.result.commanders,'rejoining does not reroll commanders');
   assert.deepEqual(rejoined.result.teams,started.result.teams,'repeated formation confirmation cannot reset live initial state');
   let live,humanCast=false;
   for(let i=0;i<500;i++){
    live=await liveGet(code,player.token);
    if(live.finished)break;
    if(!humanCast&&live.abilities[0].canUseNormal){
     const cast=await request('/api/experimental/commander-live',{code,token:player.token,ability:'normal',requestId:'human-bot-match-'+match});
     if(cast.status===200){humanCast=true;assert.ok(cast.body.cast.events.some(e=>e.actor==='commander:0'));}
     else assert.equal(cast.status,422,'only a concurrent effect lock can reject an otherwise ready cast');
    }
    await delay(25);
   }
   assert.equal(live.finished,true,'live battle must finish');assert.ok(humanCast,'human commander actions are enabled against bots');
   if(match===3){
    assert.equal(commander.commanderId,'attack','the deterministic easy scenario uses the attack commander');
    assert.ok(live.events.some(e=>e.actor==='commander:1'&&e.action==='commander-attack-normal'),'the easy bot autonomously casts a normal attack through the live engine');
   }
   assert.equal(live.winner,battleOutcome(live.teams).winner);
   assert.ok(live.summary.actionCount>0);
   if(live.winner!==null)expectedSeries[live.winner]++;
   for(let repeat=0;repeat<2;repeat++)assert.deepEqual((await post('/api/battle-auction-complete',{code,token:player.token})).series,expectedSeries,'completion is idempotent');
   room=(await post('/api/state',{code,...player})).room;
   assert.deepEqual(room.series,expectedSeries);assert.deepEqual(room.rankChange,[0,0]);
   assert.equal((await post('/api/wallet',player)).gold,before.gold,'bot creation, victory and loss never alter gold');
   if(match===0){
    const next=(await post('/api/rematch',{code,...player})).room;
    assert.equal(next.phase,'auction');assert.deepEqual(next.series,expectedSeries);
    assert.deepEqual(next.players.map(p=>[p.credits,p.team.length]),[[20,0],[20,0]]);
    const expired=await fetch(base+'/api/experimental/commander-live?'+new URLSearchParams({code,token:player.token}));assert.equal(expired.status,409,'old live session is inaccessible after rematch');
   }else if(match<3){
    if(match===2){
     const fresh=await post('/api/auth/guest',{name:'No Commander Bot Test'});
     player={authToken:fresh.authToken};previousCommander=null;
    }
    const next=await post('/api/bot',{...player,difficulty:match===2?'easy':'hard'});
    code=next.room.code;player.token=next.token;expectedSeries[0]=0;expectedSeries[1]=0;
    assert.deepEqual(next.room.players.map(p=>[p.credits,p.team.length]),[[20,0],[20,0]]);
   }
  }
  assert.equal((await post('/api/wallet',player)).gold,before.gold,'rematch also remains free');
  assert.equal((await post('/api/commander/get',player)).profile,null,'training fallback does not create a persistent human commander');
  assert.doesNotMatch(logs,/Live arena stopped:|Bot commander action:/,'the bot must not throw or stop the live runner');
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
