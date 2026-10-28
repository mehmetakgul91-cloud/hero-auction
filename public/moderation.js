// Native preview safety controls. Auth is checked server-side on every action.
export function mountModerationUI({document:doc=document,window:win=window}={}){
 if(doc.getElementById('moderation-panel'))return;
 const host=doc.getElementById('support-moderation');if(!host)return;
 const node=(tag,text)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;return el};
 const panel=node('details');panel.id='moderation-panel';panel.append(node('summary','Oyuncuyu engelle / bildir'));
 panel.append(node('p','Engelleme yeni iletişimi ve eşleşmeyi durdurur; devam eden maçın sonucu veya ücreti değişmez. Acil tehlikede yerel acil yardım hizmetlerine başvur.'));
 const id=node('input');id.placeholder='HA-… oyuncu kimliği';id.maxLength=19;id.setAttribute('aria-label','Oyuncu kimliği');
 const reason=node('select');reason.setAttribute('aria-label','Şikâyet nedeni');
 for(const [value,label]of [['harassment','Taciz'],['hate','Nefret'],['sexual','Cinsel içerik'],['threat','Tehdit'],['spam','Spam'],['other','Diğer']]){const option=node('option',label);option.value=value;reason.append(option)}
 const details=node('textarea');details.maxLength=500;details.placeholder='Açıklama (en fazla 500 karakter; özel bilgi paylaşma)';details.setAttribute('aria-label','Şikâyet açıklaması');
 const status=node('p');status.setAttribute('role','status');const list=node('div'),actions=node('div');actions.className='moderation-actions';let busy=false;
 const auth=()=>{try{return JSON.parse(win.localStorage.getItem('hero-auction-login')||'null')?.authToken}catch{return null}};
 let displayedAuth=auth();
 function syncIdentity(){const current=auth();if(current!==displayedAuth){displayedAuth=current;list.replaceChildren();status.textContent='';id.value='';details.value='';panel.open=false;}return current}
 async function post(action,body={}){const token=syncIdentity();if(!token)throw Error('Önce giriş yap.');const response=await win.fetch('/api/moderation/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,authToken:token})});const result=await response.json();if(auth()!==token){syncIdentity();throw Error('Oturum değişti; işlemi yeniden başlat.')}if(!response.ok)throw Error(result.error||'İşlem başarısız.');return result}
 function button(label,action){const b=node('button',label);b.type='button';b.onclick=()=>void run(action);actions.append(b);return b}
 async function refresh(){const data=await post('state');list.replaceChildren();list.append(node('h3','Engellediklerin'));if(!data.blocked.length)list.append(node('p','Engellenen oyuncu yok.'));for(const person of data.blocked){const row=node('p',`${person.name||'Oyuncu'} · ${person.playerId} `);const remove=node('button','Engeli kaldır');remove.type='button';remove.onclick=()=>void run(async()=>{await post('unblock',{playerId:person.playerId});await refresh()});row.append(remove);list.append(row)}list.append(node('p',`${data.reports.filter(r=>r.status==='open').length} açık şikâyetin var. Şikâyet göndermek otomatik ceza uygulamaz.`))}
 async function run(action){if(busy)return;const operationAuth=syncIdentity();busy=true;for(const b of panel.querySelectorAll('button'))b.disabled=true;status.textContent='İşleniyor…';try{await action();if(auth()===operationAuth)status.textContent='İşlem tamamlandı.';else syncIdentity()}catch(error){if(auth()===operationAuth)status.textContent=error.message;else syncIdentity()}finally{busy=false;for(const b of panel.querySelectorAll('button'))b.disabled=false}}
 button('Engelle',async()=>{await post('block',{playerId:id.value});await refresh()});
 button('Şikâyet gönder',async()=>{if(!win.confirm('Bu şikâyet ve sunucudaki ilgili etkileşim kanıtı yetkili yönetici tarafından incelensin mi?'))return;let context={};try{const session=JSON.parse(win.localStorage.getItem('hero-auction-session')||'null');if(session)context={code:session.code,token:session.token}}catch{}const result=await post('report',{playerId:id.value,reason:reason.value,details:details.value,context});details.value='';await refresh();list.append(node('p','Şikâyet numarası: '+result.id))});
 button('Listemi yenile',refresh);panel.append(id,reason,details,actions,status,list);host.append(panel);
 win.addEventListener('storage',syncIdentity);win.addEventListener('hero:login-changed',syncIdentity);win.addEventListener('pageshow',syncIdentity);panel.addEventListener('toggle',syncIdentity);
 const identityTimer=win.setInterval(syncIdentity,1000);
 return {syncIdentity,destroy(){win.clearInterval(identityTimer);win.removeEventListener('storage',syncIdentity);win.removeEventListener('hero:login-changed',syncIdentity);win.removeEventListener('pageshow',syncIdentity);panel.remove()}};
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mountModerationUI(),{once:true});else mountModerationUI();
}
