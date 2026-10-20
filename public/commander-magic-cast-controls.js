// Experimental, opt-in UI controller. No HTTP cast until an authoritative
// live combat session supplies a sendCast callback. Never use legacy turn API.
import {createArenaMagicTargeting} from './commander-arena-magic-targeting.js';
import {requiredMagicTargets,validateMagicTargetSelection} from './commander-magic-target-picker.js';
export function createMagicCastControls({enemyRoot,confirmButton,cancelButton,status,onCast}){
 if(!enemyRoot||!confirmButton||!cancelButton||!status||typeof onCast!=='function')throw Error('Invalid magic controls');
 let ability=null,heroes=[],pending=false;
 const picker=createArenaMagicTargeting({root:enemyRoot,enemySide:1,onConfirm:()=>{}});
 function reset(){ability=null;heroes=[];pending=false;picker.cancel();confirmButton.disabled=true;confirmButton.hidden=true;cancelButton.hidden=true}
 function sync(){if(!ability)return;picker.repaint();const selected=picker.selection();confirmButton.disabled=pending||!validateMagicTargetSelection(ability,heroes,selected);status.textContent='Büyü hedefi seç: '+selected.length+' / '+requiredMagicTargets(ability,heroes)}
 const click=()=>{sync()};
 const confirm=async()=>{
  if(!ability||pending)return;
  const targetIds=picker.selection();
  if(!validateMagicTargetSelection(ability,heroes,targetIds))return;
  pending=true;confirmButton.disabled=true;
  const chosen=ability;
  try{
   // Server must revalidate living targets, cooldown and energy atomically.
   await onCast({ability:chosen,targetIds});
   reset();status.textContent='Büyü komutu sunucu tarafından kabul edildi';
  }catch(error){pending=false;status.textContent='⚠ '+(error?.message||'Büyü komutu reddedildi');sync()}
 };
 const cancel=()=>{reset();status.textContent='Büyü seçimi iptal edildi; enerji harcanmadı'};
 enemyRoot.addEventListener('click',click);
 enemyRoot.addEventListener('keydown',click);
 confirmButton.addEventListener('click',confirm);
 cancelButton.addEventListener('click',cancel);
 reset();
 return {
  begin(nextAbility,nextHeroes){
   if(pending)throw Error('Cast pending');
   if(!['normal','ultimate'].includes(nextAbility)||!Array.isArray(nextHeroes))throw Error('Invalid magic targets');
   ability=nextAbility;heroes=nextHeroes.map(h=>({...h}));
   if(requiredMagicTargets(ability,heroes)===0){reset();return false}
   picker.begin(ability,heroes);confirmButton.hidden=false;cancelButton.hidden=false;sync();return true;
  },
  refresh(nextHeroes){if(!ability)return;heroes=nextHeroes.map(h=>({...h}));picker.refresh(heroes);if(!requiredMagicTargets(ability,heroes)){cancel();return}sync()},
  cancel,
  destroy(){reset();enemyRoot.removeEventListener('click',click);enemyRoot.removeEventListener('keydown',click);confirmButton.removeEventListener('click',confirm);cancelButton.removeEventListener('click',cancel);picker.destroy()}
 };
}
