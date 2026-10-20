// Server-time based cooldown view for the live commander arena.
function initializeCommanderCooldown(){
 const params=new URLSearchParams(location.search);
 const panel=document.getElementById('experimental-commander-controls');
 if(!panel||params.get('commanderTest')!=='1'||!params.has('auctionCode')||!params.has('auctionToken')||panel.dataset.cooldownInitialized)return;
 panel.dataset.cooldownInitialized='true';
 const label=panel.querySelector('[data-live-cooldown]');
 const code=params.get('auctionCode'),token=params.get('auctionToken');
 let expiresAt=0,active=false;
 const render=()=>{if(!active)return;const remaining=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));label.textContent=remaining>0?'Yetenek bekleme süresi: '+remaining+' saniye':'Anlık yetenekler savaş motoru bağlantısını bekliyor'};
 const poll=async()=>{if(document.hidden)return;try{const started=Date.now();const response=await fetch('/api/experimental/commander-live?code='+encodeURIComponent(code)+'&token='+encodeURIComponent(token),{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Sunucuya ulaşılamadı');const received=Date.now();expiresAt=received+Math.max(0,Number(data.cooldownMs)||0);active=true;render()}catch(error){active=false;label.textContent='Anlık yetenek durumu: '+error.message}};
 void poll();setInterval(render,200);setInterval(poll,2500);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll()});
}
initializeCommanderCooldown();
window.addEventListener('heroarena:route-change',initializeCommanderCooldown);
