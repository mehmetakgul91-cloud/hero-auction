import {auctionMatchKey} from './auction-delivery-state.js';
// Auction identity is class-only: never render a saved progression profile.
const classes=Object.freeze({
 attack:{names:['Saldırı','Attack'],portrait:'Ateşler İçinde Savaşçı Komutan.png',normal:['Takım saldırısına bağlı hasarı rakiplere paylaştırır.','Distributes damage based on team attack among enemies.'],ultimate:['Av Emri: takım ilk ölümüne kadar hedefe odaklanır; yaşayan müttefiklerin sonraki saldırısı +%20 saldırı kazanır.','Hunt Order: allies focus the target until its first death; living allies gain +20% attack for their next attack.']},
 defense:{names:['Savunma','Defense'],portrait:'Altın Aslanın Kale Muhafızı.png',normal:['Yaşayan takımın azami canına bağlı kalkanı paylaştırır.','Shares a shield based on the living team’s maximum health.'],ultimate:['Son Kale: takıma kalkan verir. Seçilen müttefik ölümcül darbeden kurtulur; o tur ve sonraki 2 tur korunur.','Last Bastion: shields the team. A chosen ally survives a lethal hit and is protected for that round and the next 2 rounds.']},
 magic:{names:['Büyücü','Mage'],portrait:'Kozmik Rünlerin Büyücü Komutanı.png',normal:['Seçilen rakibi sersemletir; sonraki saldırısını atlatır.','Stuns a chosen enemy, skipping its next attack.'],ultimate:['Aşırı Yük: seçilen müttefike 3 hareket turu ek vuruş gücü verir. Düşerse kalan etki en yüksek canlı müttefike geçer.','Arcane Surge: grants a chosen ally extra hit power for 3 action rounds. If it falls, the remaining effect transfers to the ally with the highest current health.']},
 support:{names:['Destek','Support'],portrait:'Zümrüt Işığın Şifacı Kraliçesi.png',normal:['Eksik canı iyileştirir; can oranı en düşük kahramana öncelik verir.','Heals missing health, prioritizing the hero with the lowest health ratio.'],ultimate:['Diriliş: seçilen düşen müttefiki %40 canla, kalkansız diriltir; ek hareket vermez.','Revival: revives a chosen fallen ally at 40% health without a shield or extra action.']}
});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function auctionCommanderView(identity,{english=false}={}){
 const id=identity?.commanderId;if(!Object.hasOwn(classes,id))return null;
 const item=classes[id],i=english?1:0;
 return {id,name:item.names[i],portrait:'/images/'+encodeURIComponent(item.portrait),normal:item.normal[i],ultimate:item.ultimate[i]};
}
export function auctionCommanderMarkup(identity,seat,{english=false}={}){
 const view=auctionCommanderView(identity,{english});if(!view||![0,1].includes(seat))return '';
 return `<button type="button" class="auction-commander" data-auction-commander="${seat}" aria-haspopup="dialog" aria-label="${escape(view.name)} · ${english?'Commander abilities':'Komutan yetenekleri'}"><img src="${view.portrait}" alt="" width="32" height="36"><span>${escape(view.name)}</span></button>`;
}
export function auctionCommanderDialogMarkup(identity,{english=false}={}){
 const view=auctionCommanderView(identity,{english});if(!view)return '';
 return `<div class="auction-commander-dialog-heading"><img src="${view.portrait}" alt="" width="56" height="64"><h2 id="auction-commander-title">${escape(view.name)} ${english?'Commander':'Komutanı'}</h2></div><h3>${english?'Normal ability':'Normal yetenek'}</h3><p>${escape(view.normal)}</p><h3>${english?'Ultimate':'Nihai yetenek'}</h3><p>${escape(view.ultimate)} ${english?'Once per battle.':'Savaşta 1 kez.'}</p><form method="dialog"><button type="submit" autofocus>${english?'Close':'Kapat'}</button></form>`;
}
export function createAuctionCommanderDialog({document,getRoom}){
 let active=null;
 function close(){if(active?.dialog.open)active.dialog.close();}
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-auction-commander]');if(!button)return;
  const room=getRoom(),seat=Number(button.dataset.auctionCommander);
  if(room?.phase!=='auction'||room.cancellation||![0,1].includes(seat))return;
  const identity=room.players[seat]?.commander;
  const markup=auctionCommanderDialogMarkup(identity,{english:document.documentElement.lang==='en'});if(!markup)return;
  // Native close events are queued. Never reuse a closed node: an old close
  // event must not clear a reopened popup or move focus behind its modal.
  if(!active?.dialog.open){
   const dialog=document.createElement('dialog'),instance={dialog,opened:null};active=instance;
   dialog.className='auction-commander-dialog';dialog.setAttribute('aria-labelledby','auction-commander-title');document.body.append(dialog);
   dialog.addEventListener('click',e=>{if(e.target===dialog&&active===instance){const box=dialog.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)close();}});
   dialog.addEventListener('close',()=>{
    if(dialog.open)return;
    dialog.remove?.();
    if(active!==instance)return;
    const seat=instance.opened?.seat;active=null;
    document.querySelector(`[data-auction-commander="${seat}"]`)?.focus({preventScroll:true});
   });
  }
  active.dialog.innerHTML=markup;active.opened={matchKey:auctionMatchKey(room),seat,id:identity.commanderId};if(!active.dialog.open)active.dialog.showModal();
 });
 return {close,sync(room){const opened=active?.opened;if(opened&&(room?.phase!=='auction'||room.cancellation||auctionMatchKey(room)!==opened.matchKey||room.players[opened.seat]?.commander?.commanderId!==opened.id))close();}};
}
