// Experimental server-owned cursor. Does not change legacy precomputed battles.
// Special/passive heroes are intentionally blocked until full parity is implemented.
import {orderHeroActions,nextScheduledHeroAction} from './battle-action-scheduler.js';
import {applyHeroDelay,finishHeroDelay} from './battle-delay.js';
import {consumeCommanderFocus,expireCommanderFocus} from './battle-commander-focus.js';
import {stepBasicHeroCombat,advanceBasicCombatRound} from './commander-incremental-basic.js';
import {stepParityBasicAttack} from './commander-parity-basic-attack.js';
import {randomInt} from 'node:crypto';
import {applyLegacyRoundPassives} from './commander-parity-passives.js';
import {applyServerSpecialHeal} from './commander-live-special-heal.js';
import {resolveSpecialHealing} from './battle-special-formulas.js';
import {stepParityEnergySplash} from './commander-parity-energy-splash.js';
import {stepParityShieldDrain} from './commander-parity-shield-drain.js';
import {stepParityStatSpecial} from './commander-parity-stat-special.js';
import {stepParityExecute} from './commander-parity-execute.js';
import {stepParityDamageSpecial} from './commander-parity-damage-special.js';
export function createBasicTurnSession(combat,{parity=false,specialHealing=false,energySplash=false,shieldDrain=false,statSpecial=false,executeSpecial=false,thornsPassive=false,roundPassives=false,damageSpecial=false}={}){
 if(!combat||combat.finished||!Array.isArray(combat.teams)||combat.teams.length!==2)throw Error('Invalid turn session');
 if(combat.teams.some(team=>team.some(hero=>(hero.passive&&!((thornsPassive&&hero.passive.effect==='thorns')||(roundPassives&&['guard','resist','focus','evasion','momentum','regen','rage'].includes(hero.passive.effect))))||(hero.active&&!((specialHealing&&hero.active.effect==='heal')||(shieldDrain&&['shield','drain'].includes(hero.active.effect))||(statSpecial&&['sunder','weaken','haste'].includes(hero.active.effect)&&hero.role!=='tank')||(executeSpecial&&hero.active.effect==='execute'&&!['tank','energy'].includes(hero.role))||(damageSpecial&&['burst','pierce','splash','headshot'].includes(hero.active.effect)))))))throw Error('Special hero mechanics require incremental engine integration');
 if((specialHealing||energySplash||shieldDrain||statSpecial||executeSpecial||thornsPassive||roundPassives||damageSpecial)&&!parity)throw Error('Special healing requires parity mode');
 if(typeof parity!=='boolean')throw Error('Invalid parity mode');
 if(roundPassives)applyLegacyRoundPassives(combat);
 return {combat,parity,specialHealing,energySplash,shieldDrain,statSpecial,executeSpecial,thornsPassive,roundPassives,damageSpecial,round:combat.round,order:orderHeroActions(combat.teams,{round:combat.round}).map(x=>({side:x.side,id:x.unit.id})),cursor:0};
}
export function peekBasicTurn(session){
 if(!session||session.combat.finished||session.round!==session.combat.round) return null;
 const {combat,order}=session;
 expireCommanderFocus(combat.teams,combat.round);
 const indexed=order.map(x=>({side:x.side,unit:combat.teams[x.side].find(u=>u.id===x.id)}));
 const next=nextScheduledHeroAction(indexed,session.cursor,{round:combat.round});
 return next?{side:next.side,actorId:next.unit.id,round:combat.round}:null;
}
export function stepBasicTurn(session){
 const next=peekBasicTurn(session);
 if(!next)throw Error('No scheduled hero action');
 const actor=session.combat.teams[next.side].find(u=>u.id===next.actorId);
 const allies=session.combat.teams[next.side];
 const heal=session.specialHealing&&next.round%3===0&&resolveSpecialHealing(actor,allies)!==null;
 const splash=session.energySplash&&next.round%3===0&&actor.role==='energy'&&!actor.active&&(!actor.passive||(session.thornsPassive&&actor.passive.effect==='thorns')||(session.roundPassives&&['guard','resist','focus','evasion','momentum','regen','rage'].includes(actor.passive.effect)))&&!heal;
 const special=session.shieldDrain&&next.round%3===0&&['shield','drain'].includes(actor.active?.effect)&&(!actor.passive||(session.thornsPassive&&actor.passive.effect==='thorns')||(session.roundPassives&&['guard','resist','focus','evasion','momentum','regen','rage'].includes(actor.passive.effect)));
 const stat=session.statSpecial&&next.round%3===0&&['sunder','weaken','haste'].includes(actor.active?.effect)&&(!actor.passive||(session.thornsPassive&&actor.passive.effect==='thorns')||(session.roundPassives&&['guard','resist','focus','evasion','momentum','regen','rage'].includes(actor.passive.effect)));
 const execute=session.executeSpecial&&next.round%3===0&&actor.active?.effect==='execute'&&(!actor.passive||(session.thornsPassive&&actor.passive.effect==='thorns')||(session.roundPassives&&['guard','resist','focus','evasion','momentum','regen','rage'].includes(actor.passive.effect)));
 const damageSpecial=session.damageSpecial&&next.round%3===0&&['burst','pierce','splash','headshot'].includes(actor.active?.effect);
 const result=heal?applyServerSpecialHeal(session.combat,{side:next.side,actorId:next.actorId,round:next.round}):damageSpecial?stepParityDamageSpecial(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,allowThornsPassive:session.thornsPassive,allowRoundPassives:session.roundPassives}):execute?stepParityExecute(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,allowThornsPassive:session.thornsPassive,allowRoundPassives:session.roundPassives}):stat?stepParityStatSpecial(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,allowThornsPassive:session.thornsPassive,allowRoundPassives:session.roundPassives}):special?stepParityShieldDrain(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,allowThornsPassive:session.thornsPassive,allowRoundPassives:session.roundPassives}):splash?stepParityEnergySplash(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,allowThornsPassive:session.thornsPassive,allowRoundPassives:session.roundPassives}):
  session.parity?stepParityBasicAttack(session.combat,{side:next.side,actorId:next.actorId,round:next.round,critical:randomInt(100)<8,specialFallback:next.round%3===0&&(!actor.active||actor.active.effect==='heal'),allowHealActive:session.specialHealing,allowShieldDrainActive:session.shieldDrain,allowStatActive:session.statSpecial,allowExecuteActive:session.executeSpecial,allowDamageActive:session.damageSpecial,allowThornsPassive:session.thornsPassive,allowRoundPassives:session.roundPassives}):
  stepBasicHeroCombat(session.combat,{side:next.side,actorId:next.actorId,round:next.round});
 session.cursor=session.order.findIndex((x,i)=>i>=session.cursor&&x.side===next.side&&x.id===next.actorId)+1;
 const completedActor=session.combat.teams[next.side].find(unit=>unit.id===next.actorId);
 completedActor.lastActionRound=next.round;
 finishHeroDelay(completedActor,next.round);
 const damaged=(result.events||[result.event]).some(event=>event?.actor===next.actorId&&(['normal','special'].includes(event.damageType)||event.action==='attack'));
 if(damaged)consumeCommanderFocus(completedActor);
 expireCommanderFocus(session.combat.teams,next.round);
 const primary=(result.events||[result.event]).find(event=>event?.damageType==='special'&&event.actor===next.actorId&&event.action!=='splash');
 const delay=primary?applyHeroDelay({teams:session.combat.teams,order:session.order,cursor:session.cursor,round:next.round,side:next.side,actorId:next.actorId,targetId:primary.target}):null;
 if(delay){
  delay.version=session.combat.version;
  session.combat.events.push(delay);
  if(result.events)result.events.push(delay);
 }
 // Include authoritative status changes in the same atomic action snapshot.
 result.teams=structuredClone(session.combat.teams);
 return {result,next:peekBasicTurn(session)};
}
export function advanceBasicTurnSession(session){
 if(!session||session.combat.finished||session.round!==session.combat.round||peekBasicTurn(session))throw Error('Round not ready to advance');
 const result=advanceBasicCombatRound(session.combat);
 if(session.roundPassives&&!session.combat.finished)applyLegacyRoundPassives(session.combat);
 session.round=session.combat.round;
 expireCommanderFocus(session.combat.teams,session.round);
 session.order=orderHeroActions(session.combat.teams,{round:session.combat.round}).map(x=>({side:x.side,id:x.unit.id}));
 session.cursor=0;
 return result;
}
