// Server-owned temporary commander statuses. These helpers never mutate a
// hero's computed attack/defense/speed or reapply formation/credit/passive bonuses.
const validRound=round=>Number.isInteger(round)&&round>=1;
const arcaneFields=['arcaneSurgeBonusAttack','arcaneSurgeFromRound','arcaneSurgeUntilRound'];
export function grantArcaneSurge(target,round){
 if(!validRound(round))throw Error('Invalid arcane surge round');
 if(!target||!Number.isFinite(target.hp)||target.hp<=0||!Number.isFinite(target.attack)||target.attack<0)throw Error('Arcane surge requires a living ally');
 // An active or scheduled surge cannot be stacked or have its expiry refreshed.
 if(Number.isInteger(target.arcaneSurgeUntilRound)&&target.arcaneSurgeUntilRound>=round)return false;
 const start=target.lastActionRound===round?round+1:round;
 target.arcaneSurgeBonusAttack=target.attack;
 target.arcaneSurgeFromRound=start;
 target.arcaneSurgeUntilRound=start+2;
 return true;
}
export function arcaneDamageAttack(unit,round){
 const attack=unit?.attack;
 if(!Number.isFinite(attack)||attack<0)throw Error('Invalid damage attack');
 // Callers must supply the actual action round; absent round never grants a
 // stale/future bonus. Only damage uses this value: healing still reads attack.
 const active=validRound(round)&&Number.isInteger(unit.arcaneSurgeFromRound)&&Number.isInteger(unit.arcaneSurgeUntilRound)&&round>=unit.arcaneSurgeFromRound&&round<=unit.arcaneSurgeUntilRound;
 const bonus=active&&Number.isFinite(unit.arcaneSurgeBonusAttack)&&unit.arcaneSurgeBonusAttack>=0?unit.arcaneSurgeBonusAttack:0;
 return attack+bonus;
}
// Settle each atomic death immediately, including execute and successive AoE
// casualties. Transfer keeps the original expiry and never grants another
// buffed action in a round the previous bearer already used.
export function transferArcaneSurgeOnDeath(target,allies,round){
 if(!validRound(round)||!Array.isArray(allies))throw Error('Invalid arcane transfer');
 if(target?.hp!==0||!Number.isInteger(target.arcaneSurgeUntilRound)||target.arcaneSurgeUntilRound<round)return null;
 const until=target.arcaneSurgeUntilRound,originalFrom=target.arcaneSurgeFromRound;
 const consumed=target.lastActionRound===round;
 for(const key of arcaneFields)delete target[key];
 const recipient=allies.filter(u=>u!==target&&u.hp>0).sort((a,b)=>b.hp-a.hp||String(a.id).localeCompare(String(b.id)))[0];
 if(!recipient)return null;
 const from=Math.max(originalFrom,round+(consumed||recipient.lastActionRound===round?1:0));
 if(!Number.isInteger(from)||from>until)return null;
 // A separate existing surge must not be stacked, overwritten or refreshed.
 if(Number.isInteger(recipient.arcaneSurgeUntilRound)&&recipient.arcaneSurgeUntilRound>=round)return null;
 recipient.arcaneSurgeBonusAttack=recipient.attack;
 recipient.arcaneSurgeFromRound=from;
 recipient.arcaneSurgeUntilRound=until;
 return {sourceId:target.id,targetId:recipient.id,fromRound:from,untilRound:until,bonusAttack:recipient.attack};
}
export function expireCommanderUltimateStatuses(teams,round){
 if(!Array.isArray(teams)||teams.some(team=>!Array.isArray(team))||!validRound(round))throw Error('Invalid commander status expiry');
 for(const team of teams)for(const unit of team){
  if(!Number.isInteger(unit.arcaneSurgeUntilRound)||round>unit.arcaneSurgeUntilRound)for(const key of arcaneFields)delete unit[key];
 }
}
const revivalClearFields=[...arcaneFields,'commanderWeaken','commanderWeakenUntilRound','commanderWeakenNextAttack','delayDueRound','delayProtectedThroughRound','lastStandReady','lastStandPersistent','lastStandUntilRound','commanderFocusTargetId','commanderFocusUntilRound','commanderFocusUntilDeath','focusTargetId','focusUntilRound','focusRemaining'];
// The cast transaction validates own-side selection, combat still running and
// its once-per-battle allowance BEFORE calling this helper. It charges energy
// only after successful effect validation. This helper rejects an already-live
// target and deliberately does not rebuild stats or reset historical counters.
export function reviveCommanderAlly(target,round){
 if(!validRound(round))throw Error('Invalid revival round');
 if(!target||target.hp!==0||!Number.isSafeInteger(target.maxHp)||target.maxHp<=0)throw Error('Revival requires a fallen ally');
 for(const key of revivalClearFields)delete target[key];
 target.hp=Math.min(target.maxHp,Math.max(1,Math.floor(target.maxHp*.40)));
 target.shield=0;
 target.revivedAtRound=round;
 target.canActFromRound=round+1;
 target.lastActionRound=round;
 return {value:target.hp,canActFromRound:target.canActFromRound};
}
