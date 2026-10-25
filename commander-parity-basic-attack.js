import {commanderWeakenRate} from './commander-weaken-status.js';
// Experimental parity attack: caller must supply a server-owned critical roll.
// No specials/passives here; the legacy basic prototype remains untouched.
import {calculateHeroRawDamage} from './battle-damage-formula.js';
import {abilityValue} from './public/hero-ability-rules.js';
import {selectBattleTarget} from './battle-target-selection.js';
import {applyServerHeroAction} from './commander-live-combat.js';
export function stepParityBasicAttack(combat,{side,actorId,round=combat?.round,critical=false,specialFallback=false,allowHealActive=false,allowShieldDrainActive=false,allowStatActive=false,allowExecuteActive=false,allowDamageActive=false,allowThornsPassive=false,allowRoundPassives=false}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||typeof critical!=='boolean'||typeof specialFallback!=='boolean')throw Error('Invalid parity combat step');
 const actor=combat.teams[side].find(u=>u.id===actorId&&u.hp>0);
 if(!actor||(actor.passive&&!((allowThornsPassive&&actor.passive.effect==='thorns')||(allowRoundPassives&&['guard','resist','focus','evasion','momentum','regen','rage'].includes(actor.passive.effect))))||(actor.active&&!((allowHealActive&&actor.active.effect==='heal')||(allowShieldDrainActive&&['shield','drain'].includes(actor.active.effect))||(allowStatActive&&['sunder','weaken','haste'].includes(actor.active.effect)&&actor.role!=='tank')||(allowExecuteActive&&actor.active.effect==='execute'&&!['tank','energy'].includes(actor.role))||(allowDamageActive&&['burst','pierce','splash','headshot'].includes(actor.active.effect)))))throw Error('Special hero mechanics require incremental engine integration');
 if(specialFallback&&(round%3!==0||(actor.active&&actor.active.effect!=='heal')))throw Error('Invalid special fallback');
 if(!Number.isSafeInteger(actor.attack)||actor.attack<0||!Number.isFinite(actor.position)||!Number.isFinite(actor.defense))throw Error('Invalid hero stats');
 const enemies=combat.teams[1-side];
 const target=selectBattleTarget(enemies,actor,round);
 if(!target)throw Error('No living target');
 const guarded=target.lane!=='front'&&enemies.some(u=>u.hp>0&&u.lane==='front');
 const weakened=commanderWeakenRate(actor,round);
 const raw=calculateHeroRawDamage({unit:actor,target,skill:specialFallback?actor.active:null,special:specialFallback,critical,guarded,weakened,round});
 const result=applyServerHeroAction(combat,{side,actorId,targetId:target.id,value:raw,round,applyThorns:allowThornsPassive});
 // This is server-calculated metadata, not a client-provided damage value.
 result.event.rawDamage=raw;
 result.event.critical=critical;
 if(specialFallback){
  result.event.action=actor.active?.name||'special';
  result.event.damageType='special';
  if(actor.role==='tank'){
   for(const ally of combat.teams[side].filter(unit=>unit.hp>0&&unit.lane==='front'))ally.shield=(ally.shield||0)+Math.max(1,Math.round(actor.defense*abilityValue(actor.active,'frontShieldRate')));
   const current=combat.teams[side].find(unit=>unit.id===actorId);
   current.shield=(current.shield||0)+Math.round(actor.defense*abilityValue(actor.active,'tankShieldRate'));
   result.teams=structuredClone(combat.teams);
  }
 }
 return result;
}
