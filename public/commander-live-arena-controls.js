import {commanderUltimateName,commanderUltimateDescription} from './commander-ultimate-presentation.js';
import {getCommanderAbilityCost} from './commander-ability-rules.js';
// Experimental, opt-in arena commander buttons. No live-room integration.
export function createLiveArenaCommanderControls({normalButton,ultimateButton,energyLabel,statusLabel,readState,onCast,onMagicTarget}){
 if(!normalButton||!ultimateButton||!energyLabel||!statusLabel||typeof readState!=='function'||typeof onCast!=='function')throw Error('Invalid live commander controls');
 let pending=false,disposed=false;
 function refresh(){
  if(disposed)return;
  const state=readState();
  const energy=state?.energy??0,ultimateEnergy=state?.ultimateEnergy??0,cooldownMs=Math.max(0,state?.normalCooldownMs??state?.cooldownMs??0),effectLockMs=Math.max(0,state?.effectLockMs??0);
  normalButton.disabled=pending||!!state?.finished||energy<getCommanderAbilityCost(state?.commanderId||'defense','normal')||cooldownMs>0||effectLockMs>0||state?.canUseNormal===false;
  const id=state?.commanderId||'defense',revivalUsed=id==='support'&&(Array.isArray(state?.revivalUsed)?!!state.revivalUsed[state.side??0]:state?.revivalUsed===true);
  const ultimateUsed=(Array.isArray(state?.ultimateUsed)?!!state.ultimateUsed[state.side??0]:state?.ultimateUsed===true)||revivalUsed;
  energyLabel.textContent='Normal: '+energy+'/100 · Ulti: '+(ultimateUsed?'Kullanıldı':ultimateEnergy+'/100');
  const targetAvailable=!['attack','magic','support'].includes(id)||state?.ultimateTargetAvailable===true;
  ultimateButton.disabled=pending||!!state?.finished||ultimateEnergy<getCommanderAbilityCost(id,'ultimate')||effectLockMs>0||state?.canUseUltimate===false||ultimateUsed||!targetAvailable;
  const ready=!ultimateButton.disabled;ultimateButton.classList?.toggle('commander-ultimate-ready',ready);
  normalButton.textContent='Normal · '+getCommanderAbilityCost(id,'normal');ultimateButton.textContent=commanderUltimateName(id)+' · '+(ultimateUsed?'Kullanıldı':getCommanderAbilityCost(id,'ultimate')+(ready?' · Hazır':''));ultimateButton.title=commanderUltimateDescription(id);
  statusLabel.textContent=pending?'Komut gönderiliyor':effectLockMs>0?'Komutan efekti sürüyor':!ultimateUsed&&!targetAvailable&&ultimateEnergy>=getCommanderAbilityCost(id,'ultimate')?'Ulti dolu · uygun hedef yok':cooldownMs>0?'Normal bekleme: '+Math.ceil(cooldownMs/1000)+' sn':'Komutan hazır';
 }
 async function use(ability){
  if(disposed||pending)return;
  refresh();
  const button=ability==='normal'?normalButton:ultimateButton;
  if(button.disabled)return;
  pending=true;refresh();
  try{
   if(typeof onMagicTarget==='function'){
    const targets=await onMagicTarget(ability);
    if(targets===null||targets===undefined){statusLabel.textContent='Hedef seçimi iptal edildi';return;}
    if(disposed)return;
    pending=false;refresh();if(button.disabled)return;pending=true;refresh();
    if(targets===false)await onCast({ability});
    else await onCast({ability,targetIds:targets});
   }else await onCast({ability});
   statusLabel.textContent='Komut sunucu tarafından kabul edildi';
  }catch(error){statusLabel.textContent='⚠ '+(error?.message||'Komut reddedildi');}
  finally{pending=false;refresh();}
 }
 const normal=()=>use('normal'),ultimate=()=>use('ultimate');
 normalButton.addEventListener('click',normal);ultimateButton.addEventListener('click',ultimate);
 refresh();
 return {refresh,destroy(){disposed=true;ultimateButton.classList?.toggle('commander-ultimate-ready',false);normalButton.removeEventListener('click',normal);ultimateButton.removeEventListener('click',ultimate)}};
}
