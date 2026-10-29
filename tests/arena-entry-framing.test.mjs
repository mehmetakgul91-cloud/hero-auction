import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {mountArenaViewport,refreshArenaViewport} from '../public/arena-viewport.js';
const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
const block=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
const buildSource=block('async function build(overrideResult){','function battleEventText(');
const enterSource=block('function enterArenaWithoutReload(url){','async function lockFormation(');
const lockSource=block('async function lockFormation(){','function startPreparation(');
const directEntry=source.match(/^if\(arenaMode\)\{document\.body\.classList\.add\('arena-room'\)[^\n]+/m)?.[0];
assert.ok(directEntry);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({auctionMode=false,initiallyVisible=false,fetchImpl=null,renderError=false}={}){
 const calls=[],frames=new Map(),intervals=new Map(),nodes=new Map(),classes=new Set(['arena-room']),properties=new Map();let frameId=0,intervalId=0,notify=()=>{};
 function node(id){if(nodes.has(id))return nodes.get(id);let hidden=id==='battle-arena'?!initiallyVisible:true;const item={disabled:false,textContent:'',replaceChildren(){calls.push('replace:'+id)},click(){calls.push('click:'+id)}};Object.defineProperty(item,'hidden',{get:()=>hidden,set(value){hidden=value;calls.push('hidden:'+id+':'+value);if(id==='battle-arena')notify();}});nodes.set(id,item);return item;}
 const body={classList:{contains:n=>classes.has(n),add:n=>classes.add(n),remove:n=>classes.delete(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n)}};
 const document={body,documentElement:{style:{setProperty:(k,v)=>{properties.set(k,v);calls.push('css:'+k+':'+v)},removeProperty:k=>properties.delete(k)}},getElementById:node,querySelector:node};
 const window=Object.assign(new EventTarget(),{innerHeight:800,visualViewport:Object.assign(new EventTarget(),{height:700,scale:1}),
  MutationObserver:class{constructor(fn){notify=fn;}observe(){}disconnect(){notify=()=>{}}},
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>{calls.push('cancel-frame');frames.delete(id)},scrollTo:()=>calls.push('scroll'),
  HeroPlatform:{gameplay:v=>calls.push('gameplay:'+v),loaded:()=>calls.push('loaded')},dispatchEvent:event=>{calls.push('event:'+event.type);return true;}});
 const dispose=mountArenaViewport({window,document});calls.length=0;
 const context={document,window,$:node,arenaMode:true,auctionMode,auctionCode:'ROOM /',auctionToken:'seat&fake',multiplayerCode:null,multiplayerArenaKey:null,preparationMatchKey:'1:123',previewMusicMatchKey:'preview:123',
  arenaWeatherReady:true,arenaWeatherPageHidden:false,liveArenaMode:false,battlePresentationFinished:false,leavingBattle:false,timer:null,states:[],events:[],cursor:0,finalResult:null,
  victoryPendingTimer:null,victoryRevealTimer:null,victoryRevealDone:false,prepTimer:null,prepDone:false,prepSubmitting:false,auctionLoaded:true,battlePoll:null,
  positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roleAt:()=> 'tank',
  history:{replaceState(...args){calls.push(['history',...args])}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
  setInterval(fn,ms){intervals.set(++intervalId,{fn,ms});return intervalId},clearInterval:id=>intervals.delete(id),clearTimeout:()=>{},
  combatEffects:{clear:()=>calls.push('clear-combat-effects')},resetVictoryChestPresentation:()=>calls.push('reset-chest'),stop:()=>calls.push('stop'),resetArenaClock:()=>calls.push('reset-clock'),
  arenaTeamRenderer:{reset:()=>calls.push('reset-renderer')},arenaWeather:{clear:()=>calls.push('clear-weather')},arenaSceneLayout:{clear:()=>calls.push('clear-layout')},
  arenaTheme:{apply(value,key){calls.push('theme');context.appliedTheme={value,key};}},renderArenaCommanderMatchup:profiles=>{calls.push('matchup');context.profiles=profiles},
  createBattleReplayHealth:()=>({apply:entry=>entry,statusSnapshot:()=>[],finish:()=>calls.push('finish-replay-health')}),
  startArenaClock:()=>calls.push('start-clock'),startArenaMusic:()=>calls.push('music'),
  refreshArenaViewport(){calls.push('fit');refreshArenaViewport({document});},
  render(){calls.push('render');assert.equal(node('battle-arena').hidden,false);assert.equal(node('arena-score').hidden,false);assert.ok(classes.has('arena-fit'));assert.equal(properties.get('--arena-viewport-height'),'700px');assert.equal(context.arenaWeatherReady,true);if(renderError)throw Error('render failed');},
  mountCommanderDock:()=>calls.push('dock'),requestArenaWakeLock:()=>calls.push('wake'),revealArenaAudio:()=>calls.push('audio'),startReplay:()=>calls.push('replay'),renderBoard:()=>calls.push('board'),startPreparation:()=>calls.push('prepare'),
  async fetch(...args){calls.push(['fetch',...args]);if(fetchImpl)return fetchImpl(...args);return {ok:true,json:async()=>({started:false,ready:[true,false]})};},
 };
 vm.createContext(context);
 return {context,calls,frames,intervals,node,classes,properties,dispose,install:text=>vm.runInContext(text,context),run:text=>vm.runInContext(text,context)};
}
const result=(live=true)=>({live,rounds:1,arenaPresentation:{version:1,matchKey:'ROOM /:1:123',theme:'fjord'},commanders:[{commanderId:'attack'},{commanderId:'defense'}],teams:[[{id:'a',name:'A',maxHp:100,hp:55,shield:8,lane:'front'}],[{id:'b',name:'B',maxHp:90,hp:40,shield:5,lane:'back'}]],log:[]});
test('real direct-reload entry branch keeps the arena hidden and mounts controls without a scene reveal',()=>{
 const f=fixture({initiallyVisible:true,auctionMode:true});f.install(directEntry);assert.equal(f.node('battle-arena').hidden,true);assert.equal(f.node('.formation').hidden,true);assert.ok(f.calls.includes('dock'));assert.ok(!f.calls.includes('render'));assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='fetch').length,0);f.dispose();
});
test('same-document entry and opponent polling preserve hidden waiting scene and existing read-only request',async()=>{
 const f=fixture({auctionMode:true});f.install(enterSource);f.context.url='/battle-preview.html?room=arena';f.run('enterArenaWithoutReload(url)');await flush();
 assert.equal(f.node('battle-arena').hidden,true);assert.equal(f.node('play').disabled,true);assert.match(f.node('message').textContent,/1\/2 hazır/);assert.equal(f.intervals.size,1);assert.equal([...f.intervals.values()][0].ms,1800);
 const requests=f.calls.filter(c=>Array.isArray(c)&&c[0]==='fetch');assert.equal(requests.length,1);assert.equal(requests[0][1],'/api/battle-auction-preview?code=ROOM%20%2F&token=seat%26fake');assert.equal(requests[0][2].cache,'no-store');assert.equal(requests[0][2].method,undefined);assert.equal(requests[0][2].body,undefined);assert.ok(!f.calls.includes('fit'));f.dispose();
});
test('ordinary preview entry remains hidden while its existing build is pending',async()=>{
 const f=fixture();f.context.build=()=>new Promise(()=>{});f.install(enterSource);f.run('enterArenaWithoutReload("/battle-preview.html?room=arena")');assert.equal(f.node('battle-arena').hidden,true);assert.equal(f.intervals.size,0);assert.ok(!f.calls.includes('render'));f.dispose();
});
test('already-entered lockFormation branch also hides before awaiting build and does not send another room command',async()=>{
 const f=fixture({initiallyVisible:true});f.context.build=()=>{assert.equal(f.node('battle-arena').hidden,true);return Promise.resolve()};f.install(lockSource);await f.run('lockFormation()');assert.equal(f.node('battle-arena').hidden,true);assert.equal(f.context.prepDone,true);assert.equal(f.context.prepSubmitting,false);assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='fetch').length,0);f.dispose();
});
test('real build hides before tearing down old geometry, then fits final HUD synchronously before rendering',async()=>{
 for(const live of [true,false]){const f=fixture({initiallyVisible:true,auctionMode:true});f.context.fixtureResult=result(live);f.install(buildSource);await f.run('build(fixtureResult)');
  const order=label=>f.calls.indexOf(label);assert.ok(order('hidden:battle-arena:true')<order('clear-layout'));assert.ok(order('theme')<order('hidden:battle-arena:false'));assert.ok(order('matchup')<order('hidden:battle-arena:false'));assert.ok(order('hidden:arena-score:false')<order('fit'));assert.ok(order('hidden:battle-arena:false')<order('fit'));assert.ok(order('fit')<order('render'));assert.ok(order('render')<order('event:heroarena:ready'));
  assert.equal(f.node('battle-arena').hidden,false);assert.equal(f.frames.size,0,'queued observer frame is cancelled by synchronous fit');assert.equal(f.context.finalResult,f.context.fixtureResult);assert.equal(f.context.states[0][0].id,'a');assert.equal(f.context.states[0][0].hp,100);assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='fetch').length,0);f.dispose();
 }
});
test('pending result fetch and not-started response cannot expose an intermediate painting',async()=>{
 let resolve;const f=fixture({initiallyVisible:true,auctionMode:true,fetchImpl:()=>new Promise(done=>resolve=done)});f.install(buildSource);const pending=f.run('build()');assert.equal(f.node('battle-arena').hidden,true);assert.ok(!f.calls.includes('render'));
 resolve({ok:true,json:async()=>({started:false,ready:[true,false]})});await pending;assert.equal(f.node('battle-arena').hidden,true);assert.equal(f.context.arenaWeatherReady,false);assert.ok(!f.calls.includes('render'));assert.match(f.node('message').textContent,/1\/2 hazır/);f.dispose();
});
test('failed result fetch and failed render both leave arena hidden and release synchronous fit',async()=>{
 for(const stage of ['fetch','render']){const f=fixture({initiallyVisible:true,auctionMode:true,fetchImpl:async()=>{throw Error('network failed')},renderError:stage==='render'});f.context.fixtureResult=result();f.install(buildSource);await f.run(stage==='fetch'?'build()':'build(fixtureResult)');
  assert.equal(f.node('battle-arena').hidden,true);assert.equal(f.context.arenaWeatherReady,false);assert.equal(f.classes.has('arena-fit'),false);assert.equal(f.properties.has('--arena-viewport-height'),false);assert.equal(f.frames.size,0);assert.match(f.node('message').textContent,/failed/);assert.ok(!f.calls.includes('event:heroarena:ready'));f.dispose();
 }
});
test('unoverridden ordinary preview retains its original GET query and does not mutate authentication or rooms',async()=>{
 const f=fixture({fetchImpl:async()=>({ok:true,json:async()=>result(false)})});f.install(buildSource);await f.run('build()');const requests=f.calls.filter(c=>Array.isArray(c)&&c[0]==='fetch');assert.equal(requests.length,1);assert.equal(requests[0][1],'/api/battle-preview?roles=tank%2Ctank%2Ctank%2Ctank%2Ctank&positions=0%2C1%2C2%2C3%2C4&lanes=front%2Cfront%2Cback%2Cback%2Cback');assert.equal(requests[0][2].method,undefined);assert.equal(requests[0][2].body,undefined);assert.equal(f.node('battle-arena').hidden,false);f.dispose();
 const viewport=readFileSync(new URL('../public/arena-viewport.js',import.meta.url),'utf8');assert.doesNotMatch(viewport,/fetch\(|localStorage|sessionStorage|authToken|\/api\//);
});
test('dock reservation is confined to fitted arena mode, keeps landscape responsiveness and introduces no zoom styling',()=>{
 const css=readFileSync(new URL('../public/battle-preview.css',import.meta.url),'utf8'),start=css.indexOf('/* Reserve the commander dock before late control initialization.');assert.ok(start>=0);const added=css.slice(start);
 assert.match(added,/\.arena-room\.arena-fit \.arena-commander-dock\{min-height:142px\}/);assert.match(added,/@media\(min-width:600px\) and \(max-height:600px\)\{\.arena-room\.arena-fit \.arena-commander-dock\{min-height:180px\}\}/);
 assert.doesNotMatch(added,/transform|scale\(|zoom:|background-size|overflow|position:fixed|height:100vh/);
});
