// Isolated turn-command validation for the upcoming multiplayer arena.
// This module does not change the existing battle engine or live endpoints.
export const COMMANDER_TURN_COST=Object.freeze({normal:40,ultimate:100});
export const COMMANDER_MAX_ENERGY=100;
export const COMMANDER_TURN_ENERGY=12;

export function validateTurnCommand(command,{side,round,energy,commanderId}){
 if(!Number.isInteger(side)||![0,1].includes(side))throw Error('Invalid player side');
 if(!Number.isInteger(round)||round<1||round>15)throw Error('Invalid battle round');
 if(!Number.isInteger(energy)||energy<0||energy>100)throw Error('Invalid commander energy');
 if(!['attack','defense','magic','support'].includes(commanderId))throw Error('Commander not selected');
 if(command===null||command==='pass')return null;
 if(!['normal','ultimate'].includes(command))throw Error('Invalid commander ability');
 if(energy<COMMANDER_TURN_COST[command])throw Error('Insufficient commander energy');
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
