// Energy role splash also accompanies non-damage active effects (weaken/drain).
// Mutates only the action's cloned teams; the caller commits it atomically.
import {calculateSplashRawDamage} from './battle-special-formulas.js';
export function applyEnergySpecialSplash({actor,enemies,target,raw,round,side,events}){
 if(actor.role!=='energy')return 0;
 const amount=calculateSplashRawDamage(raw,{skill:actor.active,role:actor.role,special:true});
 let deaths=0;
 for(const victim of enemies.filter(unit=>unit!==target&&unit.hp>0)){
  const absorbed=Math.min(victim.shield||0,amount);
  victim.shield=(victim.shield||0)-absorbed;
  const damage=Math.min(victim.hp,amount-absorbed);
  victim.hp-=damage;actor.damage=(actor.damage||0)+damage;
  if(victim.hp===0){actor.kills=(actor.kills||0)+1;deaths++;}
  events.push({round,side,actor:actor.id,action:'splash',target:victim.id,value:damage,absorbed,rawDamage:amount,damageType:'splash'});
 }
 return deaths;
}
