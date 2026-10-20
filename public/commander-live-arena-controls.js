// Experimental, opt-in arena commander buttons. No live-room integration.
export function createLiveArenaCommanderControls({normalButton,ultimateButton,energyLabel,statusLabel,readState,onCast,onMagicTarget}){
 if(!normalButton||!ultimateButton||!energyLabel||!statusLabel||typeof readState!=='function'||typeof onCast!=='function')throw Error('Invalid live commander controls');
 let pending=false,disposed=false;
 function refresh(){
  if(disposed)return;
  const state=readState();
  const energy=state?.energy??0,cooldownMs=Math.max(0,state?.cooldownMs??0);
  energyLabel.textContent='Komutan enerjisi: '+energy+'/100';
  normalButton.disabled=pending||!!state?.finished||energy<40||cooldownMs>0;
  ultimateButton.disabled=pending||!!state?.finished||energy<100||cooldownMs>0;
  statusLabel.textContent=pending?'Komut gönderiliyor':cooldownMs>0?'Bekleme: '+Math.ceil(cooldownMs/1000)+' sn':'Komutan hazır';
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
    await onCast({ability,targetIds:targets});
   }else await onCast({ability});
   statusLabel.textContent='Komut sunucu tarafından kabul edildi';
  }catch(error){statusLabel.textContent='⚠ '+(error?.message||'Komut reddedildi');}
  finally{pending=false;refresh();}
 }
 const normal=()=>use('normal'),ultimate=()=>use('ultimate');
 normalButton.addEventListener('click',normal);ultimateButton.addEventListener('click',ultimate);
 refresh();
 return {refresh,destroy(){disposed=true;normalButton.removeEventListener('click',normal);ultimateButton.removeEventListener('click',ultimate)}};
}
