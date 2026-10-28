// One fixed +20% charge per living ally, granted only by a committed Hunt Order.
// Never mutate attack: formation/credits/commander/passive modifiers have already
// been applied, and future rage/weakening changes remain authoritative.
export const COMMANDER_HUNT_ATTACK_RATE=.20;
export function grantCommanderHunt(unit){
 if(!unit||!Number.isFinite(unit.hp)||unit.hp<=0)throw Error('Hunt Order requires a living ally');
 unit.commanderHuntNextAttack=true;
}
export function commanderHuntAttackBonus(unit){
 return unit?.hp>0&&unit.commanderHuntNextAttack===true?unit.attack*COMMANDER_HUNT_ATTACK_RATE:0;
}
// The caller settles the complete attack before consuming, not each AoE hit.
export function consumeCommanderHunt(unit){
 if(unit?.commanderHuntNextAttack!==true)return false;
 delete unit.commanderHuntNextAttack;return true;
}
export function clearCommanderHunt(teams){
 for(const team of teams)for(const unit of team)delete unit.commanderHuntNextAttack;
}
export function expireCommanderHunt(teams){
 if(teams.some(team=>team.every(unit=>unit.hp<=0))){clearCommanderHunt(teams);return;}
 for(const team of teams)for(const unit of team)if(unit.hp<=0)delete unit.commanderHuntNextAttack;
}
