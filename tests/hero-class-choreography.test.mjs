import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heroVisualClass,heroClassMotion} from '../public/hero-combat-presentation.js';
import {heroAttackTiming,playHeroAttack} from '../public/hero-attack-effects.js';
import {createCombatEffects} from '../public/arena-combat-effects.js';

test('class choreography excludes bow identities before checking their combat role',()=>{
 for(const role of ['fighter','tank','energy','support','mage','healer','archer']){
  for(const id of ['original:08','original:13']){
   assert.equal(heroVisualClass({id,role}),null);
   assert.equal(heroClassMotion({id,role}),null);
  }
 }
 assert.equal(heroVisualClass({id:'new-bow',role:'archer'}),null);
 for(const [role,visual] of [['energy','mage'],['mage','mage'],['fighter','fighter'],['tank','tank'],['support','healer'],['healer','healer']])assert.equal(heroVisualClass({role}),visual);
 for(const role of ['assassin','ranged','unknown'])assert.equal(heroVisualClass({role}),null);
});

test('fighter and tank hold their forward pose across actual contact and then recover',()=>{
 for(const role of ['fighter','tank'])for(const special of [false,true])for(const speed of [450,850,1500])for(const direction of [-1,1]){
  const timing=heroAttackTiming(speed,{special});
  const {frames,options}=heroClassMotion({role},{dx:300*direction,dy:100*direction,arrival:timing.arrival,special});
  const atContact=timing.arrival/options.duration;
  assert.ok(frames[2].offset<atContact&&frames[3].offset>atContact);
  assert.equal(frames[2].transform,frames[3].transform,'hold, not an interpolated retreat, at the hit');
  assert.equal(frames.at(-1).transform,'translate(0,0) scale(1)');
  assert.equal(frames.at(-1).offset,1);
  assert.equal(options.easing,'linear','keyframe times stay aligned to wall-clock contact');
  assert.ok(options.duration<1100*(speed===450?.8:speed===1500?1.15:1)+timing.arrival);
  assert.match(frames[2].transform,new RegExp(`translate\\(${direction*(role==='tank'?54:66)}px`));
 }
 assert.equal(heroClassMotion({role:'support'}),null);
 assert.equal(heroClassMotion({role:'energy'}),null);
 assert.equal(heroClassMotion({role:'assassin'}),null);
});

function setup(){
 const timers=new Map();let now=0,serial=0;
 const element=()=>({children:[],className:'',style:{props:{},setProperty(k,v){this.props[k]=v}},setAttribute(){},append(n){this.children.push(n)},remove(){this.removed=true},querySelector(){return null},getBoundingClientRect(){return {left:20,top:20,width:54,height:66}}});
 const body=element(),document={body,createElement:element};
 const effects=createCombatEffects({document,maxResources:6,setTimer(fn,ms){timers.set(++serial,{fn,at:now+ms});return serial},clearTimer(id){timers.delete(id)}});
 const actor=element(),target=element();target.getBoundingClientRect=()=>({left:320,top:100,width:54,height:66});
 const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
 return {document,effects,actor,target,advance,timers,clock:()=>now};
}

test('archer attack, heal, shield and lightning keep their original nodes and timing',()=>{
 for(const hero of [{id:'original:08',role:'fighter'},{id:'original:13',role:'fighter'},{id:'new-bow',role:'archer'}])for(const kind of ['arrow','heal','shield','lightning'])for(const special of [false,true]){
  const h=setup(),timing=playHeroAttack({...h,hero,kind,special});
  assert.equal(h.document.body.children.length,3);
  assert.ok(h.document.body.children.every(n=>!n.className.includes('class-')));
  assert.equal(timing.arrival,special?840:600);
  assert.equal(h.document.body.children[2].style.props['--hero-delay'],timing.arrival+'ms');
  h.effects.clear();assert.equal(h.timers.size,0);
 }
});

test('healer target cue starts with immediate health feedback without a second callback',()=>{
 for(const special of [false,true]){
  const h=setup();let hits=0;
  const timing=playHeroAttack({...h,hero:{role:'support'},kind:'heal',special,onImpact:()=>hits++});
  const cue=h.document.body.children.find(n=>n.className.includes('hero-fx-restore'));
  assert.ok(cue);assert.equal(cue.style.props['--hero-delay'],'0ms');
  assert.equal(cue.style.props['--hero-ms'],timing.arrival+'ms');
  assert.equal(h.document.body.children.length,4);assert.equal(hits,0);
  h.advance(timing.arrival);assert.equal(hits,1,'the target cue does not create another impact callback');
  h.advance(4000);assert.equal(hits,1);h.effects.clear();assert.equal(h.timers.size,0);
 }
});

test('shield casts and healing by other classes retain their original presentation',()=>{
 for(const role of ['fighter','tank','energy','support'])for(const kind of ['heal','shield']){
  if(role==='support'&&kind==='heal')continue;
  const h=setup();playHeroAttack({...h,hero:{role},kind});
  assert.equal(h.document.body.children.length,3);
  assert.ok(h.document.body.children.every(n=>!n.className.includes('class-')));
  h.effects.clear();assert.equal(h.timers.size,0);
 }
});

test('restore cue is absent for self, shield, damage, splash, settled and reduced motion',()=>{
 for(const options of [{self:true},{kind:'shield'},{kind:'strike'},{splash:true},{settled:true},{reducedMotion:true}]){
  const h=setup();
  playHeroAttack({...h,hero:{role:'support'},kind:'heal',...options,target:options.self?h.actor:h.target});
  assert.ok(h.document.body.children.every(n=>!n.className.includes('hero-fx-restore')));
  h.effects.clear();assert.equal(h.timers.size,0);
 }
});

test('all added CSS selectors are class-scoped; target contact renderer remains unchanged',()=>{
 const css=readFileSync(new URL('../public/hero-attack-effects.css',import.meta.url),'utf8');
 const added=css.slice(css.indexOf('/* Class choreography'));
 for(const line of added.split('\n').filter(x=>x.startsWith('.hero-fx')))assert.match(line,/\.class-(mage|fighter|tank|healer)/);
 assert.match(added,/heroHammerStrike var\(--hero-ms\) ease-in var\(--hero-delay\)/);
 assert.match(added,/@keyframes heroClassTravel\{0%\{opacity:0/,'new class projectiles stay hidden during preparation');
 assert.doesNotMatch(added,/signature-arrow|hero-fx-impact|hero-contact|@keyframes heroTravel|infinite/);
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(source,/if\(heal\|\|shield\)onImpact\(\)/,'health and +value remain immediate');
 assert.match(source,/combatEffects.animate\(actor,choreography.frames,choreography.options\)/,'motion uses the shared cancellation owner');
});
