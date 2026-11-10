import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

test('auction SSE, live polling, safety checks and rematches share isolated transient emotes',{timeout:25000},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--import','./tests/fixtures/arena-emotes-clock.mjs','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe','ipc']});
 let logs='',clockId=0,reader;
 child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const post=async(path,body,status=200,headers={})=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data};
 const get=async(path,params,status=200)=>{const response=await fetch(base+path+'?'+new URLSearchParams(params));const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data};
 const advance=(ms,steps=1)=>new Promise((resolve,reject)=>{const id=++clockId,timer=setTimeout(()=>{child.off('message',listener);reject(Error('Clock acknowledgment missing: '+logs))},3000);const listener=message=>{if(message?.type==='arena-emotes-clock'&&message.id===id){clearTimeout(timer);child.off('message',listener);resolve()}};child.on('message',listener);child.send({type:'arena-emotes-clock',id,ms,steps})});
 try{
  let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,30))}assert.ok(ready,logs);
  const players=[];
  for(const [i,commanderId] of ['attack','support'].entries()){
   const auth=await post('/api/auth/guest',{name:'Reaction Test '+i});players.push({authToken:auth.authToken});
   await post('/api/commander/select',{...players[i],commanderId});
  }
  const created=await post('/api/create',players[0]),code=created.room.code;
  players[0].token=created.token;assert.equal(created.room.arenaEmotes.enabled,false);
  const initialKey=created.room.arenaEmotes.matchKey;
  const input=(seat=0,extra={})=>({code,token:players[seat].token,matchKey:initialKey,emoteId:'laugh',requestId:'reaction-0001',...extra});
  await post('/api/arena-emotes',input(),409);
  const joined=await post('/api/join',{code,...players[1]});players[1].token=joined.token;assert.equal(joined.room.arenaEmotes.enabled,true);
  await post('/api/arena-emotes',input(0,{token:'foreign-seat'}),403);
  await post('/api/arena-emotes',input(0,{code:'missing'}),403);
  await post('/api/arena-emotes',input(0,{matchKey:'stale-match'}),409);
  for(const extra of [{emoteId:'chicken'},{emoteId:'https://x.test/a.png'},{side:1},{text:'unapproved chat'},{at:1},{requestId:'bad'}])await post('/api/arena-emotes',input(0,extra),422);
  await post('/api/arena-emotes',input(),403,{Referer:base+'/crazygames/'});
  await post('/api/arena-emotes',null,422);
  assert.equal((await fetch(base+'/api/arena-emotes')).status,405);
  assert.equal((await fetch(base+'/api/arena-emotes',{method:'POST',body:'{'})).status,400);
  assert.equal((await fetch(base+'/api/arena-emotes',{method:'POST',body:'a'.repeat(2001)})).status,413);

  const spectator=await post('/api/auth/guest',{name:'Spectator Test'});
  const spectated=await post('/api/spectate',{code,authToken:spectator.authToken});assert.equal(spectated.room.arenaEmotes.enabled,false);assert.deepEqual(spectated.room.arenaEmotes.events,[]);
  const stream=await fetch(base+'/api/events?'+new URLSearchParams({code,...players[1]}),{signal:AbortSignal.timeout(20000)});assert.equal(stream.status,200);reader=stream.body.getReader();
  let buffer='';const decoder=new TextDecoder();
  const event=async name=>{
   for(;;){
    let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const part=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const type=part.split('\n').find(line=>line.startsWith('event: '))?.slice(7)||'message';const data=part.split('\n').find(line=>line.startsWith('data: '));if(type===name&&data)return JSON.parse(data.slice(6))}
    const chunk=await reader.read();assert.equal(chunk.done,false);buffer+=decoder.decode(chunk.value,{stream:true});
   }
  };
  await event('message');
  const beforeAuction=(await post('/api/state',{code,...players[0]})).room;
  const first=(await post('/api/arena-emotes',input())).arenaEmotes;
  assert.equal(first.enabled,true);assert.equal(first.cooldownMs,5000);assert.equal(first.events[0].side,0);assert.equal(first.events[0].expiresAt-first.events[0].at,5000);
  const received=await event('arena-emotes');assert.equal(received.events[0].id,first.events[0].id);assert.equal(received.events[0].side,1);
  const afterAuction=(await post('/api/state',{code,...players[0]})).room;
  assert.deepEqual({...afterAuction,arenaEmotes:null},{...beforeAuction,arenaEmotes:null},'reaction does not change auction revision, timer, bid, cards, currency, chat or room state');
  const otherAuction=(await post('/api/state',{code,...players[1]})).room;assert.equal(otherAuction.arenaEmotes.events[0].side,1);
  assert.deepEqual((await post('/api/arena-emotes',input())).arenaEmotes,first);
  await post('/api/arena-emotes',input(0,{emoteId:'yawn'}),409);
  const other=(await post('/api/arena-emotes',input(1,{emoteId:'nanik'}))).arenaEmotes;assert.deepEqual(other.events.map(e=>e.side),[1,0]);
  await advance(1000);await post('/api/arena-emotes',input(0,{requestId:'reaction-0002'}),429);

  let room=(await post('/api/state',{code,...players[0]})).room;
  for(let n=0;room.phase==='auction'&&n<40;n++)room=(await post('/api/pass',{code,...players[room.turn]})).room;
  assert.equal(room.phase,'finished');assert.equal(room.arenaEmotes.enabled,false);
  await post('/api/arena-emotes',input(0,{requestId:'during-preparation'}),409);
  const {teams}=await get('/api/battle-auction-team',{code,token:players[0].token});
  for(let i=0;i<2;i++){const prepared=await post('/api/battle-auction-preview',{code,token:players[i].token,positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roles:teams[i].map(h=>h.role)});await post('/api/battle-auction-commander',{code:code,...players[i],matchKey:prepared.matchKey,commanderId:'attack'});}
  const live=await get('/api/experimental/commander-live',{code,token:players[0].token});
  assert.equal(live.arenaEmotes.enabled,true);assert.equal(live.arenaEmotes.matchKey,initialKey);assert.equal(live.arenaEmotes.cooldownMs,4000);assert.equal(live.arenaEmotes.events[0].id,first.events[0].id);
  const reversed=await get('/api/experimental/commander-live',{code,token:players[1].token});assert.deepEqual(reversed.arenaEmotes.events.map(e=>e.side),[1,0]);
  await post('/api/arena-emotes',input(0,{requestId:'reaction-0002'}),429);
  await advance(3999);
  const beforeExpiry=await get('/api/experimental/commander-live',{code,token:players[0].token});assert.equal(beforeExpiry.arenaEmotes.cooldownMs,1);assert.equal(beforeExpiry.arenaEmotes.events.length,2,'both expressions survive through 4999ms');
  await advance(1);
  const expiredRetry=(await post('/api/arena-emotes',input())).arenaEmotes;assert.deepEqual(expiredRetry.events,[]);assert.equal(expiredRetry.cooldownMs,0);
  const beforeCombat=await get('/api/experimental/commander-live',{code,token:players[0].token});
  const next=(await post('/api/arena-emotes',input(0,{emoteId:'slow_clap',requestId:'reaction-0002'}))).arenaEmotes;
  const afterCombat=await get('/api/experimental/commander-live',{code,token:players[0].token});
  assert.deepEqual({...afterCombat,arenaEmotes:null},{...beforeCombat,arenaEmotes:null},'emote submission does not advance combat, change HP/energy or affect outcomes');
  const delta=await get('/api/experimental/commander-live',{code,token:players[1].token,sinceVersion:afterCombat.version});assert.deepEqual(delta.events,[]);assert.equal(delta.arenaEmotes.events[0].id,next.events[0].id);assert.equal(delta.arenaEmotes.events[0].side,1);

  const aid=(await post('/api/friends',players[0])).playerId;
  await post('/api/moderation/block',{...players[1],playerId:aid});
  for(const player of players){const blocked=await get('/api/experimental/commander-live',{code,token:player.token});assert.equal(blocked.arenaEmotes.enabled,false);assert.deepEqual(blocked.arenaEmotes.events,[])}
  await post('/api/arena-emotes',input(0,{requestId:'blocked-reaction'}),403);
  await post('/api/moderation/unblock',{...players[1],playerId:aid});
  const unblocked=(await post('/api/arena-emotes',input(0,{emoteId:'slow_clap',requestId:'reaction-0002'}))).arenaEmotes;assert.deepEqual(unblocked.events,[]);assert.equal(unblocked.cooldownMs,5000);
  await post('/api/arena-emotes',input(1,{requestId:'portal-reaction'}),403,{Origin:'https://www.crazygames.com'});

  await advance(5000,400);
  const finished=await get('/api/experimental/commander-live',{code,token:players[0].token});assert.equal(finished.finished,true);assert.equal(finished.arenaEmotes.enabled,false);assert.deepEqual(finished.arenaEmotes.events,[]);
  await post('/api/arena-emotes',input(0,{requestId:'after-finish'}),409);
  for(const player of players)await post('/api/battle-auction-complete',{code,token:player.token});
  await post('/api/rematch',{code,...players[0]});
  const rematch=(await post('/api/rematch',{code,...players[1]})).room;
  assert.equal(rematch.phase,'auction');assert.equal(rematch.arenaEmotes.enabled,true);assert.equal(rematch.arenaEmotes.cooldownMs,0);assert.deepEqual(rematch.arenaEmotes.events,[]);assert.notEqual(rematch.arenaEmotes.matchKey,initialKey);
  await post('/api/arena-emotes',input(),409);
  const fresh=(await post('/api/arena-emotes',input(0,{matchKey:rematch.arenaEmotes.matchKey}))).arenaEmotes;assert.equal(fresh.events.length,1);assert.notEqual(fresh.events[0].id,first.events[0].id);
 }finally{
  await reader?.cancel().catch(()=>{});
  child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()});
 }
});
