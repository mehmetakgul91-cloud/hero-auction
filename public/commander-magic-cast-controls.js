import {createArenaMagicTargeting} from './commander-arena-magic-targeting.js?v=instant-commander-targets-20261110';
import {requiredMagicTargets,validateMagicTargetSelection,commanderTargetMode} from './commander-magic-target-picker.js';
import {commanderUltimateName} from './commander-ultimate-presentation.js';

export function createMagicCastControls({enemyRoot,allyRoot=enemyRoot,commanderId='magic',confirmButton,cancelButton,status,onCast,canCast=()=>true,onSelectionChange=()=>{}}){
 if(!enemyRoot||!allyRoot||!cancelButton||!status||typeof onCast!=='function')throw Error('Invalid magic controls');
 let ability=null,heroes=[],pending=false,generation=0,context={commanderId},picker=null;
 const roots=[...new Set([enemyRoot,allyRoot])],pickers=new Map(roots.map(root=>[root,createArenaMagicTargeting({root,enemySide:1,onSelect:castSelected})]));
 function reset(){
  generation++;ability=null;heroes=[];pending=false;for(const p of pickers.values())p.cancel();picker=null;
  // Hide legacy markup too, if a cached page still supplies the old button.
  if(confirmButton){confirmButton.disabled=true;confirmButton.hidden=true;}
  cancelButton.hidden=true;cancelButton.disabled=false;onSelectionChange(false);
 }
 function sync(){
  if(!ability)return;
  picker.setEnabled(!pending&&canCast(ability));
  const mode=commanderTargetMode(context.commanderId,ability);
  cancelButton.disabled=pending;
  const title=ability==='ultimate'?commanderUltimateName(context.commanderId):'Normal büyü';
  const instruction=mode==='enemy-alive'?'Rakip kartına dokun':mode==='ally-dead'?'Düşen müttefik kartına dokun':'Yaşayan müttefik kartına dokun';
  status.textContent=pending?'Yetenek komutu gönderiliyor…':title+' · '+instruction+' · Seçince hemen uygulanır';
 }
 async function castSelected(){
  if(!ability||pending||!canCast(ability))return;
  const targetIds=picker.selection();if(!validateMagicTargetSelection(ability,heroes,targetIds,context))return;
  const chosen=ability,current=generation;pending=true;sync();
  try{await onCast({ability:chosen,targetIds});if(current===generation)reset();}
  catch(error){if(current!==generation)return;pending=false;sync();status.textContent='⚠ '+(error?.message||'Yetenek komutu reddedildi');}
 }
 const cancel=()=>{if(pending)return;reset();status.textContent='Hedef seçimi iptal edildi; enerji harcanmadı'};
 cancelButton.addEventListener('click',cancel);reset();
 return {
  isSelecting:()=>ability!==null,selectedAbility:()=>ability,
  begin(nextAbility,nextHeroes,options={}){
   if(pending)throw Error('Cast pending');
   if(!['normal','ultimate'].includes(nextAbility)||!Array.isArray(nextHeroes))throw Error('Invalid magic targets');
   generation++;for(const p of pickers.values())p.cancel();ability=nextAbility;heroes=nextHeroes.map(h=>({...h}));context={commanderId,...options};
   if(requiredMagicTargets(ability,heroes,context)===0){reset();status.textContent='Uygun hedef yok; enerji harcanmadı';return false}
   picker=pickers.get(commanderTargetMode(context.commanderId,ability)==='enemy-alive'?enemyRoot:allyRoot);
   picker.begin(ability,heroes,context);cancelButton.hidden=false;onSelectionChange(true);sync();return true;
  },
  refresh(nextHeroes,options={}){
   if(!ability)return;heroes=nextHeroes.map(h=>({...h}));context={...context,...options};picker.refresh(heroes,context);
   if(!pending&&!requiredMagicTargets(ability,heroes,context)){reset();status.textContent='Uygun hedef yok; enerji harcanmadı';return}sync();
  },cancel,
  destroy(){reset();cancelButton.removeEventListener('click',cancel);for(const p of pickers.values())p.destroy()}
 };
}
