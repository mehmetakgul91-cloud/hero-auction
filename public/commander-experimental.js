// Experimental commander controls; only active when explicitly requested.
const params=new URLSearchParams(location.search);
const panel=document.getElementById('experimental-commander-controls');
if(panel&&params.get('commanderTest')==='1'&&params.has('auctionCode')&&params.has('auctionToken')){
 panel.hidden=false;
 const status=panel.querySelector('[data-status]');
 const energy=panel.querySelector('[data-energy]');
 const buttons=[...panel.querySelectorAll('[data-command]')];
 const code=params.get('auctionCode'),token=params.get('auctionToken');
 let state=null;
 async function refresh(){
  const response=await fetch('/api/experimental/commander-turn?code='+encodeURIComponent(code)+'&token='+encodeURIComponent(token),{cache:'no-store'});
  const data=await response.json();
  if(!response.ok){status.textContent=data.error||'Komutan servisi kullanılamıyor';buttons.forEach(b=>b.disabled=true);return}
  state=data;energy.textContent=data.energy+' / 100';
  for(const button of buttons){const c=button.dataset.command;button.disabled=data.finished||(c==='normal'&&!data.canUseNormal)||(c==='ultimate'&&!data.canUseUltimate)}
  status.textContent=data.finished?'Savaş tamamlandı':'Tur '+data.round+' · '+(data.submitted[data.yourSide]?'Rakip bekleniyor':'Komut seç');
 }
 for(const button of buttons)button.addEventListener('click',async()=>{
  if(!state)return;
  const response=await fetch('/api/experimental/commander-turn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,token,round:state.round,command:button.dataset.command})});
  const data=await response.json();
  if(!response.ok)status.textContent=data.error||'Komut reddedildi';
  await refresh();
 });
 refresh().catch(e=>{status.textContent=e.message});
 setInterval(()=>{if(!document.hidden)refresh().catch(e=>{status.textContent=e.message})},2500);
}
