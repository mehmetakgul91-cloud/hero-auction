// Cosmetic presentation; the shared ability lock is enforced by the server.
const english=()=>document.documentElement?.lang==='en';
const text=(tr,en)=>english()?en:tr;
const names={attack:['Saldırı','Attack'],defense:['Savunma','Defense'],magic:['Büyü','Magic'],support:['Destek','Support']};
const skills={attack:['Vuruş','Strike'],defense:['Kalkan','Shield'],magic:['Saldırı azaltma','Attack reduction'],support:['Şifa','Healing']};
const ultimateSkills={attack:['Av Emri','Hunt Order'],defense:['Son Kale','Last Bastion'],magic:['Aşırı Yük','Arcane Surge'],support:['Diriliş','Revival']};
const symbols={attack:'⚔',defense:'◇',magic:'✦',support:'✧'};
const EFFECT_MS=1200;
const seen=new Set(),pending=[],waitingImpacts=[],impactElements=new Set(),castElements=new Set(),timers=new Set();
let playing=false,activeUntil=0,activeOverlay=null;
function later(callback,delay){const id=setTimeout(()=>{timers.delete(id);callback()},delay);timers.add(id);return id;}
function notifyLock(){window.heroCommanderEffectUntil=playing?activeUntil+EFFECT_MS*pending.length:0;if(playing)window.heroCommanderImpactUntil=window.heroCommanderEffectUntil+EFFECT_MS;window.dispatchEvent(new CustomEvent('heroarena:commander-effect-lock'));}
function targetSide(entry,impact){return ['heal','shield','buff','guard','revive'].includes(impact.kind)?entry.side:1-entry.side;}
function validImpact(impact){return ['damage','shield','heal','weaken','buff','guard','focus','revive'].includes(impact.kind)&&Number.isFinite(impact.value)&&impact.value>=0&&(impact.value>0||(impact.kind==='damage'&&impact.absorbed>0));}
function targetPortrait(entry,impact){
 const team=document.getElementById(targetSide(entry,impact)===0?'team-a':'team-b');
 return [...(team?.querySelectorAll('.hero')||[])].find(el=>el.dataset.heroId===impact.target)?.querySelector('.arena-portrait');
}
function clearCastEffects(){for(const element of castElements)element.remove();castElements.clear();}
function showTargetEffects(entry,kind,ability){
 const marked=new Set();
 for(const impact of entry.impacts||[]){
  if(!validImpact(impact))continue;
  const portrait=targetPortrait(entry,impact);if(!portrait||marked.has(portrait))continue;
  marked.add(portrait);
  const effect=document.createElement('span');
  effect.className='commander-target-fx '+kind+(ability==='ultimate'?' ultimate':'');
  effect.setAttribute('data-effect',impact.kind);effect.setAttribute('aria-hidden','true');
  // Shapes are cosmetic only: no inferred targets, health or combat state changes.
  for(let i=0;i<3;i++){const particle=document.createElement('i');particle.style.setProperty('--particle',i);effect.append(particle);}
  portrait.append(effect);castElements.add(effect);
 }
}
function showHeroImpacts(){
 if(document.hidden||document.body.classList.contains('arena-catching-up')){waitingImpacts.length=0;return;}
 const targets=new Map();
 for(const entry of waitingImpacts.splice(0))for(const impact of entry.impacts||[]){
  if(!validImpact(impact)||(impact.kind==='buff'&&entry.action!=='commander-magic-ultimate'))continue;
  if(impact.value===0&&!(impact.kind==='damage'&&impact.absorbed>0))continue;
  // Side is relative to this viewer; target IDs can occur on both teams.
  const side=targetSide(entry,impact);
  const key=side+':'+impact.target;
  if(!targets.has(key))targets.set(key,{side,target:impact.target,impacts:new Map()});
  const values=targets.get(key).impacts,previous=values.get(impact.kind);
  values.set(impact.kind,{...impact,value:['weaken','buff','guard','focus','revive'].includes(impact.kind)?Math.max(previous?.value||0,impact.value):(previous?.value||0)+impact.value,absorbed:(previous?.absorbed||0)+(impact.absorbed||0)});
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
   const labels={damage:text('CAN HASARI','HP DAMAGE'),heal:text('ŞİFA','HEALING'),shield:text('KALKAN','SHIELD'),weaken:text('SONRAKİ SALDIRI','NEXT ATTACK'),buff:text('AŞIRI YÜK','ARCANE SURGE'),guard:text('ÖLÜMCÜL DARBE KORUMASI','LETHAL-HIT GUARD'),focus:text('AV EMRİ','HUNT ORDER'),revive:text('DİRİLİŞ','REVIVAL')};
   const signs={damage:'−',heal:'+',shield:'+',weaken:'−%'};
   const label=document.createElement('span');label.className='commander-impact-label';
   const title=document.createElement('span');title.textContent=labels[impact.kind];
   const value=document.createElement('strong');value.textContent=impact.kind==='buff'?'+'+Math.round(impact.value)+text(' VURUŞ GÜCÜ · 3 TUR',' HIT POWER · 3 ROUNDS'):impact.kind==='guard'?text('1 CANDA KORUR','SURVIVE AT 1 HP'):impact.kind==='focus'?text('HEDEF','TARGET'):impact.kind==='revive'?'+'+Math.round(impact.value)+' HP':signs[impact.kind]+(impact.kind==='weaken'?impact.value:Math.round(impact.value)).toLocaleString(english()?'en-US':'tr-TR',{maximumFractionDigits:1});
   label.append(title,value);
   if(impact.absorbed>0){const blocked=document.createElement('small');blocked.textContent='🛡 '+Math.round(impact.absorbed)+text(' engellendi',' blocked');label.append(blocked);}
   descriptions.push(title.textContent+' '+value.textContent+(impact.absorbed>0?text(', kalkan ',', shield blocked ')+impact.absorbed+text(' engelledi',''):''));
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
 overlay.id='commander-ability-flash';overlay.className='commander-cast-cue '+kind+(ability==='ultimate'?' ultimate':'');
 overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
 const label=document.createElement('strong');label.textContent=(entry.side===0?text('Senin','Your'):text('Rakibin','Opponent’s'))+' '+text(...names[kind])+text(entry.side===0?' komutanın':' komutanı',' commander');
 const skill=document.createElement('span');
 // Current support restores HP; if a future committed support buff arrives, never call it healing.
 const skillName=ability==='ultimate'?text(...ultimateSkills[kind]):kind==='support'&&entry.impacts?.some(impact=>impact.kind==='buff')?text('Güçlendirme','Empower'):text(...skills[kind]);
 skill.textContent=symbols[kind]+' '+(ability==='ultimate'?text('Nihai · ','Ultimate · '):'')+skillName;
 overlay.append(label,skill);
 const team=document.getElementById(entry.side===0?'team-a':'team-b');
 const commander=document.getElementById(entry.side===0?'arena-commander-left':'arena-commander-right');
 // Fitted live arenas hide team headings; use the visible caster card in its dock.
 const host=commander?.getBoundingClientRect?.().width>0?commander:team?.parentElement?.querySelector('h2');
 host?.append(overlay);
 showTargetEffects(entry,kind,ability);
 later(()=>{
  overlay.remove();clearCastEffects();activeOverlay=null;playing=false;waitingImpacts.push(entry);
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
 activeOverlay?.remove();activeOverlay=null;clearCastEffects();
 for(const element of impactElements)element.remove();impactElements.clear();
 playing=false;activeUntil=0;window.heroCommanderImpactUntil=0;pending.length=0;waitingImpacts.length=0;notifyLock();
}
window.addEventListener('heroarena:move',showCommanderAbility);
window.addEventListener('heroarena:commander-round',showCommanderAbility);
window.addEventListener('heroarena:ready',()=>{resetEffects();seen.clear();});
window.addEventListener('heroarena:connection-lost',resetEffects);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetEffects();});
// Do not cancel on battle-finished: a lethal committed cast can arrive just after
// that signal, and victory already waits for these original cast/impact windows.
window.addEventListener('pagehide',resetEffects);
window.addEventListener('popstate',resetEffects);
window.addEventListener('heroarena:route-change',()=>{resetEffects();seen.clear();});
