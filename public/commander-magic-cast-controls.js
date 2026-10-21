import {createArenaMagicTargeting} from './commander-arena-magic-targeting.js?v=magic-selection-20261021';
import {requiredMagicTargets,validateMagicTargetSelection} from './commander-magic-target-picker.js';

export function createMagicCastControls({enemyRoot,confirmButton,cancelButton,status,onCast,canCast=()=>true,onSelectionChange=()=>{}}){
 if(!enemyRoot||!confirmButton||!cancelButton||!status||typeof onCast!=='function')throw Error('Invalid magic controls');
 let ability=null,heroes=[],pending=false,generation=0;
 const picker=createArenaMagicTargeting({root:enemyRoot,enemySide:1});
 function reset(){
  generation++;ability=null;heroes=[];pending=false;picker.cancel();
  confirmButton.disabled=true;confirmButton.hidden=true;cancelButton.hidden=true;cancelButton.disabled=false;
  onSelectionChange(false);
 }
 function sync(){
  if(!ability)return;
  picker.setEnabled(!pending);
  const selected=picker.selection();
  confirmButton.disabled=pending||!canCast(ability)||!validateMagicTargetSelection(ability,heroes,selected);
  confirmButton.textContent='Büyüyü uygula · '+(ability==='ultimate'?100:40);
  cancelButton.disabled=pending;
  status.textContent=pending?'Büyü komutu gönderiliyor…':(ability==='ultimate'?'Nihai büyü':'Normal büyü')+' · Rakip kartına dokun: '+selected.length+' / '+requiredMagicTargets(ability,heroes);
 }
 const click=()=>sync();
 const confirm=async()=>{
  if(!ability||pending||!canCast(ability))return;
  const targetIds=picker.selection();
  if(!validateMagicTargetSelection(ability,heroes,targetIds))return;
  const chosen=ability,current=generation;
  pending=true;sync();
  try{
   // Energy and effects change only after the server revalidates the selection.
   await onCast({ability:chosen,targetIds});
   if(current===generation)reset();
  }catch(error){
   if(current!==generation)return;
   pending=false;sync();status.textContent='⚠ '+(error?.message||'Büyü komutu reddedildi');
  }
 };
 const cancel=()=>{if(pending)return;reset();status.textContent='Büyü seçimi iptal edildi; enerji harcanmadı'};
 enemyRoot.addEventListener('click',click);enemyRoot.addEventListener('keydown',click);
 confirmButton.addEventListener('click',confirm);cancelButton.addEventListener('click',cancel);
 reset();
 return {
  isSelecting:()=>ability!==null,
  begin(nextAbility,nextHeroes){
   if(pending)throw Error('Cast pending');
   if(!['normal','ultimate'].includes(nextAbility)||!Array.isArray(nextHeroes))throw Error('Invalid magic targets');
   generation++;ability=nextAbility;heroes=nextHeroes.map(h=>({...h}));
   if(requiredMagicTargets(ability,heroes)===0){reset();return false}
   picker.begin(ability,heroes);confirmButton.hidden=false;cancelButton.hidden=false;onSelectionChange(true);sync();return true;
  },
  refresh(nextHeroes){
   if(!ability)return;
   heroes=nextHeroes.map(h=>({...h}));picker.refresh(heroes);
   if(!requiredMagicTargets(ability,heroes)){reset();return}
   sync();
  },
  cancel,
  destroy(){reset();enemyRoot.removeEventListener('click',click);enemyRoot.removeEventListener('keydown',click);confirmButton.removeEventListener('click',confirm);cancelButton.removeEventListener('click',cancel);picker.destroy()}
 };
}
