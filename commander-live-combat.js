import {consumeCommanderStun,expireCommanderStun} from './commander-stun-status.js';
import {finishHeroDelay} from './battle-delay.js';
import {consumeCommanderWeaken,expireCommanderWeaken} from './commander-weaken-status.js';
import {expireCommanderFocus} from './battle-commander-focus.js';
import {expireCommanderUltimateStatuses} from './commander-ultimate-status.js';
import {applyHeroDamage,expireLastStandGuards} from './battle-hp-damage.js';
import {commanderEnergyPerRound} from './public/commander-ability-rules.js';
// Server-owned atomic commander cast and snapshot update.
// Keep this adapter isolated until hero attacks are driven by the same live session.
import {grantLiveCommanderEnergy,castLiveCommanderAbility} from './commander-live-abilities.js';
import {applyLiveCommanderEffect} from './commander-live-effects.js';
import {commanderAttackPower} from './commander-attack-damage.js';

export function createLiveCommanderCombat({abilities,teams,commanders,round=1}){
 if(!abilities||!Array.isArray(teams)||teams.length!==2||!Array.isArray(commanders)||commanders.length!==2)throw Error('Invalid live combat');
 if(commanders.some(c=>!['attack','defense','magic','support'].includes(c?.commanderId)))throw Error('Invalid commander profiles');
 // Actual authoritative profiles override any standalone ability fixture IDs.
 abilities.commanderIds=Object.freeze(commanders.map(profile=>profile.commanderId));
 abilities.ultimateUsed??=[false,false];
 return {abilities,ultimateUsed:abilities.ultimateUsed,teams:structuredClone(teams),commanders:structuredClone(commanders),commanderAttackPower:teams.map(commanderAttackPower),round,version:0,events:[],revivalUsed:[false,false],finished:false};
}
export function castLiveCommanderCombat(combat,{side,ability,requestId,matchKey,now=Date.now(),targetIds}){
 if(!combat||combat.finished)throw Error('Battle already finished');
 if(![0,1].includes(side))throw Error('Unauthorized commander seat');
 const requestKey=side+':'+requestId;
 const prior=combat.abilities.requests.get(requestKey);
 if(prior){
  if(prior.ability!==ability||JSON.stringify(prior.targetIds??null)!==JSON.stringify(targetIds??null))throw Error('Cast request ID conflict');
  return {duplicate:true,version:prior.version,events:[],teams:structuredClone(combat.teams)};
 }
 if(ability==='ultimate'&&combat.abilities.ultimateUsed?.[side])throw Error('Commander ultimate already used');
 // Compute effects first, without changing energy or HP if the cast cannot apply.
 const effect=applyLiveCommanderEffect(combat.teams,{side,ability,commanderId:combat.commanders[side].commanderId,commanderProfile:combat.commanders[side],attackBasis:combat.commanderAttackPower[side],round:combat.round,targetIds,revivalUsed:!!combat.revivalUsed?.[side]});
 const cast=castLiveCommanderAbility(combat.abilities,{side,ability,requestId,matchKey,now});
 combat.teams=effect.teams;
 combat.revivalUsed??=[false,false];combat.revivalUsed[side]=effect.revivalUsed;
 combat.version++;
 const events=effect.log.map(entry=>({...entry,energy:cast.energy,ultimateEnergy:cast.ultimateEnergy,ultimateUsed:cast.ultimateUsed,version:combat.version,sequence:cast.cast.sequence,at:now,effectUntil:cast.effectUntil}));
 combat.events.push(...events);
 combat.finished=effect.finished;
 combat.abilities.finished=effect.finished;
 const record=combat.abilities.requests.get(requestKey);
 if(record){record.version=combat.version;record.targetIds=structuredClone(targetIds??null);}
 return {duplicate:false,version:combat.version,events,teams:structuredClone(combat.teams),finished:combat.finished,energy:cast.energy,ultimateEnergy:cast.ultimateEnergy,normalCooldownUntil:cast.normalCooldownUntil,normalCooldownMs:cast.normalCooldownMs,cooldownUntil:cast.cooldownUntil};
}
export function viewLiveCommanderCombat(combat,{sinceVersion=0}={}){
 if(!combat||!Number.isSafeInteger(sinceVersion)||sinceVersion<0)throw Error('Invalid snapshot request');
 return {version:combat.version,round:combat.round,teams:structuredClone(combat.teams),ultimateUsed:[...(combat.abilities.ultimateUsed||[false,false])],revivalUsed:[...(combat.revivalUsed||[false,false])],
  events:combat.events.filter(e=>e.version>sinceVersion),finished:combat.finished};
}

// A skipped attack is one authoritative action, but never damage, a special,
// an AoE hit or a focus charge. Healing/shield-only callers do not invoke this.
export function applyServerStunSkip(combat,{side,actorId,round=combat?.round}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round)throw Error('Invalid stun action');
 const actor=combat.teams[side].find(u=>u.id===actorId&&u.hp>0);
 if(!actor)throw Error('Invalid acting hero');
 if(!consumeCommanderStun(actor))return null;
 actor.lastActionRound=round;finishHeroDelay(actor,round);
 combat.version++;
 const event={round,side,actor:actorId,action:'stun-skip',target:actorId,value:0,version:combat.version};
 combat.events.push(event);
 return {version:combat.version,event,teams:structuredClone(combat.teams),finished:combat.finished};
}

// Advance a trusted, server-calculated hero action on the same authoritative
// snapshot as commander abilities. Never accept this action from an HTTP client.
export function applyServerHeroAction(combat,{side,actorId,targetId,action='attack',value,round=combat?.round,applyThorns=false}){
 if(!combat||combat.finished)throw Error('Battle already finished');
 if(![0,1].includes(side)||!['attack','heal','shield'].includes(action)||!Number.isSafeInteger(value)||value<0||value>1000000||!Number.isInteger(round)||round!==combat.round)throw Error('Invalid server hero action');
 const next=structuredClone(combat.teams);
 const actor=next[side].find(u=>u.id===actorId&&u.hp>0);
 const targetSide=action==='heal'||action==='shield'?side:1-side;
 const target=next[targetSide].find(u=>u.id===targetId&&u.hp>0);
 if(!actor||!target)throw Error('Invalid living actor or target');
 if(action==='attack'){const skipped=applyServerStunSkip(combat,{side,actorId,round});if(skipped)return skipped;}
 let applied=0,absorbed=0,guardTriggered=false,arcaneTransfer;
 if(action==='attack'){
  ({damage:applied,absorbed,guardTriggered,arcaneTransfer}=applyHeroDamage(target,value,{round,allies:next[targetSide]}));
  actor.damage=(actor.damage||0)+applied;
  if(target.hp===0)actor.kills=(actor.kills||0)+1;
 }else if(action==='shield'){
  applied=value;
  target.shield=(target.shield||0)+applied;
 }else{
  applied=Math.min(target.maxHp-target.hp,value);
  target.hp+=applied;
  actor.healing=(actor.healing||0)+applied;
 }
 if(applyThorns&&action==='attack'&&actor.hp>0&&actor.passive?.effect==='thorns'){
  const amount=Math.floor(actor.defense*actor.passive.value);
  if(!Number.isSafeInteger(amount)||amount<0)throw Error('Invalid thorns value');
  actor.shield=(actor.shield||0)+amount;
 }
 if(action==='attack')consumeCommanderWeaken(actor);
 combat.teams=next;
 combat.version++;
 const event={round,side,actor:actorId,action,target:targetId,value:applied,absorbed,version:combat.version,...(guardTriggered?{guardTriggered:true}:{}),...(arcaneTransfer?{arcaneTransfer}:{})};
 if(applyThorns&&action==='attack'&&actor.passive?.effect==='thorns')event.thornsShield=Math.floor(actor.defense*actor.passive.value);
 combat.events.push(event);
 // Preserve the existing per-casualty energy bonus once, per affected side.
 if(action==='attack'&&target.hp===0)grantLiveCommanderEnergy(combat.abilities,targetSide,10);
 expireCommanderFocus(next,round);
 combat.finished=next.some(team=>team.every(u=>u.hp<=0));
 combat.abilities.finished=combat.finished;
 return {version:combat.version,event,teams:structuredClone(next),finished:combat.finished};
}
export function beginServerCombatRound(combat,round){
 if(!combat||combat.finished||!Number.isInteger(round)||round!==combat.round+1||round>15)throw Error('Invalid next combat round');
 combat.round=round;
 expireLastStandGuards(combat.teams,round);
 expireCommanderUltimateStatuses(combat.teams,round);
 expireCommanderFocus(combat.teams,round);
 expireCommanderWeaken(combat.teams,round);
 expireCommanderStun(combat.teams);
 for(let side=0;side<2;side++)grantLiveCommanderEnergy(combat.abilities,side,commanderEnergyPerRound(combat.commanders[side]));
 combat.version++;
 const event={round,action:'round-start',energy:[...combat.abilities.energy],ultimateEnergy:[...combat.abilities.ultimateEnergy],version:combat.version};
 combat.events.push(event);
 return {round,energy:[...combat.abilities.energy],ultimateEnergy:[...combat.abilities.ultimateEnergy],version:combat.version,event};
}
