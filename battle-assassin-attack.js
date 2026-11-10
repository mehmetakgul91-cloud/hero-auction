// Apply once, only while preparing a NEW battle, after formation, credits,
// commander support and starting passives have produced the final base attack.
// Existing combat snapshots, round updates and revivals never call this helper.
// Do not change card power, defense, HP, speed or per-hit skill multipliers.
export function applyAssassinStartingAttackBonus(team){
 for(const unit of team)if(unit.role==='assassin')unit.attack=Math.round(unit.attack*11/10);
 return team;
}
