import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {request as httpRequest} from 'node:http';
import {createCommanderProfile} from '../arena-commanders.js';

const legacyHeaders={'User-Agent':'okhttp/4.12.0'};
const modernHeaders={...legacyHeaders,'X-Hero-Match-Commander-Selection':'1'};
const webHeaders={'User-Agent':'Mozilla/5.0','Origin':'https://arena.example'};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function fixture(t,{fast=false}={}){
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const args=[...(fast?['--import','./tests/fixtures/fast-live-clock.mjs']:[]),'server.js'];
 const child=spawn(process.execPath,args,{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),DATABASE_URL:'',NODE_ENV:'test',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
 t.after(async()=>{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})});
 const base=`http://127.0.0.1:${port}`;
 let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null||child.signalCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await delay(30)}assert.ok(ready,logs);
 async function request(player,path,data={},method='POST',headers={}){
  const body={...(player?.authToken?{authToken:player.authToken}:{}),...(player?.token?{token:player.token}:{}),...data};
  // Undici/fetch adds Sec-Fetch-Mode, which correctly identifies a non-legacy
  // transport. Use raw HTTP here to reproduce the old OkHttp request exactly.
  return new Promise((resolve,reject)=>{
   const req=httpRequest(base+path+(method==='GET'?'?'+new URLSearchParams(body):''),{method,headers:{...(method==='POST'?{'Content-Type':'application/json'}:{}),...(player?.headers||legacyHeaders),...headers}},response=>{
    let raw='';response.setEncoding('utf8');response.on('data',chunk=>raw+=chunk);response.on('end',()=>{try{resolve({status:response.statusCode,body:JSON.parse(raw)})}catch(error){reject(error)}});
   });
   req.on('error',reject);req.end(method==='POST'?JSON.stringify(body):undefined);
  });
 }
 async function ok(...args){const response=await request(...args);assert.equal(response.status,200,args[1]+' '+JSON.stringify(response)+'\n'+logs);return response.body;}
 async function finishAuction(match){
  let room=(await ok(match.players[0],'/api/state',{code:match.code})).room;
  for(let i=0;room.phase==='auction'&&i<40;i++)room=(await ok(match.players[room.turn],'/api/pass',{code:match.code})).room;
  assert.equal(room.phase,'finished');
  match.views=await Promise.all(match.players.map(player=>ok(player,'/api/battle-auction-team',{code:match.code},'GET')));
  match.key=match.views[0].preparation.matchKey;
  return match;
 }
 async function match(headers=[legacyHeaders,legacyHeaders],commanders=['attack','support']){
  const players=[];
  for(let seat=0;seat<2;seat++){
   const player={headers:headers[seat]};
   const auth=await ok(player,'/api/auth/guest',{name:'Legacy Compatibility '+seat});player.authToken=auth.authToken;players.push(player);
   if(commanders[seat])await ok(player,'/api/commander/select',{commanderId:commanders[seat]});
  }
  const created=await ok(players[0],'/api/create'),code=created.room.code;players[0].token=created.token;
  players[1].token=(await ok(players[1],'/api/join',{code})).token;
  return finishAuction({players,code});
 }
 const formation=(match,seat,extra={})=>ok(match.players[seat],'/api/battle-auction-preview',{code:match.code,...match.views[seat].preparation,...extra});
 const poll=(match,seat,extra={},headers={})=>ok(match.players[seat],'/api/battle-auction-preview',{code:match.code,...extra},'GET',headers);
 const choose=(match,seat,commanderId)=>ok(match.players[seat],'/api/battle-auction-commander',{code:match.code,matchKey:match.key,commanderId});
 return {request,ok,match,finishAuction,formation,poll,choose};
}

for(const legacySeat of [0,1])for(const [kind,modern] of [['native',modernHeaders],['web',webHeaders]])test(`mixed legacy seat ${legacySeat} and current ${kind} require only the current seat's explicit choice`,{timeout:15000},async t=>{
 const f=await fixture(t),headers=[modern,modern];headers[legacySeat]=legacyHeaders;
 const m=await f.match(headers),modernSeat=1-legacySeat;
 const before=await Promise.all(m.players.map(player=>f.ok(player,'/api/wallet')));
 for(const view of m.views)assert.deepEqual(view.commanderSelection.ready,[false,false]);
 await f.formation(m,modernSeat);
 const prepared=await f.formation(m,legacySeat);
 const ready=[false,false];ready[legacySeat]=true;
 assert.deepEqual(prepared.ready,[true,true]);assert.deepEqual(prepared.commanderSelection.ready,ready);assert.equal(prepared.started,false);
 const saved=createCommanderProfile(['attack','support'][legacySeat]);
 assert.deepEqual(prepared.commanderSelection.profile,saved);
 const own=await f.ok(m.players[modernSeat],'/api/battle-auction-team',{code:m.code},'GET');
 assert.deepEqual(own.commanderSelection,{ready,profile:null},'opponent profile remains private and cannot satisfy the modern gate');
 for(let i=0;i<3;i++)assert.equal((await f.poll(m,legacySeat)).started,false);
 const started=await f.choose(m,modernSeat,'magic');
 assert.equal(started.started,true);assert.equal(started.result.live,true);
 assert.deepEqual(started.result.commanders,[createCommanderProfile('magic'),saved],'result profiles are oriented to the choosing player');
 const current=await f.ok(m.players[modernSeat],'/api/commander/get');
 assert.equal(current.profile.commanderId,['attack','support'][modernSeat],'a match choice does not overwrite the saved preference');
 for(let seat=0;seat<2;seat++)assert.equal((await f.ok(m.players[seat],'/api/wallet')).gold,before[seat].gold);
});

test('legacy formation confirmations and reconnect polls reuse the one saved-profile combat',{timeout:15000},async t=>{
 const f=await fixture(t),m=await f.match();
 const first=await f.formation(m,0);assert.equal(first.started,false);assert.deepEqual(first.commanderSelection.profile,createCommanderProfile('attack'));
 await f.ok(m.players[0],'/api/commander/change',{commanderId:'defense'});
 assert.deepEqual((await f.poll(m,0)).commanderSelection.profile,createCommanderProfile('attack'),'a locked legacy snapshot does not follow menu changes');
 const results=await Promise.all(Array.from({length:6},()=>f.formation(m,1)));
 for(const result of results){assert.equal(result.started,true);assert.deepEqual(result.result,results[0].result);}
 assert.deepEqual(results[0].result.commanders,[createCommanderProfile('support'),createCommanderProfile('attack')]);
 const oldResult=(await f.poll(m,0)).result;
 const upgraded=await f.poll(m,0,{matchCommanderSelection:1},modernHeaders);
 assert.equal(upgraded.started,true);assert.deepEqual(upgraded.result,oldResult,'an already-started legacy battle survives a client upgrade');
 const again=await f.poll(m,0);assert.deepEqual(again.result,oldResult,'old-client retries cannot replace the existing live battle');
 const reconnect=await f.ok(m.players[0],'/api/room/current');assert.equal(reconnect.token,m.players[0].token);assert.equal(reconnect.resumeStage,'arena');
});

test('legacy players with no saved profile are blocked without a default, then reconnect can use their saved choice',{timeout:15000},async t=>{
 const f=await fixture(t),m=await f.match([legacyHeaders,modernHeaders],[null,'support']);
 const rejected=await f.request(m.players[0],'/api/battle-auction-preview',{code:m.code,...m.views[0].preparation,commanderId:'attack',profile:createCommanderProfile('magic')});
 assert.equal(rejected.status,409);assert.match(rejected.body.error,/komutan/i);
 assert.equal((await f.ok(m.players[0],'/api/commander/get')).profile,null,'legacy fallback must never create or trust a submitted profile');
 const team=await f.ok(m.players[0],'/api/battle-auction-team',{code:m.code},'GET');
 assert.equal(team.preparation.ready,true);assert.deepEqual(team.commanderSelection.ready,[false,false]);
 await f.ok(m.players[0],'/api/commander/select',{commanderId:'defense'});
 const recovered=await f.poll(m,0);
 assert.equal(recovered.started,false);assert.deepEqual(recovered.commanderSelection.profile,createCommanderProfile('defense'),'GET recovers a previously confirmed legacy formation');
 await f.formation(m,1);const started=await f.choose(m,1,'magic');assert.equal(started.started,true);
 assert.deepEqual(started.result.commanders,[createCommanderProfile('magic'),createCommanderProfile('defense')]);
});

test('a capability upgrade clears only its pending legacy lock and old requests cannot downgrade it',{timeout:15000},async t=>{
 const f=await fixture(t),m=await f.match();
 await f.formation(m,0);
 const upgraded=await f.poll(m,0,{matchCommanderSelection:1});
 assert.deepEqual(upgraded.commanderSelection,{ready:[false,false],profile:null});assert.deepEqual(upgraded.ready,[true,false]);
 await f.formation(m,1);
 for(const request of [()=>f.poll(m,0),()=>f.formation(m,0),()=>f.poll(m,0,{matchCommanderSelection:0})]){
  const result=await request();assert.equal(result.started,false);assert.deepEqual(result.commanderSelection,{ready:[false,true],profile:null});
 }
 const started=await f.choose(m,0,'magic');assert.equal(started.started,true);
 assert.deepEqual(started.result.commanders,[createCommanderProfile('magic'),createCommanderProfile('support')]);
});

test('explicit selection endpoints upgrade legacy seats without requiring a separate capability flag',{timeout:15000},async t=>{
 const f=await fixture(t),m=await f.match();await f.formation(m,0);
 const choices=await f.ok(m.players[0],'/api/battle-auction-commanders',{code:m.code,matchKey:m.key},'GET');
 assert.equal(choices.selection,null,'reading the picker removes a pending automatic legacy selection');
 await f.formation(m,1);assert.equal((await f.poll(m,0)).started,false);
 const chosen=await f.choose(m,0,'defense');assert.equal(chosen.started,true);assert.equal(chosen.result.commanders[0].commanderId,'defense');
});

test('invalid room or account credentials cannot upgrade another legacy seat or clear its saved choice',{timeout:15000},async t=>{
 const f=await fixture(t),m=await f.match();await f.formation(m,0);
 const forged=await f.request(m.players[0],'/api/state',{code:m.code,authToken:m.players[1].authToken},'POST',modernHeaders);
 assert.equal(forged.status,403);
 for(const route of ['/api/battle-auction-team','/api/battle-auction-preview']){
  const rejected=await f.request(m.players[0],route,{code:m.code,token:'wrong-token',matchCommanderSelection:1},'GET',modernHeaders);assert.equal(rejected.status,403);
 }
 const unchanged=await f.poll(m,0);assert.deepEqual(unchanged.commanderSelection,{ready:[true,false],profile:createCommanderProfile('attack')});
 const started=await f.formation(m,1);assert.equal(started.started,true,'neither legacy seat was accidentally made explicit');
});

test('unknown transports, browser hints, and even invalid capability markers fail closed to explicit selection',{timeout:20000},async t=>{
 const f=await fixture(t);
 const transports=[
  {'User-Agent':'okhttp/4.12.1'},
  {...legacyHeaders,Origin:'https://localhost'},
  {...legacyHeaders,'Sec-Fetch-Site':'same-origin'},
  {...legacyHeaders,'X-Hero-Match-Commander-Selection':'0'},
  {...legacyHeaders,'X-Hero-Match-Commander-Selection':'garbage'},
 ];
 for(const headers of transports){
  const m=await f.match([headers,legacyHeaders]);await f.formation(m,0);await f.formation(m,1);
  const result=await f.poll(m,0);assert.equal(result.started,false,JSON.stringify(headers));assert.deepEqual(result.commanderSelection,{ready:[false,true],profile:null});
 }
 for(const marker of [0,false,null,'invalid']){
  const m=await f.match();await f.formation(m,0,{matchCommanderSelection:marker});await f.formation(m,1);
  const result=await f.poll(m,0);assert.equal(result.started,false,String(marker));assert.deepEqual(result.commanderSelection,{ready:[false,true],profile:null});
 }
});

test('rematch clears choices but retains a modern capability established during the previous battle',{timeout:30000},async t=>{
 const f=await fixture(t,{fast:true}),m=await f.match();await f.formation(m,0);await f.formation(m,1);
 const first=(await f.poll(m,0)).result;assert.ok(first.live);
 await f.ok(m.players[0],'/api/room/current',{matchCommanderSelection:1});
 assert.deepEqual((await f.poll(m,0)).result,first,'an authenticated recovery upgrade leaves the active battle alone');
 let live;for(let i=0;i<350;i++){live=await f.ok(m.players[0],'/api/experimental/commander-live',{code:m.code},'GET');if(live.finished)break;await delay(40)}assert.equal(live.finished,true);
 for(const player of m.players)await f.ok(player,'/api/battle-auction-complete',{code:m.code});
 const firstKey=m.key;
 for(const player of m.players)await f.ok(player,'/api/rematch',{code:m.code});
 await f.finishAuction(m);assert.notEqual(m.key,firstKey);
 for(const view of m.views)assert.deepEqual(view.commanderSelection.ready,[false,false]);
 await f.formation(m,0);await f.formation(m,1);
 const waiting=await f.poll(m,0);assert.equal(waiting.started,false);assert.deepEqual(waiting.commanderSelection,{ready:[false,true],profile:null});
 const stale=await f.request(m.players[0],'/api/battle-auction-commander',{code:m.code,matchKey:firstKey,commanderId:'magic'});assert.equal(stale.status,409);
 const started=await f.choose(m,0,'magic');assert.equal(started.started,true);assert.equal(started.result.commanders[0].commanderId,'magic');
});
