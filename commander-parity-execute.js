// Experimental server-owned execute special, preserving the legacy <12% threshold.
import {applyAttackThorns} from './commander-parity-thorns.js';
import {calculateHeroRawDamage} from './battle-damage-formula.js';
import {selectBattleTarget} from './battle-target-selection.js';
import {grantLiveCommanderEnergy} from './commander-live-abilities.js';
export function stepParityExecute(combat,{side,actorId,round=combat?.round,critical=false,allowThornsPassive=false}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||round%3!==0||typeof critical!=='boolean')throw Error('Invalid execute turn');
 const teams=structuredClone(combat.teams),actor=teams[side].find(u=>u.id===actorId&&u.hp>0);
 if(!actor||(actor.passive&&!(allowThornsPassive&&actor.passive.effect==='thorns'))||actor.active?.effect!=='execute'||['tank','energy'].includes(actor.role))throw Error('Unsupported execute hero');
 const enemies=teams[1-side],target=selectBattleTarget(enemies,actor,round);
 if(!target)throw Error('No living target');
 const guarded=target.lane!=='front'&&enemies.some(u=>u.hp>0&&u.lane==='front');
 const weakened=Number.isInteger(actor.commanderWeakenUntilRound)&&round<=actor.commanderWeakenUntilRound?Math.max(0,Math.min(1,Number(actor.commanderWeaken)||0)):0;
 const raw=calculateHeroRawDamage({unit:actor,target,skill:actor.active,special:true,critical,guarded,weakened});
 const absorbed=Math.min(target.shield||0,raw);
 target.shield=(target.shield||0)-absorbed;
 const damage=Math.min(target.hp,raw-absorbed);
 target.hp-=damage;actor.damage=(actor.damage||0)+damage;
 let executed=0;
 if(target.hp>0&&target.hp/target.maxHp<.12){
  executed=target.hp;actor.damage+=executed;target.hp=0;
 }
 const killed=target.hp===0;
 if(killed)actor.kills=(actor.kills||0)+1;
 const event={round,side,actor:actorId,action:actor.active.name||'special',target:target.id,value:damage,critical,absorbed,rawDamage:raw,damageType:'special',executedDamage:executed};
 const thornsShield=applyAttackThorns(actor,{enabled:allowThornsPassive});
 if(thornsShield)event.thornsShield=thornsShield;
 combat.teams=teams;combat.version++;event.version=combat.version;combat.events.push(event);
 if(killed)grantLiveCommanderEnergy(combat.abilities,1-side,10);
 combat.finished=teams.some(team=>team.every(u=>u.hp<=0));
 combat.abilities.finished=combat.finished;
 return {version:combat.version,event,teams:structuredClone(teams),finished:combat.finished};
}
