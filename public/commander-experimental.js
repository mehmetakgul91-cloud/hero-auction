import {getCommanderAbilityCost} from './commander-ability-rules.js';
import {createMagicCastControls} from './commander-magic-cast-controls.js?v=commander-ultimate-selection';
import {commanderTargetMode,requiredMagicTargets} from './commander-magic-target-picker.js';
import {commanderUltimateName,commanderUltimateDescription} from './commander-ultimate-presentation.js';

// Authenticated two-seat controls for the server-owned live arena.
function initializeCommanderControls(){
 const params=new URLSearchParams(location.search);
 const panel=document.getElementById('experimental-commander-controls');
 if(!panel||params.get('commanderTest')!=='1'||!params.has('auctionCode')||!params.has('auctionToken')||window.__heroArenaCommanderControlsInitialized)return;
 window.__heroArenaCommanderControlsInitialized=true;
 const code=params.get('auctionCode'),token=params.get('auctionToken');
 const $=s=>panel.querySelector(s),normal=$('[data-command="normal"]'),ultimate=$('[data-command="ultimate"]'),pass=$('[data-command="pass"]');
 const energy=$('[data-energy]'),meter=$('[data-energy-meter]'),fill=$('[data-energy-fill]'),ultimateEnergy=$('[data-ultimate-energy]'),ultimateMeter=$('[data-ultimate-energy-meter]'),ultimateFill=$('[data-ultimate-energy-fill]'),status=$('[data-status]');
 let state=null,busy=false,refreshing=false,stopped=false,lastVersion=0,effectLockUntil=0,interval=null,magicControls=null;
 panel.hidden=false;if(pass)pass.hidden=true;
 function ultimateUsed(){return !!state?.ultimateUsed?.[state.side]||(state?.commanderId==='support'&&!!state?.revivalUsed?.[state.side]);}
 function canCast(ability){
  const own=state?.abilities?.[state.side]||{};
  if(!state)return false;
  if(ability==='ultimate'&&ultimateUsed())return false;
  const mode=commanderTargetMode(state.commanderId,ability);
  if(mode&&!requiredMagicTargets(ability,targetHeroes(ability),targetContext(ability)))return false;
  return !stopped&&!busy&&!!state&&!state.finished&&Date.now()>=Math.max(effectLockUntil,window.heroCommanderEffectUntil||0)&&Number(own.cooldownMs||0)<=0&&Number(ability==='ultimate'?own.ultimateEnergy:own.energy)>=getCommanderAbilityCost(state.commanderId,ability);
 }
 function targetHeroes(ability){return state?.teams?.[commanderTargetMode(state.commanderId,ability)==='enemy-alive'?1-state.side:state.side]||[];}
 function targetContext(ability){return {commanderId:state?.commanderId,excludedTargetIds:state?.commanderId==='magic'&&ability==='ultimate'?targetHeroes(ability).filter(hero=>Number.isInteger(hero.arcaneSurgeUntilRound)&&hero.arcaneSurgeUntilRound>=state.round).map(hero=>hero.id):[]};}
 function refreshSelection(){if(ultimateUsed()&&magicControls?.selectedAbility()==='ultimate'){magicControls.cancel();return;}const selected=magicControls?.selectedAbility();if(selected)magicControls.refresh(targetHeroes(selected),targetContext(selected));}
 function renderControls(){
  const selecting=!!magicControls?.isSelecting();
  normal.hidden=ultimate.hidden=selecting;
  if(state){normal.textContent='Normal · '+getCommanderAbilityCost(state.commanderId,'normal');ultimate.textContent=commanderUltimateName(state.commanderId)+' · '+(ultimateUsed()?'Kullanıldı':getCommanderAbilityCost(state.commanderId,'ultimate'));ultimate.title=commanderUltimateDescription(state.commanderId);}
  normal.disabled=!canCast('normal');ultimate.disabled=!canCast('ultimate');
  if(!selecting&&state)status.textContent=state.finished?'Savaş tamamlandı':`Tur ${state.round} · Sv. ${state.abilityStats?.level||0} · Beceri +%${state.abilityStats?.bonusPercent||0} · +${state.abilityStats?.energyPerRound||12} / tur (${ultimateUsed()?'normal':'normal + ulti'})`;
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
  energy.textContent=value+' / 100';meter.setAttribute('aria-valuenow',String(value));fill.style.width=value+'%';
  const used=ultimateUsed(),charge=used?0:Math.max(0,Math.min(100,Number(own.ultimateEnergy)||0));
  ultimateEnergy.textContent=used?'Kullanıldı':charge+' / 100';ultimateMeter.setAttribute('aria-valuenow',String(charge));ultimateMeter.setAttribute('aria-valuetext',used?'Kullanıldı':charge+' / 100');ultimateFill.style.width=charge+'%';renderControls();
  if(battleChanged&&Array.isArray(data.teams)){
   window.dispatchEvent(new CustomEvent('heroarena:experimental-round-end',{detail:{round:data.round,teams:data.teams,finished:data.finished,winner:data.winner,summary:data.summary,version:data.version,events:data.events||[]}}));
   window.dispatchEvent(new CustomEvent('heroarena:commander-round',{detail:{round:data.round,events:data.events||[],teams:data.teams,finished:data.finished}}));
   // Preserve target selection while applying changed health snapshots.
  }
  refreshSelection();
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
  if(commanderTargetMode(state.commanderId,ability)){
   if(!magicControls)magicControls=createMagicCastControls({
    enemyRoot:document.getElementById(state.side===0?'team-b':'team-a'),allyRoot:document.getElementById(state.side===0?'team-a':'team-b'),commanderId:state.commanderId,
    confirmButton:$('[data-magic-confirm]'),cancelButton:$('[data-magic-cancel]'),status,canCast,onCast:sendCast,
    onSelectionChange:active=>{normal.hidden=ultimate.hidden=active;if(!active)renderControls()}
   });
   magicControls.begin(ability,targetHeroes(ability),targetContext(ability));
  }else void sendCast({ability}).catch(e=>{if(!stopped)status.textContent='⚠ '+e.message});
 }
 window.addEventListener('heroarena:commander-effect-lock',()=>{
  renderControls();if(state)refreshSelection();
  if(Date.now()>=(window.heroCommanderEffectUntil||0))void refresh();
 });
 normal.addEventListener('click',()=>cast('normal'));ultimate.addEventListener('click',()=>cast('ultimate'));
 void refresh();interval=setInterval(()=>{if(stopped){clearInterval(interval);return}if(!document.hidden)void refresh()},700);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
}
initializeCommanderControls();
window.addEventListener('heroarena:route-change',initializeCommanderControls);
