import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('isolated two-player HTTP and SSE share every hidden tail for both receiving seats (1–4 cards)',{timeout:30000},async()=>{
 const socket=createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve)});
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const base='http://127.0.0.1:'+port,controllers=[];
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result};
 async function stream(params){
  const controller=new AbortController();controllers.push(controller);
  const response=await fetch(base+'/api/events?'+new URLSearchParams(params),{signal:controller.signal});assert.equal(response.status,200);
  const snapshots=[];let buffer='';
  const done=(async()=>{try{for await(const chunk of response.body){buffer+=new TextDecoder().decode(chunk);let index;while((index=buffer.indexOf('\n\n'))>=0){const data=buffer.slice(0,index);buffer=buffer.slice(index+2);if(data.startsWith('data: '))snapshots.push(JSON.parse(data.slice(6)));}}}catch(error){if(!controller.signal.aborted)throw error}})();
  return {snapshots,close:async()=>{controller.abort();await done},wait:async check=>{for(let i=0;i<100;i++){const found=snapshots.find(check);if(found)return found;await delay(10)}assert.fail('SSE did not receive expected room snapshot')}};
 }
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await delay(40)}assert.ok(ready,logs);
  for(const receiver of [0,1])for(let count=1;count<=4;count++){
   const players=[];for(let seat=0;seat<2;seat++){const auth=await post('/api/auth/guest',{name:`Reveal ${receiver} ${count} ${seat}`});players.push({authToken:auth.authToken})}
   const created=await post('/api/create',players[0]),code=created.room.code;players[0].token=created.token;
   const joined=await post('/api/join',{code,...players[1]});players[1].token=joined.token;
   const streams=await Promise.all(players.map(player=>stream({code,...player})));
   try{
    let room=joined.room;const matchKey=room.matchKey,initialRevision=room.revision;
    const ordinary=[];
    const winners=[...Array(5-count).fill(receiver),...Array(5).fill(1-receiver)];
    for(const winner of winners){
     const offered=room.card,round=room.round;
     assert.equal(room.phase,'auction');assert.equal('tailAwards' in room,false,'never leak undisplayed cards in auction snapshots');
     if(room.turn!==winner)room=(await post('/api/pass',{code,...players[room.turn]})).room;
     room=(await post('/api/bid',{code,...players[winner],amount:1})).room;
     if(room.phase==='auction'&&room.round===round)room=(await post('/api/pass',{code,...players[room.turn]})).room;
     ordinary.push(offered.name);
    }
    assert.equal(room.phase,'finished');assert.equal(room.matchKey,matchKey);assert.ok(room.revision>initialRevision);
    assert.equal(room.tailAwards.length,count);assert.ok(room.tailAwards.every(award=>award.seat===receiver));
    assert.deepEqual(room.tailAwards.map(award=>award.round),Array.from({length:count},(_,i)=>10-count+i));
    assert.equal(new Set(room.tailAwards.map(award=>award.id)).size,count);
    assert.ok(room.tailAwards.every(award=>!ordinary.includes(award.card.name)),'normal purchases must never be center-revealed again');
    assert.deepEqual(room.tailAwards.map(award=>award.card),room.final[receiver].team.slice(-count));
    assert.ok(room.final[1-receiver].team.every(card=>card.cost===1),'ordinary purchases retain actual bid prices');
    const credits=20-(5-count)-room.tailAwards.reduce((sum,award)=>sum+award.card.cost,0);
    assert.equal(room.final[receiver].credits,credits);
    assert.equal(room.final[receiver].score,Math.round(room.final[receiver].team.reduce((sum,card)=>sum+card.power,0)*(1+credits*.01)*100)/100);
    for(const seat of [0,1]){
     const live=await streams[seat].wait(view=>view.phase==='finished');
     assert.equal(live.me,seat);assert.deepEqual(live.tailAwards,room.tailAwards);assert.equal(live.revision,room.revision);assert.equal(live.matchKey,matchKey);
     assert.ok(streams[seat].snapshots.filter(view=>view.phase==='auction').every(view=>!('tailAwards' in view)));
     const revisions=streams[seat].snapshots.map(view=>view.revision);assert.ok(revisions.every((revision,i)=>!i||revision>revisions[i-1]),'each server mutation emits a newer snapshot');
     const restored=(await post('/api/state',{code,...players[seat]})).room;
     assert.equal(restored.revision,room.revision);assert.deepEqual(restored.tailAwards,room.tailAwards,'poll/cold reload can reconstruct all hidden reveals without previous state');
     const reconnected=await stream({code,...players[seat]});
     try{const replay=await reconnected.wait(view=>view.phase==='finished');assert.equal(replay.revision,room.revision);assert.deepEqual(replay.tailAwards,room.tailAwards)}finally{await reconnected.close()}
    }
   }finally{await Promise.all(streams.map(s=>s.close()))}
  }
 }finally{for(const controller of controllers)controller.abort();child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
