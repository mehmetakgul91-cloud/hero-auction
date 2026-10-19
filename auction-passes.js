// Keep every auction card assigned so both teams can enter the arena.
export function awardUnbidCard(room,costForCard){
 const first=room.openingPassSeat;
 const seat=[first,1-first].find(i=>Number.isInteger(i)&&room.players[i]?.team.length<5);
 if(seat===undefined)throw Error('No open team slot for unbid card');
 const card=room.cards[room.round];
 if(!card)throw Error('Missing unbid card');
 const cost=costForCard(card);
 room.players[seat].credits-=cost;
 room.players[seat].team.push({...card,cost});
 room.round++;room.topBid=0;room.topSeat=null;room.openingPassSeat=null;
 return {seat,card,cost};
}
