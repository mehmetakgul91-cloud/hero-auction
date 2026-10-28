import {consumeCommanderHunt,expireCommanderHunt} from './commander-hunt-status.js';
import {applyServerStunSkip} from './commander-live-combat.js';
import {expireCommanderFocus} from './battle-commander-focus.js';
import {commanderWeakenRate,consumeCommanderWeaken} from './commander-weaken-status.js';
import {abilityValue} from './public/hero-ability-rules.js';
import {applyHeroDamage} from './battle-hp-damage.js';
// Experimental server-owned execute special, preserving the legacy <12% threshold.
import {applyAttackThorns} from './commander-parity-thorns.js';
import {calculateHeroRawDamage} from './battle-damage-formula.js';
import {selectBattleTarget} from './battle-target-selection.js';
import {grantLiveCommanderEnergy} from './commander-live-abilities.js';
export function stepParityExecute(combat,{side,actorId,round=combat?.round,critical=false,allowThornsPassive=false,allowRoundPassives=false}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||round%3!==0||typeof critical!=='boolean')throw Error('Invalid execute turn');
 const teams=structuredClone(combat.teams),actor=teams[side].find(u=>u.id===actorId&&u.hp>0);
 if(!actor||(actor.passive&&!((allowThornsPassive&&actor.passive.effect==='thorns')||(allowRoundPassives&&['guard','resist','focus','evasion','momentum','regen','rage'].includes(actor.passive.effect))))||actor.active?.effect!=='execute'||['tank','energy'].includes(actor.role))throw Error('Unsupported execute hero');
 const enemies=teams[1-side],target=selectBattleTarget(enemies,actor,round);
 if(!target)throw Error('No living target');
 const skipped=applyServerStunSkip(combat,{side,actorId,round});if(skipped)return skipped;
 const guarded=target.lane!=='front'&&enemies.some(u=>u.hp>0&&u.lane==='front');
 const weakened=commanderWeakenRate(actor,round);
 const raw=calculateHeroRawDamage({unit:actor,target,skill:actor.active,special:true,critical,guarded,weakened,round});
 const {damage,absorbed,executedDamage:executed,guardTriggered,lastStandTriggeredRound,lastStandImmortalUntilRound,arcaneTransfer}=applyHeroDamage(target,raw,{round,allies:enemies,executeThreshold:abilityValue(actor.active,'executeThreshold')});
 actor.damage=(actor.damage||0)+damage+executed;
 const killed=target.hp===0;
 if(killed)actor.kills=(actor.kills||0)+1;
 const event={round,side,actor:actorId,action:actor.active.name||'special',target:target.id,value:damage,critical,absorbed,rawDamage:raw,damageType:'special',executedDamage:executed,...(guardTriggered?{guardTriggered:true}:{}),...(lastStandImmortalUntilRound?{lastStandTriggeredRound,lastStandImmortalUntilRound}:{}),...(arcaneTransfer?{arcaneTransfer}:{})};
 const thornsShield=applyAttackThorns(actor,{enabled:allowThornsPassive});
 if(thornsShield)event.thornsShield=thornsShield;
 consumeCommanderWeaken(actor);
 if(consumeCommanderHunt(actor))event.huntAttackConsumed=true;
 combat.teams=teams;combat.version++;event.version=combat.version;combat.events.push(event);
 if(killed)grantLiveCommanderEnergy(combat.abilities,1-side,10);
 expireCommanderFocus(teams,round);expireCommanderHunt(teams);
 combat.finished=teams.some(team=>team.every(u=>u.hp<=0));
 combat.abilities.finished=combat.finished;
 return {version:combat.version,event,teams:structuredClone(teams),finished:combat.finished};
}
