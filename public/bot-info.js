import {botTerms,botTermsCopy} from './bot-entry.js';

// In-card disclosure only: opening/closing this never starts a match or claims a reward.
export function createBotInfo({document=globalThis.document}={}){
 const details=document?.getElementById('bot-info'),trigger=document?.getElementById('bot-info-trigger'),content=document?.getElementById('bot-info-content');
 if(!details||!trigger||!content)return {update(){},close(){}};
 const close=({restoreFocus=false}={})=>{const wasOpen=details.open;details.open=false;if(wasOpen&&restoreFocus)trigger.focus();};
 document.addEventListener('keydown',event=>{if(details.open&&event.key==='Escape'){event.preventDefault();close({restoreFocus:true});}});
 document.addEventListener('click',event=>{if(details.open&&!details.contains(event.target))close();});
 document.addEventListener('focusin',event=>{if(details.open&&!details.contains(event.target))close();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});
 return {close,update(capability,difficulty){
  const english=document.documentElement.lang==='en',terms=botTerms(capability,difficulty);
  trigger.setAttribute('aria-label',english?'Computer match information':'Bilgisayar maçı bilgileri');
  content.setAttribute('aria-label',english?'Computer match rules':'Bilgisayar maçı kuralları');
  const label=trigger.querySelector('.bot-info-label');if(label)label.textContent=english?'Info':'Bilgi';
  content.textContent=terms?botTermsCopy(terms,english):(english?'Match information is unavailable. Please try again later.':'Maç bilgileri alınamadı. Lütfen daha sonra tekrar dene.');
  if(terms&&capability.available!==true)content.textContent+='\n'+(english?'Computer matches are temporarily unavailable.':'Bilgisayar maçları şu anda kullanılamıyor.');
 }};
}
