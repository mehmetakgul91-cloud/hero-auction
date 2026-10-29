// Presentation-only receipts: never request art for cards that have not opened.
const identity=card=>JSON.stringify([card.universe,card.name]);
export function createRevealedTeams(final,pending,tailAwards=[]){
 const hidden=seat=>new Set(pending.filter(a=>a.seat===seat).map(a=>identity(a.card)));
 const tail=seat=>new Set(tailAwards.filter(a=>a.seat===seat).map(a=>identity(a.card)));
 const teams=final.map((player,seat)=>player.team.filter(card=>!hidden(seat).has(identity(card))&&!tail(seat).has(identity(card))));
 const receive=({seat,card})=>{
  if(!teams[seat]||teams[seat].some(known=>identity(known)===identity(card)))return;
  teams[seat].push(card);
 };
 // On reconnect, retain the same reveal order as the server's tail manifest.
 for(const award of tailAwards)if(!hidden(award.seat).has(identity(award.card)))receive(award);
 return {teams,receive};
}

export function renderDeliveryPortraits(slot,cards,{loadArt,english=false}={}){
 if(!slot)return;
 const doc=slot.ownerDocument;
 const portraits=cards.map(card=>{
  const portrait=doc.createElement('span');
  const rarity=['common','advanced','rare','legendary'].includes(card.rarity)?card.rarity:'common';
  portrait.className='delivery-portrait rarity-frame rarity-frame-'+rarity;
  portrait.title=card.name;portrait.setAttribute('translate','no');
  const fallback=doc.createElement('span');fallback.className='delivery-portrait-name';fallback.textContent=card.name;
  portrait.append(fallback);
  // Old disconnected nodes may finish loading, but cannot repaint a new match.
  Promise.resolve().then(()=>loadArt?.(card)).then(url=>{
   if(!url||!portrait.isConnected)return;
   const img=doc.createElement('img');img.alt=card.name;img.decoding='async';
   img.onload=()=>{if(portrait.isConnected)fallback.hidden=true;};
   img.onerror=()=>{img.remove();fallback.hidden=false;};
   img.src=url;portrait.prepend(img);
  }).catch(()=>{});
  return portrait;
 });
 slot.replaceChildren(...portraits);
 slot.setAttribute('aria-label',english?`${cards.length} revealed cards`:`${cards.length} açılan kart`);
}
