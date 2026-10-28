// Navigation/presentation only. Polling, chat and the next offered card must not
// jump a player back to the top while they are reading or writing.
export function isAuctionEntry(previous,next){
 return next?.phase==='auction'&&(!previous||previous.phase!=='auction'||previous.code!==next.code||
  (previous.matchKey&&next.matchKey&&previous.matchKey!==next.matchKey)||previous.round>next.round);
}
export function resetAuctionEntryViewport({window,document,home}){
 // A focused hidden join/name input can make mobile Safari restore its old scroll.
 if(home?.contains(document.activeElement))document.activeElement.blur();
 window.scrollTo({top:0,left:0,behavior:'instant'});
}
