import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heroAttackSignature,heroAttackTiming,playHeroAttack} from '../public/hero-attack-effects.js';
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
  assert.equal(cast.style.left,'57px');assert.equal(impact.style.left,'327px');
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
 assert.ok(js.indexOf('playHeroAttack({')<js.indexOf('if(!ranged)combatEffects.animate(actor'));
 assert.doesNotMatch(js,/battle-comic-banner|comicBattleCue/);
 assert.doesNotMatch(js,/combatEffects\.accent\(target|orb\.className='battle-projectile/);
 const css=readFileSync(new URL('../public/hero-attack-effects.css',import.meta.url),'utf8');
 assert.match(css,/prefers-reduced-motion:reduce/);assert.doesNotMatch(css,/infinite|z-index:100[2-9]/);
 for(const signature of ['arrow','blade','dagger','magic','hammer','heal','shield','lightning'])assert.ok(css.includes('signature-'+signature));
});
