// Experimental server-owned live arena coordinator.
// Commander casts can be interleaved with scheduled hero actions without a pass turn.
import {createBasicTurnSession,peekBasicTurn,stepBasicTurn,advanceBasicTurnSession} from './commander-basic-turn-session.js';
import {castLiveCommanderCombat,viewLiveCommanderCombat} from './commander-live-combat.js';
export function createLiveArenaSession(combat,options={}){
 const turns=createBasicTurnSession(combat,options);
 return {combat,turns};
}
export function castDuringLiveArena(session,cast){
 if(!session||session.turns.combat!==session.combat)throw Error('Invalid live arena session');
 return castLiveCommanderCombat(session.combat,cast);
}
export function stepLiveArenaHero(session){
 if(!session||session.turns.combat!==session.combat)throw Error('Invalid live arena session');
 return stepBasicTurn(session.turns);
}
export function advanceLiveArenaRound(session){
 if(!session||session.turns.combat!==session.combat)throw Error('Invalid live arena session');
 return advanceBasicTurnSession(session.turns);
}
export function viewLiveArenaSession(session,{sinceVersion=0}={}){
 if(!session||session.turns.combat!==session.combat)throw Error('Invalid live arena session');
 return {...viewLiveCommanderCombat(session.combat,{sinceVersion}),nextHero:peekBasicTurn(session.turns)};
}
