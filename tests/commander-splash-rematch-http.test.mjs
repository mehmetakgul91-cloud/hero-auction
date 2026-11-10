import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {battleOutcome} from '../battle-result.js';
import {writeFile} from 'node:fs/promises';
import {battleRoster} from '../battle-roster.js';

test('actual HTTP live battles and rematch retain pre-shield splash with real mage heroes',{timeout:60000},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
 const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--import','./tests/fixtures/fast-live-clock.mjs','--import','./tests/fixtures/splash-auction-deck.mjs','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()}};
 const get=async(path,params)=>{const response=await fetch(base+path+'?'+new URLSearchParams(params));assert.equal(response.status,200);return response.json()};
 try{
  let ready=false;
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50))}
  assert.ok(ready,'server did not start: '+logs);
  const players=[];
  for(const [i,commanderId] of ['defense','defense'].entries()){
   const auth=await post('/api/auth/guest',{name:'Series Test '+i});assert.equal(auth.status,200);
   players.push({authToken:auth.body.authToken});
   assert.equal((await post('/api/commander/select',{...players[i],commanderId})).status,200);
  }
  const created=await post('/api/create',players[0]);assert.equal(created.status,200);
  const code=created.body.room.code;players[0].token=created.body.token;
  const joined=await post('/api/join',{code,...players[1]});assert.equal(joined.status,200);players[1].token=joined.body.token;
  const expectedSeries=[0,0],records=[],observed=new Set();let auditedSplashes=0,shieldedPrimaries=0,shieldedSecondaries=0;
  function audit(current,before,match){
   const fresh=current.events.filter(e=>e.version>(before?.version??-1));
   for(const splash of fresh.filter(e=>e.damageType==='splash')){
    const primary=current.events.find(e=>e.version===splash.version&&e.actor===splash.actor&&e.damageType==='special');
    assert.ok(primary,'each splash has its primary hit in the same atomic version');
    const actor=current.teams.flat().find(h=>h.id===splash.actor);
    const rate=actor.active?.effect==='splash'?actor.active.splashRate:.15;
    assert.equal(splash.rawDamage,Math.max(1,Math.floor(primary.rawDamage*rate)),JSON.stringify({match,primary,splash}));
    assert.ok(splash.absorbed<=Math.floor(splash.rawDamage*7/10));
    auditedSplashes++;observed.add(splash.actor);if(primary.absorbed>0)shieldedPrimaries++;if(splash.absorbed>0)shieldedSecondaries++;
    if(before&&current.version===before.version+1){
     const prior=before.teams[1-splash.side].find(h=>h.id===splash.target);
     assert.equal(splash.absorbed,Math.min(prior.shield,Math.floor(splash.rawDamage*7/10)));
     const after=current.teams[1-splash.side].find(h=>h.id===splash.target);
     assert.equal(after.hp,prior.hp-splash.value);assert.equal(after.shield,prior.shield-splash.absorbed);
    }
   }
   if(fresh.some(e=>e.damageType==='splash'))records.push({match,before,current});
  }
  for(let match=0;match<2;match++){
   let room=(await post('/api/state',{code,...players[0]})).body.room;
   assert.deepEqual(room.series,expectedSeries);
   for(let n=0;room.phase==='auction'&&n<40;n++){
    const passed=await post('/api/pass',{code,...players[room.turn]});assert.equal(passed.status,200);room=passed.body.room;
   }
   assert.equal(room.phase,'finished');
   const {teams}=await get('/api/battle-auction-team',{code,token:players[0].token});
   for(let i=0;i<2;i++){
    const formation=await post('/api/battle-auction-preview',{code,token:players[i].token,positions:[0,1,2,3,4],lanes:teams[i].map(h=>h.role==='tank'?'front':'back'),roles:teams[i].map(h=>h.role)});
    assert.equal(formation.status,200);
    assert.equal(formation.body.started,false);
    const selection=await post('/api/battle-auction-commander',{code,...players[i],matchKey:formation.body.matchKey,commanderId:'defense'});assert.equal(selection.status,200);
    if(i===1){assert.equal(selection.body.result.live,true);assert.equal(selection.body.result.winner,null)}
   }
   let live,previous=null;const casts=[0,0];
   for(let i=0;i<1200;i++){
    live=await get('/api/experimental/commander-live',{code,token:players[0].token});audit(live,previous,match);previous=live;
    if(live.finished)break;
    for(const seat of [0,1]){
     const own=seat===0?live:await get('/api/experimental/commander-live',{code,token:players[seat].token});
     if(own.abilities[0].canUseNormal){const cast=await post('/api/experimental/commander-live',{code,token:players[seat].token,ability:'normal',requestId:'splash_shield_'+match+'_'+seat+'_'+casts[seat]++});assert.ok([200,422].includes(cast.status));}
    }
    await new Promise(r=>setTimeout(r,10));
   }
   assert.equal(live.finished,true,'live match did not finish');
   const winner=battleOutcome(live.teams).winner;assert.equal(live.winner,winner);
   if(winner!==null)expectedSeries[winner]++;
   const reversed=await get('/api/experimental/commander-live',{code,token:players[1].token});
   assert.equal(reversed.winner,winner===null?null:1-winner);
   assert.deepEqual(reversed.events.filter(e=>e.damageType==='splash').map(e=>[e.actor,e.target,e.rawDamage,e.absorbed,e.value]),live.events.filter(e=>e.damageType==='splash').map(e=>[e.actor,e.target,e.rawDamage,e.absorbed,e.value]));
   assert.ok(live.summary.actionCount>0,'finished live battle must include all actions');
   const total=rows=>rows.flat().reduce((n,h)=>n+h.dealt,0);
   assert.equal(total(live.summary.teams),live.teams.flat().reduce((n,h)=>n+(h.damage||0),0));
   assert.equal(total(live.summary.teams),live.summary.teams.flat().reduce((n,h)=>n+h.taken,0));
   const finalDelta=await get('/api/experimental/commander-live',{code,token:players[0].token,sinceVersion:String(live.version)});
   assert.deepEqual(finalDelta.events,[]);
   assert.deepEqual(finalDelta.summary,live.summary,'even an empty final poll retains full battle statistics');
   assert.deepEqual(reversed.summary.teams,[live.summary.teams[1],live.summary.teams[0]]);
   for(let repeat=0;repeat<2;repeat++)for(const player of players){
    const completed=await post('/api/battle-auction-complete',{code,token:player.token});
    assert.equal(completed.status,200);assert.deepEqual(completed.body.series,expectedSeries);
   }
   assert.deepEqual((await post('/api/state',{code,...players[0]})).body.room.series,expectedSeries);
   if(match===0){
    const before=await Promise.all(players.map(p=>post('/api/wallet',p)));
    assert.equal((await post('/api/rematch',{code,...players[0]})).status,200);
    const requests=await Promise.all([0,1].map(()=>post('/api/rematch',{code,...players[1]})));
    assert.equal(requests.filter(r=>r.status===200).length,1,'duplicate rematch must not start twice');
    const next=requests.find(r=>r.status===200).body.room;
    assert.equal(next.phase,'auction');assert.deepEqual(next.series,expectedSeries);
    assert.ok(next.players.every(p=>p.credits===20&&p.team.length===0));
    const after=await Promise.all(players.map(p=>post('/api/wallet',p)));
    for(let i=0;i<2;i++)assert.equal(after[i].body.gold,before[i].body.gold-50);
   }
  }
  assert.ok(auditedSplashes>20);assert.ok(shieldedPrimaries>0);assert.ok(shieldedSecondaries>0);
  assert.equal(observed.size,7,'all seven actual splash heroes must be observed');
  const names=[...observed].map(id=>battleRoster.find(h=>h.id===id)?.name);
  const evidence={auditedSplashes,shieldedPrimaries,shieldedSecondaries,names,records};
  if(process.env.HERO_SPLASH_TEST_EVIDENCE)await writeFile(process.env.HERO_SPLASH_TEST_EVIDENCE,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({auditedSplashes,shieldedPrimaries,shieldedSecondaries,names,rematches:1}));
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
