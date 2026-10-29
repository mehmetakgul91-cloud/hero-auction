import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {applyHeroDamage,grantLastStand} from '../battle-hp-damage.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function assertShieldDamageEvent(event){
 assert.ok(Number.isSafeInteger(event.absorbed)&&event.absorbed>=0,'absorption is whole-point and nonnegative');
 assert.ok(event.absorbed<=Math.floor(event.rawDamage*7/10),'bot/live shield cannot absorb more than 70%');
 // Son Kale already protects a living target at 1 HP for one lethal hit. That
 // explicit guard is not full shield absorption; ordinary zero damage is invalid.
 assert.ok(event.value>0||(event.value===0&&event.guardTriggered===true),'positive damage must reach the target unless Son Kale protects 1 HP: '+JSON.stringify(event));
 assert.ok(event.value+event.absorbed<=event.rawDamage,'HP damage excludes absorbed and overkill damage');
}

test('live shield event invariant permits the explicit 1 HP Last Stand guard, never ordinary zero damage',()=>{
 const target={hp:1,maxHp:100,shield:1000};grantLastStand(target,1);
 const hit=applyHeroDamage(target,100,{round:1}),event={...hit,value:hit.damage};
 assert.equal(target.hp,1);assert.equal(event.value,0);assert.equal(event.guardTriggered,true);assertShieldDamageEvent(event);
 assert.throws(()=>assertShieldDamageEvent({...event,guardTriggered:false}),/positive damage/);
 assert.throws(()=>assertShieldDamageEvent({...event,guardTriggered:'true'}),/positive damage/);
 assert.throws(()=>assertShieldDamageEvent({...event,value:-1}),/positive damage/);
 assert.throws(()=>assertShieldDamageEvent({...event,absorbed:71}),/more than 70%/);
 assertShieldDamageEvent({rawDamage:100,absorbed:70,value:30});
});

// Paid live-combat/receipt workflow is retained in
// tools/test-postgres-bot-live.mjs, guarded to a disposable real PostgreSQL DB.
// This no-DB HTTP process must never bypass durable admission for test convenience.
test('noDB bot entries fail closed; 60-second matching offers require consent and cancel without charge',{timeout:15000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['--import','./tests/fixtures/fast-live-clock.mjs','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);const base='http://127.0.0.1:'+port;
 const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:response.status,body:await response.json()}};
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await delay(40)}assert.ok(ready,logs);
  const info=await(await fetch(base+'/api/info')).json();assert.equal(info.botEconomy.available,false);assert.equal(info.botEconomy.entryGold,50);
  const auth=await post('/api/auth/guest',{name:'Bot Storage Test'});assert.equal(auth.status,200);assert.match(auth.body.user.sub,/^guest:/);const identity={authToken:auth.body.authToken};const before=(await post('/api/wallet',identity)).body;assert.equal((await post('/api/auth/check',identity)).body.user.sub,auth.body.user.sub,'guest retry journal retains stable account scope after reconnect');
  for(const difficulty of ['easy','medium','hard'])for(let retry=0;retry<2;retry++){
   const denied=await post('/api/bot',{...identity,difficulty,botTermsVersion:'bot-fixed-v1',requestId:'12345678-1234-4234-8234-123456789abc'});assert.equal(denied.status,503);assert.equal(denied.body.room,undefined);assert.equal(denied.body.token,undefined);
  }
  assert.deepEqual((await post('/api/wallet',identity)).body,before);
  const matching=await post('/api/match',identity);assert.equal(matching.status,200);const seat={...identity,code:matching.body.room.code,token:matching.body.token};let room=matching.body.room;assert.equal(room.phase,'matching');
  for(let i=0;room.phase==='matching'&&i<100;i++){await delay(40);room=(await post('/api/state',seat)).body.room;}
  assert.equal(room.phase,'bot_offer');assert.equal(room.players[1],null);assert.equal(room.entryPaid,false);assert.deepEqual((await post('/api/wallet',identity)).body,before);
  const accept=await post('/api/bot-accept',{...seat,difficulty:'easy',botTermsVersion:'bot-fixed-v1',expectedMatchId:room.matchId,requestId:'12345678-1234-4234-8234-123456789abc'});assert.equal(accept.status,503);
  assert.equal((await post('/api/room/detach',seat)).status,200);assert.equal((await post('/api/state',seat)).body.room.phase,'cancelled');await delay(600);assert.equal((await post('/api/state',seat)).body.room.phase,'cancelled');assert.deepEqual((await post('/api/wallet',identity)).body,before);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
