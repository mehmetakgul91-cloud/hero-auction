// First-party owner-only credit journal. No authentication material is persisted.
// The server remains authoritative; this controller only prevents unsafe UI retries.
(()=>{
 const currencies=Object.freeze({gold:'Altın',diamonds:'Elmas',magicDust:'Büyü tozu'});
 const validRequest=value=>value&&Object.keys(value).sort().join(',')==='accountId,amount,currency,reason,requestId'&&typeof value.accountId==='string'&&value.accountId.length>0&&value.accountId.length<=200&&value.accountId.trim()===value.accountId&&!/[\u0000-\u001f\u007f]/.test(value.accountId)&&typeof value.currency==='string'&&Object.hasOwn(currencies,value.currency)&&Number.isSafeInteger(value.amount)&&value.amount>0&&value.amount<=1000000&&typeof value.reason==='string'&&value.reason===value.reason.trim()&&value.reason.length>=3&&value.reason.length<=300&&!/[\u0000-\u001f\u007f]/.test(value.reason)&&typeof value.requestId==='string'&&value.requestId.length>=16&&value.requestId.length<=100&&!/[^a-zA-Z0-9_-]/.test(value.requestId);
 function createController({getIdentity,request,storage,locks,randomUUID,confirm,onChange=()=>{},onSuccess=()=>{}}){
  let owner=null,auth=null,generation=0,verified=false,busy=false,pending=null,blocked=false,message='';
  const key=()=>owner?'hero-auction-admin-credit-pending:'+encodeURIComponent(owner):null;
  const identity=()=>{const current=getIdentity();return current&&typeof current.accountId==='string'&&current.accountId&&typeof current.authToken==='string'?current:null};
  const current=stamp=>stamp.generation===generation&&stamp.owner===owner&&stamp.auth===auth&&identity()?.accountId===owner&&identity()?.authToken===auth;
  const snapshot=()=>({verified,busy,pending:pending?{...pending}:null,blocked,message,canStart:verified&&!busy&&!pending&&!blocked&&Boolean(locks?.request)});
  const emit=()=>onChange(snapshot());
  function restore(){
   pending=null;blocked=false;
   try{if(!key()||!storage)throw Error();const raw=storage.getItem(key());if(!raw)return;const saved=JSON.parse(raw);if(saved?.version!==1||Object.keys(saved).sort().join(',')!=='request,version'||!validRequest(saved.request))throw Error();pending={...saved.request};}
   catch{blocked=true;message='Güvenli işlem kaydı okunamadı. Sonuç incelenmeden kayıt silinmemeli; yeni ekleme engellendi.';}
  }
  function setIdentity(isVerified){
   generation++;const next=identity();owner=next?.accountId||null;auth=next?.authToken||null;verified=Boolean(isVerified&&owner&&auth);busy=false;message='';pending=null;blocked=false;
   if(verified){restore();if(!locks?.request){blocked=true;message='Bu tarayıcı güvenli sekmeler arası işlem kilidini desteklemiyor; bakiye ekleme kapalı.';}}
   emit();
  }
  function syncJournal(){if(!verified)return;restore();emit();}
  function save(payload){try{storage.setItem(key(),JSON.stringify({version:1,request:payload}));pending={...payload};return true}catch{blocked=true;message='İşlem kaydı saklanamadı; hiçbir ekleme isteği gönderilmedi.';return false}}
  function clear(){try{storage.removeItem(key());pending=null;blocked=false;return true}catch{blocked=true;message='Makbuz doğrulandı ancak yerel işlem kaydı temizlenemedi. Yeni ekleme engellendi.';return false}}
  // A response is not success until its immutable receipt matches the exact intent.
  function matchingReceipt(result,payload){
   const receipt=result?.receipt;
   if(!receipt||receipt.requestId!==payload.requestId||receipt.accountId!==payload.accountId||receipt.actorId!==owner||receipt.currency!==payload.currency||receipt.amount!==payload.amount||receipt.reason!==payload.reason||!Number.isSafeInteger(receipt.balanceBefore)||receipt.balanceBefore<0||!Number.isSafeInteger(receipt.balanceAfter)||receipt.balanceAfter!==receipt.balanceBefore+payload.amount||receipt.balanceAfter>2147483647)return null;
   return receipt;
  }
  async function run(mode,input){
   if(!verified||busy||blocked||!locks?.request)return false;
   busy=true;const stamp={generation,owner,auth};emit();
   try{
    return await locks.request('hero-auction-admin-credit:'+owner,{mode:'exclusive'},async()=>{
     if(!current(stamp))return false;restore();if(blocked)return false;
     let payload;
     if(mode==='new'){
      if(pending){message='Önce bekleyen aynı işlemin sonucunu doğrulayın; yeni bir ekleme gönderilmedi.';return false;}
      payload={requestId:randomUUID(),accountId:input?.accountId,currency:input?.currency,amount:input?.amount,reason:typeof input?.reason==='string'?input.reason.trim():input?.reason};
      if(!validRequest(payload)){message='Hesap, para birimi, 1–1000000 tam sayı miktar ve 3–300 karakter tek satır gerekçe gerekli.';return false;}
      if(!confirm(payload.accountId+' hesabına '+payload.amount+' '+currencies[payload.currency]+' EKLENSİN mi?\nGerekçe: '+payload.reason+'\nMevcut bakiye değiştirilmez; yalnız bu miktar eklenir.'))return false;
      if(!current(stamp))return false;
      if(!save(payload))return false;
     }else{
      if(!pending)return false;payload={...pending};
      if(mode==='retry'&&!confirm('Yalnız aynı bekleyen isteği güvenli biçimde tekrar gönder:\n'+payload.requestId+'\n'+payload.accountId+' · +'+payload.amount+' '+currencies[payload.currency]+'\nGerekçe: '+payload.reason+'\nYeni istek kimliği oluşturulmaz; makbuz varsa ikinci kez eklenmez.'))return false;
      if(!current(stamp))return false;
     }
     try{
      const result=await request(mode==='lookup'?'wallet/receipt':'wallet/credit',mode==='lookup'?{requestId:payload.requestId}:{...payload});
      if(!current(stamp))return false;
      const receipt=matchingReceipt(result,payload);
      if(!receipt){message=mode==='lookup'?'Makbuz henüz doğrulanmadı. Bu, işlemin yapılmadığını kanıtlamaz; bekleyen kayıt korunuyor.':'Sunucu makbuzu istekle eşleşmedi. Sonuç belirsiz; yeni ekleme engellendi.';return false;}
      if(!clear())return false;
      message='Makbuz doğrulandı: '+receipt.accountId+' · +'+receipt.amount+' '+currencies[receipt.currency]+' · '+receipt.balanceBefore+' → '+receipt.balanceAfter+'. Aynı istek ikinci kez uygulanmaz.';
      onSuccess(receipt);return true;
     }catch(error){if(current(stamp))message=(error.message||'İşlem yanıtı alınamadı.')+' Sonuç varsayılmıyor. Aynı istek kaydı korunuyor; yeni ekleme engellendi.';return false;}
    });
   }catch(error){if(current(stamp)){blocked=true;message='Güvenli işlem kilidi alınamadı; yeni ekleme engellendi.';}return false;}
   finally{if(current(stamp)){busy=false;emit();}}
  }
  return {setIdentity,syncJournal,snapshot,submit:input=>run('new',input),reconcile:()=>run('lookup'),retry:()=>run('retry')};
 }
 const sourceLabels={google_search:'Google araması',invite:'Davet bağlantısı',crazygames:'CrazyGames',external:'Diğer bağlantı',direct_or_unknown:'Doğrudan / bilinmiyor',unknown:'Bilinmiyor'};
 const duration=ms=>{if(!Number.isFinite(ms)||ms<0)return '—';const seconds=Math.floor(ms/1000),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);return hours?hours+' sa '+minutes%60+' dk':minutes?minutes+' dk '+seconds%60+' sn':seconds+' sn'};
 window.HeroAdminWalletCredits=Object.freeze({createController,currencies,validRequest,sourceLabels,duration});
})();
