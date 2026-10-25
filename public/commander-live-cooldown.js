// Use the same authoritative snapshot as the ability buttons.
let cooldownEnd=0,effectEnd=0,finished=false;
function renderCommanderCooldown(){
 const label=document.querySelector('#experimental-commander-controls [data-live-cooldown]');
 if(!label)return;
 const effect=Math.max(effectEnd,window.heroCommanderEffectUntil||0)-Date.now();
 const remaining=Math.max(0,Math.ceil((cooldownEnd-Date.now())/1000));
 label.textContent=finished?'Savaş tamamlandı':effect>0?'Komutan efekti · '+(Math.ceil(effect/100)/10).toLocaleString('tr-TR',{minimumFractionDigits:1,maximumFractionDigits:1})+' saniye':remaining>0?'Yetenek bekleme süresi: '+remaining+' saniye':'Normal enerji veya ulti dolumu yeterliyse becerini kullanabilirsin';
}
window.addEventListener('heroarena:commander-state',event=>{
 const data=event.detail,own=data.abilities?.[data.side]||{};
 cooldownEnd=Date.now()+Math.max(0,Number(own.cooldownMs)||0);
 effectEnd=Date.now()+Math.max(0,Number(own.effectLockMs)||0);
 finished=!!data.finished;renderCommanderCooldown();
});
window.addEventListener('heroarena:commander-effect-lock',renderCommanderCooldown);
setInterval(renderCommanderCooldown,200);
