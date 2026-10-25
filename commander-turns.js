import {COMMANDER_ROUND_ENERGY,commanderEnergyPerRound,COMMANDER_ABILITY_COSTS,getCommanderAbilityCost} from './public/commander-ability-rules.js';
// Isolated turn-command validation for the upcoming multiplayer arena.
// This module does not change the existing battle engine or live endpoints.
export const COMMANDER_TURN_COST=COMMANDER_ABILITY_COSTS;
export const COMMANDER_MAX_ENERGY=100;
export const COMMANDER_TURN_ENERGY=COMMANDER_ROUND_ENERGY;

export function validateTurnCommand(command,{side,round,energy,ultimateEnergy,ultimateUsed=false,commanderId,targetIds}){
 if(!Number.isInteger(side)||![0,1].includes(side))throw Error('Invalid player side');
 if(!Number.isInteger(round)||round<1||round>15)throw Error('Invalid battle round');
 if(!Number.isInteger(energy)||energy<0||energy>100)throw Error('Invalid commander energy');
 if(!['attack','defense','magic','support'].includes(commanderId))throw Error('Commander not selected');
 if(targetIds!==undefined&&(!Array.isArray(targetIds)||targetIds.length!==1||typeof targetIds[0]!=='string'||!targetIds[0]||targetIds[0].length>120))throw Error('Invalid commander targets');
 if(command===null||command==='pass'){if(targetIds!==undefined)throw Error('Invalid commander targets');return null;}
 if(!['normal','ultimate'].includes(command))throw Error('Invalid commander ability');
 if(command==='ultimate'&&ultimateUsed)throw Error('Commander ultimate already used');
 const available=command==='ultimate'?ultimateEnergy:energy;
 if(!Number.isInteger(available)||available<0||available>100)throw Error('Invalid commander energy');
 if(available<getCommanderAbilityCost(commanderId,command))throw Error('Insufficient commander energy');
 return Object.freeze({side,round,ability:command,...(targetIds===undefined?{}:{targetIds:Object.freeze([...targetIds])})});
}

export function createTurnSubmissionState(round){
 if(!Number.isInteger(round)||round<1||round>15)throw Error('Invalid battle round');
 return {round,submissions:[undefined,undefined]};
}
export function submitTurnCommand(state,{side,round,command,energy,ultimateEnergy,ultimateUsed=false,commanderId,targetIds}){
 if(!state||!Array.isArray(state.submissions)||state.submissions.length!==2)throw Error('Invalid turn state');
 if(round!==state.round)throw Error('Stale or future turn');
 if(![0,1].includes(side))throw Error('Invalid player side');
 if(state.submissions[side]!==undefined)throw Error('Turn already submitted');
 const action=validateTurnCommand(command,{side,round,energy,ultimateEnergy,ultimateUsed,commanderId,targetIds});
 state.submissions[side]=action;
 return {ready:state.submissions.every(value=>value!==undefined),action};
}

export function resolveTurnSubmissions(state){
 if(!state||!Array.isArray(state.submissions)||state.submissions.length!==2)throw Error('Invalid turn state');
 if(!state.submissions.every(value=>value!==undefined))throw Error('Both players must submit before resolution');
 return state.submissions.filter(Boolean).map(action=>({...action}));
}
export function calculateNextTurnEnergy(energy,action,{lostHeroes=0,commanderProfile}={}){
 if(!Number.isInteger(energy)||energy<0||energy>100)throw Error('Invalid commander energy');
 if(!Number.isInteger(lostHeroes)||lostHeroes<0||lostHeroes>5)throw Error('Invalid hero loss count');
 const ability=action?.ability;
 if(action!==null&&!['normal','ultimate'].includes(ability))throw Error('Invalid commander ability');
 const cost=ability==='normal'?getCommanderAbilityCost(commanderProfile?.commanderId??'defense','normal'):0;
 if(cost===undefined||energy<cost)throw Error('Invalid or unaffordable commander action');
 return Math.min(COMMANDER_MAX_ENERGY,energy-cost+lostHeroes*10+commanderEnergyPerRound(commanderProfile));
}

// Ultimate charge grows independently; after its single successful use it freezes.
export function calculateNextTurnUltimateEnergy(ultimateEnergy,action,{lostHeroes=0,commanderProfile,ultimateUsed=false}={}){
 if(!Number.isInteger(ultimateEnergy)||ultimateEnergy<0||ultimateEnergy>100)throw Error('Invalid commander energy');
 if(!Number.isInteger(lostHeroes)||lostHeroes<0||lostHeroes>5)throw Error('Invalid hero loss count');
 const ability=action?.ability;
 if(action!==null&&!['normal','ultimate'].includes(ability))throw Error('Invalid commander ability');
 if(ultimateUsed){if(ability==='ultimate')throw Error('Commander ultimate already used');return ultimateEnergy;}
 const cost=ability==='ultimate'?getCommanderAbilityCost(commanderProfile?.commanderId??'defense','ultimate'):0;
 if(ultimateEnergy<cost)throw Error('Invalid or unaffordable commander action');
 return ability==='ultimate'?ultimateEnergy-cost:Math.min(COMMANDER_MAX_ENERGY,ultimateEnergy+lostHeroes*10+commanderEnergyPerRound(commanderProfile));
}

// Validate selected IDs against the server-owned previous round snapshot. The
// effect engine repeats validation on the actual ordered cast transaction.
export function validateCommanderTurnTargets(command,{commanderId,targetIds,teams,side}){
 const friendly=command==='ultimate'&&['magic','support'].includes(commanderId);
 const enemy=command==='normal'&&commanderId==='magic';
 if(!friendly&&targetIds===undefined)return;
 if(!friendly&&!enemy)throw Error('Invalid commander targets');
 if(enemy&&targetIds===undefined)return; // Legacy normal magic auto-targets.
 if(!Array.isArray(targetIds)||targetIds.length!==1||typeof targetIds[0]!=='string')throw Error('Select one friendly hero');
 const target=teams?.[friendly?side:1-side]?.find(u=>u.id===targetIds[0]);
 if(!target||(friendly&&commanderId==='support'?target.hp!==0:!(target.hp>0)))throw Error(friendly?(commanderId==='support'?'Select a fallen friendly hero':'Select a living friendly hero'):'Invalid magic targets');
}
