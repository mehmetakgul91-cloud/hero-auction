// Bridge existing deterministic battle logs to the experimental live combat session.
// Only direct damage/healing actions are supported here. Other effects (splash,
// shields, passive healing, debuffs) require dedicated authoritative handlers.
// This bridge is not an HTTP endpoint and must only receive server-generated logs.
import {applyServerHeroAction,beginServerCombatRound} from './commander-live-combat.js';

export function applyBattleLogHeroEvent(combat,event){
 if(!combat||!event||!Number.isInteger(event.round)||event.round<1||event.round>15)throw Error('Invalid battle log event');
 if(event.round===combat.round+1)beginServerCombatRound(combat,event.round);
 if(event.round!==combat.round)throw Error('Out-of-order battle event');
 if(![0,1].includes(event.side)||typeof event.actor!=='string'||typeof event.target!=='string')throw Error('Invalid battle actor or target');
 if(event.actor.startsWith('commander:'))throw Error('Commander log must not be replayed as hero action');
 const isHeal=event.action==='heal';
 const isDamage=event.damageType==='normal'||event.damageType==='special'||event.action==='attack';
 if(!isHeal&&!isDamage)throw Error('Unsupported battle event; requires full engine integration');
 if(!Number.isSafeInteger(event.value)||event.value<0)throw Error('Invalid battle log value');
 // Existing log values represent actual HP loss after shields. Reapplying
 // absorption would double-count; reject shielded events until integrated.
 if(!isHeal&&(event.absorbed||0)!==0)throw Error('Shielded battle event requires engine integration');
 return applyServerHeroAction(combat,{side:event.side,actorId:event.actor,targetId:event.target,
  action:isHeal?'heal':'attack',value:event.value,round:event.round});
}
