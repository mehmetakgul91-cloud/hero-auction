import {calculateShieldAbsorption} from './battle-shield-absorption.js';
// Bridge existing deterministic battle logs to the experimental live combat session.
// Supports direct damage, splash, shield and healing logs. Passive buffs,
// debuffs and unlogged state changes require dedicated engine integration.
// This bridge is not an HTTP endpoint and must only receive server-generated logs.
import {applyServerHeroAction,beginServerCombatRound} from './commander-live-combat.js';

export function applyBattleLogHeroEvent(combat,event){
 if(!combat||!event||!Number.isInteger(event.round)||event.round<1||event.round>15)throw Error('Invalid battle log event');
 if(event.round!==combat.round&&event.round!==combat.round+1)throw Error('Out-of-order battle event');
 if(![0,1].includes(event.side)||typeof event.actor!=='string'||typeof event.target!=='string')throw Error('Invalid battle actor or target');
 if(event.actor.startsWith('commander:'))throw Error('Commander log must not be replayed as hero action');
 const isHeal=event.action==='heal'||event.action==='passive-heal';
 const isShield=event.action==='shield';
 const isDamage=event.damageType==='normal'||event.damageType==='special'||event.damageType==='splash'||event.action==='attack';
 if(!isHeal&&!isShield&&!isDamage)throw Error('Unsupported battle event; requires full engine integration');
 if(!Number.isSafeInteger(event.value)||event.value<0)throw Error('Invalid battle log value');
 let amount=event.value;
 if(isDamage){
  const absorbed=event.absorbed??0;
  if(!Number.isSafeInteger(absorbed)||absorbed<0)throw Error('Invalid absorbed damage');
  amount=event.rawDamage;
  if(!Number.isSafeInteger(amount)||amount<0||amount>1000000||amount<event.value+absorbed)throw Error('Damage log requires trustworthy raw damage');
  const target=combat.teams[1-event.side]?.find(u=>u.id===event.target&&u.hp>0);
  if(!target||calculateShieldAbsorption(target.shield||0,amount)!==absorbed||Math.min(target.hp,amount-absorbed)!==event.value)throw Error('Battle log diverged from authoritative state');
 }
 // Do not grant next-round energy until all event validations have passed.
 if(event.round===combat.round+1)beginServerCombatRound(combat,event.round);
 return applyServerHeroAction(combat,{side:event.side,actorId:event.actor,targetId:event.target,
  action:isHeal?'heal':isShield?'shield':'attack',value:amount,round:event.round});
}
