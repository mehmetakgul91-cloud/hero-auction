const $=id=>document.getElementById(id);
let csrf='', account='', current=null, history=[], noticeTimer, attachment=null, attachmentBusy=false;
const states={draft:'Önizleme hazır. Henüz gönderilmedi.',sending:'Gönderiliyor… Yeniden gönderme.',accepted:'Mail sunucusu kabul etti.',rejected:'Mail sunucusu gönderimi reddetti.',unknown:'Gönderim sonucu belirsiz. Tekrar göndermeden önce alıcıyla kontrol et.'};
function archiveStatus(d){return d.archiveState==='saved'?`Gönderilen klasörüne kaydedildi (${d.archiveFolder}).`:d.archiveState==='saving'?'Gönderilen klasörüne kaydediliyor…':d.state==='accepted'?'Gönderim kabul edildi; klasöre kayıt henüz tamamlanmadı.':'';}
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,10000);}
async function api(path,body){const res=await fetch(path,{credentials:'same-origin',headers:body?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const data=await res.json();if(!res.ok)throw new Error(data.error||'İşlem tamamlanamadı.');return data;}
function renderQuota(q){$('quota').textContent=`Saatlik hak: ${q.remaining} / ${q.limit}`+(q.nextAt?` · Yeni hak: ${new Date(q.nextAt).toLocaleTimeString('tr-TR',{timeZone:'Europe/Istanbul'})} (Türkiye)`:'');}
function renderHistory(){
  const sent=history.filter(d=>d.state!=='draft');$('history-list').replaceChildren();
  if(!sent.length){const p=document.createElement('p');p.className='muted';p.textContent='Henüz gönderim yok.';$('history-list').append(p);}
  for(const d of sent.reverse()){
    const row=document.createElement('div'),label=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('small'),status=document.createElement('div');
    row.className='history-row';title.textContent=d.subject;sub.textContent=d.to+' · '+new Date(d.sentAt||d.created).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})+' (Türkiye)';
    const delivery=document.createElement('span'),copy=document.createElement('small');delivery.textContent=states[d.state];copy.textContent=archiveStatus(d);status.append(delivery,copy);
    if(d.state==='accepted'&&!['saved','saving'].includes(d.archiveState)){
      const retry=document.createElement('button');retry.className='quiet';retry.textContent='Yalnızca Gönderilen klasörüne kaydet';
      retry.addEventListener('click',async()=>{retry.disabled=true;try{const result=await api('/api/archive',{id:d.id});await refreshSession();notice(archiveStatus(result),result.archiveState!=='saved');}catch(e){notice(e.message,true);retry.disabled=false;}});status.append(retry);
    }
    label.append(title,sub);row.append(label,status);$('history-list').append(row);
  }
}
function renderPreview(d){current=d;$('empty-preview').hidden=true;$('preview').hidden=false;$('preview-from').textContent=account;$('preview-to').textContent=d.to;$('preview-subject').textContent=d.subject;$('preview-body').textContent=d.text;$('preview-attachment').textContent=d.attachment?`Ek: ${d.attachment.filename} · ${(d.attachment.size/1024/1024).toFixed(2)} MB`:'Ek yok.';$('draft-status').textContent=states[d.state]+' '+archiveStatus(d);$('send').disabled=d.state!=='draft';}
async function refreshSession(){const s=await api('/api/session');csrf=s.csrf;account=s.account;history=s.drafts;$('login-view').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;$('connected-account').textContent=account+' · Hesap bağlı';renderQuota(s.quota);renderHistory();if(current){const d=history.find(x=>x.id===current.id);if(d)renderPreview(d);}}
async function init(){try{const s=await api('/api/status');account=s.account;$('account').value=account;const ready=s.smtp.ready;$('connection').textContent=ready===true?'Şifreli mail bağlantısı hazır.':ready===false?'Mail sunucusu bağlantısı henüz doğrulanamadı.':'Mail bağlantısı kontrol ediliyor…';$('connection').classList.toggle('error',ready===false);try{await refreshSession();}catch{}}catch{notice('Sunucuya ulaşılamadı. Sayfayı yenileyerek tekrar dene.',true);}}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-button').disabled=true;try{await api('/api/login',{account,password:$('password').value});$('password').value='';await refreshSession();notice('Hesabın bağlandı. Gönderilen maillerin kopyaları otomatik kaydedilecek.');}catch(e){notice(e.message,true);}finally{$('password').value='';$('login-button').disabled=false;}});
$('logout').addEventListener('click',async()=>{try{await api('/api/logout',{});location.reload();}catch(e){notice(e.message,true);}});
$('compose-form').addEventListener('submit',async e=>{e.preventDefault();if(attachmentBusy){notice('Sunum ekinin yüklenmesini bekle.',true);return;}const button=e.submitter;button.disabled=true;try{const d=await api('/api/drafts',{to:$('recipient').value.trim(),subject:$('subject').value,text:$('message').value,attachmentId:attachment?.id});history.push(d);renderPreview(d);$('preview').scrollIntoView({behavior:'auto',block:'nearest'});}catch(e){notice(e.message,true);}finally{button.disabled=false;}});
$('test-mail').addEventListener('click',()=>{$('recipient').value=account;$('subject').value='ENKA mail bağlantısı · Deneme';$('message').value='Merhaba Mehmet,\n\nBu mail, ENKA mail merkezinin gönderim bağlantısını kontrol etmek için hazırlanmıştır.\n\nMehmet AKGÜL\nENKA Plastik';current=null;$('preview').hidden=true;$('empty-preview').hidden=false;$('compose-form').scrollIntoView({behavior:'auto',block:'start'});notice('Deneme maili hazır. Önizlemeyi hazırlayıp kontrol edebilirsin.');});
$('send').addEventListener('click',async()=>{if(!current||current.state!=='draft')return;const id=current.id;$('send').disabled=true;$('draft-status').textContent=states.sending;try{const d=await api('/api/send',{id});renderPreview(d);await refreshSession();notice(states[d.state]+' '+archiveStatus(d),d.state!=='accepted'||d.archiveState!=='saved');}catch(e){notice(e.message+' Gönderimi tekrar denemeden önce durumu kontrol et.',true);try{await refreshSession();}catch{}$('send').disabled=true;}});
$('refresh').addEventListener('click',async()=>{try{await refreshSession();notice('Gönderim hakkı ve kayıtlar güncellendi.');}catch(e){notice(e.message,true);}});
$('export').addEventListener('click',async()=>{try{const data=await api('/api/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='enka-gonderim-kayitlari.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){notice(e.message,true);}});
$('import-receipts').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;e.target.disabled=true;
  try{
    if(file.size>30*1024*1024)throw new Error('Kayıt dosyası en fazla 30 MB olabilir.');
    const data=JSON.parse(await file.text());
    if(data.account!==account||!Array.isArray(data.records)||data.records.length>100)throw new Error('Bu hesaba ait, en fazla 100 kayıt içeren bir dışa aktarma dosyası seç.');
    let imported=0;
    for(const record of data.records){if(record.state!=='accepted')continue;await api('/api/import-receipt',{account,record,attachmentFile:data.attachmentFiles?.find(a=>a.id===record.attachment?.id)});imported++;}
    notice(`${imported} kayıt alındı. Henüz klasöre kaydedilmedi; kayıtların yanındaki kaydet düğmesini kullan. Alıcılara mail gönderilmez.`);
  }catch(e){notice(e.message,true);}finally{e.target.disabled=false;e.target.value='';try{await refreshSession();}catch{}}
});
$('attachment').addEventListener('change',async e=>{
  const file=e.target.files[0];attachment=null;if(!file)return;
  attachmentBusy=true;$('attachment-status').textContent='Sunum yükleniyor…';
  try{
    if(file.size>5*1024*1024||!file.name.toLowerCase().endsWith('.pdf'))throw new Error('En fazla 5 MB boyutunda bir PDF seç.');
    const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('Dosya okunamadı.'));r.readAsDataURL(file);});
    attachment=await api('/api/attachments',{filename:file.name,base64});
    $('attachment-status').textContent=`${attachment.filename} · ${(attachment.size/1024/1024).toFixed(2)} MB. Yeni önizlemelere eklenecek.`;
  }catch(e){$('attachment-status').textContent=e.message;notice(e.message,true);}finally{attachmentBusy=false;}
});
$('remove-attachment').addEventListener('click',()=>{if(attachmentBusy)return;attachment=null;$('attachment').value='';$('attachment-status').textContent='Ek kaldırıldı. Önizlemeyi yeniden hazırla.';});
void init();
