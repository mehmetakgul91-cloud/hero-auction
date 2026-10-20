// Exact damage calculation extracted from the existing automatic battle engine.
// Caller owns seeded RNG, critical roll and target/skill selection.
export function calculateHeroRawDamage({unit,target,skill=null,special=false,critical=false,guarded=false,weakened=0}){
 const multiplier=skill?.power??(special?1.15:1);
 const defense=skill?.effect==='pierce'?Math.floor(target.defense*.6):target.defense;
 const roleMultiplier=(guarded?0.85:1)*(unit.role==='energy'?0.97:unit.role==='support'?1.03:1);
 return skill?.effect==='headshot'?target.hp+target.shield:
  Math.max(1,Math.floor(unit.attack*(1-weakened)*multiplier*roleMultiplier*0.7*100/(100+defense)*(critical?1.3:1)));
}
