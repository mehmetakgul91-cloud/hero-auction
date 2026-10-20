// Experimental room-bound commander sessions. Does not change the live battle path.
// A player seat is always resolved from the room token; client-provided seat is ignored.
import {createCommanderMatchSession,submitCommanderMatchTurn} from './commander-match-session.js';

export function createRoomCommanderSession(room,{cardsA,cardsB,commanders,remainingCredits=[0,0]}){
 if(!room||!Array.isArray(room.players)||room.players.length!==2||room.players.some(p=>!p?.token))throw Error('Two authenticated room players required');
 if(room.phase!=='finished')throw Error('Auction not finished');
 const matchKey=String(room.matchNumber||1)+':'+String(room.created);
 const session=createCommanderMatchSession({cardsA,cardsB,commanders,remainingCredits,seed:'auction-battle-'+room.code+'-'+matchKey});
 return {code:room.code,matchKey,session};
}

export function roomCommanderSeat(room,token){
 if(!room||typeof token!=='string'||!token)return -1;
 return room.players?.findIndex(p=>p?.token===token)??-1;
}

export function submitRoomCommanderTurn(room,bound,{token,round,command}){
 if(!room||!bound||bound.code!==room.code)throw Error('Invalid commander room');
 if(bound.matchKey!==String(room.matchNumber||1)+':'+String(room.created))throw Error('Commander match expired');
 const side=roomCommanderSeat(room,token);
 if(side<0)throw Error('Unauthorized commander player');
 if(room.phase!=='finished')throw Error('Auction not finished');
 return submitCommanderMatchTurn(bound.session,{side,round,command});
}

export function viewRoomCommanderSession(room,bound,token){
 if(!room||!bound||bound.code!==room.code)throw Error('Invalid commander room');
 if(bound.matchKey!==String(room.matchNumber||1)+':'+String(room.created))throw Error('Commander match expired');
 const side=roomCommanderSeat(room,token);
 if(side<0)throw Error('Unauthorized commander player');
 const session=bound.session;
 return {round:session.round,finished:session.finished,
  submitted:session.pending.map(x=>x!==undefined),
  yourSide:side,
  yourCommand:session.pending[side]?.command??null,
  energy:session.result?.commanderEnergy?.[side]??0,
  result:session.result?{winner:session.result.winner===null?null:session.result.winner===side?0:1,rounds:session.result.rounds}:null};
}
