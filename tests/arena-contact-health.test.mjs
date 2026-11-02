import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createArenaContactHealth} from '../public/arena-contact-health.js';
import {createHeroAttackPlayer} from '../public/hero-attack-effects.js';
function harness({special=false,splash=0,motion=true,time=850,missing=false}={}){
 let now=0,serial=0,displayed=null,plays=0,contacts=0;const tasks=new Map(),renders=[];
 const setTimer=(fn,ms)=>{tasks.set(++serial,{fn,at:now+ms});return serial},clearTimer=id=>tasks.delete(id);
 const advance=ms=>{const end=now+ms;for(let i=0;i<10000;i++){const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=end;};
 const el=(id)=>({id,dead:false,isConnected:true,children:[],style:{setProperty(){}},setAttribute(){},append(n){this.children.push(n)},remove(){this.removed=true},querySelector(){return null},getBoundingClientRect(){return {left:id==='a'?0:200,top:0,width:64,height:64}}});
 const nodes=new Map(['a','b','c','d'].map(id=>[id,el(id)]));for(const node of nodes.values())node.classList={contains:()=>node.dead};
 const document={body:el('body'),createElement:()=>el('fx')};
 const player=createHeroAttackPlayer({document,clock:()=>now,setTimer,clearTimer});
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 const start=source.indexOf('function animateLiveCast('),end=source.indexOf('const liveContactHealth=',start);
 let animateLiveCast;
 const context={animateMove:(e,callback)=>{
  if(missing)return;
  if(!['normal','special','splash'].includes(e.damageType))return;
  return player.play({actor:nodes.get(e.actor),target:nodes.get(e.target),hero:{role:'energy'},kind:'magic',castKey:e.version,special:e.damageType==='special',splash:e.damageType==='splash',time,onImpact:()=>{contacts++;callback();}});
 },capture:fn=>animateLiveCast=fn};
 runInNewContext(source.slice(start,end)+'\ncapture(animateLiveCast)',context);
 const controller=createArenaContactHealth({setTimer,clearTimer,canAnimate:()=>motion,clearEffects:()=>player.clear(),
  play:(events,done)=>{plays++;return animateLiveCast(events,done)},render:(frame,key)=>{
   displayed=structuredClone(frame);renders.push({time:now,frame:displayed,contacts});
   for(const hero of frame.teams.flat())nodes.get(hero.id).dead=hero.hp<=0;
   if(key!==undefined)player.acceptContact(key);player.prune();
  }});
 const frame=(version,hp=80,extra={})=>({version,round:1,teams:[[{id:'a',hp:100,maxHp:100}],[...['b','c','d'].slice(0,splash+1).map(id=>({id,hp,maxHp:100}))]],events:[{actor:'a',target:'b',side:0,version,action:'attack',damageType:special?'special':'normal',value:100-hp},...['c','d'].slice(0,splash).map(id=>({actor:'a',target:id,side:0,version,action:'attack',damageType:'splash',value:100-hp}))],...extra});
 const base=frame(0,100,{events:[]});controller.receive(base);
 return {controller,player,nodes,tasks,renders,advance,frame,base,get displayed(){return displayed},get plays(){return plays},get contacts(){return contacts}};
}
for(const options of [{},{special:true},{special:true,splash:2},{time:450},{time:1500}])test('live HP waits for actual contact '+JSON.stringify(options),()=>{
 const h=harness(options),expected=Math.round((options.special?360:240)*Math.max(.8,Math.min(1.15,(options.time||850)/850)))+Math.round((options.special?480:360)*Math.max(.8,Math.min(1.15,(options.time||850)/850)));
 const next=h.frame(1);h.controller.receive(next);
 assert.equal(h.displayed.teams[1][0].hp,100);assert.equal(next.teams[1][0].hp,80);
 h.advance(expected-1);assert.equal(h.contacts,0);assert.equal(h.displayed.teams[1][0].hp,100);
 h.advance(1);assert.equal(h.contacts,1+(options.splash||0));assert.equal(h.displayed.teams[1][0].hp,80);assert.equal(h.renders.at(-1).time,expected);assert.equal(h.controller.pending,false);
 h.advance(3000);assert.equal(h.renders.length,2);assert.equal(h.player.size,0);assert.equal(h.tasks.size,0);
});
test('lethal multi-target contact commits once after all contacts and preserves the final impact tail',()=>{
 const h=harness({special:true,splash:2});h.controller.receive(h.frame(1,0,{finished:true,winner:0}));h.advance(839);
 assert.equal(h.displayed.finished,undefined);assert.equal(h.nodes.get('b').dead,false);
 h.advance(1);assert.equal(h.contacts,3);assert.equal(h.displayed.finished,true);assert.equal(h.renders.length,2);
 assert.equal(h.player.size,1);assert.ok(h.player.remaining>=1060);h.advance(1000);assert.equal(h.player.size,1);
 h.advance(200);assert.equal(h.player.size,0);
});
test('same/older snapshot never replays or prematurely commits pending attack',()=>{
 const h=harness();h.controller.receive(h.frame(1));h.advance(200);h.controller.receive(h.frame(1));h.controller.receive(h.frame(0));
 assert.equal(h.plays,1);assert.equal(h.displayed.version,0);h.advance(400);assert.equal(h.displayed.version,1);assert.equal(h.renders.length,2);
});
test('burst and version gaps settle exact latest snapshot, never invent intermediate damage',()=>{
 const h=harness();const frame=h.frame(3,23);frame.events=[...h.frame(1).events,...h.frame(2).events,...frame.events];
 h.controller.receive(frame);assert.equal(h.plays,0);assert.deepEqual(h.displayed,frame);h.advance(3000);assert.equal(h.contacts,0);
 h.controller.receive(h.frame(5,9));assert.equal(h.plays,0);assert.equal(h.displayed.teams[1][0].hp,9);
});
test('new commander snapshot supersedes in-flight hero without stale damage or resurrection',()=>{
 const h=harness();h.controller.receive(h.frame(1,0));h.advance(200);
 const commander=h.frame(2,50,{events:[{actor:'commander:0',version:2,action:'commander-support-ultimate'}]});h.controller.receive(commander);
 assert.deepEqual(h.displayed.teams,commander.teams);assert.deepEqual(h.displayed.events.map(e=>e.version),[1,2]);assert.equal(h.controller.pending,false);assert.equal(h.player.size,0);
 h.advance(3000);assert.equal(h.displayed.teams[1][0].hp,50);assert.equal(h.contacts,0);
});
test('hidden/reduced motion/missing target never delays authority display',()=>{
 for(const options of [{motion:false},{missing:true}]){
  const h=harness(options);h.controller.receive(h.frame(1));assert.equal(h.displayed.version,1);assert.equal(h.controller.pending,false);h.advance(3000);assert.equal(h.renders.length,2);
 }
});
test('hide/disconnect settles newest pending; rematch reset discards old callbacks',()=>{
 const h=harness();h.controller.receive(h.frame(1));h.advance(100);h.controller.settle();assert.equal(h.displayed.version,1);assert.equal(h.player.size,0);h.advance(3000);assert.equal(h.renders.length,2);
 h.controller.receive(h.frame(2));h.advance(100);h.controller.reset();h.player.clear();h.controller.receive(h.base);h.advance(3000);assert.equal(h.displayed.version,0);assert.equal(h.displayed.teams[1][0].hp,100);
 h.controller.receive(h.frame(1));h.advance(600);assert.equal(h.displayed.version,1);
});
test('removed target has bounded fallback, with no stale impact',()=>{
 const h=harness();h.controller.receive(h.frame(1));h.nodes.get('b').isConnected=false;h.advance(600);assert.equal(h.contacts,0);assert.equal(h.displayed.version,0);
 h.advance(80);assert.equal(h.displayed.version,1);assert.equal(h.controller.pending,false);assert.equal(h.player.size,0);
});
test('initial reconnect settles snapshot without pretending to animate prior unseen health',()=>{
 const h=harness();h.controller.reset();const next=h.frame(12,7);h.controller.receive(next);assert.equal(h.plays,0);assert.deepEqual(h.displayed,next);
});
test('production transport shares only visual coordination while commander authority stays immediate',()=>{
 const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
 const source=read('commander-experimental.js');
 assert.ok(source.indexOf('state=data;')<source.indexOf("'heroarena:experimental-round-end'"));
 assert.match(source,/events:data.events\|\|\[\],presentation/);
 assert.match(source,/teams:data.teams,finished:data.finished,presentation/);
 assert.match(read('commander-round-playback.js'),/if\(presentation\?\.managed\)return/);
 const preview=read('battle-preview.js');assert.match(preview,/e.detail.presentation.managed=true;liveContactHealth.receive\(e.detail\);return/);
 assert.match(preview,/heroAttacks.acceptContact\(e.detail.presentation.castKey\)/);
});
test('same-version finished metadata survives both settled and in-flight presentation',()=>{
 const h=harness();h.controller.receive(h.frame(1));h.advance(200);h.controller.receive(h.frame(1,80,{finished:true,winner:0}));
 assert.equal(h.displayed.finished,undefined);h.advance(400);assert.equal(h.displayed.finished,true);assert.equal(h.displayed.winner,0);assert.equal(h.plays,1);
 const f=harness();f.controller.receive(f.frame(1));f.advance(600);f.controller.receive(f.frame(1,80,{finished:true,winner:0}));assert.equal(f.displayed.finished,true);assert.equal(f.plays,1);
});
test('nonattack next snapshot preserves earlier contact tail at normal cadence',()=>{
 const h=harness();h.controller.receive(h.frame(1));h.advance(1100);assert.equal(h.player.size,1);
 h.controller.receive(h.frame(2,80,{events:[{actor:'a',version:2,action:'round-start'}]}));assert.equal(h.player.size,1);assert.equal(h.player.remaining,380);h.advance(400);assert.equal(h.player.size,0);
});
test('pagehide settlement retains final result before reset, even if poller already stopped',()=>{
 const h=harness();h.controller.receive(h.frame(1,0,{finished:true,winner:0}));h.advance(50);
 h.controller.settle();h.controller.reset();assert.equal(h.displayed.finished,true);assert.equal(h.displayed.teams[1][0].hp,0);h.advance(3000);assert.equal(h.renders.length,2);
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');assert.match(source,/addEventListener\('pagehide',\(\)=>\{liveContactHealth.settle\(\);liveContactHealth.reset\(\)\}/);
});
test('single-cast heal/shield/stun/delay cues remain while their snapshots apply immediately',()=>{
 for(const action of ['heal','shield','stun-skip','delay']){
  let plays=0,rendered=null;const controller=createArenaContactHealth({render:f=>rendered=f,play:()=>{plays++},canAnimate:()=>true});
  controller.receive({version:0,teams:[[],[]],events:[]});
  const next={version:1,teams:[[],[]],events:[{version:1,actor:'a',target:'a',action}]};controller.receive(next);
  assert.equal(rendered,next);assert.equal(plays,1,action);assert.equal(controller.pending,false);
 }
});
test('visual failure falls back to exact snapshot once instead of leaving stale HP',()=>{
 let current=null,clears=0;const controller=createArenaContactHealth({render:f=>current=f,play:()=>{throw Error('missing renderer')},clearEffects:()=>clears++});
 controller.receive({version:0,teams:[[],[]],events:[]});
 const frame={version:1,teams:[[],[{hp:0}]],events:[{version:1,actor:'a',target:'b',action:'attack'}],finished:true};
 controller.receive(frame);assert.equal(current,frame);assert.equal(controller.pending,false);assert.equal(clears,2);
});
test('shipped live snapshot listener leaves displayed HP untouched until its managed contact',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 const begin=source.indexOf("window.addEventListener('heroarena:experimental-round-end',e=>{"),end=source.indexOf('const arenaArtCache=',begin);
 const handlers=new Map(),states=[[{id:'a',hp:100,maxHp:100}],[{id:'b',hp:100,maxHp:100}]],renders=[];let contact;
 const window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:e=>handlers.get(e.type)?.(e)};
 const context={window,states,timer:null,victoryRevealDone:false,feedbackVersion:0,heroAttacks:{prune(){},acceptContact(){}},render:()=>renders.push(states[1][0].hp),$:()=>({}),liveArenaMode:false,appendBattleFeedback(){},showBattleFeedback(){}};
 context.liveContactHealth=createArenaContactHealth({play:(events,done)=>{contact=done;return {arrival:600}},render:(frame,castKey)=>window.dispatchEvent({type:'heroarena:experimental-round-end',detail:{...frame,presentation:{commit:true,castKey}}}),setTimer:()=>0,clearTimer(){}});
 runInNewContext(source.slice(begin,end),context);
 const send=(version,hp,events=[])=>{const presentation={};window.dispatchEvent({type:'heroarena:experimental-round-end',detail:{round:1,version,teams:[[...states[0].map(h=>({...h}))],[{id:'b',hp,maxHp:100}]],events,presentation}});assert.equal(presentation.managed,true)};
 send(0,100);send(1,80,[{version:1,actor:'a',target:'b',action:'attack',value:20}]);assert.deepEqual(renders,[100]);assert.equal(states[1][0].hp,100);
 contact();assert.deepEqual(renders,[100,80]);assert.equal(states[1][0].hp,80);
});
test('superseding snapshot retains acknowledged cast feedback without duplicate casts or HP rebound',()=>{
 const h=harness();h.controller.receive(h.frame(1,70));h.advance(100);h.controller.receive(h.frame(2,60));
 assert.deepEqual(h.displayed.events.map(e=>e.version),[1,2]);assert.equal(h.displayed.teams[1][0].hp,60);assert.equal(h.plays,1);
 h.advance(3000);assert.equal(h.contacts,0);assert.equal(h.displayed.teams[1][0].hp,60);
 const duplicate=harness();const previous=duplicate.frame(1);duplicate.controller.receive(previous);const newer=duplicate.frame(2);newer.events.unshift(...previous.events);duplicate.controller.receive(newer);
 assert.deepEqual(duplicate.displayed.events.map(e=>e.version),[1,2]);
});
