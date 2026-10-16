// Hero Auction rewarded-ad readiness UI.
// No advertising is loaded and no gold is credited before Google approval
// and a server-verified reward integration is implemented.
const button=document.getElementById('rewarded-ad-button');
const status=document.getElementById('rewarded-ad-status');
if(button&&status){
  button.disabled=true;
  button.setAttribute('aria-disabled','true');
  status.textContent='Google reklam onayı bekleniyor. Reklam ödülleri henüz aktif değil.';
}
