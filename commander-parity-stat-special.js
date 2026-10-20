// Experimental server-owned sunder, weaken and haste special attacks.
import {calculateHeroRawDamage} from './battle-damage-formula.js';
import {selectBattleTarget} from './battle-target-selection.js';
import {grantLiveCommanderEnergy} from './commander-live-abilities.js';
export function stepParityStatSpecial(combat,{side,actorId,round=combat?.round,critical=false}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||round%3!==0||typeof critical!=='boolean')throw Error('Invalid stat special turn');
 const teams=structuredClone(combat.teams),actor=teams[side].find(u=>u.id===actorId&&u.hp>0);
 const effect=actor?.active?.effect;
 if(!actor||actor.passive||!['sunder','weaken','haste'].includes(effect)||['tank','energy'].includes(actor.role))throw Error('Unsupported stat special');
 const enemies=teams[1-side],target=selectBattleTarget(enemies,actor,round);
 if(!target)throw Error('No living target');
 const guarded=target.lane!=='front'&&enemies.some(u=>u.hp>0&&u.lane==='front');
 const weakened=Number.isInteger(actor.commanderWeakenUntilRound)&&round<=actor.commanderWeakenUntilRound?Math.max(0,Math.min(1,Number(actor.commanderWeaken)||0)):0;
 const raw=calculateHeroRawDamage({unit:actor,target,skill:actor.active,special:true,critical,guarded,weakened});
 const absorbed=Math.min(target.shield||0,raw);
 target.shield=(target.shield||0)-absorbed;
 const damage=Math.min(target.hp,raw-absorbed);
 target.hp-=damage;actor.damage=(actor.damage||0)+damage;
 const killed=target.hp===0;
 if(killed)actor.kills=(actor.kills||0)+1;
 let action,value=0,recipient=target.id;
 if(effect==='sunder'){target.defense=Math.max(5,Math.floor(target.defense*.85));action='armor-break';}
 else if(effect==='weaken'){target.attack=Math.max(5,Math.floor(target.attack*.9));action='weaken';}
 else{actor.speed=Math.min(150,actor.speed+8);action='haste';value=8;recipient=actor.id;}
 const events=[
  {round,side,actor:actorId,action,target:recipient,value},
  {round,side,actor:actorId,action:actor.active.name||'special',target:target.id,value:damage,absorbed,critical,rawDamage:raw,damageType:'special'}
 ];
 combat.teams=teams;combat.version++;
 for(const event of events){event.version=combat.version;combat.events.push(event);}
 if(killed)grantLiveCommanderEnergy(combat.abilities,1-side,10);
 combat.finished=teams.some(team=>team.every(u=>u.hp<=0));
 combat.abilities.finished=combat.finished;
 return {version:combat.version,events,teams:structuredClone(teams),finished:combat.finished};
}
