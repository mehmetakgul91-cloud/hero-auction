// Only inputs rendered inside the auction stage belong here. A new snapshot's
// revision, chat, history and presence clock must not replace active bid controls.
export function auctionViewKey(room){
 if(room?.phase!=='auction')return null;
 const card=room.card;
 return JSON.stringify([
  room.code,room.matchKey||[room.matchNumber,room.created],room.me,room.phase,
  room.round,card?.universe,card?.name,card?.rarity,card?.description,
  room.turn,room.topBid,room.topSeat,room.deadline,room.universe,room.mode,
  room.players?.map(player=>[player?.name,player?.credits])
 ]);
}
