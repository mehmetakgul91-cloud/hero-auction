import {COMMANDER_START_ENERGY,COMMANDER_ABILITY_COSTS,getCommanderAbilityCost,getUltimateEnergyCost} from './public/commander-ability-rules.js';
// Experimental server-authoritative, on-demand commander ability controller.
// The battle engine integration is separate: accepting a cast never fabricates combat damage.
export const COMMANDER_COOLDOWN_MS=5000;
export const COMMANDER_EFFECT_MS=1200;
export {COMMANDER_ABILITY_COSTS};
export function createLiveCommanderAbilities({matchKey,energy=[COMMANDER_START_ENERGY,COMMANDER_START_ENERGY],ultimateEnergy=energy,commanderIds=['defense','defense'],now=Date.now()}={}){
 if(!matchKey||!Array.isArray(energy)||energy.length!==2||energy.some(n=>!Number.isInteger(n)||n<0||n>100))throw Error('Invalid live commander session');
 if(!Array.isArray(ultimateEnergy)||ultimateEnergy.length!==2||ultimateEnergy.some(n=>!Number.isInteger(n)||n<0||n>100))throw Error('Invalid ultimate charge');
 if(!Array.isArray(commanderIds)||commanderIds.length!==2)throw Error('Invalid commander cost bindings');
 commanderIds.forEach(getUltimateEnergyCost);
 return {matchKey,commanderIds:Object.freeze([...commanderIds]),energy:[...energy],ultimateEnergy:[...ultimateEnergy],ultimateUsed:[false,false],cooldownUntil:[now,now],effectUntil:now,casts:[],requests:new Map(),finished:false};
}
export function viewLiveCommanderAbilities(session,side,now=Date.now()){
 if(!session||![0,1].includes(side))throw Error('Unauthorized commander seat');
 const cooldownMs=Math.max(0,session.cooldownUntil[side]-now);
 const effectLockMs=Math.max(0,(session.effectUntil||0)-now);
 const energy=session.energy[side],ultimateEnergy=session.ultimateEnergy[side];
 return {energy,ultimateEnergy,ultimateUsed:!!session.ultimateUsed?.[side],effectLockMs,effectUntil:session.effectUntil||0,cooldownMs,cooldownUntil:session.cooldownUntil[side],finished:session.finished,
  canUseNormal:!session.finished&&cooldownMs===0&&effectLockMs===0&&energy>=getCommanderAbilityCost(session.commanderIds?.[side]??'defense','normal'),
  canUseUltimate:!session.ultimateUsed?.[side]&&!session.finished&&cooldownMs===0&&effectLockMs===0&&ultimateEnergy>=getCommanderAbilityCost(session.commanderIds?.[side]??'defense','ultimate'),
  lastCast:session.casts.at(-1)||null};
}
export function grantLiveCommanderEnergy(session,side,amount){
 if(!session||session.finished||![0,1].includes(side)||!Number.isInteger(amount)||amount<0)throw Error('Invalid commander energy grant');
 session.energy[side]=Math.min(100,session.energy[side]+amount);
 if(!session.ultimateUsed[side])session.ultimateEnergy[side]=Math.min(100,session.ultimateEnergy[side]+amount);
 return session.energy[side];
}
export function castLiveCommanderAbility(session,{side,ability,now=Date.now(),matchKey,requestId}){
 if(!session||session.finished||session.matchKey!==matchKey)throw Error('Commander match expired');
 if(![0,1].includes(side))throw Error('Unauthorized commander seat');
 if(typeof requestId!=='string'||!/^[-a-zA-Z0-9_]{8,80}$/.test(requestId))throw Error('Invalid cast request ID');
 const requestKey=side+':'+requestId;
 const previous=session.requests.get(requestKey);
 if(previous){
  if(previous.ability!==ability)throw Error('Cast request ID conflict');
  return {...previous.result,duplicate:true};
 }
 if(ability==='ultimate'&&session.ultimateUsed?.[side])throw Error('Commander ultimate already used');
 const cost=getCommanderAbilityCost(session.commanderIds?.[side]??'defense',ability);
 if(!cost)throw Error('Invalid commander ability');
 if(!Number.isFinite(now))throw Error('Invalid time');
 if(now<(session.effectUntil||0))throw Error('Komutan efekti sürüyor. 1,2 saniyelik efektin bitmesini bekle.');
 if(now<session.cooldownUntil[side])throw Error('Commander cooldown active');
 const pool=ability==='ultimate'?session.ultimateEnergy:session.energy;
 if(pool[side]<cost)throw Error('Insufficient commander energy');
 pool[side]-=cost;
 if(ability==='ultimate'){session.ultimateUsed??=[false,false];session.ultimateUsed[side]=true;}
 session.effectUntil=now+COMMANDER_EFFECT_MS;
 session.cooldownUntil[side]=now+COMMANDER_COOLDOWN_MS;
 const cast={side,ability,at:now,sequence:session.casts.length+1};
 session.casts.push(cast);
 const result={cast,...viewLiveCommanderAbilities(session,side,now)};
 session.requests.set(requestKey,{ability,result});
 return result;
}
