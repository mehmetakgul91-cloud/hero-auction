// Server-side match adapter for Hero Auction 2.0.
// Call only after the auction is finalized; never trust client-supplied battle stats.
import {battleRoster,simulateRosterBattle} from './battle-roster.js';
import crypto from 'node:crypto';
const known=new Set(battleRoster.map(x=>x.id));
const slug=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const byName=new Map(battleRoster.map(h=>[slug(h.name),h.id]));
export function normalizeBattleCard(card){
  if(!card||typeof card!=='object')throw new Error('Invalid card');
  const id=known.has(String(card.id||'').toLowerCase())?String(card.id).toLowerCase():byName.get(slug(card.name));
  if(!id)throw new Error('Hero not in initial 50-character roster');
  const power=Number(card.power??card.strength??card.score);
  if(!Number.isInteger(power)||power<1||power>100)throw new Error('Invalid power');
  return {id,power};
}
export function prepareBattleTeams(auctionState){
  if(!auctionState||!auctionState.finished)throw new Error('Auction must finish before battle');
  const sides=[auctionState.teamA,auctionState.teamB];
  if(sides.some(x=>!Array.isArray(x)||x.length!==5))throw new Error('Each team must have five heroes');
  const teams=sides.map(cards=>cards.map(normalizeBattleCard));
  const ids=teams.flat().map(c=>c.id);
  if(new Set(ids).size!==10)throw new Error('Heroes must be unique across both teams');
  return teams;
}
export function finishAuctionWithBattle(auctionState,{matchId,seed}={}){
  if(!matchId)throw new Error('A stable match ID is required');
  const [a,b]=prepareBattleTeams(auctionState);
  // Production server should persist seed and result once per match to prevent rerolls.
  const battleSeed=seed||crypto.createHash('sha256').update(String(matchId)).digest('hex');
  // Read final balances from authoritative, completed auction state only.
  const remainingCredits=[auctionState.remainingCreditsA,auctionState.remainingCreditsB];
  if(remainingCredits.some(v=>!Number.isSafeInteger(v)||v<0))throw new Error('Final auction credit balances are required');
  const result=simulateRosterBattle(a,b,{seed:battleSeed,remainingCredits});
  return {matchId:String(matchId),winner:result.winner,rounds:result.rounds,teams:result.teams,log:result.log,remainingCredits,seed:battleSeed};
}
