import {getCommanderAbilityCost} from './public/commander-ability-rules.js';
// Server-owned decisions, restricted to information a player can observe.
// Difficulty changes choices, reaction time and the temporary commander profile.
// Combat bonuses/energy still follow the same progression rules as human profiles.
import {COMMANDERS,COMMANDER_STATS,createCommanderProfile,commanderLevelCap} from './arena-commanders.js';
import {battleRoster} from './battle-roster.js';

const difficultyOf=value=>['easy','medium','hard'].includes(value)?value:'medium';
const quality={common:1,advanced:2,rare:3,legendary:4};
const heroFor=card=>battleRoster.find(hero=>hero.id===card.id||hero.name===card.name);
const roleFor=card=>heroFor(card)?.role||card.role||'fighter';
const sample=(rng,count)=>Math.min(count-1,Math.max(0,Math.floor(rng()*count)));

export const BOT_COMMANDER_LEVELS=Object.freeze({easy:5,medium:10,hard:15});
export function createBotCommanderProfile(commanderId,difficulty){
 const profile=createCommanderProfile(commanderId);
 const level=BOT_COMMANDER_LEVELS[difficultyOf(difficulty)];
 // Branches are independent gold upgrades, not a shared talent-point budget.
 // Training grants no gold and never persists this profile to a human account.
 for(const stat of COMMANDER_STATS)profile.levels[stat]=Math.min(level,commanderLevelCap(commanderId,stat));
 return profile;
}

export function chooseBotCommander(previousId,rng=Math.random,difficulty){
 const available=COMMANDERS.filter(c=>c.id!==previousId);
 return createBotCommanderProfile(available[sample(rng,available.length)].id,difficulty);
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
 if(!ability||snapshot.finished||![0,1].includes(side)||!COMMANDERS.some(c=>c.id===commanderId)||now-Math.max(startedAt,lastCastAt)<BOT_REACTION_MS[level])return null;
 const available=cast=>(cast!=='ultimate'||!snapshot.ultimateUsed?.[side])&&ability[cast==='ultimate'?'canUseUltimate':'canUseNormal']===true&&(!Number.isFinite(ability[cast==='ultimate'?'ultimateEnergy':'energy'])||ability[cast==='ultimate'?'ultimateEnergy':'energy']>=getCommanderAbilityCost(commanderId,cast));
 const canNormal=available('normal'),canUltimate=level!=='easy'&&available('ultimate');
 if(!canNormal&&!canUltimate)return null;
 const ownTeam=snapshot.teams[side],allies=ownTeam.filter(u=>u.hp>0),enemies=snapshot.teams[1-side].filter(u=>u.hp>0);
 if(!allies.length||!enemies.length)return null;
 let cast=canUltimate?'ultimate':'normal',friendlyTarget=null;
 const missing=allies.reduce((n,u)=>n+Math.max(0,u.maxHp-u.hp),0),maxHp=allies.reduce((n,u)=>n+u.maxHp,0);
 if(cast==='ultimate'&&commanderId==='magic'){
  // Visible attack and status only. Never refresh a scheduled/active surge;
  // prefer an AoE caster on an attack tie, then use a stable public ID tie-break.
  friendlyTarget=[...allies].filter(u=>(u.attack||0)>0&&(!Number.isInteger(u.arcaneSurgeUntilRound)||u.arcaneSurgeUntilRound<snapshot.round))
   .sort((a,b)=>(b.attack||0)-(a.attack||0)||Number(b.role==='energy')-Number(a.role==='energy')||String(a.id).localeCompare(String(b.id)))[0]??null;
  if(!friendlyTarget)cast='normal';
 }else if(cast==='ultimate'&&commanderId==='support'){
  if(!snapshot.revivalUsed?.[side])friendlyTarget=[...ownTeam].filter(u=>u.hp===0&&u.maxHp>0)
   .sort((a,b)=>(b.power||0)-(a.power||0)||(b.maxHp||0)-(a.maxHp||0)||String(a.id).localeCompare(String(b.id)))[0]??null;
  if(!friendlyTarget)cast='normal';
 }else if(cast==='ultimate'&&commanderId==='attack'){
  const activeOrder=allies.some(u=>Number.isInteger(u.commanderFocusUntilRound)&&u.commanderFocusUntilRound>=snapshot.round&&enemies.some(e=>e.id===u.commanderFocusTargetId));
  if(activeOrder)return null;
 }
 if(cast==='normal'&&!canNormal)return null;
 // Normal healing has no legal effect on a full-health living team, even if
 // a revival ultimate was unavailable or already used earlier in the battle.
 if(commanderId==='support'&&cast==='normal'&&missing<=0)return null;
 if(level==='hard'){
  const urgent=allies.some(u=>u.hp/u.maxHp<.3);
  if(commanderId==='support'&&cast==='normal'){
   if(missing/maxHp<.15)return null;
  }else if(commanderId==='defense'){
   const shields=allies.reduce((n,u)=>n+(u.shield||0),0);
   if(shields>maxHp*.3&&!urgent)return null;
  }else if(commanderId==='magic'&&cast==='normal'){
   // Normal spell remains the existing enemy debuff, not an ally buff.
   const worthwhile=enemies.some(u=>(u.commanderWeaken||0)<.3||(u.commanderWeakenUntilRound||0)<=snapshot.round);
   if(!worthwhile)return null;

  }
 }
 const result={ability:cast};
 if(cast==='ultimate'&&friendlyTarget)result.targetIds=[friendlyTarget.id];
 else if(commanderId==='magic'){
  const ranked=level==='hard'?[...enemies].sort((a,b)=>{
   const value=u=>(u.attack||u.baseAttack||0)*Math.max(0,.3-((u.commanderWeakenUntilRound||0)>snapshot.round?(u.commanderWeaken||0):0))*(u.hp/u.maxHp>.2?1:.6);
   return value(b)-value(a)||String(a.id).localeCompare(String(b.id));
  }):enemies;
  result.targetIds=ranked.slice(0,1).map(u=>u.id);
 }
 return result;
}
