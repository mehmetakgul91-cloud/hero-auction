import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HERO_SWORD_RASTER} from '../public/hero-sword-raster.js';
import {targetMeleeWeapon,targetSwingGeometry,targetWeaponProfile} from '../public/hero-target-swing.js';
import {playHeroAttack,createHeroAttackPlayer,heroAttackTiming} from '../public/hero-attack-effects.js';
import {appendDetailedWeapon,DETAILED_WEAPON_GEOMETRY} from '../public/hero-melee-weapon-art.js';
import {createCombatEffects} from '../public/arena-combat-effects.js';

function setup({width=54,left=320}={}){
 let now=0,serial=0;const timers=new Map(),animations=[];
 const element=(tag='span')=>({tag,children:[],attributes:{},className:'',style:{props:{},setProperty(k,v){this.props[k]=v}},setAttribute(k,v){this.attributes[k]=v},append(n){this.children.push(n)},remove(){this.removed=true},querySelector(){return null},getBoundingClientRect(){return {left:20,top:20,width,height:width*1.2}},animate(frames,options){const a={frames,options,element:this,canceled:false,cancel(){this.canceled=true}};animations.push(a);return a}});
 const body=element(),document={body,createElement:element,createElementNS:(ns,tag)=>element(tag)};
 const actor=element(),target=element(),portrait=element();
 portrait.getBoundingClientRect=()=>({left,top:100,width,height:width*1.2});
 target.querySelector=selector=>selector==='.arena-portrait'?portrait:null;
 const setTimer=(fn,ms)=>{timers.set(++serial,{fn,at:now+ms});return serial},clearTimer=id=>timers.delete(id),clock=()=>now;
 const effects=createCombatEffects({document,maxResources:6,setTimer,clearTimer});
 const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now&&timers.has(id)){timers.delete(id);t.fn()}};
 const h={document,actor,target,portrait,effects,advance,timers,animations,clock,setTimer,clearTimer};
 h.play=options=>playHeroAttack({...h,hero:{id:'original:02',role:'fighter'},kind:'strike',...options});
 return h;
}
const swings=h=>h.document.body.children.filter(n=>n.className.includes('hero-fx-swing'));

test('target melee classification excludes bow identities and non-melee signatures',()=>{
 for(const role of ['fighter','tank','assassin','archer','energy','support'])for(const id of ['original:08','original:13'])for(const signature of ['blade','dagger','hammer'])assert.equal(targetMeleeWeapon({id,role},signature),null);
 for(const signature of ['blade','dagger','hammer'])assert.equal(targetMeleeWeapon({role:'archer'},signature),null);
 for(const role of ['fighter','tank','assassin'])for(const signature of ['arrow','magic','heal','shield','lightning','light'])assert.equal(targetMeleeWeapon({role},signature),null);
 assert.equal(targetMeleeWeapon({id:'original:02',role:'fighter'},'blade'),'sword');
 assert.equal(targetMeleeWeapon({id:'original:05',role:'assassin'},'dagger'),'dagger');
 assert.equal(targetMeleeWeapon({id:'original:01',role:'tank'},'hammer'),'hammer');
});

test('target swings replace only the melee flight and preserve cast and impact nodes',()=>{
 for(const hero of [{id:'original:02',role:'fighter'},{id:'original:01',role:'tank'},{id:'original:05',role:'assassin'},{id:'original:expansion-03',role:'fighter'}]){
  const h=setup();h.play({hero});
  assert.equal(swings(h).length,1);
  assert.equal(h.document.body.children.filter(n=>n.className.includes('hero-fx-cast')).length,1);
  assert.equal(h.document.body.children.filter(n=>n.className.includes('hero-fx-impact')).length,1);
  assert.ok(h.document.body.children.every(n=>!n.className.includes('hero-fx-flight')));
  assert.equal(h.animations.length,0);h.effects.clear();assert.equal(h.timers.size,0);
 }
});

test('recoil begins on the target portrait at the single normal or special contact callback',()=>{
 for(const special of [false,true])for(const time of [450,850,1500])for(const left of [-320,320]){
  const h=setup({left});let hits=0;
  const timing=h.play({special,time,onImpact(){hits++}});
  assert.equal(timing.arrival,heroAttackTiming(time,{special}).arrival);
  h.advance(timing.arrival-1);assert.equal(hits,0);assert.equal(h.animations.length,0);
  h.advance(1);assert.equal(hits,1);assert.equal(h.animations.length,1);
  const recoil=h.animations[0];assert.equal(recoil.element,h.portrait);
  assert.ok(recoil.frames.some(f=>f.translate!=='0px 0px'&&f.rotate!=='0deg'));
  assert.equal(Math.sign(parseFloat(recoil.frames[1].translate)),Math.sign(left));
  assert.ok(recoil.frames.every(f=>!('transform' in f)),'individual transforms preserve the portrait scale');
  assert.ok(h.effects.size<=6);
  h.effects.clear();assert.equal(recoil.canceled,true);h.advance(4000);assert.equal(hits,1);assert.equal(h.timers.size,0);
 }
});

test('explicit shared arrival overrides also synchronize the swing and recoil',()=>{
 for(const arrivalAtOverride of [0,117,777]){
  const h=setup();let hits=0;const timing=h.play({arrivalAtOverride,onImpact:()=>hits++});
  assert.equal(timing.impactAt,arrivalAtOverride);assert.equal(timing.arrival,arrivalAtOverride);
  if(arrivalAtOverride){const props=swings(h)[0].style.props;assert.equal(parseFloat(props['--hero-delay'])+parseFloat(props['--hero-ms']),arrivalAtOverride)}else assert.equal(swings(h).length,0);
  if(arrivalAtOverride){h.advance(arrivalAtOverride-1);assert.equal(hits,0);assert.equal(h.animations.length,0);h.advance(1)}
  assert.equal(hits,1);assert.equal(h.animations.length,1);h.effects.clear();
 }
});

test('self, splash, settled and reduced motion never create a swing or recoil',()=>{
 for(const options of [{self:true},{splash:true},{settled:true},{reducedMotion:true}]){
  const h=setup();let hits=0;const timing=h.play({...options,target:options.self?h.actor:h.target,onImpact:()=>hits++});
  assert.equal(swings(h).length,0);h.advance(timing.arrival);assert.equal(hits,1);assert.equal(h.animations.length,0);
  h.effects.clear();assert.equal(h.timers.size,0);
 }
});

test('archer, magic, healing, shielding and lightning retain existing presentation and timing',()=>{
 for(const options of [{hero:{id:'original:08',role:'fighter'}},{hero:{id:'original:13',role:'tank'}},{hero:{role:'archer'}},{kind:'magic'},{kind:'heal'},{kind:'shield'},{kind:'lightning'}])for(const special of [false,true]){
  const h=setup();let hits=0;const timing=h.play({...options,special,onImpact:()=>hits++});
  assert.equal(swings(h).length,0);assert.equal(timing.arrival,special?840:600);
  assert.equal(h.document.body.children.filter(n=>n.className.includes('hero-fx-flight')).length,1);
  h.advance(timing.arrival);assert.equal(hits,1);assert.equal(h.animations.length,0);h.effects.clear();
 }
});

test('cancelled, stale and invalid contacts cannot emit a callback or late recoil',()=>{
 for(const mode of ['cancel','invalid','stale']){
  const h=setup();let hits=0,valid=true;h.play({valid:()=>valid,onImpact:()=>hits++});
  if(mode==='cancel')h.effects.clear();if(mode==='invalid')valid=false;
  h.advance(mode==='stale'?5000:600);assert.equal(hits,0);assert.equal(h.animations.length,0);
  h.effects.clear();assert.equal(h.timers.size,0);
 }
});

test('bursts stay within four whole casts and six owned resources per target, then fully cancel',()=>{
 const h=setup(),player=createHeroAttackPlayer({...h,maxCasts:4});
 for(let i=0;i<32;i++){
  player.play({...h,hero:{id:'original:02',role:'fighter'},kind:'strike',castKey:i});
  assert.ok(player.size<=4);assert.ok(h.timers.size<=24);
 }
 assert.equal(player.size,4);h.advance(600);assert.ok(h.timers.size<=24);
 player.clear();assert.equal(player.size,0);assert.equal(h.timers.size,0);
 assert.ok(h.document.body.children.every(n=>n.removed));assert.ok(h.animations.every(a=>a.canceled));
 h.advance(5000);assert.equal(player.remaining,0);
});

test('weapon profiles preserve distinct sizes and rotated physical tips meet mirrored target points',()=>{
 const profiles={sword:{scale:1.55,max:110,min:30,angle:76,windup:-20,recovery:290},axe:{scale:1.4,max:100,min:28,angle:80,windup:-24,recovery:280},dagger:{scale:1.25,max:90,min:26,angle:66,windup:-30,recovery:180}};
 const tips={sword:[50,4],axe:[84,20],dagger:[50,18],hammer:[70.24,15]};
 for(const [weapon,profile] of Object.entries(profiles))assert.deepEqual(targetWeaponProfile(weapon),profile);
 for(const width of [32,44,54,84,120])for(const special of [false,true]){
  const rect={left:320,top:100,width,height:width*1.2};const sizes={};
  for(const [weapon,tip] of Object.entries(tips)){
   const p=targetWeaponProfile(weapon),size=Math.max(p.min,Math.min(p.max,width*p.scale*(special?1.08:1)));sizes[weapon]=size;
   for(const direction of [-1,1]){
    const g=targetSwingGeometry(rect,direction,size,weapon),angle=p.angle*Math.PI/180;
    const x=.5+(tip[0]/100-.5)*Math.cos(angle)-(tip[1]/100-.9)*Math.sin(angle);
    const y=.9+(tip[0]/100-.5)*Math.sin(angle)+(tip[1]/100-.9)*Math.cos(angle);
    assert.ok(Math.abs(g.contactX-x)<1e-10);assert.ok(Math.abs(g.contactY-y)<1e-10);
    assert.ok(Math.abs(g.left+size*(direction>0?x:1-x)-(rect.left+width*(direction>0?.76:.24)))<1e-9);
    assert.ok(Math.abs(g.top+size*y-(rect.top+rect.height*.55))<1e-9);
   }
  }
  assert.ok(sizes.sword>sizes.dagger);
  assert.ok(sizes.sword*.86>=sizes.dagger*.72*1.4,'physical sword blade remains clearly longer than dagger');
  for(const [weapon,id] of [['sword','original:02'],['axe','original:expansion-03'],['dagger','original:05']]){
   const h=setup({width});h.play({hero:{id,role:'fighter'},special});
   assert.equal(parseFloat(swings(h)[0].style.props['--hero-size']),sizes[weapon]);h.effects.clear();
  }
 }
 assert.equal(targetMeleeWeapon({id:'original:expansion-03',role:'fighter'},'blade'),'axe');
 assert.equal(targetMeleeWeapon({id:'unknown',role:'fighter'},'blade'),'slash');
});

test('axe and dagger remain distinct safe SVG with exact physical tip and pivot metadata',()=>{
 const sources=new Set();
 for(const [weapon,contact] of [['axe',[84,20]],['dagger',[50,18]]]){
  const h=setup(),arm=h.document.createElement('i'),img=appendDetailedWeapon(h.document,arm,weapon);
  assert.equal(arm.children.length,1);assert.equal(img.tag,'img');assert.equal(img.attributes['aria-hidden'],'true');assert.equal(img.attributes.draggable,'false');
  assert.match(img.src,/^data:image\/svg\+xml;charset=utf-8,/);
  const svg=decodeURIComponent(img.src.split(',')[1]);sources.add(svg);
  assert.match(svg,/viewBox="0 0 100 100"/);assert.ok((svg.match(/<path /g)||[]).length>=10);
  assert.doesNotMatch(svg,/<(?:script|foreignObject|image|use)\b|\bhref\s*=|\bon\w+\s*=|url\(\s*[^#]/i);
  assert.deepEqual(DETAILED_WEAPON_GEOMETRY[weapon],{viewBox:[0,0,100,100],pivot:[50,90],contact});
 }
 assert.equal(sources.size,2);
 const h=setup(),arm=h.document.createElement('i');
 for(const weapon of ['hammer','slash','unknown','__proto__'])assert.equal(appendDetailedWeapon(h.document,arm,weapon),null);
 assert.equal(arm.children.length,0);
});

test('target-local CSS stays swing-scoped without cross-board travel or existing contact and arrow overrides',()=>{
 const css=readFileSync(new URL('../public/hero-attack-effects.css',import.meta.url),'utf8');
 const start=css.indexOf('/* Target-local melee');assert.ok(start>=0);const added=css.slice(start);
 for(const line of added.split('\n').filter(x=>x.startsWith('.hero-fx')))assert.match(line,/^\.hero-fx-swing(?:[ .:]|\{)/);
 assert.match(added,/transform-origin:50% 90%/);
 assert.match(added,/100%\{transform:rotate\(var\(--hero-contact-angle\)\)\}/);
 assert.match(added,/heroWeaponFollow var\(--hero-recovery\).*calc\(var\(--hero-delay\) \+ var\(--hero-ms\)\)/);
 assert.doesNotMatch(added,/--hero-dx|--hero-dy|signature-arrow|hero-fx-impact|\.hero-contact|@keyframes heroTravel|infinite/);
});


test('flaming sword preserves its steel, grip and physical tip with two owned decorative layers',()=>{
 const h=setup(),arm=h.document.createElement('i'),img=appendDetailedWeapon(h.document,arm,'sword');
 assert.equal(arm.children.length,4);
 const flames=arm.children.filter(n=>n.className.includes('hero-sword-flames'));
 const blade=arm.children.find(n=>n.className.includes('hero-sword-wide-blade'));
 assert.equal(flames.length,2);assert.ok(blade);
 assert.equal(img.src,HERO_SWORD_RASTER);assert.equal(blade.src,img.src);
 assert.equal(img.decoding,'sync');assert.equal(blade.decoding,'sync');
 assert.match(img.src,/^data:image\/png;base64,/);
 const png=Buffer.from(img.src.split(',')[1],'base64');
 assert.deepEqual(png,readFileSync(new URL('../public/images/effects/flaming-sword.png',import.meta.url)));
 assert.equal(createHash('sha256').update(png).digest('hex'),'e69972d864dcba079814837c71ff467860d2629cd8631f96c10bf1f48c5d1fc7');
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 for(const child of arm.children){assert.equal(child.tag,'img');assert.equal(child.attributes['aria-hidden'],'true');assert.equal(child.attributes.draggable,'false');assert.equal(child.alt,'');}
 for(const flame of flames){
  assert.match(flame.src,/^data:image\/svg\+xml;charset=utf-8,/);
  const svg=decodeURIComponent(flame.src.split(',')[1]);assert.match(svg,/viewBox="0 0 100 100"/);
  assert.doesNotMatch(svg,/<(?:script|foreignObject|image|use)\b|\bhref\s*=|\bon\w+\s*=|url\(\s*[^#]/i);
 }
 assert.deepEqual(DETAILED_WEAPON_GEOMETRY.sword,{viewBox:[0,0,100,100],pivot:[50,90],contact:[50,4]});
 const css=readFileSync(new URL('../public/hero-attack-effects.css',import.meta.url),'utf8');
 assert.match(css,/hero-sword-wide-blade\{[^}]*clip-path:inset\(0 0 30% 0\);transform:scaleX\(1.25\)/);
 assert.match(css,/hero-sword-flames\{[^}]*pointer-events:none/);
 assert.doesNotMatch(css,/infinite/);
});

test('flame children expire with the sword owner before their finite decorative cycles finish',()=>{
 for(const special of[false,true])for(const time of[450,850,1500]){
  const h=setup(),timing=h.play({special,time}),node=swings(h)[0];
  assert.equal(node.children[0].children.length,4);
  const end=timing.arrival+targetWeaponProfile('sword').recovery+80;
  assert.ok(end<180*10&&end<230*8);
  h.advance(end-1);assert.notEqual(node.removed,true);h.advance(1);assert.equal(node.removed,true);
  h.effects.clear();assert.equal(h.timers.size,0);
 }
});
