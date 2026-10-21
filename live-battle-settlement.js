import {battleOutcome} from './battle-result.js';

// Only the authoritative, completed match can advance its room's rematch series.
export function settleLiveBattle(room,matchKey,snapshot,settleMatch){
 if(!room||!snapshot?.finished||room.matchSettled||room.phase!=='finished')return false;
 const expected=String(room.matchNumber||1)+':'+String(room.created);
 if(matchKey!==room.code+':'+expected||room.battleSync?.key!==expected||!room.battleSync?.result?.live)return false;
 const winner=battleOutcome(snapshot.teams).winner;
 room.battleSync.result={...room.battleSync.result,winner,rounds:snapshot.round,teams:structuredClone(snapshot.teams),log:structuredClone(snapshot.events),finished:true};
 settleMatch(room,winner);
 room.battleSettlementPending=false;
 return true;
}
