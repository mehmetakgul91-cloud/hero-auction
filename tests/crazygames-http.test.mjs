import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {generateKeyPairSync,sign} from 'node:crypto';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function credential(userId,extra={}){const now=Math.floor(Date.now()/1000),data=encode({alg:'RS256'})+'.'+encode({userId,gameId:'fixture-game',username:userId,iat:now-1,exp:now+3600,...extra});return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')}
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port}
test('verified portal accounts retain progress; invites join once and preserve account isolation',{timeout:20000},async()=>{
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--import','./tests/fixtures/crazygames-key.mjs','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1',CRAZYGAMES_GAME_ID:'fixture-game',CG_TEST_PUBLIC_KEY:publicKey.export({type:'spki',format:'pem'})},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()}};
 try{
  let ready=false;
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
  assert.ok(ready,'server did not start: '+logs);
  const heroes=await (await fetch(base+'/api/heroes')).json();
  assert.equal(heroes.heroes.length,50);
  assert.ok(heroes.heroes.every(h=>h.universe==='original'));
  const hero=heroes.heroes[0];
  const artResponse=await fetch(base+'/api/art?universe=original&name='+encodeURIComponent(hero.name));
  assert.equal(artResponse.status,200);
  const art=await artResponse.json();assert.equal(art.url,hero.portrait);assert.equal(art.role,hero.role);
  assert.deepEqual(art.active,hero.active);assert.deepEqual(art.passive,hero.passive);
  assert.equal((await fetch(base+'/api/art?universe=marvel&name=Hulk')).status,400);
  const demo=await fetch(base+'/api/battle-preview?roles=tank,fighter,energy,energy,energy');
  assert.equal(demo.status,200);
  assert.ok((await demo.json()).teams.flat().every(h=>h.id.startsWith('original:')));
  const arenaHtml=await (await fetch(base+'/crazygames/battle-preview.html')).text();
  assert.doesNotMatch(arenaHtml,/arena-three\.js|arena-3d\.css|id="arena-3d"/);

  const auth=async(id,extra={})=>{const result=await post('/api/auth/crazygames',{credential:credential(id,extra)});assert.equal(result.status,200);return result.body};
  const a=await auth('player-a'),b=await auth('player-b'),c=await auth('player-c');
  assert.equal(a.user.sub,'crazygames:fixture-game:player-a');
  assert.equal((await post('/api/auth/crazygames',{credential:credential('player-a',{exp:1})})).status,401);
  assert.equal((await post('/api/auth/crazygames',{credential:credential('player-a',{gameId:'another'})})).status,401);
  const selected=await post('/api/commander/select',{authToken:a.authToken,commanderId:'magic'});assert.equal(selected.status,200);
  const aSecondDevice=await auth('player-a');
  const profile=await post('/api/commander/get',{authToken:aSecondDevice.authToken});assert.equal(profile.body.profile.commanderId,'magic');
  const otherProfile=await post('/api/commander/get',{authToken:b.authToken});assert.equal(otherProfile.body.profile,null);
  const created=await post('/api/create',{authToken:a.authToken,universe:'mixed'});assert.equal(created.status,200);const code=created.body.room.code;
  const joins=await Promise.all([b,c].map(user=>post('/api/join',{authToken:user.authToken,code})));
  assert.equal(joins.filter(r=>r.status===200).length,1);assert.equal(joins.filter(r=>r.status!==200).length,1);
  const wallet=await post('/api/wallet',{authToken:aSecondDevice.authToken});assert.equal(wallet.body.gold,450);
  const winner=joins[0].status===200?b:c,loser=joins[0].status===200?c:b;
  assert.equal((await post('/api/wallet',{authToken:winner.authToken})).body.gold,450);
  assert.equal((await post('/api/wallet',{authToken:loser.authToken})).body.gold,500);
  const seat={code,token:created.body.token};
  const renamed=await auth('player-a',{username:'Fresh.Name'});
  const restored=await post('/api/state',{...seat,authToken:renamed.authToken});assert.equal(restored.status,200);assert.equal(restored.body.room.players[0].name,'Fresh.Name');
  assert.equal((await post('/api/state',{...seat,authToken:b.authToken})).status,403);
  const unauthorizedEvents=await fetch(base+'/api/events?'+new URLSearchParams({...seat,authToken:b.authToken}));assert.equal(unauthorizedEvents.status,403);
  assert.equal((await post('/api/join',{authToken:loser.authToken,code:'not-a-room'})).status,404);
  // Finish a real auction, then verify re-entry cannot replace a locked formation.
  const joined=joins.find(r=>r.status===200).body;
  const players=[{authToken:a.authToken,token:created.body.token},{authToken:winner.authToken,token:joined.token}];
  let auction=(await post('/api/state',{code,...players[0]})).body.room;
  for(let n=0;auction.phase==='auction'&&n<40;n++){
   const passed=await post('/api/pass',{code,...players[auction.turn]});
   assert.equal(passed.status,200);auction=passed.body.room;
  }
  assert.equal(auction.phase,'finished');
  const teams=await (await fetch(base+'/api/battle-auction-team?'+new URLSearchParams({code,token:players[0].token}))).json();
  const positions=[0,1,2,3,4],lanes=['front','front','back','back','back'];
  const formation=i=>({code,token:players[i].token,positions,lanes,roles:teams.teams[i].map(h=>h.role)});
  assert.equal((await post('/api/battle-auction-preview',formation(0))).status,200);
  const duplicate=await post('/api/battle-auction-preview',{...formation(0),positions:[4,3,2,1,0]});
  assert.equal(duplicate.status,200);assert.deepEqual(duplicate.body.ready,[true,false]);
  const started=await post('/api/battle-auction-preview',formation(1));
  assert.equal(started.status,200);assert.equal(started.body.started,true);
  const resumed=await post('/api/battle-auction-preview',formation(1));
  assert.equal(resumed.status,200);assert.deepEqual(resumed.body,started.body);
  assert.equal((await post('/api/battle-auction-preview',{...formation(0),token:'invalid'})).status,403);

 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
