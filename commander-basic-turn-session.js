// Experimental server-owned cursor. Does not change legacy precomputed battles.
// Special/passive heroes are intentionally blocked until full parity is implemented.
import {orderHeroActions,nextScheduledHeroAction} from './battle-action-scheduler.js';
import {stepBasicHeroCombat,advanceBasicCombatRound} from './commander-incremental-basic.js';
import {stepParityBasicAttack} from './commander-parity-basic-attack.js';
import {randomInt} from 'node:crypto';
export function createBasicTurnSession(combat,{parity=false}={}){
 if(!combat||combat.finished||!Array.isArray(combat.teams)||combat.teams.length!==2)throw Error('Invalid turn session');
 if(combat.teams.some(team=>team.some(hero=>hero.active||hero.passive)))throw Error('Special hero mechanics require incremental engine integration');
 if(typeof parity!=='boolean')throw Error('Invalid parity mode');
 return {combat,parity,round:combat.round,order:orderHeroActions(combat.teams).map(x=>({side:x.side,id:x.unit.id})),cursor:0};
}
export function peekBasicTurn(session){
 if(!session||session.combat.finished||session.round!==session.combat.round) return null;
 const {combat,order}=session;
 const indexed=order.map(x=>({side:x.side,unit:combat.teams[x.side].find(u=>u.id===x.id)}));
 const next=nextScheduledHeroAction(indexed,session.cursor);
 return next?{side:next.side,actorId:next.unit.id,round:combat.round}:null;
}
export function stepBasicTurn(session){
 const next=peekBasicTurn(session);
 if(!next)throw Error('No scheduled hero action');
 const result=session.parity?stepParityBasicAttack(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8}):stepBasicHeroCombat(session.combat,{side:next.side,actorId:next.actorId,round:next.round});
 session.cursor=session.order.findIndex((x,i)=>i>=session.cursor&&x.side===next.side&&x.id===next.actorId)+1;
 return {result,next:peekBasicTurn(session)};
}
export function advanceBasicTurnSession(session){
 if(!session||session.combat.finished||session.round!==session.combat.round||peekBasicTurn(session))throw Error('Round not ready to advance');
 const result=advanceBasicCombatRound(session.combat);
 session.round=session.combat.round;
 session.order=orderHeroActions(session.combat.teams).map(x=>({side:x.side,id:x.unit.id}));
 session.cursor=0;
 return result;
}
