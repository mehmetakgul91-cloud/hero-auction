import {transferArcaneSurgeOnDeath} from './commander-ultimate-status.js';
import {calculateShieldAbsorption} from './battle-shield-absorption.js';
// Son Kale waits for the first lethal atomic hit, then floors health at 1
// for the rest of that round plus the next TWO FULL rounds. It never heals,
// resurrects, refreshes itself, or bypasses per-hit shield absorption.
const validRound=round=>Number.isInteger(round)&&round>=1;
const lastStandFields=['lastStandReady','lastStandPersistent','lastStandUntilRound','lastStandImmortalRounds','lastStandTriggeredRound','lastStandImmortalUntilRound'];
const clearLastStand=target=>{for(const field of lastStandFields)delete target[field];};
const living=target=>target&&Number.isFinite(target.hp)&&target.hp>0;
function isLastStandArmed(target,round){
 if(!living(target)||target.lastStandReady!==true||!validRound(round))return false;
 if(target.lastStandPersistent===true)return true;
 // Previously saved guards retain their timed, one-hit lifetime.
 return target.lastStandPersistent===undefined&&validRound(target.lastStandUntilRound)&&target.lastStandUntilRound>=round;
}
export function isLastStandImmortal(target,round){
 return !!(living(target)&&validRound(round)&&validRound(target.lastStandTriggeredRound)&&
  target.lastStandImmortalUntilRound===target.lastStandTriggeredRound+2&&
  round>=target.lastStandTriggeredRound&&round<=target.lastStandImmortalUntilRound);
}
export function isLastStandActive(target,round){return isLastStandArmed(target,round)||isLastStandImmortal(target,round);}
export function grantLastStand(target,round){
 if(!validRound(round))throw Error('Invalid last stand round');
 if(!living(target)||isLastStandActive(target,round))return false;
 clearLastStand(target);
 target.lastStandReady=true;target.lastStandPersistent=true;target.lastStandImmortalRounds=2;return true;
}
export function expireLastStandGuards(teams,round){
 if(!Array.isArray(teams)||teams.some(team=>!Array.isArray(team))||!validRound(round))throw Error('Invalid last stand expiry');
 for(const team of teams)for(const target of team)if(!isLastStandActive(target,round))clearLastStand(target);
}
export function applyHeroDamage(target,raw,{round,executeThreshold=0,allies}={}){
 if(!target||!Number.isFinite(target.hp)||target.hp<0||!Number.isFinite(raw)||raw<0||!Number.isInteger(round)||round<1||!Number.isFinite(executeThreshold)||executeThreshold<0||executeThreshold>1)throw Error('Invalid hero damage');
 if(executeThreshold&&(!Number.isFinite(target.maxHp)||target.maxHp<=0))throw Error('Invalid execute target');
 if(target.hp===0)return {damage:0,executedDamage:0,absorbed:0,rawDamage:raw,guardTriggered:false};
 const absorbed=calculateShieldAbsorption(target.shield||0,raw);
 target.shield=(target.shield||0)-absorbed;
 const oldHp=target.hp;
 let damage=Math.min(oldHp,raw-absorbed);
 const afterHit=oldHp-damage;
 let executedDamage=executeThreshold&&afterHit>0&&afterHit/target.maxHp<executeThreshold?afterHit:0;
 const immortal=isLastStandImmortal(target,round),armed=isLastStandArmed(target,round);
 const guarded=immortal||armed;
 const guardTriggered=guarded&&damage+executedDamage>=oldHp;
 if(guardTriggered){
  const budget=Math.max(0,oldHp-1);
  damage=Math.min(damage,budget);executedDamage=Math.min(executedDamage,Math.max(0,budget-damage));
  if(!immortal){
   const duration=target.lastStandImmortalRounds;clearLastStand(target);
   if(duration===2){target.lastStandTriggeredRound=round;target.lastStandImmortalUntilRound=round+2;}
  }
 }
 target.hp=oldHp-damage-executedDamage;
 if(target.hp===0){clearLastStand(target);delete target.commanderFocusUntilDeath;delete target.commanderStunNextAttack;delete target.commanderHuntNextAttack;}
 const arcaneTransfer=target.hp===0&&allies?transferArcaneSurgeOnDeath(target,allies,round):null;
 return {damage,executedDamage,absorbed,rawDamage:raw,guardTriggered,...(guardTriggered&&isLastStandImmortal(target,round)?{lastStandTriggeredRound:target.lastStandTriggeredRound,lastStandImmortalUntilRound:target.lastStandImmortalUntilRound}:{}),...(arcaneTransfer?{arcaneTransfer}:{})};
}
