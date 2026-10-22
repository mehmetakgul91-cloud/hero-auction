// Experimental roster-to-combat preparation. Mirrors legacy stat modifiers;
// refuses unsupported passives rather than silently omitting their start effects.
import {commanderOriginalFighter} from './commander-original-roster.js';
import {applyCommanderSupport} from './arena-commanders.js';
import {applyLegacyStartPassives} from './commander-parity-passives.js';
import {battleCard,battleRoster} from './battle-roster.js';
import {fighterFromCard} from './battle-engine.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const roles=['tank','fighter','energy','assassin','support'];
export function prepareLiveArenaTeams(cardsA,cardsB,{remainingCredits=[0,0],commanders=[null,null],cardAdapter='original'}={}){
 if(!Array.isArray(cardsA)||!Array.isArray(cardsB)||cardsA.length!==5||cardsB.length!==5)throw Error('Each team must contain exactly five cards.');
 if(!Array.isArray(remainingCredits)||remainingCredits.length!==2||remainingCredits.some(v=>!Number.isSafeInteger(v)||v< -10000||v>10000))throw Error('Invalid auction remaining credits');
 if(!['original','auction'].includes(cardAdapter))throw Error('Invalid live arena card adapter');
 const convert=cardAdapter==='original'?commanderOriginalFighter:(card,i)=>battleRoster.some(hero=>hero.id===String(card?.id||'').toLowerCase())?fighterFromCard(battleCard(card),i):commanderOriginalFighter(card,i);
 const teams=[cardsA,cardsB].map(cards=>cards.map((card,i)=>convert(card,i)));
 for(const team of teams){
  const counts=Object.fromEntries(roles.map(role=>[role,0]));
  for(const u of team)counts[u.role]++;
  for(const u of team){
   const duplicates=Math.max(0,counts[u.role]-3)*.075;
   const laneBonus=Number(u.laneModifiers?.[u.lane]);
   const multiplier=clamp(1-duplicates+(Number.isFinite(laneBonus)?clamp(laneBonus,-.10,.10):0),.90,1.10);
   u.compositionMultiplier=multiplier;
   u.attack=Math.round(u.attack*multiplier);u.defense=Math.round(u.defense*multiplier);
   u.maxHp=Math.round(u.maxHp*multiplier);u.hp=u.maxHp;
   u.speed=Math.round(u.speed*multiplier);
  }
 }
 for(let side=0;side<2;side++){
  const creditMultiplier=Math.max(.01,1+remainingCredits[side]*.01);
  for(const u of teams[side]){
   u.auctionCreditMultiplier=creditMultiplier;
   u.power=Math.round(u.power*creditMultiplier*100)/100;
   u.attack=Math.round(u.attack*creditMultiplier);u.defense=Math.round(u.defense*creditMultiplier);
   u.maxHp=Math.round(u.maxHp*creditMultiplier);u.hp=u.maxHp;
   u.speed=Math.round(u.speed*creditMultiplier);
  }
 }
 for(let side=0;side<2;side++)applyCommanderSupport(teams[side],commanders[side]);
 return applyLegacyStartPassives(teams);
}
