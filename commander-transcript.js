// Deterministic adapter for a complete commander command transcript.
// It validates the transcript and delegates combat to the existing engine.
// IMPORTANT: this is not a real-time turn runner: no intermediate state is persisted.
import {simulateBattle} from './battle-engine.js';
import {createTurnSubmissionState,submitTurnCommand,resolveTurnSubmissions} from './commander-turns.js';

export function replayCommanderTranscript(cardsA,cardsB,{commanders,turns,seed='commander-transcript',maxRounds=15,remainingCredits=[0,0]}={}){
 if(!Array.isArray(commanders)||commanders.length!==2||commanders.some(c=>!c?.commanderId))throw Error('Two commander profiles required');
 if(!Array.isArray(turns)||turns.length>maxRounds)throw Error('Invalid turn transcript');
 const actions=[];
 for(let i=0;i<turns.length;i++){
  const t=turns[i],round=i+1;
  if(!Array.isArray(t)||t.length!==2)throw Error('Both players must submit each round');
  const state=createTurnSubmissionState(round);
  for(let side=0;side<2;side++){
   const entry=t[side];
   if(!entry||!Number.isInteger(entry.energy))throw Error('Missing authoritative energy snapshot');
   submitTurnCommand(state,{side,round,command:entry.command,energy:entry.energy,commanderId:commanders[side].commanderId});
  }
  actions.push(...resolveTurnSubmissions(state));
 }
 return simulateBattle(cardsA,cardsB,{seed,maxRounds,remainingCredits,commanders,commanderActions:actions});
}
