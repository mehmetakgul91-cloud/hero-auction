import {commanderWeakenRate,consumeCommanderWeaken} from './commander-weaken-status.js';
import {abilityValue} from './public/hero-ability-rules.js';
import {applyHeroDamage} from './battle-hp-damage.js';
// Server-only experimental special attack: shield or drain.
// Primary hit and special effect commit as one action.
import {applyAttackThorns} from './commander-parity-thorns.js';
import {calculateHeroRawDamage} from './battle-damage-formula.js';
import {applyEnergySpecialSplash} from './commander-energy-special-splash.js';
import {selectBattleTarget} from './battle-target-selection.js';
import {grantLiveCommanderEnergy} from './commander-live-abilities.js';
export function stepParityShieldDrain(combat,{side,actorId,round=combat?.round,critical=false,allowThornsPassive=false,allowRoundPassives=false}={}){
 if(!combat||combat.finished||![0,1].includes(side)||round!==combat.round||round%3!==0||typeof critical!=='boolean')throw Error('Invalid special attack');
 const teams=structuredClone(combat.teams),actor=teams[side].find(u=>u.id===actorId&&u.hp>0);
 const effect=actor?.active?.effect;
 if(!actor||(actor.passive&&!((allowThornsPassive&&actor.passive.effect==='thorns')||(allowRoundPassives&&['guard','resist','focus','evasion','momentum','regen','rage'].includes(actor.passive.effect))))||!['shield','drain'].includes(effect)||!Number.isFinite(actor.attack)||!Number.isFinite(actor.defense))throw Error('Unsupported special attack');
 const enemies=teams[1-side],target=selectBattleTarget(enemies,actor,round);
 if(!target)throw Error('No living target');
 const guarded=target.lane!=='front'&&enemies.some(u=>u.hp>0&&u.lane==='front');
 const weakened=commanderWeakenRate(actor,round);
 const raw=calculateHeroRawDamage({unit:actor,target,skill:actor.active,special:true,critical,guarded,weakened,round});
 const {damage,absorbed,guardTriggered,arcaneTransfer}=applyHeroDamage(target,raw,{round,allies:enemies});
 actor.damage=(actor.damage||0)+damage;
 const killed=target.hp===0;
 if(killed)actor.kills=(actor.kills||0)+1;
 const events=[];
 if(effect==='drain'){
  const healed=Math.min(actor.maxHp-actor.hp,Math.floor(damage*abilityValue(actor.active,'drainRate')));
  actor.hp+=healed;actor.healing=(actor.healing||0)+healed;
  if(healed)events.push({round,side,actor:actorId,action:'heal',target:actorId,value:healed});
 }else{
  const amount=Math.round(actor.defense*abilityValue(actor.active,'shieldRate'));
  actor.shield=(actor.shield||0)+amount;
  events.push({round,side,actor:actorId,action:'shield',target:actorId,value:amount});
 }
 if(actor.role==='tank')for(const ally of teams[side].filter(u=>u.hp>0&&u.lane==='front')){
  const amount=Math.max(1,Math.round(actor.defense*abilityValue(actor.active,'frontShieldRate')));
  ally.shield=(ally.shield||0)+amount;
  events.push({round,side,actor:actorId,action:'tank-front-shield',target:ally.id,value:amount});
 }
 events.push({round,side,actor:actorId,action:actor.active.name||'special',target:target.id,value:damage,critical,absorbed,rawDamage:raw,damageType:'special',...(guardTriggered?{guardTriggered:true}:{}),...(arcaneTransfer?{arcaneTransfer}:{})});
 if(actor.role==='tank'){
  const amount=Math.round(actor.defense*abilityValue(actor.active,'tankShieldRate'));
  actor.shield=(actor.shield||0)+amount;
  events.push({round,side,actor:actorId,action:'tank-self-shield',target:actorId,value:amount});
 }
 const splashDeaths=applyEnergySpecialSplash({actor,enemies,target,raw,round,side,events});
 const thornsShield=applyAttackThorns(actor,{enabled:allowThornsPassive});
 if(thornsShield)events.push({round,side,actor:actorId,action:'thorns-shield',target:actorId,value:thornsShield});
 consumeCommanderWeaken(actor);
 combat.teams=teams;combat.version++;
 for(const event of events){event.version=combat.version;combat.events.push(event);}
 for(let i=0;i<Number(killed)+splashDeaths;i++)grantLiveCommanderEnergy(combat.abilities,1-side,10);
 combat.finished=teams.some(team=>team.every(u=>u.hp<=0));
 combat.abilities.finished=combat.finished;
 return {version:combat.version,events,teams:structuredClone(teams),finished:combat.finished};
}
