// Cosmetic presentation; the shared ability lock is enforced by the server.
const names={attack:'SALDIRI',defense:'SAVUNMA',magic:'BÜYÜ',support:'DESTEK'};
const symbols={attack:'⚔',defense:'🛡',magic:'✦',support:'✚'};
const commanderPortraits={attack:'/images/Ate%C5%9Fler%20%C4%B0%C3%A7inde%20Sava%C5%9F%C3%A7%C4%B1%20Komutan.png',defense:'/images/Alt%C4%B1n%20Aslan%C4%B1n%20Kale%20Muhaf%C4%B1z%C4%B1.png',magic:'/images/Kozmik%20R%C3%BCnlerin%20B%C3%BCy%C3%BCc%C3%BC%20Komutan%C4%B1.png',support:'/images/Z%C3%BCmr%C3%BCt%20I%C5%9F%C4%B1%C4%9F%C4%B1n%20%C5%9Eifac%C4%B1%20Krali%C3%A7esi.png'};
const EFFECT_MS=1200;
const seen=new Set(),pending=[],waitingImpacts=[],impactElements=new Set(),timers=new Set();
let playing=false,activeUntil=0,activeOverlay=null;
function later(callback,delay){const id=setTimeout(()=>{timers.delete(id);callback()},delay);timers.add(id);return id;}
function notifyLock(){window.heroCommanderEffectUntil=playing?activeUntil+EFFECT_MS*pending.length:0;if(playing)window.heroCommanderImpactUntil=window.heroCommanderEffectUntil+EFFECT_MS;window.dispatchEvent(new CustomEvent('heroarena:commander-effect-lock'));}
function showHeroImpacts(){
 if(document.hidden||document.body.classList.contains('arena-catching-up')){waitingImpacts.length=0;return;}
 const targets=new Map();
 for(const entry of waitingImpacts.splice(0))for(const impact of entry.impacts||[]){
  if(!['damage','shield','heal','weaken'].includes(impact.kind)||!Number.isFinite(impact.value)||impact.value<0)continue;
  if(impact.value===0&&!(impact.kind==='damage'&&impact.absorbed>0))continue;
  // Side is relative to this viewer; target IDs can occur on both teams.
  const side=['heal','shield'].includes(impact.kind)?entry.side:1-entry.side;
  const key=side+':'+impact.target;
  if(!targets.has(key))targets.set(key,{side,target:impact.target,impacts:new Map()});
  const values=targets.get(key).impacts,previous=values.get(impact.kind);
  values.set(impact.kind,{...impact,value:impact.kind==='weaken'?Math.max(previous?.value||0,impact.value):(previous?.value||0)+impact.value,absorbed:(previous?.absorbed||0)+(impact.absorbed||0)});
 }
 for(const {side,target,impacts} of targets.values()){
  const team=document.getElementById(side===0?'team-a':'team-b');
  const card=[...(team?.querySelectorAll('.hero')||[])].find(el=>el.dataset.heroId===target);
  const portrait=card?.querySelector('.arena-portrait');if(!portrait)continue;
  const rect=portrait.getBoundingClientRect();if(!rect.width||!rect.height)continue;
  const effect=document.createElement('div');effect.className='commander-hero-impact '+[...impacts.keys()][0];
  effect.style.left=rect.left+'px';effect.style.top=rect.top+'px';effect.style.width=rect.width+'px';effect.style.height=rect.height+'px';
  effect.setAttribute('role','status');effect.setAttribute('aria-live','polite');
  const descriptions=[];
  for(const impact of impacts.values()){
   const labels={damage:'CAN HASARI',heal:'ŞİFA',shield:'KALKAN',weaken:'SALDIRI'};
   const signs={damage:'−',heal:'+',shield:'+',weaken:'−%'};
   const label=document.createElement('span');label.className='commander-impact-label';
   const title=document.createElement('span');title.textContent=labels[impact.kind];
   const value=document.createElement('strong');value.textContent=signs[impact.kind]+(impact.kind==='weaken'?impact.value:Math.round(impact.value)).toLocaleString('tr-TR',{maximumFractionDigits:1});
   label.append(title,value);
   if(impact.absorbed>0){const blocked=document.createElement('small');blocked.textContent='🛡 '+Math.round(impact.absorbed)+' engellendi';label.append(blocked);}
   descriptions.push(title.textContent+' '+value.textContent+(impact.absorbed>0?', kalkan '+impact.absorbed+' engelledi':''));
   effect.append(label);
  }
  effect.setAttribute('aria-label',(card.querySelector('.arena-hero-label')?.textContent||target)+': '+descriptions.join(', '));
  document.body.append(effect);window.heroCommanderImpactUntil=Date.now()+EFFECT_MS;impactElements.add(effect);later(()=>{effect.remove();impactElements.delete(effect)},EFFECT_MS);
 }
}
function playNext(){
 if(playing||!pending.length)return;
 const entry=pending.shift();
 const match=/^commander-(attack|defense|magic|support)-(normal|ultimate)$/.exec(entry.action);
 if(!match)return playNext();
 const [,kind,ability]=match;
 playing=true;activeUntil=Date.now()+EFFECT_MS;notifyLock();
 const overlay=document.createElement('div');activeOverlay=overlay;
 overlay.id='commander-ability-flash';overlay.className='commander-cinematic '+kind+(ability==='ultimate'?' ultimate':'');
 overlay.style.setProperty('--commander-effect-duration',EFFECT_MS+'ms');
 overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
 const content=document.createElement('div');content.className='commander-cinematic-content';
 const portrait=document.createElement('img');portrait.src=commanderPortraits[kind];portrait.alt=names[kind]+' komutanı';portrait.className='commander-cinematic-portrait';
 portrait.onerror=()=>{portrait.hidden=true;};
 const label=document.createElement('strong');label.textContent=(entry.side===0?'SENİN':'RAKİBİN')+' '+names[kind]+' KOMUTANI';
 const skill=document.createElement('span');skill.textContent=symbols[kind]+' '+(ability==='ultimate'?'NİHAİ YETENEK':'NORMAL YETENEK');
 content.append(portrait,label,skill);overlay.append(content);document.body.append(overlay);
 later(()=>{
  overlay.remove();activeOverlay=null;playing=false;waitingImpacts.push(entry);
  if(pending.length)playNext();else{notifyLock();showHeroImpacts();}
 },EFFECT_MS);
}
function showCommanderAbility(event){
 if(document.hidden||document.body.classList.contains('arena-catching-up'))return;
 const entries=event.detail?.events||[event.detail?.event];
 for(const entry of entries){
  if(!/^commander-(attack|defense|magic|support)-(normal|ultimate)$/.test(entry?.action||''))continue;
  const key=[entry.sequence??entry.version??entry.round,entry.side,entry.action].join(':');
  if(seen.has(key))continue;
  seen.add(key);pending.push(entry);
 }
 if(playing)notifyLock();else playNext();
}
function resetEffects(){
 for(const timer of timers)clearTimeout(timer);timers.clear();
 activeOverlay?.remove();activeOverlay=null;
 for(const element of impactElements)element.remove();impactElements.clear();
 playing=false;activeUntil=0;window.heroCommanderImpactUntil=0;pending.length=0;waitingImpacts.length=0;notifyLock();
}
window.addEventListener('heroarena:move',showCommanderAbility);
window.addEventListener('heroarena:commander-round',showCommanderAbility);
window.addEventListener('heroarena:ready',()=>{resetEffects();seen.clear();});
window.addEventListener('heroarena:connection-lost',resetEffects);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetEffects();});
