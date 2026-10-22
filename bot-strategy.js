// Server-owned decisions, restricted to information a player can observe.
// Difficulty changes choices and reaction time, never stats, energy or credits.
import {COMMANDERS,createCommanderProfile} from './arena-commanders.js';
import {battleRoster} from './battle-roster.js';

const difficultyOf=value=>['easy','medium','hard'].includes(value)?value:'medium';
const quality={common:1,advanced:2,rare:3,legendary:4};
const heroFor=card=>battleRoster.find(hero=>hero.id===card.id||hero.name===card.name);
const roleFor=card=>heroFor(card)?.role||card.role||'fighter';
const sample=(rng,count)=>Math.min(count-1,Math.max(0,Math.floor(rng()*count)));

export function chooseBotCommander(previousId,rng=Math.random){
 const available=COMMANDERS.filter(c=>c.id!==previousId);
 return createCommanderProfile(available[sample(rng,available.length)].id);
}

export function chooseBotBid({difficulty,card,bot,human,round=0,topBid=0},rng=Math.random){
 const offer=topBid+1,slots=5-bot.team.length;
 if(slots<=0||offer>bot.credits)return false;
 const level=difficultyOf(difficulty),rank=quality[card.rarity]||1;
 if(level==='easy')return offer<=3&&rng()<(offer===1?.6:.18);
 // Expected future quality is deliberately not read: the deck is hidden.
 const cardsLeft=10-round,reserve=Math.max(0,slots-1)*2;
 const spending=Math.max(1,bot.credits-reserve);
 if(level==='medium')return offer<=Math.min(spending,rank+1)&&(offer<=2||rng()<.65);
 const role=roleFor(card),roles=bot.team.map(roleFor);
 const fillsGap=(role==='tank'&&!roles.includes('tank'))||(role==='support'&&!roles.includes('support'));
 const duplicatePenalty=roles.filter(r=>r===role).length>=2?1:0;
 const scarcity=cardsLeft<=slots+1;
 const deny=rank>=3&&human.team.length<5&&human.credits<=offer+1;
 const value=rank+1+(fillsGap?1:0)+(deny?1:0)-duplicatePenalty;
 const cap=Math.min(bot.credits,spending,Math.max(1,value));
 return offer<=cap&&(rank>=2||fillsGap||scarcity||offer===1);
}

export function chooseBotFormation(cards,difficulty,rng=Math.random){
 const level=difficultyOf(difficulty);
 const indices=cards.map((_,i)=>i);
 let front;
 if(level==='easy'){
  // A legal but unplanned formation, including varied order on rematches.
  for(let i=indices.length-1;i>0;i--){const j=sample(rng,i+1);[indices[i],indices[j]]=[indices[j],indices[i]];}
  front=indices.slice(0,2);
 }else{
  const score=i=>{
   const hero=heroFor(cards[i]),role=roleFor(cards[i]);
   const resilience=({tank:30,fighter:12,assassin:2,support:-14,energy:-18})[role]||0;
   if(level==='medium')return resilience;
   const lane=hero?.laneModifiers||cards[i].laneModifiers||{};
   return resilience+100*((lane.front||0)-(lane.back||0))+(Number(hero?.stats?.defense)||0)*.08;
  };
  const ranked=[...indices].sort((a,b)=>score(b)-score(a)||a-b);
  front=ranked.slice(0,level==='hard'&&score(ranked[1])<0?1:2);
 }
 const positions=[...front,...indices.filter(i=>!front.includes(i))];
 return {positions,lanes:positions.map(i=>front.includes(i)?'front':'back'),roles:positions.map(i=>roleFor(cards[i]))};
}

export const BOT_REACTION_MS=Object.freeze({easy:9000,medium:4500,hard:1500});
export function chooseBotCast(snapshot,commanderId,difficulty,{now=Date.now(),lastCastAt=0,startedAt=0,side=1}={}){
 const level=difficultyOf(difficulty),ability=snapshot?.abilities?.[side];
 if(!ability||snapshot.finished||now-Math.max(startedAt,lastCastAt)<BOT_REACTION_MS[level]||!ability.canUseNormal)return null;
 const allies=snapshot.teams[side].filter(u=>u.hp>0),enemies=snapshot.teams[1-side].filter(u=>u.hp>0);
 if(!allies.length||!enemies.length)return null;
 let cast=level!=='easy'&&ability.canUseUltimate?'ultimate':'normal';
 const missing=allies.reduce((n,u)=>n+u.maxHp-u.hp,0),maxHp=allies.reduce((n,u)=>n+u.maxHp,0);
 if(level==='hard'){
  const urgent=allies.some(u=>u.hp/u.maxHp<.3),late=snapshot.round>=13;
  if(commanderId==='support'){
   if(missing/maxHp<.15)return null;
   if(!ability.canUseUltimate&&!urgent&&!late)return null;
  }else if(commanderId==='defense'){
   const shields=allies.reduce((n,u)=>n+(u.shield||0),0);
   if(shields>maxHp*.3&&!urgent)return null;
   if(!ability.canUseUltimate&&!urgent&&!late)return null;
  }else if(commanderId==='attack'){
   // Visible base attack is sufficient for a conservative finishing estimate.
   const basis=snapshot.teams[side].reduce((n,u)=>n+(u.baseAttack??u.attack??0),0);
   const normalDamage=Math.floor(basis*.12/enemies.length);
   const finishing=enemies.some(u=>u.hp+(u.shield||0)<=normalDamage);
   if(!ability.canUseUltimate&&!finishing&&!urgent&&!late)return null;
  }else if(commanderId==='magic'){
   // Do not spend energy refreshing an equally strong debuff with time left.
   const rate=cast==='ultimate'?.4:.3;
   const worthwhile=enemies.some(u=>(u.commanderWeaken||0)<rate||(u.commanderWeakenUntilRound||0)<=snapshot.round);
   if(!worthwhile)return null;
   const enemyAttack=enemies.reduce((n,u)=>n+(u.attack||0),0);
   const strongestAlly=Math.max(...allies.map(u=>u.attack||0));
   const highThreat=enemies.some(u=>(u.commanderWeaken||0)<.3&&(u.attack||0)>=enemyAttack*.55&&(u.attack||0)>=strongestAlly*2);
   const openingDebuff=snapshot.round<=3&&lastCastAt===0;
   if(!ability.canUseUltimate&&!urgent&&!late&&!highThreat&&!openingDebuff)return null;
  }
 }
 const result={ability:cast};
 if(commanderId==='magic'){
  const ranked=level==='hard'?[...enemies].sort((a,b)=>{
   const rate=cast==='ultimate'?.4:.3;
   const value=u=>(u.attack||u.baseAttack||0)*Math.max(0,rate-((u.commanderWeakenUntilRound||0)>snapshot.round?(u.commanderWeaken||0):0))*(u.hp/u.maxHp>.2?1:.6);
   return value(b)-value(a)||String(a.id).localeCompare(String(b.id));
  }):enemies;
  result.targetIds=ranked.slice(0,cast==='ultimate'?2:1).map(u=>u.id);
 }
 return result;
}
