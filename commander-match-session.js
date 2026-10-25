import {commanderRoundEnergy} from './public/commander-ability-rules.js';
// Isolated authoritative commander match session. Not wired to production routes.
import {replayCommanderTranscript} from './commander-transcript.js';
import {validateTurnCommand,validateCommanderTurnTargets} from './commander-turns.js';

export function createCommanderMatchSession({cardsA,cardsB,commanders,seed,remainingCredits=[0,0]}){
 if(!Array.isArray(cardsA)||cardsA.length!==5||!Array.isArray(cardsB)||cardsB.length!==5)throw Error('Invalid teams');
 if(!Array.isArray(commanders)||commanders.length!==2||commanders.some(c=>!c?.commanderId))throw Error('Two commander profiles required');
 return {cardsA:structuredClone(cardsA),cardsB:structuredClone(cardsB),
  commanders:structuredClone(commanders),seed:String(seed||'commander-session'),
  remainingCredits:[...remainingCredits],round:1,pending:[undefined,undefined],
  turns:[],result:null,finished:false};
}

export function submitCommanderMatchTurn(session,{side,round,command,targetIds}){
 if(!session||session.finished)throw Error('Battle already finished');
 if(!Number.isInteger(side)||![0,1].includes(side))throw Error('Invalid player side');
 if(round!==session.round)throw Error('Stale or future turn');
 // A pending choice may be revised until both players have committed the round.
 // Validate against engine-owned energy before storing any choice.
 const energy=commanderRoundEnergy(session.result?.commanderEnergy?.[side]??0,session.round,session.commanders[side]);
 const ultimateUsed=!!session.result?.ultimateUsed?.[side];
 const ultimateEnergy=ultimateUsed?(session.result?.commanderUltimateEnergy?.[side]??0):commanderRoundEnergy(session.result?.commanderUltimateEnergy?.[side]??0,session.round,session.commanders[side]);
 validateTurnCommand(command,{side,round,energy,ultimateEnergy,ultimateUsed,commanderId:session.commanders[side]?.commanderId,targetIds});
 validateCommanderTurnTargets(command,{commanderId:session.commanders[side]?.commanderId,targetIds,teams:session.result?.teams,side});
 const nextPending=[...session.pending];
 nextPending[side]={command,...(targetIds===undefined?{}:{targetIds:[...targetIds]})};
 if(nextPending.some(x=>x===undefined)){
  session.pending=nextPending;
  return {ready:false,round:session.round};
 }
 const turns=[...session.turns,nextPending.map(x=>({...x}))];
 // Validate and compute the complete round before mutating committed state.
 const result=replayCommanderTranscript(session.cardsA,session.cardsB,{
  commanders:session.commanders,turns,seed:session.seed,
  remainingCredits:session.remainingCredits
 });
 session.turns=turns;session.result=result;
 session.pending=[undefined,undefined];
 session.finished=result.survivors.some(n=>n===0)||session.round>=15;
 if(!session.finished)session.round++;
 return {ready:true,round:session.round,finished:session.finished,result};
}
