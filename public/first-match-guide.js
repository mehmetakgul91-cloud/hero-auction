// Presentation only: never starts a match, changes credits, or sends a command.
export const guideSteps = {
 tr: [
  ['Kahramanlarını kazan', '20 krediyle 10 kartlık açık artırmada sırayla teklif ver veya pas geç. Her oyuncu 5 kahraman toplar. Kalan kredin takımının gücünü etkiler.', '1 · AÇIK ARTIRMA', '20 kredi → 5 kahraman'],
  ['Takımını yerleştir', 'Bir kahramana, ardından bir yuvaya dokun; dolu yuvada kartlar yer değiştirir. Ön / arka saf düğmeleriyle konum bonuslarını karşılaştır, sonra Hazırım’a bas. Süreyi takip et.', '2 · DİZİLİŞ', 'Kartı seç → Yuvaya dokun → Hazırım'],
  ['Komutan becerini zamanla', 'Savaş otomatik ilerler. İki gerçek oyunculu maçta enerji biriktir; düğme hazır olduğunda normal veya nihai beceriyi kullan. Büyücü için hedef seçip onayla. Bilgisayar maçı ücretsiz antrenmandır; altın ve lig puanın değişmez.', '3 · ARENA', 'Enerji biriktir → Hazır beceriyi kullan']
 ],
 en: [
  ['Win your heroes', 'Take turns bidding or passing on 10 cards with 20 credits. Each player recruits 5 heroes. Your remaining credits affect your team’s power.', '1 · AUCTION', '20 credits → 5 heroes'],
  ['Set your formation', 'Tap a hero, then a slot; occupied slots swap heroes. Use the front / back buttons to compare positioning bonuses, then tap Ready. Watch the timer.', '2 · FORMATION', 'Select hero → Tap slot → Ready'],
  ['Time your commander ability', 'Heroes fight automatically. In matches between two real players, build energy and use a normal or ultimate ability when its button is ready. For the Magic Commander, select targets and confirm. Computer matches are free practice: gold and league points do not change.', '3 · ARENA', 'Build energy → Use a ready ability']
 ]
};
export function guideCanAutoOpen({seen,homeVisible,invited}) { return !seen && homeVisible && !invited; }
export function mountFirstMatchGuide(doc = document, storage) {
 if(!storage){try{storage=window.localStorage}catch{}}
 const home=doc.getElementById('home'), anchor=doc.querySelector('.home-guide');
 if(!home||!anchor)return;
 const english=doc.documentElement.lang==='en'||location.pathname.startsWith('/crazygames/');
 const locale=english?'en':'tr', steps=guideSteps[locale];
 const labels=english?{open:'Quick tutorial',skip:'Skip tutorial',back:'Back',next:'Next',done:'Got it',count:'Step'}:{open:'Kısa öğretici',skip:'Öğreticiyi atla',back:'Geri',next:'İleri',done:'Anladım',count:'Adım'};
 const key='hero-auction-first-match-guide';
 let seen=false;try{seen=storage.getItem(key)==='seen'}catch{}
 let step=0, previousFocus=null;
 const replay=doc.createElement('button');replay.type='button';replay.id='first-match-guide-open';replay.className='first-match-guide-open';replay.textContent=labels.open;anchor.append(replay);
 const dialog=doc.createElement('dialog');dialog.id='first-match-guide';dialog.className='first-match-guide';dialog.setAttribute('translate','no');dialog.setAttribute('aria-labelledby','first-match-guide-title');
 dialog.innerHTML='<div class="guide-top"><span class="guide-progress"></span><button type="button" data-guide="skip"></button></div><div class="guide-visual" aria-hidden="true"></div><h2 id="first-match-guide-title"></h2><p class="guide-copy"></p><p class="guide-tip"></p><div class="guide-actions"><button type="button" data-guide="back"></button><button type="button" data-guide="next"></button></div>';
 const find=s=>dialog.querySelector(s),back=find('[data-guide="back"]'),next=find('[data-guide="next"]');
 find('[data-guide="skip"]').textContent=labels.skip;back.textContent=labels.back;
 doc.body.append(dialog);
 function render(){
  find('.guide-progress').textContent=labels.count+' '+(step+1)+' / '+steps.length;
  find('.guide-visual').textContent=['✦ 20 → 🃏 × 5','🛡️ ↔ ⚔️','⚡ → ✨'][step];
  find('h2').textContent=steps[step][0];find('.guide-copy').textContent=steps[step][1];find('.guide-tip').textContent=steps[step][3];
  back.disabled=step===0;next.textContent=step===steps.length-1?labels.done:labels.next;
 }
 function markSeen(){seen=true;try{storage.setItem(key,'seen')}catch{}}
 function close(){if(!dialog.open)return;markSeen();dialog.close();if(previousFocus?.isConnected&&previousFocus.getClientRects().length)previousFocus.focus();}
 function open(){if(dialog.open)return;previousFocus=doc.activeElement;step=0;render();dialog.showModal();next.focus();}
 replay.addEventListener('click',open);back.addEventListener('click',()=>{if(step>0){step--;render()}});
 next.addEventListener('click',()=>{if(step===steps.length-1)close();else {step++;render()}});
 find('[data-guide="skip"]').addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
 // A room/invite or navigation wins over the tutorial. Never cover a live timer.
 const sync=()=>{const homeVisible=!home.hidden&&home.getClientRects().length>0;
  if(!homeVisible){close();return;}
  if(guideCanAutoOpen({seen,homeVisible,invited:new URLSearchParams(location.search).has('join')}))open();
 };
 const observer=new MutationObserver(sync);observer.observe(home,{attributes:true,attributeFilter:['hidden']});sync();
 return {open,close,destroy(){observer.disconnect();close();dialog.remove();replay.remove()}};
}
if(typeof document!=='undefined')mountFirstMatchGuide();
