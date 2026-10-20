// Isolated authoritative commander match session. Not wired to production routes.
import {replayCommanderTranscript} from './commander-transcript.js';

export function createCommanderMatchSession({cardsA,cardsB,commanders,seed,remainingCredits=[0,0]}){
 if(!Array.isArray(cardsA)||cardsA.length!==5||!Array.isArray(cardsB)||cardsB.length!==5)throw Error('Invalid teams');
 if(!Array.isArray(commanders)||commanders.length!==2||commanders.some(c=>!c?.commanderId))throw Error('Two commander profiles required');
 return {cardsA:structuredClone(cardsA),cardsB:structuredClone(cardsB),
  commanders:structuredClone(commanders),seed:String(seed||'commander-session'),
  remainingCredits:[...remainingCredits],round:1,pending:[undefined,undefined],
  turns:[],result:null,finished:false};
}

export function submitCommanderMatchTurn(session,{side,round,command}){
 if(!session||session.finished)throw Error('Battle already finished');
 if(!Number.isInteger(side)||![0,1].includes(side))throw Error('Invalid player side');
 if(round!==session.round)throw Error('Stale or future turn');
 if(session.pending[side]!==undefined)throw Error('Turn already submitted');
 if(!['pass','normal','ultimate',null].includes(command))throw Error('Invalid commander command');
 const nextPending=[...session.pending];
 nextPending[side]={command};
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
