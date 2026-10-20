// Server-owned atomic commander cast and snapshot update.
// Keep this adapter isolated until hero attacks are driven by the same live session.
import {castLiveCommanderAbility} from './commander-live-abilities.js';
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
