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
export function expireCommanderStun(teams){
 if(teams.some(team=>team.every(unit=>unit.hp<=0))){clearCommanderStun(teams);return;}
 for(const team of teams)for(const unit of team)if(unit.hp<=0){delete unit.commanderStunNextAttack;delete unit.commanderStunNextAction;}
}

// New casts consume the hero's next scheduled action, before healing/shields.
// The separate legacy flag above keeps saved next-attack stuns honest.
export const hasCommanderActionStun=unit=>unit?.hp>0&&unit.commanderStunNextAction===true;
export function grantCommanderActionStun(unit){
 if(!unit||!Number.isFinite(unit.hp)||unit.hp<=0)throw Error('Commander stun requires a living enemy');
 delete unit.commanderStunNextAttack;
 unit.commanderStunNextAction=true;
}
export function consumeCommanderActionStun(unit){
 if(!hasCommanderActionStun(unit))return false;
 delete unit.commanderStunNextAction;return true;
}
export function clearCommanderStun(teams){
 for(const team of teams)for(const unit of team){delete unit.commanderStunNextAttack;delete unit.commanderStunNextAction;}
}
