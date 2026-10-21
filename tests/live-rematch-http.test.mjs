import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {battleOutcome} from '../battle-result.js';

test('two completed live matches retain the correct series for both seats and charge each rematch once',{timeout:30000},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
 const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--import','./tests/fixtures/fast-live-clock.mjs','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()}};
 const get=async(path,params)=>{const response=await fetch(base+path+'?'+new URLSearchParams(params));assert.equal(response.status,200);return response.json()};
 try{
  let ready=false;
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50))}
  assert.ok(ready,'server did not start: '+logs);
  const players=[];
  for(const [i,commanderId] of ['attack','support'].entries()){
   const auth=await post('/api/auth/guest',{name:'Series Test '+i});assert.equal(auth.status,200);
   players.push({authToken:auth.body.authToken});
   assert.equal((await post('/api/commander/select',{...players[i],commanderId})).status,200);
  }
  const created=await post('/api/create',players[0]);assert.equal(created.status,200);
  const code=created.body.room.code;players[0].token=created.body.token;
  const joined=await post('/api/join',{code,...players[1]});assert.equal(joined.status,200);players[1].token=joined.body.token;
  const expectedSeries=[0,0];
  for(let match=0;match<2;match++){
   let room=(await post('/api/state',{code,...players[0]})).body.room;
   assert.deepEqual(room.series,expectedSeries);
   for(let n=0;room.phase==='auction'&&n<40;n++){
    const passed=await post('/api/pass',{code,...players[room.turn]});assert.equal(passed.status,200);room=passed.body.room;
   }
   assert.equal(room.phase,'finished');
   const {teams}=await get('/api/battle-auction-team',{code,token:players[0].token});
   for(let i=0;i<2;i++){
    const formation=await post('/api/battle-auction-preview',{code,token:players[i].token,positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roles:teams[i].map(h=>h.role)});
    assert.equal(formation.status,200);
    if(i===1){assert.equal(formation.body.result.live,true);assert.equal(formation.body.result.winner,null)}
   }
   let live;
   for(let i=0;i<240;i++){
    live=await get('/api/experimental/commander-live',{code,token:players[0].token});
    if(live.finished)break;
    await new Promise(r=>setTimeout(r,40));
   }
   assert.equal(live.finished,true,'live match did not finish');
   const winner=battleOutcome(live.teams).winner;assert.equal(live.winner,winner);
   if(winner!==null)expectedSeries[winner]++;
   const reversed=await get('/api/experimental/commander-live',{code,token:players[1].token});
   assert.equal(reversed.winner,winner===null?null:1-winner);
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
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
