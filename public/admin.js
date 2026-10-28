const $=id=>document.getElementById(id);
let login=null;try{login=JSON.parse(localStorage.getItem('hero-auction-login')||'null')}catch{}
const status=t=>$('status').textContent=t;
async function api(path,body={},timeoutMs=0){
 const auth=login?.authToken,abort=timeoutMs?new AbortController():null,timer=abort?setTimeout(()=>abort.abort(),timeoutMs):null;
 try{const r=await fetch('/api/admin/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,authToken:auth}),...(abort?{signal:abort.signal}:{})});const j=await r.json();if(auth!==login?.authToken)throw Error('Yönetici oturumu değişti. Yeniden doğrulayın.');if(!r.ok)throw Object.assign(Error(j.error||'İşlem başarısız'),{status:r.status});return j}
 finally{if(timer!==null)clearTimeout(timer);}
}
let accountOffset=0,accountPage=null;
let viewerAccount=null,walletCreditPolicy=null,creditTarget=null,loadGeneration=0;
const creditTools=window.HeroAdminWalletCredits;
const currencyLabel=value=>creditTools.currencies[value]||'Bilinmiyor';
const currencyAllowed=currency=>walletCreditPolicy?.enabled===true&&walletCreditPolicy.available===true&&(walletCreditPolicy.currencies?.[currency]===true||walletCreditPolicy.currencies?.[currency]?.available===true);
let creditButtons=[];
const creditController=creditTools.createController({
 getIdentity:()=>({accountId:viewerAccount,authToken:login?.authToken}),request:(path,body)=>api(path,body,20000),storage:{getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value),removeItem:key=>window.localStorage.removeItem(key)},locks:window.navigator?.locks,
 randomUUID:()=>window.crypto.randomUUID(),confirm:message=>window.confirm(message),onChange:renderCreditState,
 onSuccess:()=>{creditTarget=null;$('wallet-credit-form').hidden=true;void load();}
});

const reports=window.HeroAdminReports.create({document,request:api,isVerified:()=>!!viewerAccount&&creditController.snapshot().verified,download:(csv,filename)=>{
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}});
function renderCreditState(state){
 for(const {button,currency} of creditButtons)button.disabled=!state.canStart||!currencyAllowed(currency);
 $('wallet-credit-submit').disabled=!state.canStart||!creditTarget||!currencyAllowed(creditTarget.currency);
 $('wallet-credit-cancel').disabled=state.busy;
 const pending=$('wallet-credit-pending');pending.hidden=!state.pending&&!state.blocked;
 pending.textContent=state.pending?'Doğrulanacak istek: '+state.pending.requestId+' · '+state.pending.accountId+' · +'+state.pending.amount+' '+currencyLabel(state.pending.currency)+' · Gerekçe: '+state.pending.reason:state.blocked?'Güvenli işlem kaydı / sekme kilidi kullanılamıyor. Kayıt incelenmeden silinmemeli.':'';
 const read=$('wallet-credit-reconcile');read.hidden=!state.pending;read.disabled=!state.verified||state.busy||state.blocked;
 const retry=$('wallet-credit-retry');retry.hidden=!state.pending;retry.disabled=!state.verified||state.busy||state.blocked||!currencyAllowed(state.pending?.currency);
 $('wallet-credit-message').textContent=state.message;
 if(state.pending||state.blocked)$('wallet-credit-form').hidden=true;
}
function selectCredit(account,currency){
 if(!creditController.snapshot().canStart||!currencyAllowed(currency))return;
 creditTarget={accountId:account.account_id,currency};$('wallet-credit-account').value=account.display_name+' · '+account.account_id;$('wallet-credit-currency').value=currencyLabel(currency);$('wallet-credit-amount').value='';$('wallet-credit-reason').value='';$('wallet-credit-form').hidden=false;renderCreditState(creditController.snapshot());$('wallet-credit-amount').focus();
}
$('wallet-credit-form').onsubmit=async event=>{
 event.preventDefault();if(!creditTarget)return;
 const raw=$('wallet-credit-amount').value;if(!/^[1-9]\d*$/.test(raw)){ $('wallet-credit-message').textContent='Miktar pozitif bir tam sayı olmalı.';return;}
 await creditController.submit({...creditTarget,amount:Number(raw),reason:$('wallet-credit-reason').value});
};
$('wallet-credit-cancel').onclick=()=>{if(creditController.snapshot().busy)return;creditTarget=null;$('wallet-credit-form').hidden=true;};
$('wallet-credit-reconcile').onclick=()=>creditController.reconcile();$('wallet-credit-retry').onclick=()=>creditController.retry();
function appendText(parent,tag,copy,className){const node=document.createElement(tag);node.textContent=copy;if(className)node.className=className;parent.append(node);return node;}
const shownDate=value=>value&&Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}):'Bilinmiyor';
function renderAnalyticsCell(tr,value){
 const stats=document.createElement('td');stats.className='admin-activity';const latest=document.createElement('td');latest.className='admin-activity';
 if(!value||!Number.isSafeInteger(value.sessionCount)||value.sessionCount===0){stats.textContent='Bu dönemde gözlenen kayıt yok; eski ziyaretler bilinmiyor.';latest.textContent='Bilinmiyor';}
 else{
  appendText(stats,'div','Oturum: '+value.sessionCount+' · Ek oturum: '+(Number.isSafeInteger(value.repeatVisits)?value.repeatVisits:Math.max(0,value.sessionCount-1)));
  appendText(stats,'div','Ön planda etkin süre: '+creditTools.duration(value.activeMs));appendText(stats,'div','Son görülme: '+shownDate(value.lastSeen));
  const last=value.latest||{};appendText(latest,'div',creditTools.sourceLabels[last.source]||'Bilinmiyor');
  const platforms={web:'Web',android:'Android tarayıcı (bildirilen)',unknown:'Bilinmiyor'},devices={desktop:'Masaüstü',mobile:'Mobil',tablet:'Tablet',unknown:'Bilinmiyor'};
  appendText(latest,'div',(platforms[last.platform]||'Bilinmiyor')+' · '+(devices[last.device]||'Bilinmiyor'));
 }
 tr.append(stats,latest);
}
async function load(){
 const generation=++loadGeneration,auth=login?.authToken;
 try{
  const d=await api('list',{search:$('search').value,activity:$('activity-filter').value||'all',state:$('account-state').value||'all',offset:accountOffset});if(generation!==loadGeneration||auth!==login?.authToken)return;
  if(typeof d.viewer?.accountId!=='string'||!d.viewer.accountId)throw Error('Yönetici kimliği doğrulanamadı.');
  const changed=viewerAccount!==d.viewer.accountId;viewerAccount=d.viewer.accountId;walletCreditPolicy=d.walletCredits||null;
  $('dashboard').hidden=false;$('daily-report').hidden=false;$('historyPanel').hidden=false;$('refresh').hidden=false;$('moderationPanel').hidden=false;
  const enabled=d.playerAnalytics?.enabled===true&&d.playerAnalytics?.available===true;
  $('analytics-summary').textContent=enabled?'Ziyaret ölçümleri yalnız son 30 günde gözlenen hesap oturumlarıdır. Ön planda etkin süre, pencerenin açık kaldığı toplam süre veya kesin insan oyun süresi değildir. Sayfa yenileme ve yeni sekme ayrı oturum sayılır; ek oturum, yeniden kimlik doğrulama sayısı değildir. Eski veri tamamlanmaz. Kaynak ve cihaz bilgisi sınırlı tarayıcı bildirimi olabilir. Android, Android tarayıcı bildirimi anlamına gelir; yerel uygulama kanıtı değildir.':'Ziyaret ölçümü kapalı veya henüz kullanılamıyor. Geçmiş giriş kaynağı ve süreleri tahmin edilmez.';
  $('wallet-credit-availability').textContent=walletCreditPolicy?.enabled&&walletCreditPolicy.available?'Ekleme yalnız sunucuda izin verilen para birimlerinde kullanılabilir. “—” sıfır bakiye değil, kapalı veya doğrulanamayan para birimidir.':'Bakiye ekleme sunucuda kapalı veya altyapısı hazır değil. Bu panel özellikleri etkinleştirmez.';
  const tbody=$('accounts');tbody.replaceChildren();creditButtons=[];
  const visible=d.accounts;accountPage=d.pagination||{offset:0,limit:50,total:visible.length,hasMore:false};
  $('activity-filter-summary').textContent=accountPage.total+' eşleşen hesap. Son görülme filtreleri Türkiye takvim günlerine göredir.';
  $('accounts-page').textContent=visible.length?`${accountPage.offset+1}–${accountPage.offset+visible.length} / ${accountPage.total}`:'Eşleşen hesap yok.';
  $('accounts-prev').disabled=accountOffset===0;$('accounts-next').disabled=!accountPage.hasMore;
  for(const a of visible){
   const tr=document.createElement('tr');appendText(tr,'td',a.display_name);appendText(tr,'td',a.account_id,'account-id');
   const balances=document.createElement('td');balances.className='admin-balance';
   for(const currency of ['gold','diamonds','magicDust'])appendText(balances,'div',currencyLabel(currency)+': '+(Number.isSafeInteger(a[currency])?a[currency]:'—'));
   tr.append(balances);renderAnalyticsCell(tr,a.analytics);appendText(tr,'td',a.banned?'Askıda':'Aktif');
   const td=document.createElement('td');
   // Preserve the pre-existing absolute gold editor independently of the new
   // diamond/dust grant policy. The server enforces this capability.
   if(walletCreditPolicy?.legacyGoldSetAvailable===true){
    const gold=appendText(td,'button','Altın düzenle');gold.type='button';
    gold.onclick=async()=>{
     if(gold.disabled||walletCreditPolicy?.legacyGoldSetAvailable!==true)return;
     const value=prompt('Yeni altın miktarı (0–100000000)',String(a.gold));if(value===null)return;
     const n=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(n)||n>100000000){alert('Geçersiz miktar');return;}
     if(!confirm('Altın bakiyesi '+n+' olarak ayarlansın mı?'))return;
     gold.disabled=true;try{await act('gold',{accountId:a.account_id,gold:n,expectedGold:a.gold});}finally{gold.disabled=false;}
    };
   }
   for(const currency of ['gold','diamonds','magicDust']){const button=appendText(td,'button',currencyLabel(currency)+' ekle');button.type='button';button.disabled=true;button.onclick=()=>selectCredit(a,currency);creditButtons.push({button,currency});}
   const ban=appendText(td,'button',a.banned?'Etkinleştir':'Askıya al');ban.type='button';ban.disabled=a.account_id===viewerAccount;if(ban.disabled)ban.title='Kendi yönetici hesabınızı askıya alamazsınız.';ban.onclick=async()=>{if(!confirm(a.account_id+' için üyelik durumu değiştirilsin mi?'))return;ban.disabled=true;try{await act('ban',{accountId:a.account_id,banned:!a.banned})}finally{ban.disabled=false}};
   const visits=appendText(td,'button','Girişleri gör');visits.type='button';visits.onclick=()=>{$('report-search').value=a.account_id;void reports.load({accountId:a.account_id});$('daily-report').scrollIntoView({behavior:'smooth'});};
   tr.append(td);const labels=['Oyuncu','Hesap ID','Bakiyeler','Son 30 gün','Kaynak / cihaz','Durum','İşlemler'];Array.from(tr.children).forEach((cell,i)=>cell.setAttribute('data-label',labels[i]));tbody.append(tr);
  }
  if(changed||!creditController.snapshot().verified)creditController.setIdentity(true);else{creditController.syncJournal();renderCreditState(creditController.snapshot());}
  void reports.load();
  const h=await api('history');if(generation!==loadGeneration||auth!==login?.authToken)return;$('history').replaceChildren();
  const history=[...(h.history||[]).map(a=>({at:a.created_at,copy:shownDate(a.created_at)+' • '+a.account_id+' • '+a.action+' • '+a.old_gold+' → '+a.new_gold})),...(h.credits||[]).map(a=>({at:a.createdAt,copy:shownDate(a.createdAt)+' • '+a.accountId+' • +'+a.amount+' '+currencyLabel(a.currency)+' • '+a.balanceBefore+' → '+a.balanceAfter+' • '+a.reason+' • Yönetici: '+a.actorId+' • Makbuz: '+a.requestId}))].sort((a,b)=>new Date(b.at)-new Date(a.at));
  if(h.creditsAvailable===false)appendText($('history'),'p','Yeni bakiye ekleme makbuzları kullanılamıyor; bu durum işlem yapılmadığını kanıtlamaz.');
  for(const entry of history)appendText($('history'),'p',entry.copy);
  status(visible.length+' hesap listelendi.');void loadModeration();window.dispatchEvent(new Event('hero:admin-verified'));
 }catch(e){if(generation!==loadGeneration||auth!==login?.authToken)return;creditController.setIdentity(false);window.dispatchEvent(new Event('hero:admin-unverified'));status(e.message);reports.clear();viewerAccount=null;$('dashboard').hidden=true;$('historyPanel').hidden=true;$('moderationPanel').hidden=true;$('moderation-reports').replaceChildren()}
}
async function act(path,data){try{await api(path,data);await load()}catch(e){alert(e.message)}}
$('login').onclick=()=>{if(!login?.authToken){status('Önce ana sayfada yetkili Google hesabıyla giriş yapın.');return}load()};
$('refresh').onclick=()=>{accountOffset=0;void load();};$('find').onclick=$('refresh').onclick;$('activity-filter').onchange=$('refresh').onclick;$('account-state').onchange=$('refresh').onclick;
$('accounts-prev').onclick=()=>{accountOffset=Math.max(0,accountOffset-50);void load();};$('accounts-next').onclick=()=>{if(accountPage?.hasMore){accountOffset+=50;void load();}};$('search').addEventListener('keydown',event=>{if(event.key==='Enter'){accountOffset=0;void load();}});
if(login?.authToken)load();else status('Önce oyuna yönetici Google hesabınızla giriş yapın.');
const googleClientId='742640702245-3e3t9m7t29fbqlkubpcqtso63l8v8bv6.apps.googleusercontent.com';
window.heroAdminGoogleCallback=async response=>{try{const r=await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:response.credential})});const data=await r.json();if(!r.ok)throw Error(data.error||'Google oturumu açılamadı');++loadGeneration;viewerAccount=null;creditController.setIdentity(false);login={type:'google',user:data.user,authToken:data.authToken};localStorage.setItem('hero-auction-login',JSON.stringify(login));await load()}catch(e){status(e.message)}};
function initAdminGoogle(attempt=0){if(!window.google?.accounts?.id){if(attempt<40)setTimeout(()=>initAdminGoogle(attempt+1),500);else status('Google giriş hizmeti yüklenemedi.');return}window.google.accounts.id.initialize({client_id:googleClientId,callback:window.heroAdminGoogleCallback});window.google.accounts.id.renderButton($('google-login'),{theme:'filled_black',size:'large',text:'continue_with',width:260})}
initAdminGoogle();

let moderationBusy=false;
async function loadModeration(){
 if(moderationBusy)return;moderationBusy=true;$('moderation-refresh').disabled=true;
 try{const result=await api('moderation/list');const root=$('moderation-reports');root.replaceChildren();
  for(const report of result.reports){
   const card=document.createElement('article');card.className='moderation-report';
   const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;card.append(el);return el};
   text('h3',report.reason+' · '+report.status);text('p',report.id+' · '+new Date(report.createdAt).toLocaleString('tr-TR'));
   text('p','Bildiren: '+(report.reporter||'Silinmiş hesap')+' / Bildirilen: '+(report.target||'Silinmiş hesap'));
   text('p',report.details||'Açıklama yok / anonimleştirildi.');text('pre',JSON.stringify(report.evidence,null,2));
   if(report.target){const find=text('button','Bildirilen hesabı bul');find.type='button';find.onclick=()=>{$('search').value=report.target;void load();$('dashboard').scrollIntoView({behavior:'smooth'})};}
   if(report.status==='open'){
    const decision=document.createElement('select');decision.setAttribute('aria-label','İnceleme kararı');for(const [value,label]of [['dismissed','İhlal saptanmadı'],['actioned','İşlem uygulandı']]){const o=document.createElement('option');o.value=value;o.textContent=label;decision.append(o)}card.append(decision);
    const note=document.createElement('textarea');note.maxLength=500;note.placeholder='Gerekçe / yapılan işlem (zorunlu)';note.setAttribute('aria-label','Karar gerekçesi');card.append(note);
    const save=text('button','Kararı kaydet');save.type='button';save.onclick=async()=>{if(!note.value.trim()){alert('Gerekçe yazın.');return}if(!confirm('İnceleme kararı kaydedilsin mi?'))return;save.disabled=true;try{await api('moderation/review',{reportId:report.id,status:decision.value,note:note.value});await loadModeration()}catch(e){$('moderation-status').textContent=e.message;save.disabled=false}};
   }else{text('p','Karar: '+report.note+' · '+(report.reviewedBy||'Silinmiş hesap'));}
   root.append(card);
  }$('moderation-status').textContent=result.reports.length+' şikâyet gösteriliyor.';
 }catch(e){$('moderation-reports').replaceChildren();$('moderation-status').textContent=e.message}
 finally{moderationBusy=false;$('moderation-refresh').disabled=false}
}
$('moderation-refresh').onclick=loadModeration;

window.addEventListener('storage',event=>{
 if(event.key?.startsWith('hero-auction-admin-credit-pending:')){creditController.syncJournal();return;}
 if(event.key!==null&&event.key!=='hero-auction-login')return;
 reports.clear();accountOffset=0;
 ++loadGeneration;viewerAccount=null;walletCreditPolicy=null;creditTarget=null;creditController.setIdentity(false);$('wallet-credit-form').hidden=true;
 try{login=JSON.parse(localStorage.getItem('hero-auction-login')||'null')}catch{login=null}
 $('dashboard').hidden=true;$('historyPanel').hidden=true;$('moderationPanel').hidden=true;
 $('accounts').replaceChildren();$('history').replaceChildren();$('moderation-reports').replaceChildren();
 status('Oturum değişti. Yönetici hesabınızı yeniden doğrulayın.');
});
