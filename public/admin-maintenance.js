// Uses the already verified admin session and existing JSON-token API helper.
// No token entry box, new credential, feature activation or automatic action.
(()=>{
 const byId=id=>document.getElementById(id),panel=byId('economy-maintenance-panel');if(!panel)return;
 let current=null,busy=false,generation=0,verified=false;
 let cancellationPreview=null,pendingCancellation=null,journalBlocked=false;
 const selectedCancellations=new Set();
 const cancellationPanel=byId('economy-cancellation-panel');
 const cancellationKey=()=>{const owner=typeof login!=='undefined'?login?.user?.sub:null;return typeof owner==='string'&&owner?'hero-auction-admin-cancellation-pending:'+encodeURIComponent(owner):null};
 const validDigest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 const validCancellationRequest=value=>value&&Object.keys(value).every(key=>['expectedBootId','expectedRevision','candidates'].includes(key))&&typeof value.expectedBootId==='string'&&value.expectedBootId.length>0&&value.expectedBootId.length<=160&&Number.isSafeInteger(value.expectedRevision)&&value.expectedRevision>=0&&Array.isArray(value.candidates)&&value.candidates.length===3&&new Set(value.candidates.map(item=>item?.id)).size===3&&value.candidates.every(item=>item&&Object.keys(item).every(key=>['id','digest'].includes(key))&&validDigest(item.id)&&validDigest(item.digest));
 const controls=['economy-maintenance-refresh','economy-maintenance-pause','economy-maintenance-resume'];
 function render(){
  renderCancellation();
  byId('economy-maintenance-refresh').disabled=busy;
  byId('economy-maintenance-pause').disabled=busy||!current||current.paused&&current.persistenceConfirmed;
  byId('economy-maintenance-resume').disabled=busy||!current?.paused||!current.persistenceConfirmed||current.uncertainLegacyEntries>0||current.uncertainInvitations>0||current.pendingMatchCancellations>0||Boolean(pendingCancellation)||journalBlocked;
  if(!current){byId('economy-maintenance-summary').textContent='Durum bilinmiyor. Yenilemeden geçiş veya giriş açma kararı vermeyin.';byId('economy-maintenance-counts').replaceChildren();byId('economy-maintenance-proof').textContent='';return;}
  byId('economy-maintenance-summary').textContent=pendingCancellation?'İptal işleminin sonucu doğrulanmayı bekliyor. Yeni işlem veya giriş açma kararı vermeden aynı isteğin kaydını doğrulayın.':current.ready?'Girişler kalıcı olarak duraklatıldı; bu sunucuda ücretli maç ve ödül kuyruğu boş. Bu, şema veya özellik etkinleştirme onayı değildir.':current.paused?'Yeni canlı maç girişleri duraklatıldı. Mevcut maçlar/işlemler tamamlanıyor; yeşil durum olmadan geçiş yapmayın.':'Yeni canlı maç girişleri açık. Ekonomi geçişi için önce duraklatmayı açıkça onaylayın.';
  const list=byId('economy-maintenance-counts');list.replaceChildren();
  const labels={pendingMatchCancellations:'Bekleyen maç iptali',activePaidMatches:'Tamamlanmamış ücretli maç',paidEntriesInFlight:'Devam eden giriş işlemi',uncertainLegacyEntries:'Belirsiz eski giriş',uncertainInvitations:'Belirsiz davet',pendingGold:'Bekleyen altın kaydı',goldFlushesInFlight:'Altın yazma işlemi',roomFlushBatchesInFlight:'Devam eden oda kayıt grubu',dirtyPaidRooms:'Kaydedilmeyi bekleyen ücretli oda',paidRoomWritesInFlight:'Ücretli oda yazma işlemi',socialWritesInFlight:'Sosyal kayıt yazma işlemi',unconfirmedSocialWrites:'Doğrulanmamış sosyal kayıt',pendingVictoryChests:'Bekleyen sandık',victoryChestWritesInFlight:'Sandık yazma işlemi'};
  for(const [key,label] of Object.entries(labels)){const item=document.createElement('p');item.textContent=label+': '+(Number.isSafeInteger(current[key])?current[key]:'—');list.append(item)}
  byId('economy-maintenance-proof').textContent='Sunucu: '+current.bootId+' · Sürüm: '+current.revision+' · Kalıcı duraklatma: '+(current.persistenceConfirmed?'doğrulandı':'doğrulanamadı')+' · Veritabanı: '+(current.databaseHealthy?'erişilebilir':'erişilemiyor');
 }
 async function refresh(){
  if(busy)return;invalidateCancellationPreview();busy=true;const request=++generation;render();
  try{const result=await api('economy/status');if(request!==generation)return;current=result;panel.hidden=false;byId('economy-maintenance-message').textContent='Durum yenilendi. Hiçbir maç veya ekonomi ayarı değiştirilmedi.'}
  catch(error){if(request===generation){current=null;byId('economy-maintenance-message').textContent=error.message}}
  finally{if(request===generation){busy=false;render()}}
 }
 async function change(paused){
  if(busy||!current||!paused&&(pendingCancellation||journalBlocked||current.pendingMatchCancellations>0))return;
  const prompt=paused?'Yeni canlı maç girişleri duraklatılsın mı? Mevcut maçlar ve bilgisayar antrenmanı devam eder. Ekonomi özellikleri etkinleşmez.':'Yeni canlı maç girişleri yeniden açılsın mı? Bu işlem ekonomi bayraklarını veya veritabanı şemasını değiştirmez.';
  if(!window.confirm(prompt))return;
  invalidateCancellationPreview();busy=true;const request=++generation,expectedBootId=current.bootId,expectedRevision=current.revision;render();
  try{const result=await api('economy/pause',{paused,expectedBootId,expectedRevision});if(request!==generation)return;current=result;byId('economy-maintenance-message').textContent=paused?'Duraklatma kaydedildi. Kuyruk durumunu yenileyerek takip edin.':'Yeni canlı maç girişleri yeniden açıldı.'}
  catch(error){if(request===generation){current=null;byId('economy-maintenance-message').textContent=error.message+' Durumu yeniden okuyun; işlemi varsaymayın.'}}
  finally{if(request===generation){busy=false;render()}}
 }
 function invalidateCancellationPreview(){cancellationPreview=null;selectedCancellations.clear();byId('economy-cancellation-candidates')?.replaceChildren();}
 function restoreCancellationJournal(){
  pendingCancellation=null;journalBlocked=false;if(!cancellationPanel)return;
  try{
   const key=cancellationKey();if(!key||!window.sessionStorage)throw Error('İşlem kaydı kullanılamıyor.');
   const raw=window.sessionStorage.getItem(key);if(!raw)return;
   const saved=JSON.parse(raw);if(saved?.version!==1||!validCancellationRequest(saved.request))throw Error('İşlem kaydı doğrulanamadı.');
   pendingCancellation=saved.request;
  }catch{journalBlocked=true;}
 }
 function saveCancellationJournal(request){
  try{const key=cancellationKey();if(!key||!window.sessionStorage)throw Error('İşlem kaydı kullanılamıyor.');window.sessionStorage.setItem(key,JSON.stringify({version:1,request}));pendingCancellation=request;return true}
  catch{journalBlocked=true;return false}
 }
 function clearCancellationJournal(){
  try{const key=cancellationKey();if(!key||!window.sessionStorage)throw Error('İşlem kaydı kullanılamıyor.');window.sessionStorage.removeItem(key);pendingCancellation=null;journalBlocked=false;return true}
  catch{journalBlocked=true;return false}
 }
 function pausedProof(){return verified&&current?.paused===true&&current.persistenceConfirmed===true&&current.databaseHealthy===true;}
 function renderCancellation(){
  if(!cancellationPanel)return;
  byId('economy-cancellation-preview').disabled=busy||!pausedProof()||Boolean(pendingCancellation);
  byId('economy-cancellation-execute').disabled=busy||!pausedProof()||journalBlocked||Boolean(pendingCancellation)||!cancellationPreview||selectedCancellations.size!==3;
  const retry=byId('economy-cancellation-reconcile');retry.hidden=!pendingCancellation;retry.disabled=busy||!verified||journalBlocked;
  const proof=byId('economy-cancellation-pending');proof.hidden=!pendingCancellation&&!journalBlocked;
  proof.textContent=journalBlocked?'Güvenli işlem kaydı okunamadı veya saklanamadı. Yeni iptal gönderilmez. Kayıt ve sunucu sonucu incelenmeden temizlemeyin.':pendingCancellation?'Sonucu belirsiz / doğrulanacak istek: '+pendingCancellation.candidates.map(item=>item.id).join(' · ')+'. Aynı kimlik ve özetler korunur; doğrulamada güncel duraklatılmış sunucu ayrıca okunur. Yeni maç seçilmez.':'';
  for(const input of byId('economy-cancellation-candidates').querySelectorAll('input'))input.disabled=busy||Boolean(pendingCancellation)||selectedCancellations.size===3&&!input.checked;
  byId('economy-cancellation-selection').textContent=cancellationPreview?'Seçili: '+selectedCancellations.size+' / 3. Yalnız bu üç kaydın iptali onaylanabilir.':'Önizleme yapılmadı. Bu bölüm kendiliğinden maç iptal etmez.';
 }
 function normalizeCancellationPreview(result){
  if(!pausedProof()||!result||result.bootId!==current.bootId||result.revision!==current.revision||result.paused!==true||result.persistenceConfirmed!==true||result.requiredSelectionCount!==3||!Array.isArray(result.candidates)||result.candidates.length>200)return null;
  const ids=new Set();
  for(const candidate of result.candidates){
   if(!validDigest(candidate?.id)||!validDigest(candidate?.digest)||ids.has(candidate.id)||candidate.refundGoldPerSeat!==50||!Number.isInteger(candidate.paidSeats)||candidate.paidSeats<1||candidate.paidSeats>2||!['number','string'].includes(typeof candidate.lastActivity)||!Number.isFinite(new Date(candidate.lastActivity).getTime()))return null;
   ids.add(candidate.id);
  }
  return {bootId:result.bootId,revision:result.revision,candidates:result.candidates.map(candidate=>({...candidate}))};
 }
 function drawCancellationCandidates(){
  const root=byId('economy-cancellation-candidates');root.replaceChildren();
  for(const candidate of cancellationPreview.candidates){
   const row=document.createElement('label');row.className='economy-cancellation-candidate';
   const input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-label','İptal için seç: '+candidate.id);
   input.onchange=()=>{if(busy||pendingCancellation)return;if(input.checked){if(selectedCancellations.size>=3){input.checked=false;return;}selectedCancellations.add(candidate.id)}else selectedCancellations.delete(candidate.id);renderCancellation()};
   const content=document.createElement('span'),identity=document.createElement('code');identity.textContent=candidate.id;
   const detail=document.createElement('span');detail.textContent='Son etkinlik: '+new Date(candidate.lastActivity).toLocaleString('tr-TR',{timeZone:'UTC'})+' UTC · '+candidate.paidSeats+' ücretli koltuk · Koltuk başına 50 altın. Önceki iadeler yeniden ödenmez.';
   content.append(identity,detail);row.append(input,content);root.append(row);
  }
 }
 async function previewCancellations(){
  if(busy||!pausedProof()||pendingCancellation)return;
  invalidateCancellationPreview();busy=true;const request=++generation;render();
  try{
   const result=await api('economy/cancellations/preview');if(request!==generation)return;
   const next=normalizeCancellationPreview(result);if(!next)throw Error('Önizleme güncel duraklatılmış sunucuyla eşleşmiyor. Önce bakım durumunu yenileyin.');
   cancellationPreview=next;drawCancellationCandidates();
   byId('economy-cancellation-message').textContent=next.candidates.length+' uygun kayıt bulundu. Liste yalnız okunmuştur; iptal veya iade yapılmadı.'+(next.candidates.length<3?' Tam üç uygun kayıt olmadığından işlem gönderilemez.':' İptal edilecek üç kaydı tek tek seçin.');
  }catch(error){if(request===generation){invalidateCancellationPreview();byId('economy-cancellation-message').textContent=error.message}}
  finally{if(request===generation){busy=false;render()}}
 }
 function cancellationReceipt(result,request){
  if(result?.ok!==true||typeof result.replayed!=='boolean'||!Array.isArray(result.cancelled)||result.cancelled.length!==3||!Number.isSafeInteger(result.refundGold)||result.refundGold<0)return null;
  const wanted=new Set(request.candidates.map(item=>item.id)),seen=new Set();let total=0;
  for(const item of result.cancelled){if(!wanted.has(item?.id)||seen.has(item.id)||!Number.isSafeInteger(item.refundGold)||item.refundGold<0||item.refundGold>100||item.refundGold%50!==0)return null;seen.add(item.id);total+=item.refundGold;}
  return total===result.refundGold?result:null;
 }
 async function executeCancellations(reconcile=false){
  if(busy||!verified||journalBlocked)return;
  let payload;
  if(reconcile){
   if(!pendingCancellation)return;
   const sameCandidates=pendingCancellation.candidates.map(({id,digest})=>({id,digest}));
   busy=true;const inspection=++generation;render();
   try{
    const status=await api('economy/status');if(inspection!==generation)return;current=status;
    if(!pausedProof())throw Error('Güncel sunucuda kalıcı duraklatma doğrulanmadan eski işlemin kaydı tekrar gönderilemez.');
    payload={expectedBootId:status.bootId,expectedRevision:status.revision,candidates:sameCandidates};
   }catch(error){if(inspection===generation)byId('economy-cancellation-message').textContent=error.message+' Eski işlemin sonucu hâlâ belirsiz; kayıt korunuyor.';return;}
   finally{if(inspection===generation){busy=false;render()}}
  }
  else{
   if(!pausedProof()||pendingCancellation||!cancellationPreview||selectedCancellations.size!==3)return;
   payload={expectedBootId:cancellationPreview.bootId,expectedRevision:cancellationPreview.revision,candidates:cancellationPreview.candidates.filter(item=>selectedCancellations.has(item.id)).map(({id,digest})=>({id,digest}))};
  }
  if(!validCancellationRequest(payload))return;
  const consentGeneration=generation,proof='Sunucu: '+payload.expectedBootId+' · Sürüm: '+payload.expectedRevision+'\n';
  const prompt=reconcile?proof+'Yalnız daha önce gönderilen bu üç iptal kaydının sonucunu doğrula:\n'+payload.candidates.map(item=>item.id).join('\n')+'\nAynı üç maç kimliği ve özeti güncel sunucuda doğrulanır; yeni seçim veya ikinci iade yapılmaz.':
   proof+'Aşağıdaki TAM ÜÇ terk edilmiş, savaş başlamamış maç iptal edilsin mi?\n'+payload.candidates.map(item=>item.id).join('\n')+'\nHer ücretli ve henüz iade edilmemiş koltuğa 50 altın bir kez geri verilir. Kazanan, lig puanı veya galibiyet yazılmaz; geçmiş silinmez. Aktif savaşlar iptal edilmez.';
  if(!window.confirm(prompt)||consentGeneration!==generation||!verified)return;
  if(!saveCancellationJournal(payload)){byId('economy-cancellation-message').textContent='Güvenli işlem kaydı saklanamadı. İptal isteği gönderilmedi.';render();return;}
  busy=true;const request=++generation;render();
  try{
   const result=await api('economy/cancellations/execute',payload);if(request!==generation)return;
   const receipt=cancellationReceipt(result,payload);if(!receipt)throw Error('İptal yanıtı seçilen üç kayıtla doğrulanamadı. Aynı isteğin sonucunu tekrar doğrulayın.');
   const cleared=clearCancellationJournal();invalidateCancellationPreview();
   byId('economy-cancellation-message').textContent='Üç iptal makbuzu doğrulandı. Kayıtlı toplam iade: '+receipt.refundGold+' altın.'+(receipt.replayed?' Önceki makbuzlar yeniden okundu; ikinci ödeme yapılmadı.':' Kazanan veya lig sonucu oluşturulmadı.')+(cleared?'':' Yerel işlem kaydı temizlenemedi; yeni seçim yapmadan aynı kaydı doğrulayın.');
   try{const status=await api('economy/status');if(request===generation)current=status;}catch{if(request===generation){current=null;byId('economy-maintenance-message').textContent='İptal makbuzu alındı; güncel bakım durumu okunamadı. Durumu yenileyin.'}}
  }catch(error){
   if(request!==generation)return;
   if(!reconcile&&[400,409].includes(error.status)){clearCancellationJournal();invalidateCancellationPreview();current=null;byId('economy-cancellation-message').textContent=error.message+' İstek reddedildi; eski seçimi tekrar göndermeyin. Bakım durumunu ve önizlemeyi yenileyin.';}
   else{byId('economy-cancellation-message').textContent=error.message+' Sonuç varsayılmıyor. Yeni seçim yapmadan yalnız kaydedilmiş aynı isteğin sonucunu doğrulayın.';}
  }finally{if(request===generation){busy=false;render()}}
 }
 if(cancellationPanel){
  byId('economy-cancellation-preview').onclick=()=>void previewCancellations();
  byId('economy-cancellation-execute').onclick=()=>void executeCancellations(false);
  byId('economy-cancellation-reconcile').onclick=()=>void executeCancellations(true);
 }
 const reset=()=>{generation++;busy=false;current=null;verified=false;invalidateCancellationPreview();pendingCancellation=null;journalBlocked=false;panel.hidden=true;byId('economy-maintenance-counts').replaceChildren();byId('economy-maintenance-proof').textContent='';render()};
 byId(controls[0]).onclick=()=>void refresh();byId(controls[1]).onclick=()=>void change(true);byId(controls[2]).onclick=()=>void change(false);
 window.addEventListener('hero:admin-verified',()=>{if(!verified){verified=true;restoreCancellationJournal()}panel.hidden=false;void refresh()});window.addEventListener('hero:admin-unverified',reset);
 window.addEventListener('storage',event=>{if(event.key==='hero-auction-login')reset()});render();
})();
