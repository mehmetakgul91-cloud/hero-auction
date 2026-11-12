import {commanderMagicNormalDescription} from './commander-magic-presentation.js';
import {auctionMatchKey} from './auction-delivery-state.js';
// Auction identity is class-only: never render a saved progression profile.
const classes=Object.freeze({
 attack:{names:['Saldırı','Attack'],portrait:'/images/optimized/commander-attack.bad033e5f738a797.webp',normal:['Toplam hasar = komutan seviyesi + savaş başındaki savaşçı ve suikastçıların toplam saldırısının %10’u. Yaşayan düşmanlara bölünür. Başlangıç değeri sonraki ölümler ve güçlendirmelerle değişmez.','Total damage = commander level + 10% of total fighter and assassin attack at battle start. Split among living enemies. Later deaths and buffs do not change the starting value.'],ultimate:['Av Emri: takım ilk ölümüne kadar hedefe odaklanır; yaşayan müttefiklerin sonraki saldırısı +%20 saldırı kazanır.','Hunt Order: allies focus the target until its first death; living allies gain +20% attack for their next attack.']},
 defense:{names:['Savunma','Defense'],portrait:'/images/optimized/commander-defense.d1127052dd9f841b.webp',normal:['Toplam kalkan = komutan seviyesi + savaş başındaki tankların toplam savunmasının %20’si. Yaşayan müttefiklere paylaştırılır. Başlangıç değeri sonraki ölümler ve güçlendirmelerle değişmez.','Total shield = commander level + 20% of total tank defense at battle start. Shared among living allies. Later deaths and buffs do not change the starting value.'],ultimate:['Son Kale: takıma kalkan verir. Seçilen müttefik ölümcül darbeden kurtulur; o tur ve sonraki 1 tur korunur.','Last Bastion: shields the team. A chosen ally survives a lethal hit and is protected for that round and the next 1 round.']},
 magic:{names:['Büyücü','Mage'],portrait:'/images/optimized/commander-magic.86e58333914984ea.webp',normal:[commanderMagicNormalDescription(),commanderMagicNormalDescription({english:true})],ultimate:['Aşırı Yük: seçilen müttefike 3 hareket turu ek vuruş gücü verir. Düşerse kalan etki en yüksek canlı müttefike geçer.','Arcane Surge: grants a chosen ally extra hit power for 3 action rounds. If it falls, the remaining effect transfers to the ally with the highest current health.']},
 support:{names:['Destek','Support'],portrait:'/images/optimized/commander-support.d6ec4a88632b972d.webp',normal:['Toplam şifa = komutan seviyesi + savaş başındaki desteklerin toplam ham şifa gücünün %5’i. Ham şifa gücü = saldırı × temel şifa oranı; komutan şifa bonusu dahil değildir. Can oranı en düşük kahraman önceliklidir. Başlangıç değeri sonraki ölümler ve güçlendirmelerle değişmez.','Total healing = commander level + 5% of total raw support healing power at battle start. Raw healing power = attack × base healing rate, excluding the commander healing bonus. Prioritizes the hero with the lowest health ratio. Later deaths and buffs do not change the starting value.'],ultimate:['Diriliş: seçilen düşen müttefiki %55 canla, kalkansız diriltir; ek hareket vermez.','Revival: revives a chosen fallen ally at 55% health without a shield or extra action.']}
});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function auctionCommanderView(identity,{english=false}={}){
 const id=identity?.commanderId;if(!Object.hasOwn(classes,id))return null;
 const item=classes[id],i=english?1:0;
 return {id,name:item.names[i],portrait:item.portrait,normal:item.normal[i],ultimate:item.ultimate[i]};
}
export function auctionCommanderMarkup(identity,seat,{english=false,playerName=null,isMe=false}={}){
 const view=auctionCommanderView(identity,{english});if(!view||![0,1].includes(seat))return '';
 const label=playerName===null?view.name:String(playerName),self=isMe?(english?'YOU':'SEN'):'';
 return `<button type="button" class="auction-commander" data-auction-commander="${seat}" aria-haspopup="dialog" aria-label="${escape(label)}${self?' · '+self:''} · ${escape(view.name)} · ${english?'Commander abilities':'Komutan yetenekleri'}"><img src="${view.portrait}" alt="" width="48" height="58"><span class="auction-commander-copy"><span class="name" translate="no">${escape(label)}${self?` <small class="auction-commander-self">${self}</small>`:''}</span><span class="auction-commander-type">${escape(view.name)} <span aria-hidden="true" class="auction-commander-info">ⓘ</span></span></span></button>`;
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
