import {grantCommanderStun} from './commander-stun-status.js';
import {applyHeroDamage,grantLastStand,isLastStandActive} from './battle-hp-damage.js';
import {commanderAbilityStats} from './public/commander-ability-rules.js';
import {commanderAttackPower,distributeCommanderAttack} from './commander-attack-damage.js';
import {commanderShieldAmounts,commanderHealingBudget} from './commander-protection-budget.js';
import {grantCommanderFocus,expireCommanderFocus} from './battle-commander-focus.js';
import {grantArcaneSurge,reviveCommanderAlly} from './commander-ultimate-status.js';
const lowestHealth=units=>[...units].sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id.localeCompare(b.id))[0];
function selectedFriendly(allies,targetIds,{dead=false}={}){
 if(!Array.isArray(targetIds)||targetIds.length!==1||typeof targetIds[0]!=='string')throw Error('Select one friendly hero');
 const target=allies.find(u=>u.id===targetIds[0]&&(dead?u.hp===0:u.hp>0));
 if(!target)throw Error(dead?'Select a fallen friendly hero':'Select a living friendly hero');return target;
}
// Pure transaction preparation: no energy, battle flags or input teams mutate.
export function applyLiveCommanderEffect(teams,{side,ability,commanderId,commanderProfile={commanderId},attackBasis,round=1,targetIds,revivalUsed=false}){
 if(!Array.isArray(teams)||teams.length!==2||teams.some(t=>!Array.isArray(t))||![0,1].includes(side)||!Number.isInteger(round)||round<1)throw Error('Invalid battle snapshot');
 if(!['normal','ultimate'].includes(ability))throw Error('Invalid ability');
 if(!['attack','defense','magic','support'].includes(commanderId))throw Error('Invalid commander');
 const next=structuredClone(teams),allies=next[side].filter(u=>u.hp>0),enemies=next[1-side].filter(u=>u.hp>0);
 if(!allies.length||!enemies.length)throw Error('Battle already finished');
 const stats=commanderAbilityStats(commanderProfile);if(commanderProfile.commanderId!==commanderId)throw Error('Invalid commander profile');
 const strong=ability==='ultimate',rate=strong?stats.ultimateRate:stats.normalRate,log=[],impacts=[];let value=0,nextRevivalUsed=revivalUsed;
 if(commanderId==='attack'&&strong){
  if(!Array.isArray(targetIds)||targetIds.length!==1||typeof targetIds[0]!=='string')throw Error('Select one living enemy hero');
  const selected=enemies.find(unit=>unit.id===targetIds[0]);if(!selected)throw Error('Selected enemy is no longer alive or is invalid');
  const focused=grantCommanderFocus(allies,enemies,round,selected.id);if(!focused)throw Error('Focus order already active');value=focused.allyIds.length;
  impacts.push({target:focused.targetId,kind:'focus',value:focused.allyIds.length,untilDeath:true});
 }else if(commanderId==='attack'){
  const budget=distributeCommanderAttack(attackBasis??commanderAttackPower(next[side]),rate,enemies.length);
  for(const[index,u]of enemies.entries()){
   const hit=applyHeroDamage(u,budget[index],{round,allies:next[1-side]});value+=hit.damage;
   impacts.push({target:u.id,kind:'damage',value:hit.damage,absorbed:hit.absorbed,...(hit.guardTriggered?{guardTriggered:true}:{}),...(hit.arcaneTransfer?{arcaneTransfer:hit.arcaneTransfer}:{})});
   log.push({round,side,actor:'commander:'+side,action:'commander-hit',target:u.id,value:hit.damage,absorbed:hit.absorbed,rawDamage:budget[index],damageType:'commander',...(hit.guardTriggered?{guardTriggered:true}:{}),...(hit.arcaneTransfer?{arcaneTransfer:hit.arcaneTransfer}:{})});
  }
 }else if(commanderId==='defense'){
  const amounts=commanderShieldAmounts(allies,rate);
  for(const[index,u]of allies.entries()){const each=amounts[index];u.shield=(u.shield||0)+each;value+=each;if(each>0)impacts.push({target:u.id,kind:'shield',value:each});}
  if(strong){
   // Never accumulate several simultaneous death guards or refresh a live one.
   const already=allies.some(u=>isLastStandActive(u,round));
   if(!already){const target=lowestHealth(allies);if(grantLastStand(target,round))impacts.push({target:target.id,kind:'guard',value:1});}
  }
 }else if(commanderId==='support'&&strong){
  if(revivalUsed)throw Error('Revival already used this battle');
  const target=selectedFriendly(next[side],targetIds,{dead:true}),revived=reviveCommanderAlly(target,round);value=revived.value;nextRevivalUsed=true;
  impacts.push({target:target.id,kind:'revive',value});
  log.push({round,side,actor:'commander:'+side,action:'commander-revive',target:target.id,value,canActFromRound:target.canActFromRound});
 }else if(commanderId==='support'){
  let budget=commanderHealingBudget(allies,rate);
  for(const u of [...allies].sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||(b.maxHp-b.hp)-(a.maxHp-a.hp))){const healed=Math.max(0,Math.min(budget,u.maxHp-u.hp));u.hp+=healed;budget-=healed;value+=healed;if(healed>0)impacts.push({target:u.id,kind:'heal',value:healed});}
 }else if(strong){
  const target=selectedFriendly(next[side],targetIds);
  if(!grantArcaneSurge(target,round))throw Error('Hero already has active arcane surge');
  value=target.arcaneSurgeBonusAttack;impacts.push({target:target.id,kind:'buff',value,fromRound:target.arcaneSurgeFromRound,untilRound:target.arcaneSurgeUntilRound});
 }else{
  if(!Array.isArray(targetIds)||targetIds.length!==1||typeof targetIds[0]!=='string'||!enemies.some(u=>u.id===targetIds[0]))throw Error('Invalid magic targets');
  const target=enemies.find(u=>u.id===targetIds[0]);grantCommanderStun(target);value=1;
  impacts.push({target:target.id,kind:'stun',value:1,nextAttack:true});
 }
 expireCommanderFocus(next,round);
 log.push({round,side,actor:'commander:'+side,action:'commander-'+commanderId+'-'+ability,value,impacts,...(commanderId==='attack'&&strong?{focusUntilDeath:true}:{}),commanderLevel:stats.level,abilityBonusPercent:stats.bonusPercent});
 return {teams:next,log,revivalUsed:nextRevivalUsed,finished:next.some(team=>team.every(u=>u.hp<=0))};
}
