import {commanderRoundEnergy} from './public/commander-ability-rules.js';
// Deterministic command transcript validator for isolated commander battles.
// The combat engine, not the client, is authoritative for energy and casualties.
// This is not yet a real-time battle runner or a production endpoint.
import {simulateBattle} from './battle-engine.js';
import {createTurnSubmissionState,submitTurnCommand,resolveTurnSubmissions,validateCommanderTurnTargets} from './commander-turns.js';

export function replayCommanderTranscript(cardsA,cardsB,{commanders,turns,seed='commander-transcript',maxRounds=15,remainingCredits=[0,0]}={}){
 if(!Array.isArray(commanders)||commanders.length!==2||commanders.some(c=>!c?.commanderId))throw Error('Two commander profiles required');
 if(!Number.isInteger(maxRounds)||maxRounds<1||maxRounds>15)throw Error('Invalid maximum rounds');
 if(!Array.isArray(turns)||turns.length>maxRounds)throw Error('Invalid turn transcript');
 const actions=[];
 let previous=null;
 for(let i=0;i<turns.length;i++){
  const t=turns[i],round=i+1;
  if(!Array.isArray(t)||t.length!==2)throw Error('Both players must submit each round');
  if(previous&&previous.survivors.some(count=>count===0))throw Error('Battle already finished');
  const state=createTurnSubmissionState(round);
  for(let side=0;side<2;side++){
   const entry=t[side];
   if(!entry||!['pass','normal','ultimate',null].includes(entry.command))throw Error('Invalid commander command');
   // Start energy and round regeneration use the same rules as the live arena.
   // Its previous result already includes casualty bonuses from that round.
   const energy=commanderRoundEnergy(previous?.commanderEnergy[side]??0,round,commanders[side]);
   const ultimateUsed=!!previous?.ultimateUsed?.[side];
   const ultimateEnergy=ultimateUsed?(previous?.commanderUltimateEnergy?.[side]??0):commanderRoundEnergy(previous?.commanderUltimateEnergy?.[side]??0,round,commanders[side]);
   submitTurnCommand(state,{side,round,command:entry.command,energy,ultimateEnergy,ultimateUsed,commanderId:commanders[side].commanderId,targetIds:entry.targetIds});
   validateCommanderTurnTargets(entry.command,{commanderId:commanders[side].commanderId,targetIds:entry.targetIds,teams:previous?.teams,side});
  }
  actions.push(...resolveTurnSubmissions(state));
  previous=simulateBattle(cardsA,cardsB,{seed,maxRounds:round,remainingCredits,commanders,commanderActions:actions,partial:round<maxRounds});
 }
 return previous??simulateBattle(cardsA,cardsB,{seed,maxRounds,remainingCredits,commanders,commanderActions:actions});
}
