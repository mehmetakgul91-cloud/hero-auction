// Cosmetic auction deck. Only the public round counter is accepted: no future cards.
export function auctionDeckState(round){
 const index=Number.isInteger(round)?Math.min(9,Math.max(0,round)):0;
 return {remaining:9-index,layers:Math.min(3,9-index),finalCards:index>=7};
}
export function auctionDeckMarkup(round,english=false){
 const {remaining,layers}=auctionDeckState(round);
 const label=remaining?(english?remaining+' cards in deck':'Destede '+remaining+' kart'):(english?'Last card':'Son kart');
 return '<div class="auction-deck-backs" aria-hidden="true">'+Array.from({length:layers},(_,i)=>'<span class="auction-deck-back" style="--deck-layer:'+(i+1)+'"><b>✦</b></span>').join('')+'</div><span class="auction-deck-count" translate="no">'+label+'</span>';
}
export function cancelAuctionReveal(root){
 root?.querySelectorAll('.auction-drawing,.auction-final-draw,.auction-tail-card').forEach(node=>node.classList.remove('auction-drawing','auction-final-draw','auction-tail-card'));
}
export function revealAuctionCard(root,{round,newCard,reducedMotion=false}={}){
 cancelAuctionReveal(root);
 const scene=root?.querySelector('.auction-deck-scene');
 if(!scene||!newCard||reducedMotion)return;
 scene.classList.add('auction-drawing');
 if(auctionDeckState(round).finalCards)scene.classList.add('auction-final-draw');
 // Animation state stays on this DOM instance. Re-render/navigation removes it.
 scene.addEventListener('animationend',event=>{
  if(event.animationName==='auctionDrawFront')scene.classList.remove('auction-drawing','auction-final-draw','auction-tail-card');
 });
}
