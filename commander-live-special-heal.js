// Server-owned heal/hybrid action. Never accepts client effect amounts.
import {resolveSpecialHealing} from './battle-special-formulas.js';
export function applyServerSpecialHeal(combat,{side,actorId,round=combat?.round}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||round%3!==0)throw Error('Invalid special heal turn');
 const next=structuredClone(combat.teams);
 const actor=next[side].find(u=>u.id===actorId&&u.hp>0);
 if(!actor||!Number.isFinite(actor.attack)||actor.attack<0)throw Error('Invalid healing actor');
 const resolved=resolveSpecialHealing(actor,next[side]);
 if(!resolved)throw Error('No applicable special heal');
 const {target,heal,shield}=resolved;
 target.hp+=heal;actor.healing=(actor.healing||0)+heal;
 if(shield)target.shield=(target.shield||0)+shield;
 combat.teams=next;combat.version++;
 const events=[];
 if(heal)events.push({round,side,actor:actorId,action:'heal',target:target.id,value:heal,version:combat.version});
 if(shield)events.push({round,side,actor:actorId,action:'shield',target:target.id,value:shield,version:combat.version});
 combat.events.push(...events);
 return {version:combat.version,event:events[0]??null,events,teams:structuredClone(next),finished:combat.finished};
}
