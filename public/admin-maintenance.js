// Uses the already verified admin session and existing JSON-token API helper.
// No token entry box, new credential, feature activation or automatic action.
(()=>{
 const byId=id=>document.getElementById(id),panel=byId('economy-maintenance-panel');if(!panel)return;
 let current=null,busy=false,generation=0;
 const controls=['economy-maintenance-refresh','economy-maintenance-pause','economy-maintenance-resume'];
 function render(){
  byId('economy-maintenance-refresh').disabled=busy;
  byId('economy-maintenance-pause').disabled=busy||!current||current.paused&&current.persistenceConfirmed;
  byId('economy-maintenance-resume').disabled=busy||!current?.paused||!current.persistenceConfirmed||current.uncertainLegacyEntries>0||current.uncertainInvitations>0;
  if(!current){byId('economy-maintenance-summary').textContent='Durum bilinmiyor. Yenilemeden geçiş veya giriş açma kararı vermeyin.';byId('economy-maintenance-counts').replaceChildren();byId('economy-maintenance-proof').textContent='';return;}
  byId('economy-maintenance-summary').textContent=current.ready?'Girişler kalıcı olarak duraklatıldı; bu sunucuda ücretli maç ve ödül kuyruğu boş. Bu, şema veya özellik etkinleştirme onayı değildir.':current.paused?'Yeni canlı maç girişleri duraklatıldı. Mevcut maçlar/işlemler tamamlanıyor; yeşil durum olmadan geçiş yapmayın.':'Yeni canlı maç girişleri açık. Ekonomi geçişi için önce duraklatmayı açıkça onaylayın.';
  const list=byId('economy-maintenance-counts');list.replaceChildren();
  const labels={activePaidMatches:'Tamamlanmamış ücretli maç',paidEntriesInFlight:'Devam eden giriş işlemi',uncertainLegacyEntries:'Belirsiz eski giriş',uncertainInvitations:'Belirsiz davet',pendingGold:'Bekleyen altın kaydı',goldFlushesInFlight:'Altın yazma işlemi',roomFlushBatchesInFlight:'Devam eden oda kayıt grubu',dirtyPaidRooms:'Kaydedilmeyi bekleyen ücretli oda',paidRoomWritesInFlight:'Ücretli oda yazma işlemi',socialWritesInFlight:'Sosyal kayıt yazma işlemi',unconfirmedSocialWrites:'Doğrulanmamış sosyal kayıt',pendingVictoryChests:'Bekleyen sandık',victoryChestWritesInFlight:'Sandık yazma işlemi'};
  for(const [key,label] of Object.entries(labels)){const item=document.createElement('p');item.textContent=label+': '+(Number.isSafeInteger(current[key])?current[key]:'—');list.append(item)}
  byId('economy-maintenance-proof').textContent='Sunucu: '+current.bootId+' · Sürüm: '+current.revision+' · Kalıcı duraklatma: '+(current.persistenceConfirmed?'doğrulandı':'doğrulanamadı')+' · Veritabanı: '+(current.databaseHealthy?'erişilebilir':'erişilemiyor');
 }
 async function refresh(){
  if(busy)return;busy=true;const request=++generation;render();
  try{const result=await api('economy/status');if(request!==generation)return;current=result;panel.hidden=false;byId('economy-maintenance-message').textContent='Durum yenilendi. Hiçbir maç veya ekonomi ayarı değiştirilmedi.'}
  catch(error){if(request===generation){current=null;byId('economy-maintenance-message').textContent=error.message}}
  finally{if(request===generation){busy=false;render()}}
 }
 async function change(paused){
  if(busy||!current)return;
  const prompt=paused?'Yeni canlı maç girişleri duraklatılsın mı? Mevcut maçlar ve bilgisayar antrenmanı devam eder. Ekonomi özellikleri etkinleşmez.':'Yeni canlı maç girişleri yeniden açılsın mı? Bu işlem ekonomi bayraklarını veya veritabanı şemasını değiştirmez.';
  if(!window.confirm(prompt))return;
  busy=true;const request=++generation,expectedBootId=current.bootId,expectedRevision=current.revision;render();
  try{const result=await api('economy/pause',{paused,expectedBootId,expectedRevision});if(request!==generation)return;current=result;byId('economy-maintenance-message').textContent=paused?'Duraklatma kaydedildi. Kuyruk durumunu yenileyerek takip edin.':'Yeni canlı maç girişleri yeniden açıldı.'}
  catch(error){if(request===generation){current=null;byId('economy-maintenance-message').textContent=error.message+' Durumu yeniden okuyun; işlemi varsaymayın.'}}
  finally{if(request===generation){busy=false;render()}}
 }
 const reset=()=>{generation++;busy=false;current=null;panel.hidden=true;byId('economy-maintenance-counts').replaceChildren();byId('economy-maintenance-proof').textContent='';render()};
 byId(controls[0]).onclick=()=>void refresh();byId(controls[1]).onclick=()=>void change(true);byId(controls[2]).onclick=()=>void change(false);
 window.addEventListener('hero:admin-verified',()=>{panel.hidden=false;void refresh()});window.addEventListener('hero:admin-unverified',reset);
 window.addEventListener('storage',event=>{if(event.key==='hero-auction-login')reset()});render();
})();
