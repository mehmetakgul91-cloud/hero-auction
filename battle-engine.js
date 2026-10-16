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
  const role=card.role&&roles.includes(card.role)?card.role:roles[power%roles.length];
  const mods={tank:[-12,22,30,-8],fighter:[6,7,8,0],energy:[15,-10,-12,2],assassin:[17,-14,-15,17],support:[-7,0,4,9]}[role];
  const attack=clamp(30+Math.round(power*.65)+mods[0],10,120);
  const defense=clamp(25+Math.round(power*.45)+mods[1],5,110);
  const maxHp=clamp(95+power+mods[2],50,250);
  const speed=clamp(25+Math.round(power*.5)+mods[3],10,110);
  return {id:String(card.id||card.name),name:String(card.name||'Hero'),role,position,attack,defense,maxHp,hp:maxHp,speed,shield:0,kills:0,damage:0,healing:0,active:card.active||null,passive:card.passive||null};
}
// Slots 0-1 are the front line; slots 2-4 are the protected rear line.
function isFront(unit){return unit.position<2}
function targetOf(enemies,attacker){
  const alive=enemies.filter(x=>x.hp>0);
  if(!alive.length)return null;
  const frontline=alive.filter(isFront);
  // Assassins bypass guards and prioritize vulnerable rear-line targets.
  const rear=alive.filter(x=>!isFront(x));
  const pool=attacker.role==='assassin'&&rear.length?rear:frontline.length?frontline:alive;
  return [...pool].sort((a,b)=>a.hp-b.hp||a.position-b.position||a.id.localeCompare(b.id))[0];
}
export function simulateBattle(cardsA,cardsB,{seed='hero-auction',maxRounds=10}={}){
  if(!Array.isArray(cardsA)||!Array.isArray(cardsB)||cardsA.length!==5||cardsB.length!==5)throw Error('Each team must contain exactly five cards.');
  if(!Number.isInteger(maxRounds)||maxRounds<1||maxRounds>100)throw Error('Invalid round limit.');
  const random=seedRandom(seed);
  const teams=[cardsA,cardsB].map(cards=>cards.map((c,i)=>fighterFromCard(c,i)));
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
      const target=targetOf(enemies,unit);
      if(!target)break;
      const special=round%3===0;
      const skill=special?unit.active:null;
      const multiplier=skill?.power??(special?(unit.role==='energy'?1.45:1.25):1);
      const critical=random()<.10;
      // Tanks shield their allies by holding the frontline. Rear units take reduced
      // damage until their front line falls, except when assassins infiltrate.
      const guarded=!isFront(target)&&enemies.some(isFront)&&unit.role!=='assassin';
      const defense=skill?.effect==='pierce'?Math.floor(target.defense*.6):target.defense;
      const roleMultiplier=unit.role==='fighter'&&isFront(target)?1.08:unit.role==='assassin'&&!isFront(target)?1.18:1;
      const raw=Math.max(1,Math.floor(unit.attack*multiplier*roleMultiplier*(guarded?.8:1)*100/(100+defense)*(critical?1.5:1)));
      const absorbed=Math.min(target.shield,raw);
      target.shield-=absorbed;
      const damage=Math.min(target.hp,raw-absorbed);
      target.hp-=damage;unit.damage+=damage;
      if(target.hp===0)unit.kills++;
      if(skill?.effect==='drain'||skill?.effect==='heal'){const healed=Math.min(unit.maxHp-unit.hp,Math.floor(damage*.35));unit.hp+=healed;unit.healing+=healed;}
      if(skill?.effect==='shield')unit.shield+=Math.round(unit.defense*.4);
      // Tanks reinforce their whole front line during their special turns.
      if(unit.role==='tank'&&special)for(const ally of allies.filter(x=>x.hp>0&&isFront(x)))ally.shield+=Math.max(1,Math.round(unit.defense*.16));
      if(skill?.effect==='sunder')target.defense=Math.max(5,Math.floor(target.defense*.85));
      if(skill?.effect==='weaken')target.attack=Math.max(5,Math.floor(target.attack*.9));
      if(skill?.effect==='haste')unit.speed=Math.min(150,unit.speed+8);
      if(skill?.effect==='execute'&&target.hp>0&&target.hp/target.maxHp<.12){unit.damage+=target.hp;target.hp=0;unit.kills++;}
      if(skill?.effect==='splash'||unit.role==='energy'&&special)for(const other of enemies.filter(x=>x!==target&&x.hp>0)){const extra=Math.min(other.hp,Math.max(1,Math.floor(damage*(unit.role==='energy'?.30:.25))));other.hp-=extra;unit.damage+=extra;if(other.hp===0)unit.kills++;log.push({round,side,actor:unit.id,action:'splash',target:other.id,value:extra});}
      if(unit.passive?.effect==='thorns'&&unit.hp>0)unit.shield+=Math.floor(unit.defense*unit.passive.value);
      log.push({round,side,actor:unit.id,action:skill?.name|| (special?'special':'attack'),target:target.id,value:damage,critical});
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
  return {version:2,seed:String(seed),winner,rounds:Math.max(0,...log.map(x=>x.round)),teams,damage,survivors,log};
}
