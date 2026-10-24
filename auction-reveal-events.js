import {rarityForPower} from './auction-card-pool.js';

// Match-scoped presentation metadata, never a second source of card ownership/cost.
export const auctionMatchKey=room=>`${room.code}:${room.matchNumber||1}:${room.created}`;

export function recordTailAward(room,seat,card,cost){
 (room.tailAwards??=[]).push({id:`${auctionMatchKey(room)}:${room.round}:${seat}`,round:room.round,seat,card:{name:card.name,universe:card.universe,cost,power:card.power,rarity:rarityForPower(card.power)}});
}

export function auctionRevealSnapshot(room){
 return {
  matchKey:auctionMatchKey(room),
  matchNumber:room.matchNumber||1,
  created:room.created,
  revision:Number.isSafeInteger(room.revision)&&room.revision>=0?room.revision:0,
  // Never expose the undisplayed cards before authoritative allocation has finished.
  ...(room.phase==='finished'&&Array.isArray(room.tailAwards)?{tailAwards:room.tailAwards.map(award=>({...award,card:{...award.card}}))}:{})
 };
}
