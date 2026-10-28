// One server-owned charge affects an entire next hero attack, including AoE.
// Legacy snapshots without the marker retain their existing timed behavior.
const fields=['commanderWeaken','commanderWeakenUntilRound','commanderWeakenNextAttack'];
const clear=unit=>{for(const field of fields)delete unit[field];};
export function commanderWeakenRate(unit,round){
 if(!unit||!Number.isInteger(round)||round<1)return 0;
 const active=unit.commanderWeakenNextAttack===true||(unit.commanderWeakenNextAttack===undefined&&Number.isInteger(unit.commanderWeakenUntilRound)&&round<=unit.commanderWeakenUntilRound);
 return active?Math.max(0,Math.min(1,Number(unit.commanderWeaken)||0)):0;
}
export function grantCommanderWeaken(unit,rate,round){
 if(!unit||!Number.isFinite(unit.hp)||unit.hp<=0||!Number.isFinite(rate)||rate<0||rate>1||!Number.isInteger(round)||round<1)throw Error('Invalid commander weaken');
 unit.commanderWeaken=Math.max(commanderWeakenRate(unit,round),rate);unit.commanderWeakenNextAttack=true;delete unit.commanderWeakenUntilRound;
 return unit.commanderWeaken;
}
export function consumeCommanderWeaken(unit){
 if(unit?.commanderWeakenNextAttack!==true)return false;
 clear(unit);return true;
}
export function expireCommanderWeaken(teams,round){
 if(!Array.isArray(teams)||!Number.isInteger(round)||round<1)throw Error('Invalid commander weaken expiry');
 for(const team of teams)for(const unit of team)if(unit.hp<=0||!commanderWeakenRate(unit,round))clear(unit);
}
