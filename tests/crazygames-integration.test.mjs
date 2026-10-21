import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {crazyGamesSource} from '../crazygames-build.js';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('submission HTML removes external ads/login before execution and stays inside platform',()=>{
 const original=read('public/index.html'),page=crazyGamesSource(original,'.html');
 assert.match(original,/pagead2\.googlesyndication/);
 assert.doesNotMatch(page,/<script[^>]+(?:pagead2\.googlesyndication|accounts\.google|ad-rewards)/);
 assert.match(page,/src="\/crazygames\/platform.js"/);
 assert.match(page,/src="\/crazygames\/app.js/);
 assert.match(page,/href="\/crazygames\/kahramanlar.html"/);
 assert.equal(crazyGamesSource('binary untouched','.png'),'binary untouched');
});
test('platform storage and arena/rematch links are isolated; API endpoints are unchanged',()=>{
 const script=crazyGamesSource(read('public/battle-preview.js'),'.js');
 assert.match(script,/'hero-auction-cg-login'/);
 assert.doesNotMatch(script,/'hero-auction-login'/);
 assert.match(script,/location.replace\('\/crazygames\/'\)/);
 assert.match(script,/\/crazygames\/battle-preview.html\?room=arena/);
 assert.match(script,/fetch\('\/api\/rematch'/);
 assert.match(script,/import\('\/crazygames\/commander-experimental.js/);
 assert.match(crazyGamesSource(read('public/battle-preview.html'),'.html'),/href="\/crazygames\/"/);
});
function harness(environment='crazygames',fail=false){
 const calls=[],listeners={};let script;
 const sdk={environment,init:async()=>{if(fail)throw Error('offline')},game:{settings:{muteAudio:true,disableChat:true},loadingStart:()=>calls.push('loadingStart'),loadingStop:()=>calls.push('loadingStop'),gameplayStart:()=>calls.push('start'),gameplayStop:()=>calls.push('stop'),addSettingsChangeListener:fn=>{listeners.settings=fn}},ad:{requestAd:()=>{throw Error('Basic Launch must not request ads')}}};
 const window={CrazyGames:{SDK:sdk},dispatchEvent:()=>{}};
 const document={head:{append:x=>{script=x}},createElement:()=>({}),documentElement:{classList:{toggle(){}}}};
 vm.runInNewContext(read('public/platform.js'),{window,document,console,CustomEvent:class{},setTimeout:()=>1,clearTimeout(){}});
 return {platform:window.HeroPlatform,script,calls,listeners,sdk,window};
}
test('SDK initializes before calls; queued gameplay is reported once and respects settings',async()=>{
 const h=harness();h.platform.gameplay(true);h.platform.loaded();assert.deepEqual(h.calls,[]);
 await h.script.onload();await h.platform.ready;
 assert.deepEqual(h.calls,['loadingStart','loadingStop','start']);
 h.platform.gameplay(true);h.platform.gameplay(false);h.platform.gameplay(false);
 assert.deepEqual(h.calls,['loadingStart','loadingStop','start','stop']);
 assert.equal(h.platform.muteAudio,true);assert.equal(h.platform.disableChat,true);
 h.listeners.settings({muteAudio:false,disableChat:false});assert.equal(h.platform.muteAudio,false);
});
test('disabled SDK and network failure leave game available without SDK calls',async()=>{
 for(const [env,fail] of [['disabled',false],['crazygames',true]]){const h=harness(env,fail);h.platform.gameplay(true);await h.script.onload();await h.platform.ready;assert.deepEqual(h.calls,[])}
 const h=harness();h.script.onerror();await h.platform.ready;assert.deepEqual(h.calls,[]);
});
test('Basic Launch cannot request advertisements or grant a completion reward',async()=>{
 const h=harness();await h.script.onload();const result=await h.platform.requestRewarded();assert.equal(result.completed,false);assert.equal(result.reason,'adsDisabledBasicLaunch');
});

test('room presence advertises only open friend lobbies and clears after leaving',async()=>{
 const h=harness(),updates=[];
 h.sdk.game.updateRoom=value=>updates.push(JSON.parse(JSON.stringify(value)));
 h.sdk.game.leftRoom=()=>updates.push(null);
 await h.script.onload();
 const lobby={code:'123',mode:'friend',phase:'waiting',players:[{},null]};
 h.platform.setRoom(lobby);h.platform.setRoom(lobby);
 h.platform.setRoom({...lobby,phase:'auction',players:[{},{}]});
 h.platform.setRoom({...lobby,mode:'bot'});h.platform.setRoom(null);
 assert.deepEqual(updates,[null,{roomId:'123',isJoinable:true,inviteParams:{roomCode:'123'}},{roomId:'123',isJoinable:false,inviteParams:{roomCode:'123'}},null]);
});
test('startup invitation, in-game join listener, instant flag and invite links use SDK',async()=>{
 const h=harness(),joined=[];
 h.sdk.game.inviteParams={roomCode:'123'};h.sdk.game.isInstantMultiplayer=true;
 h.sdk.game.addJoinRoomListener=fn=>{h.listeners.join=fn};
 h.sdk.game.inviteLink=params=>'https://www.crazygames.com/game/test?roomCode='+params.roomCode;
 await h.script.onload();
 assert.equal(h.platform.takeInviteCode(),'123');assert.equal(h.platform.takeInviteCode(),null);
 assert.equal(h.platform.instantMultiplayer,true);
 h.platform.onJoin(code=>joined.push(code));h.listeners.join({roomCode:'456'});h.listeners.join({roomCode:'../../bad'});
 assert.deepEqual(joined,['456']);assert.equal(await h.platform.inviteLink('123'),'https://www.crazygames.com/game/test?roomCode=123');
});
test('identity uses fresh opaque tokens; only unauthenticated errors become guests',async()=>{
 const h=harness();let sequence=0;
 h.sdk.user={isUserAccountAvailable:true,getUserToken:async()=>String(++sequence),addAuthListener:fn=>{h.listeners.auth=fn}};
 let changes=0;h.window.dispatchEvent=()=>{changes++};
 await h.script.onload();
 assert.equal((await h.platform.identity()).credential,'1');assert.equal((await h.platform.identity()).credential,'2');
 h.sdk.user.getUserToken=async()=>{throw {code:'userNotAuthenticated'}};
 assert.equal((await h.platform.identity()).kind,'guest');
 h.sdk.user.getUserToken=async()=>{throw {code:'unexpectedError'}};
 await assert.rejects(h.platform.identity(),/CrazyGames hesabına/);
 changes=0;h.platform.watchAccount();h.listeners.auth();assert.equal(changes,1);
});
