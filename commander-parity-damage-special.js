import {applyServerStunSkip} from './commander-live-combat.js';
import {expireCommanderFocus} from './battle-commander-focus.js';
import {commanderWeakenRate,consumeCommanderWeaken} from './commander-weaken-status.js';
import {abilityValue} from './public/hero-ability-rules.js';
import {applyHeroDamage} from './battle-hp-damage.js';
// Server-owned atomic parity for burst, pierce, splash and headshot.
// All damage and targets are computed from authoritative combat state.
import {calculateHeroRawDamage} from './battle-damage-formula.js';
import {calculateSplashRawDamage} from './battle-special-formulas.js';
import {selectBattleTarget} from './battle-target-selection.js';
import {applyAttackThorns} from './commander-parity-thorns.js';
import {grantLiveCommanderEnergy} from './commander-live-abilities.js';
const effects=new Set(['burst','pierce','splash','headshot']);
const roundEffects=new Set(['guard','resist','focus','evasion','momentum','regen','rage']);
export function stepParityDamageSpecial(combat,{side,actorId,round=combat?.round,critical=false,allowThornsPassive=false,allowRoundPassives=false}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||round%3!==0||typeof critical!=='boolean')throw Error('Invalid damage special');
 const teams=structuredClone(combat.teams);
 const actor=teams[side].find(u=>u.id===actorId&&u.hp>0);
 const skill=actor?.active;
 if(!actor||!effects.has(skill?.effect)||(actor.passive&&!((allowThornsPassive&&actor.passive.effect==='thorns')||(allowRoundPassives&&roundEffects.has(actor.passive.effect)))))throw Error('Unsupported damage special');
 const enemies=teams[1-side],target=selectBattleTarget(enemies,actor,round);
 if(!target)throw Error('No living target');
 const skipped=applyServerStunSkip(combat,{side,actorId,round});if(skipped)return skipped;
 const guarded=target.lane!=='front'&&enemies.some(u=>u.hp>0&&u.lane==='front');
 const weakened=commanderWeakenRate(actor,round);
 const raw=calculateHeroRawDamage({unit:actor,target,skill,special:true,critical,guarded,weakened,round});
 const events=[],deaths=[];
 function hit(victim,amount,action,isSecondary=false){
  const {damage,absorbed,guardTriggered,arcaneTransfer}=applyHeroDamage(victim,amount,{round,allies:enemies});
  actor.damage=(actor.damage||0)+damage;
  if(victim.hp===0){actor.kills=(actor.kills||0)+1;deaths.push(victim.id)}
  events.push({round,side,actor:actorId,action,target:victim.id,value:damage,absorbed,rawDamage:amount,damageType:isSecondary?'splash':'special',...(guardTriggered?{guardTriggered:true}:{}),...(arcaneTransfer?{arcaneTransfer}:{}),...(isSecondary?{}:{critical})});
 }
 hit(target,raw,skill.name||'special');
 if(skill.effect==='splash'||actor.role==='energy'){
  const splashRaw=calculateSplashRawDamage(raw,{skill,role:actor.role,special:true});
  for(const victim of enemies.filter(u=>u!==target&&u.hp>0))hit(victim,splashRaw,'splash',true);
 }
 if(actor.role==='tank'){
  for(const ally of teams[side].filter(u=>u.hp>0&&u.lane==='front'))ally.shield=(ally.shield||0)+Math.max(1,Math.round(actor.defense*abilityValue(actor.active,'frontShieldRate')));
 }
 const thornsShield=applyAttackThorns(actor,{enabled:allowThornsPassive});
 if(thornsShield)events.push({round,side,actor:actorId,action:'thorns-shield',target:actorId,value:thornsShield});
 if(actor.role==='tank')actor.shield=(actor.shield||0)+Math.round(actor.defense*abilityValue(actor.active,'tankShieldRate'));
 consumeCommanderWeaken(actor);
 combat.teams=teams;combat.version++;
 for(const event of events){event.version=combat.version;combat.events.push(event)}
 for(const id of deaths)grantLiveCommanderEnergy(combat.abilities,1-side,10);
 expireCommanderFocus(teams,round);
 combat.finished=teams.some(team=>team.every(u=>u.hp<=0));
 combat.abilities.finished=combat.finished;
 return {version:combat.version,events,teams:structuredClone(teams),finished:combat.finished};
}
