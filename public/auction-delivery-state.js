// Presentation state only: never changes a team, credit balance, or server timer.
export const auctionMatchKey=room=>room?.matchKey||`${room?.code}:${JSON.stringify(room?.final?.map(p=>p.team?.map(c=>c.universe+':'+c.name))||[])}`;

export function isStaleAuctionSnapshot(current,next){
 if(!current||current.code!==next?.code)return false;
 if(current.matchKey&&next.matchKey&&current.matchKey!==next.matchKey){
  if(current.matchNumber!==next.matchNumber)return Number(next.matchNumber)<Number(current.matchNumber);
  return Number(next.created)<Number(current.created);
 }
 return Number.isFinite(current.revision)&&Number.isFinite(next?.revision)&&next.revision<current.revision;
}

export function createTailReceipts({storage=()=>null,scope='web'}={}){
 const key='hero-auction-tail-receipts:'+scope,records=new Map();
 try{for(const [match,ids] of JSON.parse(storage()?.getItem(key)||'[]'))if(Array.isArray(ids))records.set(match,new Set(ids));}catch{}
 const match=room=>auctionMatchKey(room)+':'+room.me;
 const id=award=>award.id||`${award.round??''}:${award.seat}:${award.card.universe}:${award.card.name}`;
 return {
  pending(room,awards){const seen=records.get(match(room));return awards.filter(award=>!seen?.has(id(award)));},
  reviewPending(room,awards){return awards.length>0&&!records.get(match(room))?.has('@review-confirmed');},
  confirmReview(room){this.received(room,[{id:'@review-confirmed'}]);},
  received(room,awards){
   const identity=match(room),seen=records.get(identity)||new Set();
   awards.forEach(award=>seen.add(id(award)));records.delete(identity);records.set(identity,seen);
   // A tab only needs recent matches; do not grow browser storage indefinitely.
   while(records.size>12)records.delete(records.keys().next().value);
   try{storage()?.setItem(key,JSON.stringify([...records].map(([identity,ids])=>[identity,[...ids]])));}catch{}
  }
 };
}
