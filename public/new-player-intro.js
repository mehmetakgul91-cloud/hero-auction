// Account-scoped onboarding. No match, economy or identity mutation lives here.
// Only a confirmed absent commander profile enrolls a player; an unmarked
// established account is never treated as new merely because storage is empty.
export const INTRO_KEY='hero-auction-first-bot-intro-v1:';
export const introLessons={
 tr:[
  ['İlk takımını kur.','İlk zaferine bilgisayara karşı hazırlan. Altın kesilmez; lig puanın değişmez.','Kolay bot · Ücretsiz'],
  ['Her kredi bir karar.','Kartı tanı. İstersen teklif ver, istemezsen pas geç.','20 kredi → 5 kahraman'],
  ['Takımın hazır.','Safları kontrol et, komutanını seç, ardından arenaya çık.','Kolay rakip · Ücretsiz giriş']
 ],
 en:[
  ['Build your first team.','Prepare for your first victory against the computer. No gold charged; no league points changed.','Easy bot · Free'],
  ['Every credit is a choice.','Know the card. Bid if you want it, or pass.','20 credits → 5 heroes'],
  ['Your team is ready.','Check your rows, choose your commander, then enter the arena.','Easy opponent · Free entry']
 ]
};
// These are the existing game portraits, not newly invented hero art.
export const introPortraits=['hero-10-v2.webp','hero-13-v2.webp','hero-12-v2.webp','expansion-01.webp','expansion-07.webp'];
const portrait=(i,name='')=>'<figure class="intro-portrait"><img src="/images/original/'+introPortraits[i]+'" alt="" width="240" height="320" decoding="async">'+(name?'<figcaption>'+name+'</figcaption>':'')+'</figure>';
export function introScene(step,en=false){
 const t=(tr,english)=>en?english:tr;
 if(step===0)return '<div class="intro-fan" aria-hidden="true">'+portrait(1,'ELOREN')+portrait(2,'VANDRA')+portrait(0,'BRUNN')+'</div><p class="intro-free">'+t('KOLAY BOT · ÜCRETSİZ','EASY BOT · FREE')+'</p><h3>'+t('Rakip beklemeden öğren.','Learn without waiting for an opponent.')+'</h3><p>'+t('Teklif ver, 5 kahraman topla, takımını arenaya çıkar.','Bid, recruit 5 heroes, and take your team to the arena.')+'</p><div class="intro-assurances"><span>'+t('Altın kesilmez','No gold charged')+'</span><span>'+t('Lig puanın değişmez','League points unchanged')+'</span></div>';
 if(step===1)return '<div class="intro-budget"><span>'+t('BAŞLANGIÇ BÜTÇEN','STARTING BUDGET')+'</span><strong>'+t('20 KREDİ','20 CREDITS')+'</strong></div><div class="intro-card-detail"><div class="intro-callout"><small>'+t('ROLÜ','ROLE')+'</small><strong>Tank</strong></div>'+portrait(0,'BRUNN')+'<div class="intro-callout"><small>'+t('SAFI','ROW')+'</small><strong>'+t('Ön saf','Front')+'</strong></div></div><div class="intro-note"><strong>'+t('ÖNCE ROLÜNE VE YETENEĞİNE BAK','CHECK ROLE AND ABILITY FIRST')+'</strong><p>'+t('Bütün kredini tek karta harcama.','Do not spend all your credits on one card.')+'</p></div><div class="intro-demo-actions" aria-hidden="true"><span>'+t('PAS GEÇ','PASS')+'</span><span>'+t('TEKLİF VER','BID')+'</span></div><p>'+t('Hedefin: 20 krediyle 5 kahraman.','Your goal: 5 heroes with 20 credits.')+'</p>';
 return '<div class="intro-formation"><small>'+t('ÖN SAF','FRONT ROW')+'</small><div class="intro-front">'+portrait(0,'BRUNN')+portrait(1,'ELOREN')+portrait(2,'VANDRA')+'</div><small>'+t('ARKA SAF','BACK ROW')+'</small><div class="intro-back">'+portrait(3)+portrait(4)+'</div></div><p class="intro-example">'+t('Örnek diziliş · Kahramanların otomatik yerleşir. Ön / arka safı kontrol edip Hazırım’a bas.','Example formation · Heroes are placed automatically. Check Front / Back, then press Ready.')+'</p><div class="intro-note"><strong>'+t('Savaş otomatik. Beceri sende.','Battle is automatic. The ability is yours.')+'</strong><p>'+t('Komutanın enerjisi dolunca hazır beceriye dokun.','When commander energy fills, tap a ready ability.')+'</p></div><p>'+t('İlk maç: kolay rakip · ücretsiz giriş','First match: easy opponent · free entry')+'</p>';
}
export function introStorageKey(account){return typeof account==='string'&&account?INTRO_KEY+account:null;}
export function createIntroProgress({storage}={}){
 const memory=new Map();
 const read=account=>{const key=introStorageKey(account);if(!key)return null;if(memory.has(key))return memory.get(key);try{const value=storage?.getItem(key);if(value==='pending'||value==='done')return value;}catch{}return memory.get(key)||null;};
 const write=(account,value)=>{const key=introStorageKey(account);if(!key)return;memory.set(key,value);try{storage?.setItem(key,value);}catch{}};
 return {read,observeProfile(account,profile){if(profile===null&&!read(account))write(account,'pending');},complete(account){if(read(account)==='pending')write(account,'done');}};
}
export function introCanShow({enabled,account,profileReady,blocked,homeVisible,pending}){return !!(enabled&&account&&profileReady&&!blocked&&homeVisible&&pending);}
export function createNewPlayerIntro({document:doc,storage,getContext,start,onChange=()=>{},onEvent=()=>{}}){
 const progress=createIntroProgress({storage}),home=doc.getElementById('home');
 let panel=null,step=0,identity=null,busy=false,generation=0;
 const context=()=>getContext();
 const report=event=>{try{onEvent(event);}catch{}};
 const pending=()=>{const c=context();return !!(c.enabled&&c.account&&progress.read(c.account)==='pending');};
 function sync(){
  const c=context(),key=c.account+':'+c.token;
  if(identity!==key){identity=key;step=0;busy=false;generation++;}
  const active=pending();
  if(home){if(active)home.setAttribute('data-first-bot-intro','pending');else if(c.enabled&&progress.read(c.account)==='done')home.setAttribute('data-first-bot-intro','done');else home.removeAttribute('data-first-bot-intro');}
  if(!introCanShow({...c,pending:active})){if(panel)panel.hidden=true;return;}
  if(!panel)build();panel.hidden=false;render();report('intro_viewed');
 }
 function build(){
  panel=doc.createElement('section');panel.id='new-player-intro';panel.className='new-player-intro';panel.setAttribute('aria-labelledby','new-player-intro-title');panel.setAttribute('translate','no');
  panel.innerHTML='<div class="intro-brand"><img src="/images/lobby-crest.svg" alt="" width="36" height="42"><span>HERO<small>AUCTION</small></span><span id="new-player-intro-label"></span></div><div id="new-player-intro-bars" class="intro-bars" aria-hidden="true"></div><div class="new-intro-top"><span id="new-player-intro-progress"></span><button type="button" id="new-player-intro-skip"></button></div><h2 id="new-player-intro-title"></h2><p id="new-player-intro-copy"></p><div id="new-player-intro-visual"></div><div class="new-intro-actions"><button type="button" id="new-player-intro-back"></button><button type="button" id="new-player-intro-next" class="primary"></button></div><p id="new-player-intro-status" role="status" aria-live="polite"></p>';

  home.prepend(panel);
  el('skip').onclick=()=>{if(busy)return;report('intro_skipped');step=2;render();el('next').focus();};
  el('back').onclick=()=>{if(!busy&&step>0){step--;render();}};
  el('next').onclick=async()=>{
   if(busy)return;
   if(step<2){step++;render();return;}
   const c=context();if(!introCanShow({...c,pending:pending()})){sync();return;}
   report('intro_completed');
   const run=++generation,account=c.account,token=c.token;busy=true;render();el('status').textContent=c.english?'Starting your free Easy match…':'Ücretsiz kolay maçın başlatılıyor…';
   try{
    const started=await start();
    if(run!==generation||context().account!==account||context().token!==token)return;
    if(started){progress.complete(account);sync();onChange();}
    else el('status').textContent=c.english?'Your match did not start. Try again when the connection is ready.':'Maç başlamadı. Bağlantı hazır olduğunda tekrar deneyebilirsin.';
   }catch{if(run===generation)el('status').textContent=c.english?'Could not start. Please try again.':'Başlatılamadı. Tekrar deneyebilirsin.';}
   finally{if(run===generation){busy=false;sync();}}
  };
 }
 function el(part){return doc.getElementById('new-player-intro-'+part);}
 function render(){
  const english=context().english,lesson=introLessons[english?'en':'tr'][step];
  el('progress').textContent=(english?'FIRST MATCH · ':'İLK MAÇ · ')+(step+1)+' / 3';
  el('title').textContent=lesson[0];el('copy').textContent=lesson[1];el('visual').innerHTML=introScene(step,english);el('label').textContent=english?'FIRST MATCH GUIDE':'İLK MAÇ REHBERİ';el('bars').innerHTML=[0,1,2].map(i=>'<span'+(i<=step?' class="active"':'')+'></span>').join('');
  el('skip').textContent=english?'Skip explanation':'Anlatımı atla';el('skip').hidden=step===2;el('back').textContent=english?'Back':'Geri';
  el('next').textContent=step<2?(step===0?(english?'HOW TO PLAY? →':'NASIL OYNANIR? →'):(english?'SET YOUR FORMATION →':'TAKIMINI YERLEŞTİR →')):(english?'START FREE EASY MATCH →':'ÜCRETSİZ KOLAY MAÇA BAŞLA →');
  el('back').disabled=busy||step===0;el('next').disabled=busy;el('skip').disabled=busy;
  el('next').setAttribute('aria-busy',String(busy));
 }
 return {sync,pending,showStart(){step=2;sync();panel?.scrollIntoView?.({behavior:'smooth',block:'start'});},observeProfile(profile){const c=context();if(c.enabled)progress.observeProfile(c.account,profile);sync();},played(){progress.complete(context().account);sync();},destroy(){generation++;panel?.remove();home?.removeAttribute('data-first-bot-intro');}};
}
