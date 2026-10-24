// Arena card selection. Only the live controller can submit a confirmed cast.
import {requiredMagicTargets,validateMagicTargetSelection} from './commander-magic-target-picker.js';
export function createArenaMagicTargeting({root,enemySide,onConfirm=()=>{}}){
 if(!root||![0,1].includes(enemySide))throw Error('Invalid arena targeting');
 let heroes=[],selected=[],ability='normal',active=false,enabled=true;
 const cards=()=>[...root.querySelectorAll('.arena-hero[data-hero-id]')];
 function repaint(){
  for(const card of cards()){
   const hero=heroes.find(h=>h.id===card.dataset.heroId);
   const valid=active&&enabled&&hero?.hp>0;
   card.classList.toggle('magic-target-available',!!valid);
   card.classList.toggle('magic-target-selected',active&&selected.includes(card.dataset.heroId));
   card.setAttribute('aria-pressed',String(active&&selected.includes(card.dataset.heroId)));
   if(valid){card.setAttribute('role','button');card.setAttribute('tabindex','0');}
   else {card.removeAttribute('role');card.removeAttribute('tabindex');}
  }
 }
 function toggle(id){
  if(!active||!enabled||!heroes.some(h=>h.id===id&&h.hp>0))return;
  if(selected.includes(id))selected=selected.filter(x=>x!==id);
  else if(requiredMagicTargets(ability,heroes)===1)selected=[id];
  else if(selected.length<requiredMagicTargets(ability,heroes))selected=[...selected,id];
  repaint();
 }
 const click=e=>{const card=e.target.closest('.arena-hero[data-hero-id]');if(card&&root.contains(card))toggle(card.dataset.heroId)};
 const keydown=e=>{if(e.key!=='Enter'&&e.key!==' ')return;const card=e.target.closest('.arena-hero[data-hero-id]');if(card&&root.contains(card)){e.preventDefault();toggle(card.dataset.heroId)}};
 root.addEventListener('click',click);root.addEventListener('keydown',keydown);
 return {
  begin(nextAbility,nextHeroes){ability=nextAbility;heroes=nextHeroes.map(h=>({...h}));selected=[];active=true;enabled=true;repaint();return requiredMagicTargets(ability,heroes)},
  setEnabled(value){enabled=!!value;repaint()},
  refresh(nextHeroes){heroes=nextHeroes.map(h=>({...h}));selected=selected.filter(id=>heroes.some(h=>h.id===id&&h.hp>0));repaint()},
  repaint,
  selection:()=>[...selected],
  confirm(){if(!active||!validateMagicTargetSelection(ability,heroes,selected))return false;onConfirm({ability,targetIds:[...selected]});active=false;repaint();return true},
  cancel(){active=false;selected=[];repaint()},
  destroy(){root.removeEventListener('click',click);root.removeEventListener('keydown',keydown);active=false;selected=[];repaint()}
 };
}
