import {heroPortraitSource,heroRarity,heroRarityLabel} from './hero-rarity.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signed=value=>(value>=0?'+':'')+value.toFixed(2);
export function heroCalculation(hero,credits){
 const base=hero.power,multiplier=1+credits/100;
 return {base,adjustment:base*credits/100,total:base*multiplier};
}
export function teamCalculation(player){
 const base=player.team.reduce((sum,hero)=>sum+hero.power,0),credits=player.credits;
 return {base,credits,multiplier:1+credits/100,total:base*(1+credits/100)};
}
export function auctionCalculationMarkup(players,me,{english=false}={}){
 const ordered=[players[me],players[1-me]];
 const labels=english?{own:'Your team',opponent:'Opponent',hero:'Hero',base:'Base power',adjustment:'Credit effect',total:'Auction power',remaining:'Remaining credits',team:'TEAM TOTAL',note:'Auction power = base power × (1 + remaining credits / 100). Negative credits reduce power. Commander, formation and arena effects are not included.'}:{own:'Senin takımın',opponent:'Rakip takım',hero:'Kahraman',base:'Temel güç',adjustment:'Kredi etkisi',total:'Açık artırma gücü',remaining:'Kalan kredi',team:'TAKIM TOPLAMI',note:'Açık artırma gücü = temel güç × (1 + kalan kredi / 100). Eksi kredi gücü azaltır. Komutan, diziliş ve arena etkileri bu hesapta yer almaz.'};
 const teamMarkup=(player,index)=>{
  const values=teamCalculation(player),percentage=(values.credits>=0?'+':'')+values.credits+'%';
  const rows=player.team.map(hero=>{
   const value=heroCalculation(hero,values.credits),portrait=heroPortraitSource(hero),rarity=heroRarity(hero),rarityText=heroRarityLabel(rarity,english?'en':'tr');
   const identity=`<span class="calculation-identity"><span class="calculation-portrait" data-rarity="${rarity}" title="${esc(rarityText)}" aria-label="${esc(rarityText)}">${portrait?`<img src="${esc(portrait)}" alt="" decoding="async">`:`<span aria-hidden="true">${esc(String(hero.name||'').slice(0,1))}</span>`}</span><span translate="no">${esc(hero.name)}</span></span>`;
   return `<tr class="calculation-hero"><th scope="row">${identity}</th><td>${value.base}</td><td class="calculation-adjustment">${signed(value.adjustment)}</td><td class="calculation-final">${value.total.toFixed(2)}</td></tr>`;
  }).join('');
  return `<section class="calculation-team"><div class="calculation-team-heading"><div><h3>${index===0?labels.own:labels.opponent}</h3><p translate="no">${esc(player.name)}</p></div><div class="calculation-credit"><span>${labels.remaining}</span><strong>${values.credits} <small>(${percentage})</small></strong></div></div><table class="auction-calculation auction-hero-calculation"><caption>${index===0?labels.own:labels.opponent} · ${esc(player.name)}</caption><thead><tr><th scope="col">${labels.hero}</th><th scope="col">${labels.base}</th><th scope="col">${labels.adjustment}</th><th scope="col">${labels.total}</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="calculation-total"><th scope="row">${labels.team}</th><td>${values.base}</td><td>${signed(values.base*values.credits/100)}</td><td>${values.total.toFixed(2)}</td></tr></tfoot></table></section>`;
 };
 return `<div class="auction-calculation-teams">${ordered.map(teamMarkup).join('')}</div><p class="auction-calculation-note">${labels.note}</p>`;
}
