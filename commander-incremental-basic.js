// Experimental incremental combat scheduler. Unlike precomputed battle logs,
// each attack uses current HP/shields after any intervening commander cast.
// This handles basic attacks only; special/passive mechanics remain gated.
import {applyServerHeroAction,beginServerCombatRound} from './commander-live-combat.js';

const alive=team=>team.filter(unit=>unit.hp>0);
export function stepBasicHeroCombat(combat,{side,actorId,round=combat?.round}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round)throw Error('Invalid combat step');
 const actor=combat.teams[side].find(u=>u.id===actorId&&u.hp>0);
 if(!actor)throw Error('Invalid acting hero');
 if(!Number.isSafeInteger(actor.attack)||actor.attack<0)throw Error('Invalid hero attack');
 if(actor.active||actor.passive)throw Error('Special hero mechanics require incremental engine integration');
 const enemies=alive(combat.teams[1-side]);
 if(!enemies.length)throw Error('No living target');
 const front=enemies.filter(u=>u.lane==='front');
 const candidates=front.length?front:enemies;
 const target=[...candidates].sort((a,b)=>(a.position??0)-(b.position??0)||String(a.id).localeCompare(String(b.id)))[0];
 // A deliberately bounded basic-attack formula, not a substitute for the
 // existing battle engine's crits, skills, defense, and other mechanics.
 const raw=Math.max(1,Math.round(actor.attack-Math.max(0,target.defense||0)*0.35));
 return applyServerHeroAction(combat,{side,actorId,targetId:target.id,value:raw,round});
}
export function advanceBasicCombatRound(combat){
 if(!combat||combat.finished)throw Error('Battle already finished');
 return beginServerCombatRound(combat,combat.round+1);
}
