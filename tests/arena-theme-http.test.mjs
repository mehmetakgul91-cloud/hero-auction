import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFileSync} from 'node:fs';
import {ARENA_THEME_IDS} from '../public/arena-theme.js';
import {crazyGamesSource} from '../crazygames-build.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('real HTTP room, both seats, lane edits, rematch, bot, preview-room and CG retain only server-owned cosmetic metadata',{timeout:30000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--import','./tests/fixtures/fast-live-clock.mjs','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1',HERO_DIAMONDS_ENABLED:'0',HERO_LOGIN_REWARDS_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const request=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()}};
 const post=async(path,body)=>{const result=await request(path,body);assert.equal(result.status,200,JSON.stringify(result));return result.body};
 const get=async(path,params={})=>{const response=await fetch(base+path+'?'+new URLSearchParams(params));assert.equal(response.status,200);return response.json()};
 const checkMeta=value=>{assert.deepEqual(Object.keys(value).sort(),['matchKey','theme','version']);assert.equal(value.version,1);assert.ok(ARENA_THEME_IDS.includes(value.theme));};
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await delay(40)}assert.ok(ready,logs);
  const players=[];for(let i=0;i<2;i++){const auth=await post('/api/auth/guest',{name:'Cosmetic Theme '+i});players.push({authToken:auth.authToken})}
  const forged={version:1,matchKey:'evil',theme:'invalid'};
  const created=await post('/api/create',{...players[0],arenaPresentation:forged}),code=created.room.code;players[0].token=created.token;
  const initial=created.room.arenaPresentation;checkMeta(initial);assert.match(initial.matchKey,new RegExp('^'+code+':1:\\d+$'));
  Object.assign(forged,{version:1,matchKey:initial.matchKey,theme:ARENA_THEME_IDS.find(theme=>theme!==initial.theme)}); // Even valid-looking client metadata cannot select or change the shared scene.
  const joined=await post('/api/join',{code,...players[1],arenaPresentation:forged});players[1].token=joined.token;assert.deepEqual(joined.room.arenaPresentation,initial);
  assert.equal((await request('/api/state',{code,...players[0],token:'wrong'})).status,403);
  let previous=null;
  for(let match=0;match<3;match++){
   let room=(await post('/api/state',{code,...players[0]})).room;const meta=room.arenaPresentation;checkMeta(meta);
   if(previous){assert.notEqual(meta.matchKey,previous.matchKey);assert.notEqual(meta.theme,previous.theme,'three-theme rematch excludes the previous approved scene');}
   Object.assign(forged,{version:1,matchKey:meta.matchKey,theme:ARENA_THEME_IDS.find(theme=>theme!==meta.theme)});
   for(let i=0;room.phase==='auction'&&i<40;i++){room=(await post('/api/pass',{code,...players[room.turn],arenaPresentation:forged})).room;assert.deepEqual(room.arenaPresentation,meta)}
   assert.equal(room.phase,'finished');
   const views=await Promise.all(players.map(player=>get('/api/battle-auction-team',{code,token:player.token})));
   for(const view of views){assert.deepEqual(view.arenaPresentation,meta);assert.equal(meta.matchKey,code+':'+view.preparation.matchKey)}
   for(let seat=0;seat<2;seat++){
    const formation={code,token:players[seat].token,...views[seat].preparation,lanes:Array(5).fill(seat?'front':'back'),arenaPresentation:forged};
    await post('/api/battle-auction-formation',formation);
    assert.deepEqual((await get('/api/battle-auction-team',{code,token:players[seat].token})).arenaPresentation,meta);
    const response=await post('/api/battle-auction-preview',formation);assert.deepEqual(response.arenaPresentation,meta);
   }
   const snapshots=await Promise.all(players.map(player=>get('/api/battle-auction-preview',{code,token:player.token})));
   for(const view of snapshots){assert.equal(view.started,true);assert.deepEqual(view.result.arenaPresentation,meta)}
   assert.deepEqual(snapshots[0].result.teams,[...snapshots[1].result.teams].reverse(),'orientation remains gameplay-only');
   for(let repeat=0;repeat<3;repeat++)for(const player of players)assert.deepEqual((await post('/api/state',{code,...player})).room.arenaPresentation,meta);
   for(const player of players)await post('/api/battle-auction-complete',{code,token:player.token});
   if(match<2){const pending=await post('/api/rematch',{code,...players[0]});assert.deepEqual(pending.room.arenaPresentation,meta);await post('/api/rematch',{code,...players[1],arenaPresentation:forged});}
   previous=meta;
  }
  const botAuth=await post('/api/auth/guest',{name:'Cosmetic Bot'}),bot=await post('/api/bot',{authToken:botAuth.authToken,difficulty:'easy',arenaPresentation:forged});checkMeta(bot.room.arenaPresentation);
  for(let n=0;n<3;n++)assert.deepEqual((await post('/api/state',{code:bot.room.code,token:bot.token,authToken:botAuth.authToken})).room.arenaPresentation,bot.room.arenaPresentation);
  const p0=await post('/api/battle-room',{action:'create',arenaPresentation:forged}),p1=await post('/api/battle-room',{action:'join',code:p0.code});checkMeta(p0.arenaPresentation);assert.deepEqual(p0.arenaPresentation,p1.arenaPresentation);
  for(const p of [p0,p1])await post('/api/battle-room',{action:'ready',code:p.code,token:p.token,positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roles:['tank','tank','tank','tank','assassin'],arenaPresentation:forged});
  for(const p of [p0,p1]){const view=await get('/api/battle-room',{code:p.code,token:p.token});assert.deepEqual(view.arenaPresentation,p0.arenaPresentation);assert.deepEqual(view.result.arenaPresentation,p0.arenaPresentation);}
  const normal=await fetch(base+'/arena-theme.js'),cg=await fetch(base+'/crazygames/arena-theme.js');assert.equal(normal.status,200);assert.equal(cg.status,200);assert.equal(await normal.text(),await cg.text());
  for(const prefix of ['', '/crazygames'])for(const file of ['ruins-premium.webp','savanna-premium.webp','fjord-premium.webp','savanna-dust.webp']){
   const path='/images/arena-themes/'+file,response=await fetch(base+prefix+path);
   assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/webp/);
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),readFileSync(new URL('../public'+path,import.meta.url)));
  }
  for(const prefix of ['', '/crazygames'])for(const module of ['arena-weather.js','arena-dust.js','arena-forest-gust.js','arena-portrait-weather.js','arena-viking-layout.js','arena-viking-weather.js']){
   const response=await fetch(base+prefix+'/'+module);assert.equal(response.status,200);const source=readFileSync(new URL('../public/'+module,import.meta.url),'utf8');assert.equal(await response.text(),prefix?crazyGamesSource(source,'.js'):source);
  }
  for(const prefix of ['', '/crazygames'])for(const file of ['forest-leaf.svg','viking-snow-far.svg','viking-snow-middle.svg','viking-snow-near.svg','viking-snow-gust.svg']){const path='/images/arena-themes/'+file,response=await fetch(base+prefix+path);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/svg\+xml/);assert.equal(await response.text(),readFileSync(new URL('../public'+path,import.meta.url),'utf8'));}
  const cgBattle=await fetch(base+'/crazygames/battle-preview.js');assert.match(await cgBattle.text(),/from '\/crazygames\/arena-theme\.js'/);
  assert.match(await(await fetch(base+'/crazygames/battle-preview.js')).text(),/from '\/crazygames\/arena-weather\.js'/);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});
