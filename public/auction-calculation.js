const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function teamCalculation(player){
 const base=player.team.reduce((sum,hero)=>sum+hero.power,0),credits=player.credits;
 return {base,credits,multiplier:1+credits/100,total:base*(1+credits/100)};
}
export function auctionCalculationMarkup(players,me,{english=false}={}){
 const ordered=[players[me],players[1-me]],values=ordered.map(teamCalculation);
 const labels=english?['Calculation','Your team','Opponent','Base team power','Remaining credits','Power adjustment','FINAL TEAM POWER']:['Hesaplama','Senin takımın','Rakip','Takımın temel gücü','Kalan kredi','Güç değişimi','SON TAKIM GÜCÜ'];
 const row=(label,format,total=false)=>`<tr${total?' class="calculation-total"':''}><th scope="row">${label}</th>${values.map(v=>`<td>${format(v)}</td>`).join('')}</tr>`;
 return `<table class="auction-calculation"><caption>${labels[0]}</caption><thead><tr><th scope="col">${labels[0]}</th>${ordered.map((p,i)=>`<th scope="col">${labels[i+1]}<small translate="no">${esc(p.name)}</small></th>`).join('')}</tr></thead><tbody>${row(labels[3],v=>v.base)}${row(labels[4],v=>v.credits)}${row(labels[5],v=>(v.credits>=0?'+':'')+v.credits+'%')}${row(labels[6],v=>v.total.toFixed(2),true)}</tbody></table>`;
}
