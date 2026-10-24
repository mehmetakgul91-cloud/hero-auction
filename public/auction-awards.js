// Only the already-visible offered card may use the normal purchase flight.
// Automatic hidden tail cards have a separate reveal queue.
export function collectOfferedAwards(previous,next){
 if(previous?.phase!=='auction'||previous.code!==next?.code||!previous.card)return [];
 const offered=previous.card,key=card=>card.universe+':'+card.name;
 return ((next.phase==='finished'?next.final:next.players)||[]).flatMap((player,seat)=>{
  const known=new Set((previous.players?.[seat]?.team||[]).map(key));
  return (player.team||[]).filter(card=>key(card)===key(offered)&&!known.has(key(card))).map(card=>({card,seat,round:previous.round,code:next.code}));
 });
}
export const displaySeat=(seat,me)=>seat===me?0:1;
