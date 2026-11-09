// Presentation only: read server-owned duration and fixed bonus, never infer
// damage or extend a status from a local clock, animation or repeated render.
export function arcaneSurgePresentation(unit,{round,english=false}={}){
 const from=unit?.arcaneSurgeFromRound,until=unit?.arcaneSurgeUntilRound,bonus=unit?.arcaneSurgeBonusAttack;
 if(!(unit?.hp>0)||!Number.isInteger(round)||round<1||!Number.isInteger(from)||from<1||!Number.isInteger(until)||until<from||round>until||!Number.isFinite(bonus)||bonus<0)return null;
 const pending=round<from,remaining=until-Math.max(round,from)+1;
 const label=english?'SURGE':'AŞIRI YÜK';
 const text=label+' · '+remaining+(english?'R':'T');
 const description=english?
  `Arcane Surge: +${bonus} attack for normal, special and area hits. ${pending?'Starts in round '+from:remaining+' action rounds remaining'}; through round ${until}. Healing and shields are unchanged.`:
  `Aşırı Yük: normal, özel ve alan vuruşlarına +${bonus} saldırı. ${pending?from+'. turda başlar':remaining+' hareket turu kaldı'}; ${until}. tur sonuna kadar. Şifa ve kalkan değişmez.`;
 return {text,description,pending,remaining,bonus,fromRound:from,untilRound:until};
}
