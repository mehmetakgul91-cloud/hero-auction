// Experimental server-owned special healing. Never accept heal amounts from clients.
import {calculateSpecialHeal} from './battle-special-formulas.js';
export function applyServerSpecialHeal(combat,{side,actorId,round=combat?.round}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||round%3!==0)throw Error('Invalid special heal turn');
 const next=structuredClone(combat.teams);
 const actor=next[side].find(u=>u.id===actorId&&u.hp>0);
 if(!actor||!Number.isFinite(actor.attack)||actor.attack<0)throw Error('Invalid healing actor');
 // Legacy support heal precedes the active self-heal check on special rounds.
 const allies=next[side];
 let target=null;
 if(actor.role==='support'){
  target=[...allies].filter(u=>u.hp>0&&u.hp<u.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0]??null;
 }
 if(!target){
  if(actor.active?.effect!=='heal'||actor.hp>=actor.maxHp)throw Error('No applicable special heal');
  target=actor;
 }
 const amount=calculateSpecialHeal({attack:actor.attack,missingHp:target.maxHp-target.hp});
 target.hp+=amount;
 actor.healing=(actor.healing||0)+amount;
 combat.teams=next;
 combat.version++;
 const event={round,side,actor:actorId,action:'heal',target:target.id,value:amount,version:combat.version};
 combat.events.push(event);
 return {version:combat.version,event,teams:structuredClone(next),finished:combat.finished};
}
