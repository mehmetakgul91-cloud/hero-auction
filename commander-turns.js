import {COMMANDER_ROUND_ENERGY,commanderEnergyPerRound,COMMANDER_ABILITY_COSTS,getCommanderAbilityCost} from './public/commander-ability-rules.js';
// Isolated turn-command validation for the upcoming multiplayer arena.
// This module does not change the existing battle engine or live endpoints.
export const COMMANDER_TURN_COST=COMMANDER_ABILITY_COSTS;
export const COMMANDER_MAX_ENERGY=100;
export const COMMANDER_TURN_ENERGY=COMMANDER_ROUND_ENERGY;

export function validateTurnCommand(command,{side,round,energy,commanderId}){
 if(!Number.isInteger(side)||![0,1].includes(side))throw Error('Invalid player side');
 if(!Number.isInteger(round)||round<1||round>15)throw Error('Invalid battle round');
 if(!Number.isInteger(energy)||energy<0||energy>100)throw Error('Invalid commander energy');
 if(!['attack','defense','magic','support'].includes(commanderId))throw Error('Commander not selected');
 if(command===null||command==='pass')return null;
 if(!['normal','ultimate'].includes(command))throw Error('Invalid commander ability');
 if(energy<getCommanderAbilityCost(commanderId,command))throw Error('Insufficient commander energy');
 return Object.freeze({side,round,ability:command});
}

export function createTurnSubmissionState(round){
 if(!Number.isInteger(round)||round<1||round>15)throw Error('Invalid battle round');
 return {round,submissions:[undefined,undefined]};
}
export function submitTurnCommand(state,{side,round,command,energy,commanderId}){
 if(!state||!Array.isArray(state.submissions)||state.submissions.length!==2)throw Error('Invalid turn state');
 if(round!==state.round)throw Error('Stale or future turn');
 if(![0,1].includes(side))throw Error('Invalid player side');
 if(state.submissions[side]!==undefined)throw Error('Turn already submitted');
 const action=validateTurnCommand(command,{side,round,energy,commanderId});
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
 const cost=action===null?0:getCommanderAbilityCost(commanderProfile?.commanderId??'defense',action?.ability);
 if(cost===undefined||energy<cost)throw Error('Invalid or unaffordable commander action');
 return Math.min(COMMANDER_MAX_ENERGY,energy-cost+lostHeroes*10+commanderEnergyPerRound(commanderProfile));
}
