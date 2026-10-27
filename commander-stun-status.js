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
 for(const team of teams)for(const unit of team)if(unit.hp<=0)delete unit.commanderStunNextAttack;
}
