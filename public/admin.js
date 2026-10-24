const $=id=>document.getElementById(id);
let login=null;try{login=JSON.parse(localStorage.getItem('hero-auction-login')||'null')}catch{}
const status=t=>$('status').textContent=t;
async function api(path,body={}){const auth=login?.authToken;const r=await fetch('/api/admin/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,authToken:auth})});const j=await r.json();if(auth!==login?.authToken)throw Error('Yönetici oturumu değişti. Yeniden doğrulayın.');if(!r.ok)throw Error(j.error||'İşlem başarısız');return j}
async function load(){
 try{
  const d=await api('list',{search:$('search').value});
  $('dashboard').hidden=false;$('historyPanel').hidden=false;$('refresh').hidden=false;$('moderationPanel').hidden=false;
  const tbody=$('accounts');tbody.replaceChildren();
  for(const a of d.accounts){
   const tr=document.createElement('tr');
   for(const value of [a.display_name,a.account_id,String(a.gold),a.banned?'Askıda':'Aktif']){const td=document.createElement('td');td.textContent=value;tr.append(td)}
   const td=document.createElement('td');
   const gold=document.createElement('button');gold.textContent='Altın düzenle';gold.onclick=async()=>{const value=prompt('Yeni altın miktarı (0–100000000)',String(a.gold));if(value===null)return;const n=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(n)||n>100000000){alert('Geçersiz miktar');return}if(!confirm('Altın bakiyesi '+n+' olarak ayarlansın mı?'))return;await act('gold',{accountId:a.account_id,gold:n})};
   const ban=document.createElement('button');ban.textContent=a.banned?'Etkinleştir':'Askıya al';ban.onclick=async()=>{if(!confirm(a.account_id+' için üyelik durumu değiştirilsin mi?'))return;await act('ban',{accountId:a.account_id,banned:!a.banned})};
   td.append(gold,' ',ban);tr.append(td);tbody.append(tr);
  }
  const h=await api('history');$('history').replaceChildren();
  for(const a of h.history){const p=document.createElement('p');p.textContent=new Date(a.created_at).toLocaleString('tr-TR')+' • '+a.account_id+' • '+a.action+' • '+a.old_gold+' → '+a.new_gold;$('history').append(p)}
  status(d.accounts.length+' hesap listelendi.');void loadModeration();
 }catch(e){status(e.message);$('dashboard').hidden=true;$('historyPanel').hidden=true;$('moderationPanel').hidden=true;$('moderation-reports').replaceChildren()}
}
async function act(path,data){try{await api(path,data);await load()}catch(e){alert(e.message)}}
$('login').onclick=()=>{if(!login?.authToken){status('Önce ana sayfada yetkili Google hesabıyla giriş yapın.');return}load()};
$('refresh').onclick=load;$('find').onclick=load;
if(login?.authToken)load();else status('Önce oyuna yönetici Google hesabınızla giriş yapın.');
const googleClientId='742640702245-3e3t9m7t29fbqlkubpcqtso63l8v8bv6.apps.googleusercontent.com';
window.heroAdminGoogleCallback=async response=>{try{const r=await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:response.credential})});const data=await r.json();if(!r.ok)throw Error(data.error||'Google oturumu açılamadı');login={type:'google',user:data.user,authToken:data.authToken};localStorage.setItem('hero-auction-login',JSON.stringify(login));await load()}catch(e){status(e.message)}};
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
 if(event.key!=='hero-auction-login')return;
 try{login=JSON.parse(localStorage.getItem('hero-auction-login')||'null')}catch{login=null}
 $('dashboard').hidden=true;$('historyPanel').hidden=true;$('moderationPanel').hidden=true;
 $('accounts').replaceChildren();$('history').replaceChildren();$('moderation-reports').replaceChildren();
 status('Oturum değişti. Yönetici hesabınızı yeniden doğrulayın.');
});
