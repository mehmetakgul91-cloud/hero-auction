// Hero Auction 2.0 - isolated, deterministic automatic battle prototype.
// Not connected to live matchmaking or wallet payouts.
import crypto from 'node:crypto';

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
function targetOf(enemies,attacker,round){
  const alive=enemies.filter(x=>x.hp>0);
  if(!alive.length)return null;
  const frontline=alive.filter(isFront);
  const pool=attacker.role==='assassin'&&round%3===0?alive:(frontline.length?frontline:alive);
  return [...pool].sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id))[(round+attacker.position)%pool.length];
}
export function simulateBattle(cardsA,cardsB,{seed='hero-auction',maxRounds=10,remainingCredits=[0,0]}={}){
  if(!Array.isArray(remainingCredits)||remainingCredits.length!==2||remainingCredits.some(v=>!Number.isSafeInteger(v)||v< -10000||v>10000))throw Error('Invalid auction remaining credits');
  if(!Array.isArray(cardsA)||!Array.isArray(cardsB)||cardsA.length!==5||cardsB.length!==5)throw Error('Each team must contain exactly five cards.');
  if(!Number.isInteger(maxRounds)||maxRounds<1||maxRounds>100)throw Error('Invalid round limit.');
  const random=seedRandom(seed);
  const teams=[cardsA,cardsB].map(cards=>cards.map((c,i)=>fighterFromCard(c,i)));
  // One bounded tactical multiplier: role + formation + duplicate penalty.
  // No stacking of independent bonuses beyond the 0.90–1.10 interval.
  for(const team of teams){
    const counts=Object.fromEntries(roles.map(role=>[role,0]));for(const u of team)counts[u.role]++;
    for(const u of team){
      const roleBonus=u.role==='tank'?0.06:u.role==='fighter'?0.04:u.role==='energy'?0.08:0.05;
      const duplicates=Math.max(0,counts[u.role]-3)*0.075;
      const laneBonus=Number(u.laneModifiers?.[u.lane]);
      const specialtyBonus=Number.isFinite(laneBonus)?clamp(laneBonus,-0.10,0.10):0;
      const multiplier=clamp(1+roleBonus-duplicates+specialtyBonus,0.90,1.10);
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
  const log=[];
  // Passive effects are applied before the first round and each round's actions.
  for(const team of teams)for(const u of team){
    const p=u.passive;if(!p)continue;
    if(p.effect==='guard'||p.effect==='resist')u.defense=Math.round(u.defense*(1+p.value));
    if(p.effect==='focus')u.attack=Math.round(u.attack*(1+p.value));
    if(p.effect==='evasion'||p.effect==='momentum')u.speed=Math.round(u.speed*(1+p.value));
  }
  for(let round=1;round<=maxRounds;round++){
    for(const team of teams)for(const u of team){
      if(u.hp<=0||!u.passive)continue;
      const {effect,value}=u.passive;
      if(effect==='regen'){const healed=Math.min(u.maxHp-u.hp,Math.max(1,Math.floor(u.maxHp*value)));u.hp+=healed;u.healing+=healed;if(healed)log.push({round,actor:u.id,action:'passive-heal',value:healed});}
      if(effect==='rage'&&u.hp/u.maxHp<.5&&!u.rageActivated){u.attack=Math.min(180,u.attack+Math.max(1,Math.floor(u.attack*value)));u.rageActivated=true;log.push({round,actor:u.id,action:'rage',value:u.attack});}
    }
    const order=teams.flatMap((team,side)=>team.map(unit=>({unit,side})))
      .sort((a,b)=>b.unit.speed-a.unit.speed||a.side-b.side||a.unit.position-b.unit.position);
    for(const {unit,side} of order){
      if(unit.hp<=0)continue;
      const allies=teams[side],enemies=teams[1-side];
      if(!enemies.some(x=>x.hp>0))break;
      if(unit.role==='support'&&round%3===0){
        const ally=[...allies].filter(x=>x.hp>0&&x.hp<x.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
        if(ally){const heal=Math.min(ally.maxHp-ally.hp,Math.round(unit.attack*.55));ally.hp+=heal;unit.healing+=heal;log.push({round,side,actor:unit.id,action:'heal',target:ally.id,value:heal});continue}
      }
      const target=targetOf(enemies,unit,round);
      if(!target)break;
      const special=round%3===0;
      const skill=special?unit.active:null;
      const multiplier=skill?.power??(special?1.15:1);
      const critical=random()<.08;
      // Tanks shield their allies by holding the frontline. Rear units take reduced
      // damage until their front line falls, except when assassins infiltrate.
      const guarded=!isFront(target)&&enemies.some(x=>x.hp>0&&isFront(x));
      const defense=skill?.effect==='pierce'?Math.floor(target.defense*.6):target.defense;
      const roleMultiplier=guarded?0.85:1;
      // Exposed all-ranged squads lose protection; mixed frontlines intercept fire.
      
      const raw=Math.max(1,Math.floor(unit.attack*multiplier*roleMultiplier*0.7*100/(100+defense)*(critical?1.3:1)));
      const absorbed=Math.min(target.shield,raw);
      target.shield-=absorbed;
      const damage=Math.min(target.hp,raw-absorbed);
      target.hp-=damage;unit.damage+=damage;
      if(target.hp===0)unit.kills++;
      if(skill?.effect==='drain'||skill?.effect==='heal'){const healed=Math.min(unit.maxHp-unit.hp,Math.floor(damage*.35));unit.hp+=healed;unit.healing+=healed;if(healed)log.push({round,side,actor:unit.id,action:'heal',target:unit.id,value:healed});}
      if(skill?.effect==='shield'){const amount=Math.round(unit.defense*.4);unit.shield+=amount;log.push({round,side,actor:unit.id,action:'shield',target:unit.id,value:amount});}
      // Tanks reinforce their whole front line during their special turns.
      if(unit.role==='tank'&&special)for(const ally of allies.filter(x=>x.hp>0&&isFront(x)))ally.shield+=Math.max(1,Math.round(unit.defense*.16));
      if(skill?.effect==='sunder'){target.defense=Math.max(5,Math.floor(target.defense*.85));log.push({round,side,actor:unit.id,action:'armor-break',target:target.id,value:0});}
      if(skill?.effect==='weaken'){target.attack=Math.max(5,Math.floor(target.attack*.9));log.push({round,side,actor:unit.id,action:'weaken',target:target.id,value:0});}
      if(skill?.effect==='haste'){unit.speed=Math.min(150,unit.speed+8);log.push({round,side,actor:unit.id,action:'haste',target:unit.id,value:8});}
      if(skill?.effect==='execute'&&target.hp>0&&target.hp/target.maxHp<.12){unit.damage+=target.hp;target.hp=0;unit.kills++;}
      if(skill?.effect==='splash'||unit.role==='energy'&&special)for(const other of enemies.filter(x=>x!==target&&x.hp>0)){const splashRaw=Math.max(1,Math.floor(unit.attack*multiplier*(skill?.effect==='splash'?.12:.06)*100/(100+other.defense)));const splashAbsorbed=Math.min(other.shield,splashRaw);other.shield-=splashAbsorbed;const extra=Math.min(other.hp,splashRaw-splashAbsorbed);other.hp-=extra;unit.damage+=extra;if(other.hp===0)unit.kills++;log.push({round,side,actor:unit.id,action:'splash',target:other.id,value:extra,absorbed:splashAbsorbed,rawDamage:splashRaw,damageType:'splash'});}
      if(unit.passive?.effect==='thorns'&&unit.hp>0)unit.shield+=Math.floor(unit.defense*unit.passive.value);
      log.push({round,side,actor:unit.id,action:skill?.name|| (special?'special':'attack'),target:target.id,value:damage,critical,absorbed,rawDamage:raw,damageType:special?'special':'normal'});
      if(unit.role==='tank'&&special)unit.shield+=Math.round(unit.defense*.2);
    }
    if(teams.some(team=>team.every(x=>x.hp<=0)))break;
  }
  const hpRatio=teams.map(team=>team.reduce((n,x)=>n+x.hp/x.maxHp,0));
  const damage=teams.map(team=>team.reduce((n,x)=>n+x.damage,0));
  const survivors=teams.map(team=>team.filter(x=>x.hp>0).length);
  let winner=null;
  if(survivors[0]!==survivors[1]&&(survivors[0]===0||survivors[1]===0))winner=survivors[0]>survivors[1]?0:1;
  else if(Math.abs(hpRatio[0]-hpRatio[1])>1e-9)winner=hpRatio[0]>hpRatio[1]?0:1;
  else if(damage[0]!==damage[1])winner=damage[0]>damage[1]?0:1;
  else if(survivors[0]!==survivors[1])winner=survivors[0]>survivors[1]?0:1;
  return {version:3,remainingCredits:[...remainingCredits],seed:String(seed),winner,rounds:Math.max(0,...log.map(x=>x.round)),teams,damage,survivors,log};
}
