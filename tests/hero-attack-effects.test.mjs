import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heroAttackSignature,heroAttackTiming,playHeroAttack,createHeroAttackPlayer} from '../public/hero-attack-effects.js';
import {heroActionDuration,heroPlaybackInterval} from '../public/hero-battle-timing.js';
import {combatEffectKind,createCombatEffects} from '../public/arena-combat-effects.js';
const roster=JSON.parse(readFileSync(new URL('../battle-roster.json',import.meta.url))).characters;
test('normal attacks have distinct real roster visual signatures without inventing combat classes',()=>{
 for(const [role,signature] of [['fighter','blade'],['tank','hammer'],['assassin','dagger'],['energy','magic'],['support','light']]){
  const hero=roster.find(h=>h.role===role&&!['original:08','original:13','original:expansion-01'].includes(h.id));assert.ok(hero,role);
  assert.equal(heroAttackSignature(hero,combatEffectKind({action:'attack',damageType:'normal'},hero)),signature);
 }
 for(const id of ['original:08','original:13']){
  const hero=roster.find(h=>h.id===id);assert.ok(hero);assert.equal(heroAttackSignature(hero,combatEffectKind({action:'attack'},hero)),'arrow');
 }
 assert.equal(heroAttackSignature({role:'support'},'heal'),'heal');
 assert.equal(heroAttackSignature({role:'tank'},'shield'),'shield');
});
function setup(){
 const timers=new Map();let id=0;
 const el=()=>({children:[],style:{props:{},setProperty(k,v){this.props[k]=v}},setAttribute(){},append(n){this.children.push(n)},remove(){this.removed=true},querySelector(){return null},getBoundingClientRect(){return {left:30,top:50,width:54,height:54}}});
 const body=el(),document={body,createElement:el};
 const effects=createCombatEffects({document,maxResources:12,setTimer(fn){timers.set(++id,fn);return id},clearTimer(id){timers.delete(id)}});
 return {document,effects,timers,actor:el(),target:el()};
}
test('arrival coordinates and delayed impact match travel on normal and special attacks',()=>{
 for(const special of [false,true]){
  const h=setup();h.target.getBoundingClientRect=()=>({left:300,top:150,width:54,height:54});
  const result=playHeroAttack({...h,hero:{role:'energy'},kind:'magic',special,time:612});
  assert.equal(h.document.body.children.length,3);
  const [cast,flight,impact]=h.document.body.children;
  assert.equal(flight.style.props['--hero-dx'],'270px');assert.equal(flight.style.props['--hero-dy'],'100px');
  assert.equal(impact.style.props['--hero-delay'],result.arrival+'ms');
  assert.equal(result.arrival,result.charge+result.travel);
  assert.equal(impact.className.includes('is-special'),special);
  assert.equal(cast.style.left,'57px');assert.equal(impact.style.left,'300px');
  h.effects.clear();assert.equal(h.timers.size,0);assert.ok(h.document.body.children.every(n=>n.removed));
 }
});
test('splash and self effects do not launch extra projectiles, repeats remain bounded',()=>{
 const h=setup();
 playHeroAttack({...h,hero:{role:'support'},kind:'heal',target:h.actor});assert.equal(h.document.body.children.length,1);
 assert.equal(heroAttackTiming(650,{splash:true}).arrival,heroAttackTiming(650).arrival);
 assert.equal(heroAttackTiming(650,{self:true}).arrival,0);
 for(let i=0;i<100;i++)playHeroAttack({...h,hero:{role:'assassin'},kind:'strike',special:true});
 assert.equal(h.effects.size,12);assert.equal(h.timers.size,12);h.effects.clear();assert.equal(h.timers.size,0);
});
test('integration uses owned effects before actor movement and suppresses legacy duplicate impacts',()=>{
 const js=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.ok(js.indexOf('heroAttacks.play({')>0&&js.indexOf('heroAttacks.play({')<js.indexOf('if(!ranged)combatEffects.animate(actor'));
 assert.doesNotMatch(js,/battle-comic-banner|comicBattleCue/);
 assert.doesNotMatch(js,/combatEffects\.accent\(target|orb\.className='battle-projectile/);
 const css=readFileSync(new URL('../public/hero-attack-effects.css',import.meta.url),'utf8');
 assert.match(css,/prefers-reduced-motion:reduce/);assert.doesNotMatch(css,/infinite|z-index:100[2-9]/);
 for(const signature of ['arrow','blade','dagger','magic','hammer','heal','shield','lightning'])assert.ok(css.includes('signature-'+signature));
});

test('normal and special have distinct readable phases, bounded arrival and a held impact',()=>{
 assert.deepEqual(heroAttackTiming(850),{charge:240,travel:360,arrival:600,impact:800,total:1400});
 assert.deepEqual(heroAttackTiming(850,{special:true}),{charge:360,travel:480,arrival:840,impact:1060,total:1900});
 assert.equal(heroAttackTiming(850,{settled:true}).arrival,0);
 for(const time of [0,150,450,850,1500,Infinity]){
  const normal=heroAttackTiming(time);assert.ok(normal.total>=1120&&normal.total<=1610);
 }
 const css=readFileSync(new URL('../public/hero-attack-effects.css',import.meta.url),'utf8');
 assert.match(css,/12%,68%/); // silhouette holds, instead of fading for most of its life
});
function playerSetup(){
 const h=setup();let now=0,id=0;const timers=new Map();
 const player=createHeroAttackPlayer({document:h.document,clock:()=>now,setTimer(fn,ms){timers.set(++id,{fn,at:now+ms});return id},clearTimer(id){timers.delete(id)}});
 const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
 const play=options=>player.play({...h,hero:{role:'energy'},kind:'magic',time:850,...options});
 return {...h,player,advance,play,timers};
}
test('900ms authoritative cadence retains every normal, overlaps only bounded tails, drains without a queue',()=>{
 const h=playerSetup();
 for(let i=0;i<40;i++){
  assert.ok(h.play({castKey:i}));assert.ok(h.player.size<=2);assert.ok(h.timers.size<=6);
  h.advance(900);
 }
 h.advance(2000);assert.equal(h.player.size,0);assert.equal(h.player.remaining,0);assert.equal(h.timers.size,0);
});
test('burst eviction is whole-cast, with multi-target specials kept together',()=>{
 const h=playerSetup();
 for(let cast=0;cast<20;cast++)for(let target=0;target<5;target++)h.play({castKey:cast,special:true,splash:target>0,target:{...h.target}});
 assert.equal(h.player.size,4);assert.ok(h.timers.size<=48);
 assert.equal(h.document.body.children.filter(n=>!n.removed).length,28);
 h.player.clear();assert.equal(h.timers.size,0);assert.ok(h.document.body.children.every(n=>n.removed));
});
test('newer death cancels old travel; lethal committed hit shows impact now, without moving a dead hero',()=>{
 const h=playerSetup();let dead=false;h.target.classList={contains:()=>dead};
 h.play({castKey:1});h.advance(100);dead=true;h.player.prune();
 assert.equal(h.player.size,0);assert.equal(h.timers.size,0);
 const start=h.document.body.children.length;
 const result=h.play({castKey:2});assert.equal(result.arrival,0);
 assert.equal(h.document.body.children.length,start+1);
 assert.match(h.document.body.children.at(-1).className,/impact/);
 dead=false;h.player.prune();assert.equal(h.timers.size,0); // revival cancels the old death-tail
 h.play({castKey:3});h.target.isConnected=false;h.player.prune();assert.equal(h.timers.size,0);
});
test('route/background/reduced-motion cleanup and victory deadline cancel hero-owned resources',()=>{
 const h=playerSetup();h.play({special:true});assert.equal(h.player.remaining,1980);
 h.advance(1000);assert.equal(h.player.remaining,980);h.player.clear();assert.equal(h.player.remaining,0);
 const js=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(js,/function clearCombatPresentation\(\)\{combatEffects.clear\(\);heroAttacks.clear\(\);\}/);
 assert.doesNotMatch(js,/Date.now\(\)\+heroAttacks.remaining/);
 assert.match(js,/victoryRevealDone=true;\s*clearCombatPresentation\(\)/);
 assert.ok(heroAttackTiming(1500,{special:true}).total+80<2400);
 assert.match(js,/if\(document.hidden\)clearCombatPresentation\(\)/);
 assert.match(js,/prefers-reduced-motion: reduce.*clearCombatPresentation/);
 assert.match(js,/render\(\);\s*heroAttacks.prune\(\)/);
});

test('damage callback and contact share arrival, including special, clamped speeds, and instant impact',()=>{
 for(const options of [{},{special:true},{time:1},{time:9999},{reducedMotion:true}]){
  const h=playerSetup();let hits=0;
  const timing=h.play({...options,onImpact:()=>hits++});
  if(timing.arrival){h.advance(timing.arrival-1);assert.equal(hits,0);h.advance(1);}
  assert.equal(hits,1);h.advance(3000);assert.equal(hits,1);h.player.clear();
 }
});
test('shared cast arrival; repeated, canceled, stale and removed targets cannot emit late damage',()=>{
 const h=playerSetup();let hits=0;
 h.play({castKey:1,special:true,onImpact:()=>hits++});
 h.advance(100);
 const second=h.play({castKey:1,splash:true,target:{...h.target},onImpact:()=>hits++});
 assert.equal(second.arrival,740);h.advance(740);assert.equal(hits,2);
 assert.equal(h.play({castKey:1,special:true,onImpact:()=>hits++}),undefined);
 h.player.clear();h.advance(2000);assert.equal(hits,2);
 const stale=playerSetup();let late=0;stale.play({onImpact:()=>late++});stale.advance(5000);assert.equal(late,0);
 const removed=playerSetup();removed.play({onImpact:()=>late++});removed.target.isConnected=false;removed.advance(600);assert.equal(late,0);
 const canceled=playerSetup();canceled.play({onImpact:()=>late++});canceled.player.clear();canceled.advance(600);assert.equal(late,0);
});
test('canvas first frame and damage share one trigger; cancellation owns the latest animation frame',()=>{
 for(const reducedMotion of [false,true]){
  const h=playerSetup();let draws=0,callbacks=0,serial=0;const frames=new Map();
  const context=new Proxy({clearRect(){draws++},createRadialGradient(){return {addColorStop(){}}}},{get:(o,k)=>o[k]??(()=>{})});
  const create=h.document.createElement;h.document.createElement=()=>({...create(),getContext:()=>context});
  h.document.defaultView={requestAnimationFrame(fn){frames.set(++serial,fn);return serial},cancelAnimationFrame(id){frames.delete(id)}};
  const timing=h.play({reducedMotion,onImpact(){callbacks++;assert.equal(draws,1)}});
  if(timing.arrival)h.advance(timing.arrival);
  assert.equal(callbacks,1);assert.equal(draws,1);assert.equal(frames.size,reducedMotion?0:1);
  h.player.clear();assert.equal(frames.size,0);assert.equal(h.timers.size,0);
 }
});

test('dead-first splash followed by live primary shares instant contact without orphan flight',()=>{
 const h=playerSetup(),dead={...h.target,classList:{contains:()=>true}};
 const first=h.play({castKey:1,splash:true,target:dead});assert.equal(first.arrival,0);
 const count=h.document.body.children.length;let labels=0;
 const next=h.play({castKey:1,onImpact:()=>labels++});assert.equal(next.arrival,0);assert.equal(labels,1);
 assert.equal(h.document.body.children.length,count+1);assert.match(h.document.body.children.at(-1).className,/impact/);
});

test('synchronized damage is visible on its first CSS frame rather than a second fade-in delay',()=>{
 const css=readFileSync(new URL('../public/battle-preview.css',import.meta.url),'utf8');
 assert.match(css,/@keyframes arenaContactDamageRise\{0%\{opacity:1/);
 const js=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(js,/!heal&&!shield\?' contact-synced'/);
});


test('about 21% shorter cadence preserves every contact and full tail without queued travel',()=>{
 for(const time of [680,850,977.5]){
  const h=playerSetup();let elapsed=0;const hits=[];
  for(let i=0;i<40;i++){
   const special=i%3===0,events=[{damageType:special?'special':'normal'}];
   const interval=heroPlaybackInterval(events,time),timing=heroAttackTiming(time,{special});
   assert.equal(heroActionDuration(events),special?1500:1100);
   assert.ok(interval>timing.arrival,'next preparation begins after this contact');
   assert.ok(interval+heroAttackTiming(time).arrival>=timing.total,'next travelling strike lands after previous full tail');
   assert.ok(h.play({castKey:i,special,time,onImpact:()=>hits.push({cast:i,at:elapsed})}));
   elapsed+=timing.arrival-1;h.advance(timing.arrival-1);assert.equal(hits.length,i);
   elapsed++;h.advance(1);assert.equal(hits.length,i+1);
   elapsed+=interval-timing.arrival;h.advance(interval-timing.arrival);
   assert.ok(h.player.size<=2,'only bounded fading tail overlap');
  }
  h.advance(3000);assert.equal(h.player.size,0);assert.equal(h.timers.size,0);
  assert.deepEqual(hits.map(h=>h.cast),Array.from({length:40},(_,i)=>i));
 }
});
