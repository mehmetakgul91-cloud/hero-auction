// Arena card selection. Only the live controller can submit a confirmed cast.
import {requiredMagicTargets,validateMagicTargetSelection,commanderTargetMode,isCommanderTargetEligible} from './commander-magic-target-picker.js';
export function createArenaMagicTargeting({root,enemySide=1,onConfirm=()=>{}}){
 if(!root||![0,1].includes(enemySide))throw Error('Invalid arena targeting');
 let heroes=[],selected=[],ability='normal',active=false,enabled=true,context={commanderId:'magic'};
 const cards=()=>[...root.querySelectorAll('.arena-hero[data-hero-id]')];
 const eligible=hero=>isCommanderTargetEligible(hero,commanderTargetMode(context.commanderId,ability),context);
 function repaint(){
  for(const card of cards()){
   const hero=heroes.find(h=>h.id===card.dataset.heroId),valid=active&&enabled&&eligible(hero);
   card.classList.toggle('magic-target-available',!!valid);card.classList.toggle('magic-target-selected',active&&selected.includes(card.dataset.heroId));
   card.setAttribute('aria-pressed',String(active&&selected.includes(card.dataset.heroId)));
   const english=root.ownerDocument?.documentElement?.lang==='en'||(typeof document!=='undefined'&&document.documentElement?.lang==='en');
   const mode=commanderTargetMode(context.commanderId,ability);
   if(active)card.setAttribute('data-commander-target-label',mode==='ally-dead'?(english?'↟ REVIVAL':'↟ DİRİLİŞ'):mode==='ally-alive'?(english?'✦ EMPOWER':'✦ GÜÇLENDİRME'):(english?'✦ TARGET':'✦ HEDEF'));else card.removeAttribute('data-commander-target-label');
   if(valid){card.setAttribute('role','button');card.setAttribute('tabindex','0');}
   else {card.removeAttribute('role');card.removeAttribute('tabindex');}
  }
 }
 function toggle(id){
  if(!active||!enabled||!heroes.some(h=>h.id===id&&eligible(h)))return;
  selected=selected.includes(id)?[]:[id];repaint();
 }
 const click=e=>{const card=e.target.closest('.arena-hero[data-hero-id]');if(card&&root.contains(card))toggle(card.dataset.heroId)};
 const keydown=e=>{if(e.key!=='Enter'&&e.key!==' ')return;const card=e.target.closest('.arena-hero[data-hero-id]');if(card&&root.contains(card)){e.preventDefault();toggle(card.dataset.heroId)}};
 root.addEventListener('click',click);root.addEventListener('keydown',keydown);
 return {
  begin(nextAbility,nextHeroes,options={}){ability=nextAbility;heroes=nextHeroes.map(h=>({...h}));context={commanderId:'magic',...options};selected=[];active=true;enabled=true;repaint();return requiredMagicTargets(ability,heroes,context)},
  setEnabled(value){enabled=!!value;repaint()},
  refresh(nextHeroes,options={}){heroes=nextHeroes.map(h=>({...h}));context={...context,...options};selected=selected.filter(id=>heroes.some(h=>h.id===id&&eligible(h)));repaint()},
  repaint,selection:()=>[...selected],
  confirm(){if(!active||!enabled||!validateMagicTargetSelection(ability,heroes,selected,context))return false;onConfirm({ability,targetIds:[...selected]});active=false;repaint();return true},
  cancel(){active=false;selected=[];repaint()},
  destroy(){root.removeEventListener('click',click);root.removeEventListener('keydown',keydown);active=false;selected=[];repaint()}
 };
}
