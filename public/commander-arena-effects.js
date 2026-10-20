// Cosmetic presentation; the shared ability lock is enforced by the server.
const names={attack:'SALDIRI',defense:'SAVUNMA',magic:'BÜYÜ',support:'DESTEK'};
const symbols={attack:'⚔',defense:'🛡',magic:'✦',support:'✚'};
const commanderPortraits={attack:'/images/Ate%C5%9Fler%20%C4%B0%C3%A7inde%20Sava%C5%9F%C3%A7%C4%B1%20Komutan.png',defense:'/images/Alt%C4%B1n%20Aslan%C4%B1n%20Kale%20Muhaf%C4%B1z%C4%B1.png',magic:'/images/Kozmik%20R%C3%BCnlerin%20B%C3%BCy%C3%BCc%C3%BC%20Komutan%C4%B1.png',support:'/images/Z%C3%BCmr%C3%BCt%20I%C5%9F%C4%B1%C4%9F%C4%B1n%20%C5%9Eifac%C4%B1%20Krali%C3%A7esi.png'};
const seen=new Set(),pending=[];
let playing=false;
function notifyLock(){window.heroCommanderEffectUntil=playing?Date.now()+2000*(1+pending.length):0;window.dispatchEvent(new CustomEvent('heroarena:commander-effect-lock'));}
function playNext(){
 if(playing||!pending.length)return;
 const entry=pending.shift();
 const match=/^commander-(attack|defense|magic|support)-(normal|ultimate)$/.exec(entry.action);
 if(!match)return playNext();
 const [,kind,ability]=match;
 playing=true;notifyLock();
 const overlay=document.createElement('div');
 overlay.id='commander-ability-flash';overlay.className='commander-cinematic '+kind+(ability==='ultimate'?' ultimate':'');
 overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
 const content=document.createElement('div');content.className='commander-cinematic-content';
 const portrait=document.createElement('img');portrait.src=commanderPortraits[kind];portrait.alt=names[kind]+' komutanı';portrait.className='commander-cinematic-portrait';
 portrait.onerror=()=>{portrait.hidden=true;};
 const label=document.createElement('strong');label.textContent=(entry.side===0?'SENİN':'RAKİBİN')+' '+names[kind]+' KOMUTANI';
 const skill=document.createElement('span');skill.textContent=symbols[kind]+' '+(ability==='ultimate'?'NİHAİ YETENEK':'NORMAL YETENEK');
 content.append(portrait,label,skill);overlay.append(content);document.body.append(overlay);
 setTimeout(()=>{overlay.remove();playing=false;window.heroCommanderEffectUntil=0;window.dispatchEvent(new CustomEvent('heroarena:commander-effect-lock'));playNext();},2000);
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
 playNext();
}
window.addEventListener('heroarena:move',showCommanderAbility);
window.addEventListener('heroarena:commander-round',showCommanderAbility);
window.addEventListener('heroarena:ready',()=>{seen.clear();pending.length=0;});
