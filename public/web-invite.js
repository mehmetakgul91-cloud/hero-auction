// Normal-web invitations are an intent, not permission to charge an entry fee.
// Keep the code in the URL until explicit acceptance succeeds or the user cancels.
export function createWebInvite({url, platform=false, view, identity, validate, savedRoom, join, save, clearUrl, restore}) {
 const candidate=new URL(url).searchParams.get('join');
 let code=!platform&&/^\d{3}$/.test(candidate||'')?candidate:null;
 let busy=false,committing=false,generation=0,error='';
 const sync=()=>view({code,busy,committing,error,...identity()});
 function clear(){code=null;generation++;error='';clearUrl();sync();}
 async function accept(){
  if(!code||busy||!identity().ready)return;
  busy=true;error='';const ticket=generation,target=code,auth=identity().authToken;sync();
  const current=()=>ticket===generation&&code===target&&identity().authToken===auth;
  try{
   if(!await validate()||!current())return;
   const existing=await savedRoom();
   if(!current())return;
   if(existing){
    if(existing.room.code===target){clear();save(existing.token,existing.room);return;}
    error='Başka bir odan var ('+existing.room.code+'). Önce “Daveti iptal et / mevcut odama dön” ile odana dön ve odadan ayrıl. Sonra davet bağlantısını yeniden aç.';
    return;
   }
   if(!identity().ready)return;
   committing=true;sync();
   const result=await join(target);
   if(!current())return;
   clear();save(result.token,result.room);
  }catch(e){if(current())error='Davete katılınamadı: '+e.message;}
  finally{busy=false;committing=false;sync();}
 }
 function cancel(){
  // Once sent, the paid request cannot be safely cancelled client-side.
  if(committing||!code)return;
  busy=false;clear();void restore();
 }
 return {get pending(){return !!code;},sync,accept,cancel};
}

export function renderWebInvite(document,state){
 const $=id=>document.getElementById(id);
 const {code,ready,busy,committing,error}=state;
 $('join-invite').hidden=!code||!ready;
 $('join-invite-notice').hidden=!code||ready;
 $('join-invite-notice-text').textContent=code?'Oda '+code+' davetin hazır. Giriş yap ve gerekiyorsa komutanını seç. Katılım ancak onayınla gerçekleşir.':'';
 $('join-invite-code').textContent=code||'';
 $('join-invite-message').textContent=error||(committing?'Odaya katılınıyor…':'Oyunculu maça katılım: 50 altın.');
 $('join-invite-button').disabled=busy||!ready;
 $('join-invite-cancel').disabled=committing;
 $('join-invite-notice-cancel').disabled=committing;
 if(code&&ready){
  $('roomcode').value=code;
  $('home-play-panel').hidden=false;
  $('home-play-tab').setAttribute('aria-expanded','true');
  $('home-play-tab').classList.add('selected');
 }
 // No competing paid action or logout while an acceptance is in progress.
 for(const id of ['join','roomcode','create','match','bot'])$(id).disabled=busy||!!code;
 $('google-logout').disabled=busy;
}
