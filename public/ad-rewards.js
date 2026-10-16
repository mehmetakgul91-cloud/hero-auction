// Rewarded-ad UI stays disabled until Google approval and secure reward verification.
// Never credit gold from a browser callback or a client-provided completion flag.
const button=document.getElementById('rewarded-ad-button');
const status=document.getElementById('rewarded-ad-status');
if(button&&status){
  button.disabled=true;
  button.setAttribute('aria-disabled','true');
  async function refreshRewardStatus(){
    try{
      const raw=localStorage.getItem('hero-auction-login');
      const token=raw?JSON.parse(raw)?.authToken:null;
      if(!token){status.textContent='Ödüllü reklamlar için önce giriş yapmalısın.';return;}
      const response=await fetch('/api/rewarded/status',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({authToken:token})
      });
      if(!response.ok)throw Error('Durum alınamadı');
      const info=await response.json();
      status.textContent=info.message||'Reklam ödülleri henüz aktif değil.';
    }catch{
      status.textContent='Reklam ödülleri henüz aktif değil.';
    }
  }
  void refreshRewardStatus();
}
