// Authenticated two-seat controls for the server-owned live arena.
function initializeCommanderControls(){
 const params=new URLSearchParams(location.search);
 const panel=document.getElementById('experimental-commander-controls');
 if(!panel||params.get('commanderTest')!=='1'||!params.has('auctionCode')||!params.has('auctionToken')||window.__heroArenaCommanderControlsInitialized)return;
 window.__heroArenaCommanderControlsInitialized=true;
 const code=params.get('auctionCode'),token=params.get('auctionToken'),side=Number(params.get('seat')||0);
 const $=s=>panel.querySelector(s),normal=$('[data-command="normal"]'),ultimate=$('[data-command="ultimate"]'),pass=$('[data-command="pass"]');
 const energy=$('[data-energy]'),meter=$('[data-energy-meter]'),fill=$('[data-energy-fill]'),status=$('[data-status]');
 let state=null,busy=false,refreshing=false,stopped=false,lastVersion=0;
 panel.hidden=false;if(pass)pass.hidden=true;
 async function request(method='GET',payload){const url='/api/experimental/commander-live'+(method==='GET'?'?code='+encodeURIComponent(code)+'&token='+encodeURIComponent(token)+'&sinceVersion='+lastVersion:'');const response=await fetch(url,{method,headers:method==='POST'?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify({...payload,code,token,sinceVersion:lastVersion}):undefined,cache:'no-store',signal:AbortSignal.timeout(8000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Canlı savaş bağlantısı kurulamadı');return data}
 function applySnapshot(data){if(Number(data.version)<lastVersion||state?.finished&&!data.finished)return;state=data;const own=data.abilities?.[data.side]||{};const value=Math.max(0,Math.min(100,Number(own.energy)||0));energy.textContent=value+' / 100';meter.setAttribute('aria-valuenow',String(value));fill.style.width=value+'%';normal.disabled=busy||!!data.finished||value<40||Number(own.cooldownMs)>0;ultimate.disabled=busy||!!data.finished||value<100||Number(own.cooldownMs)>0;status.textContent=data.finished?'Savaş tamamlandı':`Canlı savaş · Tur ${data.round} · ${data.commanderId||'Komutan'}`;if(Array.isArray(data.teams)){window.dispatchEvent(new CustomEvent('heroarena:experimental-round-end',{detail:{round:data.round,teams:data.teams,finished:data.finished,events:data.events||[]}}));window.dispatchEvent(new CustomEvent('heroarena:commander-round',{detail:{round:data.round,events:data.events||[],teams:data.teams,finished:data.finished}}));}lastVersion=Math.max(lastVersion,Number(data.version)||0);}
 async function refresh(){if(stopped||busy||refreshing)return;refreshing=true;try{const data=await request();applySnapshot(data)}catch(e){status.textContent='⚠ '+e.message;if(/bulunamadı|sona erdi/i.test(e.message))stopped=true}finally{refreshing=false}}
 async function cast(ability){if(busy||!state||state.finished)return;let targetIds;const commander=state.commanderId;if(commander==='magic'){const living=state.teams[1-state.side].filter(u=>u.hp>0);const count=ability==='ultimate'?Math.min(2,living.length):1;const choices=living.map((u,i)=>`${i+1}. ${u.name}`).join('\n');const answer=window.prompt(`Hedef seç (${count}):\n${choices}`);if(answer===null)return;const indexes=answer.split(/[ ,]+/).map(v=>Number(v.trim())-1);if(indexes.length!==count||indexes.some(i=>!living[i])||new Set(indexes).size!==indexes.length){status.textContent='Hedef seçimi geçersiz';return}targetIds=indexes.map(i=>living[i].id)}
  busy=true;normal.disabled=ultimate.disabled=true;status.textContent='Yetenek sunucuya gönderiliyor…';try{const data=await request('POST',{ability,requestId:crypto.randomUUID().replaceAll('-','_'),targetIds});applySnapshot(data)}catch(e){status.textContent='⚠ '+e.message}finally{busy=false;await refresh()}}
 normal.addEventListener('click',()=>void cast('normal'));ultimate.addEventListener('click',()=>void cast('ultimate'));
 void refresh();const interval=setInterval(()=>{if(stopped){clearInterval(interval);return}if(!document.hidden)void refresh()},700);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
}
initializeCommanderControls();
window.addEventListener('heroarena:route-change',initializeCommanderControls);
