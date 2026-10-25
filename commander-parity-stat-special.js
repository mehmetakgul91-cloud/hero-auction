import {abilityValue} from './public/hero-ability-rules.js';
import {applyHeroDamage} from './battle-hp-damage.js';
// Experimental server-owned sunder, weaken and haste special attacks.
import {applyAttackThorns} from './commander-parity-thorns.js';
import {calculateHeroRawDamage} from './battle-damage-formula.js';
import {applyEnergySpecialSplash} from './commander-energy-special-splash.js';
import {selectBattleTarget} from './battle-target-selection.js';
import {grantLiveCommanderEnergy} from './commander-live-abilities.js';
export function stepParityStatSpecial(combat,{side,actorId,round=combat?.round,critical=false,allowThornsPassive=false,allowRoundPassives=false}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||round%3!==0||typeof critical!=='boolean')throw Error('Invalid stat special turn');
 const teams=structuredClone(combat.teams),actor=teams[side].find(u=>u.id===actorId&&u.hp>0);
 const effect=actor?.active?.effect;
 if(!actor||(actor.passive&&!((allowThornsPassive&&actor.passive.effect==='thorns')||(allowRoundPassives&&['guard','resist','focus','evasion','momentum','regen','rage'].includes(actor.passive.effect))))||!['sunder','weaken','haste'].includes(effect)||actor.role==='tank')throw Error('Unsupported stat special');
 const enemies=teams[1-side],target=selectBattleTarget(enemies,actor,round);
 if(!target)throw Error('No living target');
 const guarded=target.lane!=='front'&&enemies.some(u=>u.hp>0&&u.lane==='front');
 const weakened=Number.isInteger(actor.commanderWeakenUntilRound)&&round<=actor.commanderWeakenUntilRound?Math.max(0,Math.min(1,Number(actor.commanderWeaken)||0)):0;
 const raw=calculateHeroRawDamage({unit:actor,target,skill:actor.active,special:true,critical,guarded,weakened,round});
 const {damage,absorbed,guardTriggered,arcaneTransfer}=applyHeroDamage(target,raw,{round,allies:enemies});
 actor.damage=(actor.damage||0)+damage;
 const killed=target.hp===0;
 if(killed)actor.kills=(actor.kills||0)+1;
 let action,value=0,recipient=target.id;
 if(effect==='sunder'){target.defense=Math.max(5,Math.floor(target.defense*(1-abilityValue(actor.active,'sunderRate'))));action='armor-break';}
 else if(effect==='weaken'){target.attack=Math.max(5,Math.floor(target.attack*(1-abilityValue(actor.active,'weakenRate'))));action='weaken';}
 else{const before=actor.speed;actor.speed=Math.max(before,Math.min(150,before+abilityValue(actor.active,'hasteAmount')));action='haste';value=actor.speed-before;recipient=actor.id;}
 const events=[
  {round,side,actor:actorId,action,target:recipient,value},
  {round,side,actor:actorId,action:actor.active.name||'special',target:target.id,value:damage,absorbed,critical,rawDamage:raw,damageType:'special',...(guardTriggered?{guardTriggered:true}:{}),...(arcaneTransfer?{arcaneTransfer}:{})}
 ];
 const splashDeaths=applyEnergySpecialSplash({actor,enemies,target,raw,round,side,events});
 const thornsShield=applyAttackThorns(actor,{enabled:allowThornsPassive});
 if(thornsShield)events.push({round,side,actor:actorId,action:'thorns-shield',target:actorId,value:thornsShield});
 combat.teams=teams;combat.version++;
 for(const event of events){event.version=combat.version;combat.events.push(event);}
 for(let i=0;i<Number(killed)+splashDeaths;i++)grantLiveCommanderEnergy(combat.abilities,1-side,10);
 combat.finished=teams.some(team=>team.every(u=>u.hp<=0));
 combat.abilities.finished=combat.finished;
 return {version:combat.version,events,teams:structuredClone(teams),finished:combat.finished};
}
