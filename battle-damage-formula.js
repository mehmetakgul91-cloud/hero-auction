import {arcaneDamageAttack} from './commander-ultimate-status.js';
import {commanderHuntAttackBonus} from './commander-hunt-status.js';
import {abilityValue} from './public/hero-ability-rules.js';
// Exact damage calculation extracted from the existing automatic battle engine.
// Caller owns seeded RNG, critical roll and target/skill selection.
export function calculateHeroRawDamage({unit,target,skill=null,special=false,critical=false,guarded=false,weakened=0,round=null}){
 const multiplier=skill?.power??(special?1.15:1);
 const defense=skill?.effect==='pierce'?Math.floor(target.defense*(1-abilityValue(skill,'pierceRate'))):target.defense;
 const roleMultiplier=(guarded?0.85:1)*(unit.role==='energy'?0.97:unit.role==='support'?1.03:1);
 return skill?.effect==='headshot'?target.hp+target.shield:
  // Hunt adds 20% of current computed attack once, before defense/crit/skill
  // scaling. Arcane Surge's fixed snapshot bonus is not itself multiplied.
  Math.max(1,Math.floor((arcaneDamageAttack(unit,round)+commanderHuntAttackBonus(unit))*(1-weakened)*multiplier*roleMultiplier*0.7*100/(100+defense)*(critical?1.3:1)));
}
