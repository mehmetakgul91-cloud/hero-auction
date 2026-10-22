// Auction rarity is descriptive, not a quota. Draw ten distinct active heroes.
export const rarityForPower=power=>power>=90?'legendary':power>=70?'rare':power>=50?'advanced':'common';
export function selectAuctionCards(eligible,{shuffle,powerFor}={}){
 const heroes=[...new Map(eligible.map(hero=>[hero.id,hero])).values()];
 if(heroes.length<10)throw Error('Açık artırma için en az 10 farklı kahraman gerekli.');
 return shuffle(heroes).slice(0,10).map(hero=>({...hero,power:powerFor(hero.id)}));
}
