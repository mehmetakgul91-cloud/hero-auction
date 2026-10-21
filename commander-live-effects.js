import {commanderAbilityStats} from './public/commander-ability-rules.js';
import {commanderAttackPower,distributeCommanderAttack} from './commander-attack-damage.js';
import {commanderShieldAmounts,commanderHealingBudget} from './commander-protection-budget.js';
// Deterministic commander effects against an already initialized combat snapshot.
// This is an isolated adapter; it does not advance the existing hero attack loop.
export function applyLiveCommanderEffect(teams,{side,ability,commanderId,commanderProfile={commanderId},attackBasis,round=1,targetIds}){
 if(!Array.isArray(teams)||teams.length!==2||teams.some(t=>!Array.isArray(t))||![0,1].includes(side))throw Error('Invalid battle snapshot');
 if(!['normal','ultimate'].includes(ability))throw Error('Invalid ability');
 if(!['attack','defense','magic','support'].includes(commanderId))throw Error('Invalid commander');
 const next=structuredClone(teams);
 const allies=next[side].filter(u=>u.hp>0),enemies=next[1-side].filter(u=>u.hp>0);
 if(!allies.length||!enemies.length)throw Error('Battle already finished');
 const stats=commanderAbilityStats(commanderProfile);
 if(commanderProfile.commanderId!==commanderId)throw Error('Invalid commander profile');
 const rate=ability==='ultimate'?stats.ultimateRate:stats.normalRate;
 const log=[],impacts=[],strong=ability==='ultimate';
 let value=0;
 if(commanderId==='attack'){
  const damageBudget=distributeCommanderAttack(attackBasis??commanderAttackPower(next[side]),rate,enemies.length);
  for(const [index,u] of enemies.entries()){
   const each=damageBudget[index];
   const absorbed=Math.min(u.shield||0,each);u.shield=(u.shield||0)-absorbed;
   const damage=Math.min(u.hp,each-absorbed);u.hp-=damage;value+=damage;
   impacts.push({target:u.id,kind:'damage',value:damage,absorbed});
   log.push({round,side,actor:'commander:'+side,action:'commander-hit',target:u.id,value:damage,absorbed,rawDamage:each,damageType:'commander'});
  }
 }else if(commanderId==='defense'){
  const amounts=commanderShieldAmounts(allies,rate);
  for(const [index,u] of allies.entries()){const each=amounts[index];u.shield=(u.shield||0)+each;value+=each;if(each>0)impacts.push({target:u.id,kind:'shield',value:each})}
 }else if(commanderId==='support'){
  let budget=commanderHealingBudget(allies,rate);
  for(const u of [...allies].sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||(b.maxHp-b.hp)-(a.maxHp-a.hp))){
   const healed=Math.max(0,Math.min(budget,u.maxHp-u.hp));u.hp+=healed;budget-=healed;value+=healed;
   if(healed>0)impacts.push({target:u.id,kind:'heal',value:healed});
  }
 }else{
  const count=strong?Math.min(2,enemies.length):1;
  if(!Array.isArray(targetIds)||targetIds.length!==count||new Set(targetIds).size!==count||targetIds.some(id=>typeof id!=='string'||!enemies.some(u=>u.id===id)))throw Error('Invalid magic targets');
  for(const id of targetIds){
   const u=enemies.find(hero=>hero.id===id);
   u.commanderWeaken=Math.max(u.commanderWeaken||0,rate);u.commanderWeakenUntilRound=round+2;value++;
   impacts.push({target:u.id,kind:'weaken',value:Number((u.commanderWeaken*100).toFixed(1))});
  }
 }
 log.push({round,side,actor:'commander:'+side,action:'commander-'+commanderId+'-'+ability,value,impacts,commanderLevel:stats.level,abilityBonusPercent:stats.bonusPercent});
 return {teams:next,log,finished:next.some(team=>team.every(u=>u.hp<=0))};
}
