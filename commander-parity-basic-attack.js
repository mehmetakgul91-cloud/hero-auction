// Experimental parity attack: caller must supply a server-owned critical roll.
// No specials/passives here; the legacy basic prototype remains untouched.
import {calculateHeroRawDamage} from './battle-damage-formula.js';
import {selectBattleTarget} from './battle-target-selection.js';
import {applyServerHeroAction} from './commander-live-combat.js';
export function stepParityBasicAttack(combat,{side,actorId,round=combat?.round,critical=false,allowHealActive=false,allowShieldDrainActive=false,allowStatActive=false,allowExecuteActive=false}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||typeof critical!=='boolean')throw Error('Invalid parity combat step');
 const actor=combat.teams[side].find(u=>u.id===actorId&&u.hp>0);
 if(!actor||actor.passive||(actor.active&&!((allowHealActive&&actor.active.effect==='heal')||(allowShieldDrainActive&&['shield','drain'].includes(actor.active.effect)&&actor.role!=='energy')||(allowStatActive&&['sunder','weaken','haste'].includes(actor.active.effect)&&actor.role!=='energy')||(allowExecuteActive&&actor.active.effect==='execute'&&actor.role!=='energy'))))throw Error('Special hero mechanics require incremental engine integration');
 if(!Number.isSafeInteger(actor.attack)||actor.attack<0||!Number.isFinite(actor.position)||!Number.isFinite(actor.defense))throw Error('Invalid hero stats');
 const enemies=combat.teams[1-side];
 const target=selectBattleTarget(enemies,actor,round);
 if(!target)throw Error('No living target');
 const guarded=target.lane!=='front'&&enemies.some(u=>u.hp>0&&u.lane==='front');
 const weakened=Number.isInteger(actor.commanderWeakenUntilRound)&&round<=actor.commanderWeakenUntilRound?Math.max(0,Math.min(1,Number(actor.commanderWeaken)||0)):0;
 const raw=calculateHeroRawDamage({unit:actor,target,critical,guarded,weakened});
 const result=applyServerHeroAction(combat,{side,actorId,targetId:target.id,value:raw,round});
 // This is server-calculated metadata, not a client-provided damage value.
 result.event.rawDamage=raw;
 result.event.critical=critical;
 return result;
}
