// Experimental server-owned cursor. Does not change legacy precomputed battles.
// Special/passive heroes are intentionally blocked until full parity is implemented.
import {orderHeroActions,nextScheduledHeroAction} from './battle-action-scheduler.js';
import {stepBasicHeroCombat,advanceBasicCombatRound} from './commander-incremental-basic.js';
import {stepParityBasicAttack} from './commander-parity-basic-attack.js';
import {randomInt} from 'node:crypto';
import {applyServerSpecialHeal} from './commander-live-special-heal.js';
import {stepParityEnergySplash} from './commander-parity-energy-splash.js';
import {stepParityShieldDrain} from './commander-parity-shield-drain.js';
export function createBasicTurnSession(combat,{parity=false,specialHealing=false,energySplash=false,shieldDrain=false}={}){
 if(!combat||combat.finished||!Array.isArray(combat.teams)||combat.teams.length!==2)throw Error('Invalid turn session');
 if(combat.teams.some(team=>team.some(hero=>hero.passive||(hero.active&&!((specialHealing&&hero.active.effect==='heal')||(shieldDrain&&['shield','drain'].includes(hero.active.effect)&&!['tank','energy'].includes(hero.role)))))))throw Error('Special hero mechanics require incremental engine integration');
 if((specialHealing||energySplash||shieldDrain)&&!parity)throw Error('Special healing requires parity mode');
 if(typeof parity!=='boolean')throw Error('Invalid parity mode');
 return {combat,parity,specialHealing,energySplash,shieldDrain,round:combat.round,order:orderHeroActions(combat.teams).map(x=>({side:x.side,id:x.unit.id})),cursor:0};
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
 const actor=session.combat.teams[next.side].find(u=>u.id===next.actorId);
 const allies=session.combat.teams[next.side];
 const canSupportHeal=actor.role==='support'&&allies.some(u=>u.hp>0&&u.hp<u.maxHp);
 const canSelfHeal=actor.active?.effect==='heal'&&actor.hp<actor.maxHp;
 const heal=session.specialHealing&&next.round%3===0&&(canSupportHeal||canSelfHeal);
 const splash=session.energySplash&&next.round%3===0&&actor.role==='energy'&&!actor.active&&!actor.passive&&!heal;
 const special=session.shieldDrain&&next.round%3===0&&['shield','drain'].includes(actor.active?.effect)&&!actor.passive;
 const result=special?stepParityShieldDrain(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8}):splash?stepParityEnergySplash(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8}):heal?applyServerSpecialHeal(session.combat,{side:next.side,actorId:next.actorId,round:next.round}):
  session.parity?stepParityBasicAttack(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,allowHealActive:session.specialHealing,allowShieldDrainActive:session.shieldDrain}):
  stepBasicHeroCombat(session.combat,{side:next.side,actorId:next.actorId,round:next.round});
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
