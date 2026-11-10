import test from 'node:test';
import assert from 'node:assert/strict';
import {commanderOriginalRoster,commanderOriginalFighter} from '../commander-original-roster.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveArenaSession,castDuringLiveArena,stepLiveArenaHero,advanceLiveArenaRound,viewLiveArenaSession} from '../commander-live-arena-session.js';
const options={parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true};
const dummy=(id,position=0)=>({id,name:id,hp:100000,maxHp:100000,attack:1,defense:80,speed:1,shield:100000,role:'fighter',lane:'front',position,damage:0,healing:0,kills:0});
function setup(hero,side){
 const actor=commanderOriginalFighter({id:hero.id,power:75},0);Object.assign(actor,{hp:100000,maxHp:100000,speed:1000,shield:0});
 const teams=[[actor],[dummy('target'),dummy('secondary',1)]];if(side)teams.reverse();
 const commanders=[{commanderId:'defense'},{commanderId:'defense'}];commanders[side]={commanderId:'magic'};
 const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'mage-roster',energy:[100,100],now:0}),teams,commanders});
 return createLiveArenaSession(combat,options);
}
function cast(session,side,id){return castDuringLiveArena(session,{side,ability:'ultimate',targetIds:[id],matchKey:'mage-roster',requestId:'mage-roster-cast',now:10000});}
function assertAction(session,side,id,boosted){
 const round=session.combat.round,actor=session.combat.teams[side].find(u=>u.id===id);
 // Keep the full-health special fallback observable. Hybrid support still shields
 // instead of attacking by design, and injured support is checked separately.
 actor.hp=actor.maxHp;
 const before=structuredClone(session.combat.teams),beforeActor=before[side][0];
 const {result}=stepLiveArenaHero(session),events=result.events||[result.event];
 const primary=events.find(e=>e.actor===id&&(e.action==='attack'||['normal','special'].includes(e.damageType)));
 if(round%3===0&&actor.active?.supportHybrid){
  assert.equal(primary,undefined,'hybrid support does not turn into an attack');
  const shield=events.find(e=>e.action==='shield');assert.equal(shield.value,Math.round(beforeActor.defense*beforeActor.active.allyShieldRate));
  return;
 }
 assert.ok(primary,heroLabel(beforeActor,round)+' must attack');
 const skill=round%3===0?beforeActor.active:null,target=before[1-side].find(u=>u.id===primary.target);
 const defense=skill?.effect==='pierce'?Math.floor(target.defense*(1-skill.pierceRate)):target.defense;
 const factor=(skill?.power??(round%3===0?1.15:1))*(beforeActor.role==='energy'?.97:beforeActor.role==='support'?1.03:1)*.7*100/(100+defense)*(primary.critical?1.3:1);
 const bonus=boosted?beforeActor.arcaneSurgeBonusAttack:0;
 assert.equal(primary.rawDamage,Math.max(1,Math.floor((beforeActor.attack+bonus)*factor)),heroLabel(beforeActor,round)+' normal/special multiplier uses the fixed bonus');
 const base=Math.max(1,Math.floor(beforeActor.attack*factor));
 if(boosted)assert.ok(primary.rawDamage>=base*2&&primary.rawDamage<=base*2+1,heroLabel(beforeActor,round)+' roughly doubles raw damage before integer rounding');
 assert.equal(primary.absorbed,Math.min(target.shield,Math.floor(primary.rawDamage*.7)));
 assert.equal(primary.value,primary.rawDamage-primary.absorbed,'displayed damage is actual HP loss after own shield absorption');
 assert.equal(session.combat.teams[1-side].find(u=>u.id===target.id).hp,target.hp-primary.value);
 const splash=events.filter(e=>e.action==='splash');
 if(round%3===0&&(skill?.effect==='splash'||actor.role==='energy')){
  assert.equal(splash.length,1);
  assert.equal(splash[0].rawDamage,Math.max(1,Math.floor(primary.rawDamage*(skill?.effect==='splash'?skill.splashRate:.15))),'area hit derives from boosted raw primary exactly once');
 }else assert.equal(splash.length,0);
}
function heroLabel(hero,round){return hero.name+' / round '+round;}
for(const hero of commanderOriginalRoster)for(const side of [0,1])for(const afterAction of [false,true])test(`${hero.name}: seat ${side}, cast ${afterAction?'after':'before'} action, all three rounds include actual special route`,()=>{
 const session=setup(hero,side);
 if(afterAction)assertAction(session,side,hero.id,false);
 cast(session,side,hero.id);
 const start=afterAction?2:1,until=start+2,base=session.combat.teams[side][0].attack;
 for(let round=1;round<=until+1;round++){
  if(!(round===1&&afterAction))assertAction(session,side,hero.id,round>=start&&round<=until);
  while(viewLiveArenaSession(session).nextHero)stepLiveArenaHero(session);
  assert.equal(session.combat.teams[side][0].attack,base,'fixed bonus never compounds into base attack');
  if(round<=until)advanceLiveArenaRound(session);
 }
 assert.equal(session.combat.teams[side][0].arcaneSurgeBonusAttack,undefined,'expired bonus is absent in authoritative snapshot');
});
for(const hero of commanderOriginalRoster.filter(h=>h.role==='support'))test(`${hero.name}: mage ultimate never scales healing or shield-only special`,()=>{
 const session=setup(hero,0);cast(session,0,hero.id);
 for(let round=1;round<3;round++){
  while(viewLiveArenaSession(session).nextHero)stepLiveArenaHero(session);
  advanceLiveArenaRound(session);
 }
 const actor=session.combat.teams[0][0];actor.hp=1000;
 const before={...actor};const {result}=stepLiveArenaHero(session),events=result.events||[result.event];
 assert.equal(events.some(e=>['normal','special','splash'].includes(e.damageType)),false);
 assert.equal(events.find(e=>e.action==='heal').value,Math.round(before.attack*before.active.healRate));
 if(before.active.supportHybrid)assert.equal(events.find(e=>e.action==='shield').value,Math.round(before.defense*before.active.allyShieldRate));
});
