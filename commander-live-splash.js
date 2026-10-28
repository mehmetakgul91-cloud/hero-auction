import {expireCommanderFocus} from './battle-commander-focus.js';
import {applyHeroDamage} from './battle-hp-damage.js';
// Experimental server-only multi-target splash action. Atomic snapshot update.
import {grantLiveCommanderEnergy} from './commander-live-abilities.js';
import {calculateSplashRawDamage} from './battle-special-formulas.js';
export function applyServerSplashAction(combat,{side,actorId,primaryTargetId,primaryRaw,skill=null,special=true,round=combat?.round}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||!Number.isSafeInteger(primaryRaw)||primaryRaw<0)throw Error('Invalid splash action');
 const next=structuredClone(combat.teams);
 const actor=next[side].find(u=>u.id===actorId&&u.hp>0);
 const primary=next[1-side].find(u=>u.id===primaryTargetId&&u.hp>0);
 if(!actor||!primary||(!special&&skill?.effect!=='splash'))throw Error('Invalid splash actor or primary target');
 if(actor.active||actor.passive)throw Error('Special hero mechanics require incremental engine integration');
 const splashRaw=calculateSplashRawDamage(primaryRaw,{skill,role:actor.role,special});
 if(!splashRaw)throw Error('No splash effect');
 const events=[],killed=[];
 for(const target of next[1-side].filter(u=>u!==primary&&u.hp>0)){
  const {damage,absorbed,guardTriggered,lastStandTriggeredRound,lastStandImmortalUntilRound,arcaneTransfer}=applyHeroDamage(target,splashRaw,{round,allies:next[1-side]});
  actor.damage=(actor.damage||0)+damage;
  if(target.hp===0){actor.kills=(actor.kills||0)+1;killed.push(target.id);}
  events.push({round,side,actor:actorId,action:'splash',target:target.id,value:damage,absorbed,rawDamage:splashRaw,damageType:'splash',...(guardTriggered?{guardTriggered:true}:{}),...(lastStandImmortalUntilRound?{lastStandTriggeredRound,lastStandImmortalUntilRound}:{}),...(arcaneTransfer?{arcaneTransfer}:{})});
 }
 combat.teams=next;
 combat.version++;
 for(const event of events){event.version=combat.version;combat.events.push(event);}
 for(const id of killed)grantLiveCommanderEnergy(combat.abilities,1-side,10);
 expireCommanderFocus(next,round);
 combat.finished=next.some(team=>team.every(u=>u.hp<=0));
 combat.abilities.finished=combat.finished;
 return {version:combat.version,events,teams:structuredClone(next),finished:combat.finished};
}
