import test from 'node:test';
import fs from 'node:fs';
import {validateHeroAbility} from '../public/hero-ability-rules.js';
const expectedManifest=JSON.parse(fs.readFileSync(new URL('./fixtures/ability-balance-expected.json',import.meta.url)));
const expectedById=new Map(expectedManifest.map(h=>[h.id,h]));
import assert from 'node:assert/strict';
import {battleRoster,simulateRosterBattle} from '../battle-roster.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {applyLegacyStartPassives,applyLegacyRoundPassives} from '../commander-parity-passives.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createBasicTurnSession,stepBasicTurn} from '../commander-basic-turn-session.js';
import {calculateHeroRawDamage} from '../battle-damage-formula.js';
const flags={parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true};
function fixture(hero,{injuredAlly=false,speed=1000}={}){
 const ids=[hero.id,...battleRoster.filter(h=>h.id!==hero.id).slice(0,4).map(h=>h.id)];
 const cards=ids.map(id=>({id,power:75,lane:'front'}));
 const teams=prepareLiveArenaTeams(cards,cards,{cardAdapter:'auction'});
 for(let side=0;side<2;side++)for(let i=0;i<5;i++)Object.assign(teams[side][i],{id:side===0&&i===0?hero.id:`fixture-${side}-${i}`,position:i,lane:'front',attack:100,defense:100,hp:1000,maxHp:1000,shield:0,speed:1,active:null,passive:null});
 Object.assign(teams[0][0],{role:hero.role,active:hero.active,passive:hero.passive,speed,hp:hero.active.effect==='drain'||hero.active.effect==='heal'?500:1000});
 if(injuredAlly)teams[0][1].hp=500;
 if(hero.active.effect==='execute')for(const enemy of teams[1])enemy.hp=100;
 const combat=createLiveCommanderCombat({teams,round:3,commanders:[{commanderId:'attack'},{commanderId:'defense'}],abilities:createLiveCommanderAbilities({matchKey:'roster-regression'})});
 const session=createBasicTurnSession(combat,flags);
 const before=structuredClone(combat.teams);
 stepBasicTurn(session);
 return {combat,before,events:combat.events.filter(e=>e.actor===hero.id)};
}
// Exercise actual scheduler dispatch and resulting state for every current hero,
// not merely the informational readiness report or preserved metadata.
for(const hero of battleRoster){
 test(`${hero.name}: actual special action and passive behavior`,()=>{
  const expected=expectedById.get(hero.id);
  assert.ok(expected, 'hero must exist in independently pinned balance manifest');
  assert.deepEqual({id:hero.id,name:hero.name,role:hero.role,rarity:hero.rarity,power:hero.proposedPower,active:hero.active,passive:hero.passive},expected);
  const cards=[hero,...battleRoster.filter(h=>h.id!==hero.id).slice(0,4)].map(h=>({id:h.id,power:75}));
  const prepared=prepareLiveArenaTeams(cards,cards,{cardAdapter:'auction'})[0][0];
  assert.deepEqual(prepared.active,hero.active);
  assert.deepEqual(prepared.passive,hero.passive);
  const {combat,before,events}=fixture(hero);
  const actor=combat.teams[0][0],previous=before[0][0],effect=hero.active.effect;
  const hit=events.find(e=>e.damageType==='special');
  const event=action=>events.find(e=>e.action===action);
  if(expected.active.supportHybrid){
   assert.ok(!hit,'hybrid special must not attack');assert.equal(actor.shield,Math.round(previous.defense*expected.active.allyShieldRate));
   assert.equal(event('shield')?.target,hero.id);
  }else if(effect==='heal'){
   assert.equal(actor.hp-previous.hp,Math.round(previous.attack*expected.active.healRate));assert.equal(event('heal')?.target,hero.id);
  }else{
   assert.ok(hit,`${hero.name}: special attack missing`);
   const target=combat.teams[1].find(u=>u.id===hit.target);
   const oldTarget=before[1].find(u=>u.id===hit.target);
   const expectedRaw=calculateHeroRawDamage({unit:previous,target:oldTarget,skill:hero.active,special:true,critical:hit.critical,guarded:false});
   assert.equal(hit.rawDamage,expectedRaw,`${hero.name}: skill multiplier/pierce formula`);
   if(effect==='shield')assert.ok(actor.shield>=Math.round(previous.defense*expected.active.shieldRate));
   if(effect==='drain')assert.equal(actor.hp-previous.hp,Math.floor(hit.value*expected.active.drainRate));
   if(effect==='sunder')assert.equal(target.defense,Math.floor(100*(1-expected.active.sunderRate)));
   if(effect==='weaken')assert.equal(target.attack,Math.floor(100*(1-expected.active.weakenRate)));
   if(effect==='haste'){assert.ok(actor.speed>=previous.speed);assert.equal(event('haste').value,actor.speed-previous.speed);}
   if(effect==='execute')assert.equal(target.hp,0);
   if(effect==='splash'||hero.role==='energy'){
    const splash=events.filter(e=>e.action==='splash');assert.equal(splash.length,4);
    for(const e of splash)assert.equal(e.rawDamage,Math.max(1,Math.floor(hit.rawDamage*(effect==='splash'?expected.active.splashRate:.15))));
   }
  }
  // Preserve the existing front/back rule: passives still apply in either lane.
  for(const lane of ['front','back']){
   const unit={id:hero.id,hp:400,maxHp:1000,attack:100,defense:100,speed:100,lane,passive:hero.passive};
   const teams=applyLegacyStartPassives([[unit],[]]);
   const p=hero.passive.effect;
   if(['guard','resist'].includes(p))assert.equal(teams[0][0].defense,Math.round(100*(1+expected.passive.value)));
   if(p==='focus')assert.equal(teams[0][0].attack,Math.round(100*(1+expected.passive.value)));
   if(['evasion','momentum'].includes(p))assert.equal(teams[0][0].speed,Math.round(100*(1+expected.passive.value)));
   const c={teams,round:2,version:0,events:[],finished:false};applyLegacyRoundPassives(c);
   if(p==='regen')assert.equal(c.teams[0][0].hp,430);
   if(p==='rage'){assert.equal(c.teams[0][0].attack,100+Math.floor(100*expected.passive.value));applyLegacyRoundPassives(c);assert.equal(c.teams[0][0].attack,100+Math.floor(100*expected.passive.value));}
  }
 });
}
for(const id of ['original:15','original:expansion-31'])test(`${id}: hybrid support heals and shields same injured ally without attack`,()=>{
 const hero=battleRoster.find(h=>h.id===id);const {combat,events}=fixture(hero,{injuredAlly:true});
 const expected=expectedById.get(id);
 assert.equal(combat.teams[0][1].hp,500+Math.round(100*expected.active.healRate));
 assert.equal(combat.teams[0][1].shield,Math.round(100*expected.active.allyShieldRate));
 assert.ok(events.some(e=>e.action==='heal'));assert.ok(events.some(e=>e.action==='shield'));assert.ok(!events.some(e=>e.damageType==='special'));
 assert.equal(events.find(e=>e.action==='heal').target,events.find(e=>e.action==='shield').target);
});
test('rage never reduces already boosted attack for all rage heroes',()=>{
 for(const hero of battleRoster.filter(h=>h.passive.effect==='rage'))for(const attack of [100,175,180,210,216]){
  const c={teams:[[{id:hero.id,hp:40,maxHp:100,attack,passive:hero.passive}],[]],round:2,version:0,events:[],finished:false};
  applyLegacyRoundPassives(c);assert.equal(c.teams[0][0].attack,Math.max(attack,Math.min(180,attack+Math.floor(attack*expectedById.get(hero.id).passive.value))));
 }
});
test('haste increases ordinary speed and never reduces boosted speed; events truthful',()=>{
 const hero=battleRoster.find(h=>h.active.effect==='haste');
 for(const speed of [100,147,148,150,223]){const {combat,events}=fixture(hero,{speed});const after=combat.teams[0][0].speed;assert.equal(after,Math.max(speed,Math.min(150,speed+8)));assert.equal(events.find(e=>e.action==='haste').value,after-speed);}
});
test('bot fixtures retain energy weaken and drain behavior',()=>{
 for(const id of ['original:expansion-08','original:expansion-14']){
  const a=['original:01','original:02',id,'original:expansion-05','original:expansion-07'].map(id=>({id,power:75}));
  const b=['original:03','original:04','original:06','original:10','original:11'].map(id=>({id,power:60}));
  const result=simulateRosterBattle(a,b,{seed:'audit-0'});assert.ok(result.log.some(e=>e.actor===id&&e.action==='weaken'));
 }
 const id='original:expansion-33';const a=[id,'original:01','original:02','original:03','original:04'].map((id,i)=>({id,power:i?50:55,lane:i?'back':'front'}));
 const b=['original:03','original:04','original:06','original:10','original:11'].map(id=>({id,power:30}));
 const result=simulateRosterBattle(a,b,{seed:'audit-5'});assert.ok(result.log.some(e=>e.actor===id&&e.action==='heal'&&e.value>0));
});
for(const id of ['original:15','original:expansion-31'])test(`${id}: bot hybrid support protects same wounded ally with heal and shield`,()=>{
 const a=['original:01','original:02',id,'original:03','original:04'].map((id,i)=>({id,power:i===2?100:75}));
 const b=['original:03','original:04','original:06','original:10','original:11'].map(id=>({id,power:50}));
 const result=simulateRosterBattle(a,b,{seed:'support-regression',maxRounds:3});
 const events=result.log.filter(e=>e.actor===id&&e.round===3);
 assert.ok(events.some(e=>e.action==='heal'));assert.ok(events.some(e=>e.action==='shield'));
 assert.equal(events.find(e=>e.action==='heal').target,events.find(e=>e.action==='shield').target);assert.ok(!events.some(e=>e.damageType==='special'));
});
for(const hero of battleRoster.filter(h=>h.passive.effect==='rage'))test(`${hero.name}: bot rage cannot lower credit-boosted attack`,()=>{
 const a=[hero.id,'original:01','original:02','original:03','original:04'].map((id,i)=>({id,power:100,lane:i?'back':'front'}));
 const b=['original:03','original:04','original:06','original:10','original:11'].map(id=>({id,power:100}));
 const initial=prepareLiveArenaTeams(a,b,{remainingCredits:[100,100],cardAdapter:'auction'})[0][0].attack;
 let observed=false;
 for(let seed=0;seed<30&&!observed;seed++){
  const result=simulateRosterBattle(a,b,{seed:`rage-regression-${seed}`,remainingCredits:[100,100]});
  const event=result.log.find(e=>e.actor===hero.id&&e.action==='rage');
  if(event){observed=true;assert.ok(event.value>=initial,`${event.value} < ${initial}`);}
 }
 assert.ok(observed,'fixture must actually trigger rage');
});
test('bot haste cannot lower boosted speed and reports actual zero gain',()=>{
 const id='original:expansion-32';
 const a=['original:01','original:02',id,'original:03','original:04'].map(id=>({id,power:100}));
 const b=['original:03','original:04','original:06','original:10','original:11'].map(id=>({id,power:100}));
 const initial=prepareLiveArenaTeams(a,b,{remainingCredits:[100,100],cardAdapter:'auction'})[0][2].speed;
 const result=simulateRosterBattle(a,b,{seed:'haste-regression',remainingCredits:[100,100]});
 const events=result.log.filter(e=>e.actor===id&&e.action==='haste');
 assert.ok(events.length>0);assert.ok(result.teams[0][2].speed>=initial);assert.ok(events.every(e=>e.value===0));
});

test('trusted ability validation rejects malformed and incompatible explicit parameters',()=>{
 for(const bad of [{pierceRate:1},{shieldRate:'0.4'},{shieldRate:null},{splashRate:.3},{supportHybrid:true},{unknown:1}]){const hero=structuredClone(battleRoster.find(h=>h.name==='Demir Sur'));Object.assign(hero.active,bad);assert.throws(()=>validateHeroAbility(hero));}
});
