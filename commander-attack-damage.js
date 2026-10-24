// Commander strength is captured after formation, credit and starting bonuses.
// Casualties must not consume the power saved up for an ultimate ability.
export function commanderAttackPower(team){
 if(!Array.isArray(team))throw Error('Invalid commander team');
 return team.reduce((sum,hero)=>{
  const attack=Number(hero.attack??0);
  if(!Number.isFinite(attack)||attack<0)throw Error('Invalid commander attack power');
  return sum+attack;
 },0);
}

// Round the total once, then distribute the remainder. Rounding every target
// down used to discard up to four damage points, hiding small level upgrades.
export function distributeCommanderAttack(power,rate,targetCount){
 if(!Number.isFinite(power)||power<0||!Number.isFinite(rate)||rate<0||!Number.isSafeInteger(targetCount)||targetCount<1)throw Error('Invalid commander damage');
 const total=Math.max(1,Math.round(power*rate));
 const each=Math.floor(total/targetCount),remainder=total%targetCount;
 return Array.from({length:targetCount},(_,index)=>each+(index<remainder?1:0));
}
