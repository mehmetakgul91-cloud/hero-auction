// One atomic server-owned primary attack plus energy-role splash.
// This opt-in action does not support active skills or passives yet.
import {applyAttackThorns} from './commander-parity-thorns.js';
import {calculateHeroRawDamage} from './battle-damage-formula.js';
import {calculateSplashRawDamage} from './battle-special-formulas.js';
import {selectBattleTarget} from './battle-target-selection.js';
import {grantLiveCommanderEnergy} from './commander-live-abilities.js';
export function stepParityEnergySplash(combat,{side,actorId,round=combat?.round,critical=false,allowThornsPassive=false,allowRoundPassives=false}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||round%3!==0||typeof critical!=='boolean')throw Error('Invalid energy splash step');
 const next=structuredClone(combat.teams);
 const actor=next[side].find(u=>u.id===actorId&&u.hp>0);
 if(!actor||actor.role!=='energy'||actor.active||(actor.passive&&!((allowThornsPassive&&actor.passive.effect==='thorns')||(allowRoundPassives&&['guard','resist','focus','evasion','momentum','regen','rage'].includes(actor.passive.effect)))))throw Error('Unsupported energy splash hero');
 const enemies=next[1-side],target=selectBattleTarget(enemies,actor,round);
 if(!target)throw Error('No living target');
 const guarded=target.lane!=='front'&&enemies.some(u=>u.hp>0&&u.lane==='front');
 const weakened=Number.isInteger(actor.commanderWeakenUntilRound)&&round<=actor.commanderWeakenUntilRound?Math.max(0,Math.min(1,Number(actor.commanderWeaken)||0)):0;
 const raw=calculateHeroRawDamage({unit:actor,target,special:true,critical,guarded,weakened});
 const events=[],dead=[];
 function hit(unit,amount,action){
  const absorbed=Math.min(unit.shield||0,amount);
  unit.shield=(unit.shield||0)-absorbed;
  const damage=Math.min(unit.hp,amount-absorbed);
  unit.hp-=damage;actor.damage=(actor.damage||0)+damage;
  if(unit.hp===0){actor.kills=(actor.kills||0)+1;dead.push(unit.id);}
  events.push({round,side,actor:actorId,action,target:unit.id,value:damage,absorbed,rawDamage:amount,damageType:action==='splash'?'splash':'special',...(action==='special'?{critical}:{})});
 }
 // Legacy engine applies splash before recording the primary event, but the
 // primary damage and shield changes themselves happen first.
 hit(target,raw,'special');
 const splashRaw=calculateSplashRawDamage(raw,{role:actor.role,special:true});
 for(const other of enemies.filter(u=>u!==target&&u.hp>0))hit(other,splashRaw,'splash');
 const thornsShield=applyAttackThorns(actor,{enabled:allowThornsPassive});
 if(thornsShield)events.push({round,side,actor:actorId,action:'thorns-shield',target:actorId,value:thornsShield});
 combat.teams=next;
 combat.version++;
 for(const event of events){event.version=combat.version;combat.events.push(event);}
 for(const id of dead)grantLiveCommanderEnergy(combat.abilities,1-side,10);
 combat.finished=next.some(team=>team.every(u=>u.hp<=0));
 combat.abilities.finished=combat.finished;
 return {version:combat.version,events,teams:structuredClone(next),finished:combat.finished};
}
