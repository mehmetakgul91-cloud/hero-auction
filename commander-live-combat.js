// Server-owned atomic commander cast and snapshot update.
// Keep this adapter isolated until hero attacks are driven by the same live session.
import {grantLiveCommanderEnergy,castLiveCommanderAbility} from './commander-live-abilities.js';
import {applyLiveCommanderEffect} from './commander-live-effects.js';

export function createLiveCommanderCombat({abilities,teams,commanders,round=1}){
 if(!abilities||!Array.isArray(teams)||teams.length!==2||!Array.isArray(commanders)||commanders.length!==2)throw Error('Invalid live combat');
 if(commanders.some(c=>!['attack','defense','magic','support'].includes(c?.commanderId)))throw Error('Invalid commander profiles');
 return {abilities,teams:structuredClone(teams),commanders:structuredClone(commanders),round,version:0,events:[],finished:false};
}
export function castLiveCommanderCombat(combat,{side,ability,requestId,matchKey,now=Date.now()}){
 if(!combat||combat.finished)throw Error('Battle already finished');
 if(![0,1].includes(side))throw Error('Unauthorized commander seat');
 const requestKey=side+':'+requestId;
 const prior=combat.abilities.requests.get(requestKey);
 if(prior){
  if(prior.ability!==ability)throw Error('Cast request ID conflict');
  return {duplicate:true,version:prior.version,events:[],teams:structuredClone(combat.teams)};
 }
 // Compute effects first, without changing energy or HP if the cast cannot apply.
 const effect=applyLiveCommanderEffect(combat.teams,{side,ability,commanderId:combat.commanders[side].commanderId,round:combat.round});
 const cast=castLiveCommanderAbility(combat.abilities,{side,ability,requestId,matchKey,now});
 combat.teams=effect.teams;
 combat.version++;
 const events=effect.log.map(entry=>({...entry,version:combat.version,sequence:cast.cast.sequence}));
 combat.events.push(...events);
 combat.finished=effect.finished;
 combat.abilities.finished=effect.finished;
 const record=combat.abilities.requests.get(requestKey);
 if(record)record.version=combat.version;
 return {duplicate:false,version:combat.version,events,teams:structuredClone(combat.teams),finished:combat.finished,energy:cast.energy,cooldownUntil:cast.cooldownUntil};
}
export function viewLiveCommanderCombat(combat,{sinceVersion=0}={}){
 if(!combat||!Number.isSafeInteger(sinceVersion)||sinceVersion<0)throw Error('Invalid snapshot request');
 return {version:combat.version,round:combat.round,teams:structuredClone(combat.teams),
  events:combat.events.filter(e=>e.version>sinceVersion),finished:combat.finished};
}

// Advance a trusted, server-calculated hero action on the same authoritative
// snapshot as commander abilities. Never accept this action from an HTTP client.
export function applyServerHeroAction(combat,{side,actorId,targetId,action='attack',value,round=combat?.round}){
 if(!combat||combat.finished)throw Error('Battle already finished');
 if(![0,1].includes(side)||!['attack','heal'].includes(action)||!Number.isSafeInteger(value)||value<0||value>1000000||!Number.isInteger(round)||round!==combat.round)throw Error('Invalid server hero action');
 const next=structuredClone(combat.teams);
 const actor=next[side].find(u=>u.id===actorId&&u.hp>0);
 const targetSide=action==='heal'?side:1-side;
 const target=next[targetSide].find(u=>u.id===targetId&&u.hp>0);
 if(!actor||!target)throw Error('Invalid living actor or target');
 let applied=0,absorbed=0;
 if(action==='attack'){
  absorbed=Math.min(target.shield||0,value);
  target.shield=(target.shield||0)-absorbed;
  applied=Math.min(target.hp,value-absorbed);
  target.hp-=applied;
  actor.damage=(actor.damage||0)+applied;
  if(target.hp===0)actor.kills=(actor.kills||0)+1;
 }else{
  applied=Math.min(target.maxHp-target.hp,value);
  target.hp+=applied;
  actor.healing=(actor.healing||0)+applied;
 }
 combat.teams=next;
 combat.version++;
 const event={round,side,actor:actorId,action,target:targetId,value:applied,absorbed,version:combat.version};
 combat.events.push(event);
 // Preserve the existing per-casualty energy bonus once, per affected side.
 if(action==='attack'&&target.hp===0)grantLiveCommanderEnergy(combat.abilities,targetSide,10);
 combat.finished=next.some(team=>team.every(u=>u.hp<=0));
 combat.abilities.finished=combat.finished;
 return {version:combat.version,event,teams:structuredClone(next),finished:combat.finished};
}
export function beginServerCombatRound(combat,round){
 if(!combat||combat.finished||!Number.isInteger(round)||round!==combat.round+1||round>15)throw Error('Invalid next combat round');
 combat.round=round;
 for(let side=0;side<2;side++)grantLiveCommanderEnergy(combat.abilities,side,12);
 return {round,energy:[...combat.abilities.energy]};
}
