import {applyHeroDamage,expireLastStandGuards} from './battle-hp-damage.js';
import {expireCommanderUltimateStatuses} from './commander-ultimate-status.js';
import {commanderRoundEnergy,getCommanderAbilityCost} from './public/commander-ability-rules.js';
import {commanderAttackPower} from './commander-attack-damage.js';
import {applyLiveCommanderEffect} from './commander-live-effects.js';
import {consumeCommanderFocus,expireCommanderFocus} from './battle-commander-focus.js';
// Hero Auction 2.0 - isolated, deterministic automatic battle prototype.
// Not connected to live matchmaking or wallet payouts.
import crypto from 'node:crypto';
import {orderHeroActions} from './battle-action-scheduler.js';
import {selectBattleTarget} from './battle-target-selection.js';
import {calculateHeroRawDamage} from './battle-damage-formula.js';
import {calculateSplashRawDamage,resolveSpecialHealing} from './battle-special-formulas.js';
import {abilityValue} from './public/hero-ability-rules.js';
import {applyHeroDelay,finishHeroDelay} from './battle-delay.js';
import {applyCommanderSupport} from './arena-commanders.js';
import {battleOutcome} from './battle-result.js';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const roles=['tank','fighter','energy','assassin','support'];
function seedRandom(seed){
  let n=crypto.createHash('sha256').update(String(seed)).digest().readUInt32BE(0);
  return ()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296};
}
export function fighterFromCard(card,position=0){
  const power=clamp(Math.round(Number(card.power)||50),1,100);
  // Formation controls the battle role: both rear slots and rear specialists use ranged energy.
  const lane=card.lane==='front'||card.lane==='back'?card.lane:position>=2?'back':'front';
  const role=roles.includes(card.role)?card.role:(lane==='back'?'energy':'fighter');
  // Hero auction power is the baseline; positioning can change stats by at most 10%.
  const base={attack:power,defense:power,maxHp:power*2,speed:power};
  return {id:String(card.id||card.name),name:String(card.name||'Hero'),power,role,lane,position,specialty:card.specialty||null,laneModifiers:card.laneModifiers||null,
    attack:base.attack,defense:base.defense,maxHp:base.maxHp,hp:base.maxHp,speed:base.speed,
    shield:0,kills:0,damage:0,healing:0,active:card.active||null,passive:card.passive||null};
}
// Slots 0-1 are the front line; slots 2-4 are the protected rear line.
function isFront(unit){return unit.lane==='front'}

// Manual commander commands are validated against actual round energy; no command means no active ability.
export function simulateBattle(cardsA,cardsB,{seed='hero-auction',maxRounds=15,remainingCredits=[0,0],commanders=[null,null],commanderActions=[]}={}){
  if(!Array.isArray(remainingCredits)||remainingCredits.length!==2||remainingCredits.some(v=>!Number.isSafeInteger(v)||v< -10000||v>10000))throw Error('Invalid auction remaining credits');
  if(!Array.isArray(cardsA)||!Array.isArray(cardsB)||cardsA.length!==5||cardsB.length!==5)throw Error('Each team must contain exactly five cards.');
  if(!Number.isInteger(maxRounds)||maxRounds<1||maxRounds>100)throw Error('Invalid round limit.');
  const random=seedRandom(seed);
  const teams=[cardsA,cardsB].map(cards=>cards.map((c,i)=>fighterFromCard(c,i)));
  // One bounded tactical multiplier: formation + duplicate penalty.
  // No stacking of independent bonuses beyond the 0.90–1.10 interval.
  for(const team of teams){
    const counts=Object.fromEntries(roles.map(role=>[role,0]));for(const u of team)counts[u.role]++;
    for(const u of team){
      const duplicates=Math.max(0,counts[u.role]-3)*0.075;
      const laneBonus=Number(u.laneModifiers?.[u.lane]);
      const specialtyBonus=Number.isFinite(laneBonus)?clamp(laneBonus,-0.10,0.10):0;
      const multiplier=clamp(1-duplicates+specialtyBonus,0.90,1.10);
      u.compositionMultiplier=multiplier;
      u.attack=Math.round(u.attack*multiplier);
      u.defense=Math.round(u.defense*multiplier);
      u.maxHp=Math.round(u.maxHp*multiplier);u.hp=u.maxHp;
      u.speed=Math.round(u.speed*multiplier);
    }
  }
  // Each remaining credit modifies every hero's battle stats by 1%.
  for(let side=0;side<2;side++){
    const creditMultiplier=Math.max(0.01,1+remainingCredits[side]*0.01);
    for(const u of teams[side]){
      u.auctionCreditMultiplier=creditMultiplier;
      u.power=Math.round(u.power*creditMultiplier*100)/100;
      u.attack=Math.round(u.attack*creditMultiplier);
      u.defense=Math.round(u.defense*creditMultiplier);
      u.maxHp=Math.round(u.maxHp*creditMultiplier);u.hp=u.maxHp;
      u.speed=Math.round(u.speed*creditMultiplier);
    }
  }
  // Commander support is applied only when explicitly selected; null preserves legacy outcomes.
  for(let side=0;side<2;side++)applyCommanderSupport(teams[side],Array.isArray(commanders)?commanders[side]:null);
  const log=[];
  let actionId=null;
  const shieldSnapshot=()=>teams.map(team=>team.map(unit=>unit.shield));
  const record=(...entries)=>log.push(...entries.map(entry=>({...entry,...(actionId?{actionId}:{}),shieldSnapshot:shieldSnapshot()})));
  // Passive effects are applied before the first round and each round's actions.
  for(const team of teams)for(const u of team){
    const p=u.passive;if(!p)continue;
    if(p.effect==='guard'||p.effect==='resist')u.defense=Math.round(u.defense*(1+p.value));
    if(p.effect==='focus')u.attack=Math.round(u.attack*(1+p.value));
    if(p.effect==='evasion'||p.effect==='momentum')u.speed=Math.round(u.speed*(1+p.value));
  }
  const initialShields=shieldSnapshot();
  const commanderAttackBasis=teams.map(commanderAttackPower);
  const commanderEnergy=[0,0],revivalUsed=[false,false],ultimateUsed=[false,false];
  if(!Array.isArray(commanderActions)||commanderActions.length>200)throw Error('Invalid commander actions');
  const actions=new Map();
  for(const action of commanderActions){
    if(!action||!Number.isInteger(action.round)||action.round<1||action.round>maxRounds||![0,1].includes(action.side)||!['normal','ultimate'].includes(action.ability))throw Error('Invalid commander action');
    const key=action.round+':'+action.side;
    if(actions.has(key))throw Error('Only one commander action per side per round');
    if(action.targetIds!==undefined&&(!Array.isArray(action.targetIds)||action.targetIds.length!==1||typeof action.targetIds[0]!=='string'))throw Error('Invalid commander targets');
    actions.set(key,{ability:action.ability,targetIds:action.targetIds});
  }
  const applyCommanderAction=(round,side,{ability,targetIds})=>{
    const commander=commanders?.[side],id=commander?.commanderId;
    if(ability==='ultimate'&&ultimateUsed[side])throw Error('Commander ultimate already used');
    const cost=getCommanderAbilityCost(id,ability);
    if(commanderEnergy[side]<cost)throw Error('Insufficient commander energy at round '+round);
    if(!teams[side].some(u=>u.hp>0)||!teams[1-side].some(u=>u.hp>0))return;
    // Legacy scripted normal magic keeps deterministic targeting when omitted.
    // New selected-friendly ultimates require explicit authoritative hero IDs.
    if(id==='magic'&&ability==='normal'&&targetIds===undefined)targetIds=[...teams[1-side]].filter(u=>u.hp>0).sort((a,b)=>b.attack-a.attack||a.id.localeCompare(b.id)).slice(0,1).map(u=>u.id);
    const effect=applyLiveCommanderEffect(teams,{side,ability,commanderId:id,commanderProfile:commander,attackBasis:commanderAttackBasis[side],round,targetIds,revivalUsed:revivalUsed[side]});
    commanderEnergy[side]-=cost;revivalUsed[side]=effect.revivalUsed;if(ability==='ultimate')ultimateUsed[side]=true;
    teams[0]=effect.teams[0];teams[1]=effect.teams[1];
    for(const event of effect.log)record({...event,energy:commanderEnergy[side]});
  };
  for(let round=1;round<=maxRounds;round++){
    actionId=null;
    expireLastStandGuards(teams,round);expireCommanderUltimateStatuses(teams,round);expireCommanderFocus(teams,round);
    for(const team of teams)for(const unit of team){if(unit.commanderWeaken&&Number.isInteger(unit.commanderWeakenUntilRound)&&round>unit.commanderWeakenUntilRound){delete unit.commanderWeaken;delete unit.commanderWeakenUntilRound;}}
    for(let side=0;side<2;side++)commanderEnergy[side]=commanderRoundEnergy(commanderEnergy[side],round,commanders?.[side]);
    for(const team of teams)for(const u of team){
      if(u.hp<=0||!u.passive)continue;
      const {effect,value}=u.passive;
      if(effect==='regen'){const healed=Math.min(u.maxHp-u.hp,Math.max(1,Math.floor(u.maxHp*value)));u.hp+=healed;u.healing+=healed;if(healed)record({round,actor:u.id,action:'passive-heal',value:healed});}
      if(effect==='rage'&&u.hp/u.maxHp<.5&&!u.rageActivated){u.attack=Math.max(u.attack,Math.min(180,u.attack+Math.max(1,Math.floor(u.attack*value))));u.rageActivated=true;record({round,actor:u.id,action:'rage',value:u.attack});}
    }
    for(let side=0;side<2;side++){const ability=actions.get(round+':'+side);if(ability)applyCommanderAction(round,side,ability);}
    const order=orderHeroActions(teams,{round});
    for(let cursor=0;cursor<order.length;cursor++){
      const {unit,side}=order[cursor];
      actionId=round+':'+side+':'+unit.id;
      if(unit.hp<=0||unit.canActFromRound>round)continue;
      const allies=teams[side],enemies=teams[1-side];
      if(!enemies.some(x=>x.hp>0))break;
      const special=round%3===0;
      const skill=special?unit.active:null;
      if(special){
        const healing=resolveSpecialHealing(unit,allies);
        if(healing){
          const {target:recipient,heal,shield}=healing;
          recipient.hp+=heal;unit.healing+=heal;
          if(heal>0)record({round,side,actor:unit.id,action:'heal',target:recipient.id,value:heal});
          if(shield>0){recipient.shield+=shield;record({round,side,actor:unit.id,action:'shield',target:recipient.id,value:shield});}
          unit.lastActionRound=round;finishHeroDelay(unit,round);
          continue;
        }
      }
      const target=selectBattleTarget(enemies,unit,round);
      if(!target)break;
      const critical=random()<.08;
      const guarded=!isFront(target)&&enemies.some(x=>x.hp>0&&isFront(x));
      const weakened=Number.isInteger(unit.commanderWeakenUntilRound)&&round<=unit.commanderWeakenUntilRound?Math.max(0,Math.min(1,Number(unit.commanderWeaken)||0)):0;
      const raw=calculateHeroRawDamage({unit,target,skill,special,critical,guarded,weakened,round});
      const hit=applyHeroDamage(target,raw,{round,allies:teams[1-side],executeThreshold:skill?.effect==='execute'?abilityValue(skill,'executeThreshold'):0});
      const {absorbed,damage,executedDamage}=hit;
      unit.damage+=damage+executedDamage;
      if(target.hp===0){unit.kills++;commanderEnergy[1-side]=Math.min(100,commanderEnergy[1-side]+10);}
      if(skill?.effect==='drain'){const healed=Math.min(unit.maxHp-unit.hp,Math.floor(damage*abilityValue(skill,'drainRate')));unit.hp+=healed;unit.healing+=healed;if(healed)record({round,side,actor:unit.id,action:'heal',target:unit.id,value:healed});}
      if(skill?.effect==='shield'){const amount=Math.round(unit.defense*abilityValue(skill,'shieldRate'));unit.shield+=amount;record({round,side,actor:unit.id,action:'shield',target:unit.id,value:amount});}
      // Tanks reinforce their whole front line during their special turns.
      if(unit.role==='tank'&&special)for(const ally of allies.filter(x=>x.hp>0&&isFront(x)))ally.shield+=Math.max(1,Math.round(unit.defense*abilityValue(skill,'frontShieldRate')));
      if(skill?.effect==='sunder'){target.defense=Math.max(5,Math.floor(target.defense*(1-abilityValue(skill,'sunderRate'))));record({round,side,actor:unit.id,action:'armor-break',target:target.id,value:0});}
      if(skill?.effect==='weaken'){target.attack=Math.max(5,Math.floor(target.attack*(1-abilityValue(skill,'weakenRate'))));record({round,side,actor:unit.id,action:'weaken',target:target.id,value:0});}
      if(skill?.effect==='haste'){const before=unit.speed;unit.speed=Math.max(before,Math.min(150,before+abilityValue(skill,'hasteAmount')));record({round,side,actor:unit.id,action:'haste',target:unit.id,value:unit.speed-before});}
      // Log primary settlement before secondary deaths so status transfer replay is chronological.
      record({round,side,actor:unit.id,action:skill?.name|| (special?'special':'attack'),target:target.id,value:damage,critical,absorbed,rawDamage:raw,damageType:special?'special':'normal',executedDamage,...(hit.guardTriggered?{guardTriggered:true}:{}),...(hit.arcaneTransfer?{arcaneTransfer:hit.arcaneTransfer}:{})});
      if(skill?.effect==='splash'||unit.role==='energy'&&special)for(const other of enemies.filter(x=>x!==target&&x.hp>0)){const splashRaw=calculateSplashRawDamage(raw,{skill,role:unit.role,special});const splashHit=applyHeroDamage(other,splashRaw,{round,allies:teams[1-side]});const splashAbsorbed=splashHit.absorbed,extra=splashHit.damage;unit.damage+=extra;if(other.hp===0){unit.kills++;commanderEnergy[1-side]=Math.min(100,commanderEnergy[1-side]+10);}record({round,side,actor:unit.id,action:'splash',target:other.id,value:extra,absorbed:splashAbsorbed,rawDamage:splashRaw,damageType:'splash',...(splashHit.guardTriggered?{guardTriggered:true}:{}),...(splashHit.arcaneTransfer?{arcaneTransfer:splashHit.arcaneTransfer}:{})});}
      if(unit.passive?.effect==='thorns'&&unit.hp>0)unit.shield+=Math.floor(unit.defense*unit.passive.value);
      if(unit.role==='tank'&&special)unit.shield+=Math.round(unit.defense*abilityValue(skill,'tankShieldRate'));
      unit.lastActionRound=round;finishHeroDelay(unit,round);consumeCommanderFocus(unit);expireCommanderFocus(teams,round);
      if(skill?.delay){const delayed=applyHeroDelay({teams,order,cursor:cursor+1,round,side,actorId:unit.id,targetId:target.id});if(delayed)record(delayed);}
      // The final event represents the completed atomic hero action, including
      // role/passive shield gains which do not have separate animation events.
      log[log.length-1].shieldSnapshot=shieldSnapshot();
    }
    if(teams.some(team=>team.every(x=>x.hp<=0)))break;
  }
  const {winner,damage,survivors}=battleOutcome(teams);
  return {version:4,initialShields,commanderEnergy,revivalUsed,ultimateUsed,commanders:Array.isArray(commanders)?commanders.slice(0,2):[null,null],remainingCredits:[...remainingCredits],seed:String(seed),winner,rounds:Math.max(0,...log.map(x=>x.round)),teams,damage,survivors,log};
}
