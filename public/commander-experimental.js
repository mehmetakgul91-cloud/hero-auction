import {createMagicCastControls} from './commander-magic-cast-controls.js?v=magic-selection-20261021';

// Authenticated two-seat controls for the server-owned live arena.
function initializeCommanderControls(){
 const params=new URLSearchParams(location.search);
 const panel=document.getElementById('experimental-commander-controls');
 if(!panel||params.get('commanderTest')!=='1'||!params.has('auctionCode')||!params.has('auctionToken')||window.__heroArenaCommanderControlsInitialized)return;
 window.__heroArenaCommanderControlsInitialized=true;
 const code=params.get('auctionCode'),token=params.get('auctionToken');
 const $=s=>panel.querySelector(s),normal=$('[data-command="normal"]'),ultimate=$('[data-command="ultimate"]'),pass=$('[data-command="pass"]');
 const energy=$('[data-energy]'),meter=$('[data-energy-meter]'),fill=$('[data-energy-fill]'),status=$('[data-status]');
 let state=null,busy=false,refreshing=false,stopped=false,lastVersion=0,effectLockUntil=0,interval=null,magicControls=null;
 panel.hidden=false;if(pass)pass.hidden=true;
 function canCast(ability){
  const own=state?.abilities?.[state.side]||{};
  return !stopped&&!busy&&!!state&&!state.finished&&Date.now()>=Math.max(effectLockUntil,window.heroCommanderEffectUntil||0)&&Number(own.cooldownMs||0)<=0&&Number(own.energy)>=(ability==='ultimate'?100:40);
 }
 function renderControls(){
  const selecting=!!magicControls?.isSelecting();
  normal.hidden=ultimate.hidden=selecting;
  normal.disabled=!canCast('normal');ultimate.disabled=!canCast('ultimate');
  if(!selecting&&state)status.textContent=state.finished?'Savaş tamamlandı':`Tur ${state.round} · Sv. ${state.abilityStats?.level||0} · Beceri +%${state.abilityStats?.bonusPercent||0} · +${state.abilityStats?.energyPerRound||12} enerji/tur`;
 }
 function finish(){
  stopped=true;panel.hidden=true;magicControls?.destroy();magicControls=null;normal.disabled=ultimate.disabled=true;
  if(interval!==null){clearInterval(interval);interval=null;}
 }
 window.addEventListener('heroarena:battle-finished',finish);
 async function request(method='GET',payload){
  const url='/api/experimental/commander-live'+(method==='GET'?'?code='+encodeURIComponent(code)+'&token='+encodeURIComponent(token)+'&sinceVersion='+lastVersion:'');
  const response=await fetch(url,{method,headers:method==='POST'?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify({...payload,code,token,sinceVersion:lastVersion}):undefined,cache:'no-store',signal:AbortSignal.timeout(8000)});
  const data=await response.json();if(!response.ok){const error=Error(data.error||'Canlı savaş bağlantısı kurulamadı');error.status=response.status;throw error;}return data;
 }
 function applySnapshot(data){
  if(stopped||Number(data.version)<lastVersion||state?.finished&&!data.finished)return;
  const battleChanged=!state||!Number.isSafeInteger(data.version)||data.version!==state.version||data.finished!==state.finished;
  state=data;const own=data.abilities?.[data.side]||{};
  effectLockUntil=Date.now()+Math.max(0,Number(own.effectLockMs)||0);
  const value=Math.max(0,Math.min(100,Number(own.energy)||0));
  energy.textContent=value+' / 100';meter.setAttribute('aria-valuenow',String(value));fill.style.width=value+'%';renderControls();
  if(battleChanged&&Array.isArray(data.teams)){
   window.dispatchEvent(new CustomEvent('heroarena:experimental-round-end',{detail:{round:data.round,teams:data.teams,finished:data.finished,winner:data.winner,summary:data.summary,version:data.version,events:data.events||[]}}));
   window.dispatchEvent(new CustomEvent('heroarena:commander-round',{detail:{round:data.round,events:data.events||[],teams:data.teams,finished:data.finished}}));
   // Preserve target selection while applying changed health snapshots.
   magicControls?.refresh(data.teams[1-data.side]);
  }
  lastVersion=Math.max(lastVersion,Number(data.version)||0);
  window.dispatchEvent(new CustomEvent('heroarena:commander-state',{detail:data}));
  if(data.finished)finish();
 }
 async function refresh(){
  if(stopped||busy||refreshing)return;
  refreshing=true;
  try{applySnapshot(await request())}
  catch(e){if(!stopped){
   status.textContent='⚠ '+e.message;
   if([403,404,410].includes(e.status)||/bulunamadı|sona erdi/i.test(e.message)){
    finish();window.dispatchEvent(new CustomEvent('heroarena:connection-lost'));
   }
  }}
  finally{refreshing=false}
 }
 async function sendCast({ability,targetIds}){
  if(!canCast(ability))throw Error('Yetenek henüz hazır değil.');
  busy=true;normal.disabled=ultimate.disabled=true;status.textContent='Yetenek sunucuya gönderiliyor…';
  try{applySnapshot(await request('POST',{ability,requestId:crypto.randomUUID().replaceAll('-','_'),targetIds}))}
  finally{busy=false;renderControls();void refresh()}
 }
 function cast(ability){
  if(!canCast(ability))return;
  if(state.commanderId==='magic'){
   if(!magicControls)magicControls=createMagicCastControls({
    enemyRoot:document.getElementById(state.side===0?'team-b':'team-a'),
    confirmButton:$('[data-magic-confirm]'),cancelButton:$('[data-magic-cancel]'),status,canCast,onCast:sendCast,
    onSelectionChange:active=>{normal.hidden=ultimate.hidden=active;if(!active)renderControls()}
   });
   magicControls.begin(ability,state.teams[1-state.side]);
  }else void sendCast({ability}).catch(e=>{if(!stopped)status.textContent='⚠ '+e.message});
 }
 window.addEventListener('heroarena:commander-effect-lock',()=>{
  renderControls();if(state)magicControls?.refresh(state.teams[1-state.side]);
  if(Date.now()>=(window.heroCommanderEffectUntil||0))void refresh();
 });
 normal.addEventListener('click',()=>cast('normal'));ultimate.addEventListener('click',()=>cast('ultimate'));
 void refresh();interval=setInterval(()=>{if(stopped){clearInterval(interval);return}if(!document.hidden)void refresh()},700);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
}
initializeCommanderControls();
window.addEventListener('heroarena:route-change',initializeCommanderControls);
