import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('PvP same-lane permutation survives draft, Ready, reconnect and fresh rematch center selection',{timeout:60000},async()=>{
 const socket=createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve)});
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['--import','./tests/fixtures/fast-live-clock.mjs','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const request=async(path,body,method='POST')=>{
  const response=await fetch(base+path+(method==='GET'?'?'+new URLSearchParams(body):''),method==='GET'?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 };
 const ok=async(...args)=>{const result=await request(...args);assert.equal(result.status,200,JSON.stringify(result));return result.body;};
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await delay(40)}assert.ok(ready,logs);
  const players=[];for(let i=0;i<2;i++)players.push({authToken:(await ok('/api/auth/guest',{name:`Center Protection ${i}`})).authToken});
  const created=await ok('/api/create',players[0]),code=created.room.code;players[0].token=created.token;
  players[1].token=(await ok('/api/join',{code,...players[1]})).token;
  const team=seat=>ok('/api/battle-auction-team',{code,token:players[seat].token},'GET');
  const live=seat=>ok('/api/experimental/commander-live',{code,token:players[seat].token},'GET');
  let previousKey;
  for(let match=0;match<2;match++){
   let room=(await ok('/api/state',{code,...players[0]})).room;
   for(let n=0;room.phase==='auction'&&n<40;n++)room=(await ok('/api/pass',{code,...players[room.turn]})).room;
   assert.equal(room.phase,'finished');
   const views=await Promise.all([team(0),team(1)]),matchKey=views[0].preparation.matchKey;
   assert.notEqual(matchKey,previousKey);assert.deepEqual(views.map(v=>v.preparation.ready),[false,false]);
   const expected=[];
   for(let seat=0;seat<2;seat++){
    const cards=views[seat].teams[seat];
    const initial={positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roles:cards.map(h=>h.role)};
    await ok('/api/battle-auction-formation',{code,...players[seat],matchKey,...initial});
    // Exactly the UI contract: swap positions and their immutable roles, not lanes.
    const formation=structuredClone(initial),other=match===0?2:4;
    [formation.positions[3],formation.positions[other]]=[formation.positions[other],formation.positions[3]];
    [formation.roles[3],formation.roles[other]]=[formation.roles[other],formation.roles[3]];
    const saved=await ok('/api/battle-auction-formation',{code,...players[seat],matchKey,...formation});
    assert.deepEqual(saved.preparation,{matchKey,...formation,ready:false});
    assert.deepEqual((await team(seat)).preparation,saved.preparation,'reconnecting preparation restores same-lane order and roles');
    expected[seat]=formation.positions.map(position=>cards[position].id);
    const confirm={code,...players[seat],matchKey,formation,commanderId:'defense'};
    const locked=await ok('/api/battle-auction-commander',confirm);
    assert.equal(locked.preparation.ready,true);assert.deepEqual(locked.preparation.positions,formation.positions);
    assert.equal((await request('/api/battle-auction-formation',{code,...players[seat],matchKey,...initial})).status,409,'Ready locks the selected center');
    if(seat===1){
     assert.equal(locked.started,true);
     for(let side=0;side<2;side++){
      const prepared=locked.result.teams[1-side];
      assert.deepEqual(prepared.map(h=>h.id),expected[side]);
      assert.deepEqual(prepared[3].centerProtection,{version:1,protectorIds:expected[side].filter((_,i)=>i!==3),broken:false},'new battle, including rematch, starts with fresh unbroken cover');
      assert.equal(prepared.filter(h=>h.centerProtection).length,1);
     }
    }
   }
   // A new read from each seat while combat is running must recover the
   // selected center without deriving a new formation from current survivors.
   for(const seat of [0,1]){
    const resumed=await live(seat);
    for(let side=0;side<2;side++){
     const ids=expected[seat===0?side:1-side],heroes=resumed.teams[side];
     assert.deepEqual(heroes.map(h=>h.id),ids);
     assert.deepEqual(heroes[3].centerProtection.protectorIds,ids.filter((_,i)=>i!==3));
    }
   }
   const broken=[false,false];let state,observedDeath=false;
   for(let poll=0;poll<700;poll++){
    state=await live(0);
    for(let side=0;side<2;side++){
     const heroes=state.teams[side];assert.deepEqual(heroes.map(h=>h.id),expected[side]);
     const mark=heroes[3].centerProtection;
     assert.deepEqual(mark.protectorIds,expected[side].filter((_,i)=>i!==3));
     if(heroes.some((h,i)=>i!==3&&h.hp===0)){broken[side]=true;observedDeath=true;}
     assert.equal(mark.broken,broken[side],'live snapshots preserve the first-death latch');
    }
    if(state.finished)break;
    await delay(20);
   }
   assert.equal(state.finished,true);assert.equal(observedDeath,true);
   const reconnect=await live(0),opponent=await live(1);
   assert.deepEqual(reconnect.teams,state.teams,'reconnect does not rebuild or rearm a finished combat');
   assert.deepEqual(opponent.teams,[state.teams[1],state.teams[0]],'opponent orientation retains identical center marks');
   for(const player of players)await ok('/api/battle-auction-complete',{code,token:player.token});
   if(match===0){await ok('/api/rematch',{code,...players[0]});await ok('/api/rematch',{code,...players[1]});}
   previousKey=matchKey;
  }
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
