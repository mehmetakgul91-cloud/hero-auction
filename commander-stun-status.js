// Server-owned, non-stacking charge. It has no round deadline: an already-acted
// hero must still lose its NEXT attacking action, not expire before reaching it.
export const hasCommanderStun=unit=>unit?.hp>0&&unit.commanderStunNextAttack===true;
export function grantCommanderStun(unit){
 if(!unit||!Number.isFinite(unit.hp)||unit.hp<=0)throw Error('Commander stun requires a living enemy');
 unit.commanderStunNextAttack=true;
}
export function consumeCommanderStun(unit){
 if(!hasCommanderStun(unit))return false;
 delete unit.commanderStunNextAttack;return true;
}
export function expireCommanderStun(teams,round){
 if(teams.some(team=>team.every(unit=>unit.hp<=0))){clearCommanderStun(teams);return;}
 for(const team of teams)for(const unit of team){
  if(Number.isInteger(round)&&round>unit.commanderStunConsumedRound)delete unit.commanderStunConsumedRound;
  if(unit.hp<=0)clearHeroCommanderStun(unit);
  else if(Number.isInteger(round)&&round>unit.commanderStunBlockedRound&&!hasCommanderActionStun(unit)){delete unit.commanderStunVersion;delete unit.commanderStunBlockedRound;}
 }
}

// New casts consume the hero's next scheduled action, before healing/shields.
// The separate legacy flag above keeps saved next-attack stuns honest.
export const hasCommanderActionStun=unit=>unit?.hp>0&&unit.commanderStunNextAction===true;
export function grantCommanderActionStun(unit,round){
 if(!unit||!Number.isFinite(unit.hp)||unit.hp<=0)throw Error('Commander stun requires a living enemy');
 delete unit.commanderStunNextAttack;
 // Reapplying a pending charge cannot move its blocked turn or stack charges.
 if(Number.isInteger(round)&&round>=1&&!(unit.commanderStunNextAction&&unit.commanderStunVersion===2)){
  unit.commanderStunVersion=2;
  unit.commanderStunBlockedRound=Math.max(unit.lastActionRound>=round?round+1:round,Number.isInteger(unit.canActFromRound)?unit.canActFromRound:round);
 }
 unit.commanderStunNextAction=true;
}
export function consumeCommanderActionStun(unit,round){
 if(!hasCommanderActionStun(unit))return false;
 if(unit.commanderStunVersion===2&&Number.isInteger(round)){
  if(round<unit.commanderStunBlockedRound)return false;
  // The flag survives interrupted scheduling, but silences the actual blocked turn.
  unit.commanderStunBlockedRound=round;unit.commanderStunConsumedRound=round;
 }
 delete unit.commanderStunNextAction;return true;
}
export function clearCommanderStun(teams){
 for(const team of teams)for(const unit of team)clearHeroCommanderStun(unit);
}

export const commanderPassivesSuppressed=(unit,round)=>unit?.hp>0&&unit.commanderStunVersion===2&&(unit.commanderStunBlockedRound===round||unit.commanderStunConsumedRound===round);
export function clearHeroCommanderStun(unit){
 for(const key of ['commanderStunNextAttack','commanderStunNextAction','commanderStunVersion','commanderStunBlockedRound','commanderStunConsumedRound'])delete unit[key];
}
