// Experimental server-owned cursor. Does not change legacy precomputed battles.
// Special/passive heroes are intentionally blocked until full parity is implemented.
import {orderHeroActions,nextScheduledHeroAction} from './battle-action-scheduler.js';
import {stepBasicHeroCombat,advanceBasicCombatRound} from './commander-incremental-basic.js';
import {stepParityBasicAttack} from './commander-parity-basic-attack.js';
import {randomInt} from 'node:crypto';
import {applyLegacyRoundPassives} from './commander-parity-passives.js';
import {applyServerSpecialHeal} from './commander-live-special-heal.js';
import {stepParityEnergySplash} from './commander-parity-energy-splash.js';
import {stepParityShieldDrain} from './commander-parity-shield-drain.js';
import {stepParityStatSpecial} from './commander-parity-stat-special.js';
import {stepParityExecute} from './commander-parity-execute.js';
export function createBasicTurnSession(combat,{parity=false,specialHealing=false,energySplash=false,shieldDrain=false,statSpecial=false,executeSpecial=false,thornsPassive=false,roundPassives=false}={}){
 if(!combat||combat.finished||!Array.isArray(combat.teams)||combat.teams.length!==2)throw Error('Invalid turn session');
 if(combat.teams.some(team=>team.some(hero=>(hero.passive&&!((thornsPassive&&hero.passive.effect==='thorns')||(roundPassives&&['guard','resist','focus','evasion','momentum','regen','rage'].includes(hero.passive.effect))))||(hero.active&&!((specialHealing&&hero.active.effect==='heal')||(shieldDrain&&['shield','drain'].includes(hero.active.effect)&&hero.role!=='energy')||(statSpecial&&['sunder','weaken','haste'].includes(hero.active.effect)&&!['tank','energy'].includes(hero.role))||(executeSpecial&&hero.active.effect==='execute'&&!['tank','energy'].includes(hero.role)))))))throw Error('Special hero mechanics require incremental engine integration');
 if((specialHealing||energySplash||shieldDrain||statSpecial||executeSpecial||thornsPassive||roundPassives)&&!parity)throw Error('Special healing requires parity mode');
 if(typeof parity!=='boolean')throw Error('Invalid parity mode');
 if(roundPassives)applyLegacyRoundPassives(combat);
 return {combat,parity,specialHealing,energySplash,shieldDrain,statSpecial,executeSpecial,thornsPassive,roundPassives,round:combat.round,order:orderHeroActions(combat.teams).map(x=>({side:x.side,id:x.unit.id})),cursor:0};
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
 const splash=session.energySplash&&next.round%3===0&&actor.role==='energy'&&!actor.active&&(!actor.passive||(session.thornsPassive&&actor.passive.effect==='thorns'))&&!heal;
 const special=session.shieldDrain&&next.round%3===0&&['shield','drain'].includes(actor.active?.effect)&&(!actor.passive||(session.thornsPassive&&actor.passive.effect==='thorns'));
 const stat=session.statSpecial&&next.round%3===0&&['sunder','weaken','haste'].includes(actor.active?.effect)&&(!actor.passive||(session.thornsPassive&&actor.passive.effect==='thorns'));
 const execute=session.executeSpecial&&next.round%3===0&&actor.active?.effect==='execute'&&(!actor.passive||(session.thornsPassive&&actor.passive.effect==='thorns'));
 const result=execute?stepParityExecute(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,allowThornsPassive:session.thornsPassive,allowRoundPassives:session.roundPassives}):stat?stepParityStatSpecial(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,allowThornsPassive:session.thornsPassive,allowRoundPassives:session.roundPassives}):special?stepParityShieldDrain(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,allowThornsPassive:session.thornsPassive,allowRoundPassives:session.roundPassives}):splash?stepParityEnergySplash(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,allowThornsPassive:session.thornsPassive,allowRoundPassives:session.roundPassives}):heal?applyServerSpecialHeal(session.combat,{side:next.side,actorId:next.actorId,round:next.round}):
  session.parity?stepParityBasicAttack(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,allowHealActive:session.specialHealing,allowShieldDrainActive:session.shieldDrain,allowStatActive:session.statSpecial,allowExecuteActive:session.executeSpecial,allowThornsPassive:session.thornsPassive,allowRoundPassives:session.roundPassives}):
  stepBasicHeroCombat(session.combat,{side:next.side,actorId:next.actorId,round:next.round});
 session.cursor=session.order.findIndex((x,i)=>i>=session.cursor&&x.side===next.side&&x.id===next.actorId)+1;
 return {result,next:peekBasicTurn(session)};
}
export function advanceBasicTurnSession(session){
 if(!session||session.combat.finished||session.round!==session.combat.round||peekBasicTurn(session))throw Error('Round not ready to advance');
 const result=advanceBasicCombatRound(session.combat);
 if(session.roundPassives&&!session.combat.finished)applyLegacyRoundPassives(session.combat);
 session.round=session.combat.round;
 session.order=orderHeroActions(session.combat.teams).map(x=>({side:x.side,id:x.unit.id}));
 session.cursor=0;
 return result;
}
