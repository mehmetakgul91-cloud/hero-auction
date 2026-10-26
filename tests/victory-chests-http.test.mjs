import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFileSync} from 'node:fs';
async function withServer(flags,run){
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATABASE_URL:'',PORT:String(port),COMMANDER_TEST_GUEST_MODE:'1',HERO_DIAMONDS_ENABLED:'0',HERO_MAGIC_DUST_ENABLED:'0',HERO_VICTORY_CHESTS_ENABLED:'0',HERO_DIAMOND_EXCHANGE_ENABLED:'0',HERO_DIAMOND_SIGNUP_BONUS_ENABLED:'0',HERO_LOGIN_REWARDS_ENABLED:'0',...flags},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);const base='http://127.0.0.1:'+port;
 const post=async(path,body)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()}};
 try{let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,30));}assert.ok(ready,logs);await run({post,base,info:await(await fetch(base+'/api/info')).json()});}
 finally{child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(r,2000).unref()})}
}
test('flagsOFF wallet keeps actualgold and unavailabledust/diamonds, no fabricatedzero or grantendpoint',async()=>{
 await withServer({},async({post,info})=>{
  assert.equal(info.victoryChests.enabled,false);assert.equal(info.victoryChests.available,false);
  const auth=(await post('/api/auth/guest',{name:'Chest Off Test'})).body;const token={authToken:auth.authToken};
  const wallet=(await post('/api/wallet',token)).body;assert.equal(wallet.gold,500);assert.equal(wallet.diamonds,null);assert.equal(wallet.magicDust,null);assert.equal(wallet.currencies.magicDust.available,false);
  for(const path of ['/api/victory-chest/claim','/api/victory-chest/open','/api/magic-dust/grant'])for(let i=0;i<2;i++){const forged=await post(path,{...token,winner:0,matchId:'123:1:1000',gold:120,magicDust:5,diamonds:1});assert.ok(forged.status>=400);}
  assert.deepEqual((await post('/api/wallet',token)).body,wallet);assert.equal((await post('/api/wallet',{})).status,401);
 });
});
test('chest requested withoutdependencies/schema blocks actualentry beforecharge; bottraining unaffected',async()=>{
 for(const flags of [{HERO_VICTORY_CHESTS_ENABLED:'1'},{HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1',HERO_VICTORY_CHESTS_ENABLED:'1'}])await withServer(flags,async({post,info})=>{
  const a=(await post('/api/auth/guest',{name:'Chest Missing A'})).body,b=(await post('/api/auth/guest',{name:'Chest Missing B'})).body;
  const created=await post('/api/create',{authToken:a.authToken});assert.equal(created.status,200);
  const join=await post('/api/join',{authToken:b.authToken,code:created.body.room.code});assert.equal(join.status,503);assert.match(join.body.error,/Zafer sandığı/);
  for(const p of [a,b]){const wallet=(await post('/api/wallet',{authToken:p.authToken})).body;assert.equal(wallet.gold,500);assert.equal(wallet.magicDust,null);assert.equal(wallet.diamonds,null);}
  const bot=await post('/api/bot',{authToken:b.authToken,difficulty:'easy'});assert.equal(bot.status,200);assert.equal(bot.body.room.mode,'bot');assert.equal(bot.body.room.victoryChest,null);assert.equal(bot.body.room.victoryChestPending,false);assert.equal(info.victoryChests.available,false);
 });
});
test('server wires only authoritative settle and ownerprojection; all paid entry paths preflight',()=>{
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');assert.match(source,/function settleFinishedMatch[\s\S]*eligibleVictory\(r,winner\)/);assert.match(source,/async function chargeEntry\(accountIds,matchId\)\{requireVictoryChestStorage\(\)/);assert.match(source,/async function commitInvitationJoin\(invite,r,user\)\{\s*requireVictoryChestStorage\(\)/);assert.match(source,/r\.battleSettlementPending\|\|r\.victoryChestPending/);assert.match(source,/room\.victoryChestReceipt=receipt;room\.victoryChestPending=false/);assert.match(source,/result:sync\.result\?\{\.\.\.sync\.result,arenaPresentation:roomArenaPresentation\(room\),\.\.\.victoryChestView\(room,seat\)/);assert.match(source,/readMagicDustBalance\(database,user\.sub\)/);
});
