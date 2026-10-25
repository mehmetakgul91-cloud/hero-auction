import {transferArcaneSurgeOnDeath} from './commander-ultimate-status.js';
import {calculateShieldAbsorption} from './battle-shield-absorption.js';
// One-shot Son Kale: survives a lethal atomic hit at 1 HP. It never resurrects,
// heals, stacks charges, or bypasses the existing per-hit shield absorption.
export function grantLastStand(target,round){
 if(!Number.isInteger(round)||round<1)throw Error('Invalid last stand round');
 if(!target||!Number.isFinite(target.hp)||target.hp<=0)return false;
 if(target.lastStandReady===true&&Number.isInteger(target.lastStandUntilRound)&&target.lastStandUntilRound>=round)return false;
 target.lastStandReady=true;target.lastStandUntilRound=round+1;return true;
}
export function expireLastStandGuards(teams,round){
 if(!Array.isArray(teams)||!Number.isInteger(round)||round<1)throw Error('Invalid last stand expiry');
 for(const team of teams)for(const target of team){
  if(target.lastStandReady!==true||!Number.isInteger(target.lastStandUntilRound)||target.lastStandUntilRound<round){delete target.lastStandReady;delete target.lastStandUntilRound;}
 }
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
 const guarded=target.lastStandReady===true&&Number.isInteger(target.lastStandUntilRound)&&round<=target.lastStandUntilRound;
 const guardTriggered=guarded&&damage+executedDamage>=oldHp;
 if(guardTriggered){
  const budget=Math.max(0,oldHp-1);
  damage=Math.min(damage,budget);executedDamage=Math.min(executedDamage,Math.max(0,budget-damage));
  delete target.lastStandReady;delete target.lastStandUntilRound;
 }
 target.hp=oldHp-damage-executedDamage;
 const arcaneTransfer=target.hp===0&&allies?transferArcaneSurgeOnDeath(target,allies,round):null;
 return {damage,executedDamage,absorbed,rawDamage:raw,guardTriggered,...(arcaneTransfer?{arcaneTransfer}:{})};
}
