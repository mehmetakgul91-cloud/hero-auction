// Experimental server-authoritative, on-demand commander ability controller.
// The battle engine integration is separate: accepting a cast never fabricates combat damage.
export const COMMANDER_COOLDOWN_MS=5000;
export const COMMANDER_ABILITY_COSTS=Object.freeze({normal:40,ultimate:100});
export function createLiveCommanderAbilities({matchKey,energy=[0,0],now=Date.now()}={}){
 if(!matchKey||!Array.isArray(energy)||energy.length!==2||energy.some(n=>!Number.isInteger(n)||n<0||n>100))throw Error('Invalid live commander session');
 return {matchKey,energy:[...energy],cooldownUntil:[now,now],casts:[],requests:new Map(),finished:false};
}
export function viewLiveCommanderAbilities(session,side,now=Date.now()){
 if(!session||![0,1].includes(side))throw Error('Unauthorized commander seat');
 const cooldownMs=Math.max(0,session.cooldownUntil[side]-now);
 const energy=session.energy[side];
 return {energy,cooldownMs,cooldownUntil:session.cooldownUntil[side],finished:session.finished,
  canUseNormal:!session.finished&&cooldownMs===0&&energy>=40,
  canUseUltimate:!session.finished&&cooldownMs===0&&energy>=100,
  lastCast:session.casts.at(-1)||null};
}
export function grantLiveCommanderEnergy(session,side,amount){
 if(!session||session.finished||![0,1].includes(side)||!Number.isInteger(amount)||amount<0)throw Error('Invalid commander energy grant');
 session.energy[side]=Math.min(100,session.energy[side]+amount);
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
 const cost=COMMANDER_ABILITY_COSTS[ability];
 if(!cost)throw Error('Invalid commander ability');
 if(!Number.isFinite(now))throw Error('Invalid time');
 if(now<session.cooldownUntil[side])throw Error('Commander cooldown active');
 if(session.energy[side]<cost)throw Error('Insufficient commander energy');
 session.energy[side]-=cost;
 session.cooldownUntil[side]=now+COMMANDER_COOLDOWN_MS;
 const cast={side,ability,at:now,sequence:session.casts.length+1};
 session.casts.push(cast);
 const result={cast,...viewLiveCommanderAbilities(session,side,now)};
 session.requests.set(requestKey,{ability,result});
 return result;
}
