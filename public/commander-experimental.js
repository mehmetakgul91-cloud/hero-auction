// Experimental controls, isolated from normal arena playback.
const params=new URLSearchParams(location.search);
const panel=document.getElementById('experimental-commander-controls');
if(panel&&params.get('commanderTest')==='1'&&params.has('auctionCode')&&params.has('auctionToken')){
 const code=params.get('auctionCode'),token=params.get('auctionToken');
 const status=panel.querySelector('[data-status]');
 const energy=panel.querySelector('[data-energy]');
 const meter=panel.querySelector('[data-energy-meter]');
 const fill=panel.querySelector('[data-energy-fill]');
 const buttons=[...panel.querySelectorAll('[data-command]')];
 let state=null,busy=false,requestId=0,stopped=false;
 panel.hidden=false;
 function showError(message){status.textContent='⚠ '+message}
 function updateButtons(){
  for(const button of buttons){
   const command=button.dataset.command;
   button.disabled=busy||!state||state.finished||(command==='normal'&&!state.canUseNormal)||(command==='ultimate'&&!state.canUseUltimate);
  }
 }
 async function refresh(){
  if(busy||stopped)return;
  const id=++requestId;
  try{
   const response=await fetch('/api/experimental/commander-turn?code='+encodeURIComponent(code)+'&token='+encodeURIComponent(token),{cache:'no-store'});
   const data=await response.json();
   if(id!==requestId||busy)return;
   if(!response.ok){
    state=null;updateButtons();showError(data.error||'Komutan servisi kullanılamıyor');
    if(response.status===404)stopped=true;
    return;
   }
   state=data;
   const value=Math.max(0,Math.min(100,Number(data.energy)||0));
   energy.textContent=value+' / 100';
   meter.setAttribute('aria-valuenow',String(value));
   fill.style.width=value+'%';
   status.textContent=data.finished?'Savaş tamamlandı':'Tur '+data.round+' · '+(data.submitted[data.yourSide]?'Komut kaydedildi; rakip bekleniyor':'Komutunu seç');
   updateButtons();
  }catch(error){if(id===requestId&&!busy)showError(error.message)}
 }
 for(const button of buttons)button.addEventListener('click',async()=>{
  if(busy||!state||state.finished||button.disabled)return;
  busy=true;requestId++;updateButtons();
  try{
   const response=await fetch('/api/experimental/commander-turn',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code,token,round:state.round,command:button.dataset.command})
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Komut reddedildi');
   status.textContent=data.ready?'Tur tamamlandı':'Komut kaydedildi; rakip bekleniyor';
  }catch(error){showError(error.message)}
  finally{busy=false;await refresh();updateButtons()}
 });
 await refresh();
 const interval=setInterval(()=>{if(stopped){clearInterval(interval);return}if(!document.hidden)void refresh()},2500);
}
