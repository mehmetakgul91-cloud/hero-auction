// Result-only presentation. Never infer death from winner, damage or replay frames.
export function finalHeroStatus(hero){
 if(!Number.isFinite(hero?.hp))return 'unknown';
 return hero.hp<=0?'defeated':'alive';
}

// Preserve raw server HP separately from the animation layer's numeric coercion.
export function captureFinalHeroHealth(teams){
 return (Array.isArray(teams)?teams:[]).map(team=>(Array.isArray(team)?team:[])
  .filter(hero=>hero&&typeof hero==='object').map(({id,hp})=>({id,hp})));
}

export function applySummaryHeroStatus(document,row,hero){
 const status=finalHeroStatus(hero);
 row.dataset.heroStatus=status;
 row.classList.toggle('battle-hero-stat-row--defeated',status==='defeated');
 row.querySelector('.battle-stat-status')?.remove();
 if(status==='defeated'){
  const label=document.createElement('span');label.className='battle-stat-status';
  label.setAttribute('translate','no');
  label.textContent=document.documentElement?.lang==='en'?'Defeated':'Öldü';
  row.querySelector('.battle-stat-name')?.append(label);
 }
 return status;
}
