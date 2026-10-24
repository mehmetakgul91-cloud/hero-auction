// Shared CrazyGames adapter. Basic Launch never requests advertisements.
(()=>{
 if(window.HeroPlatform?.basicLaunch)return;
 const navigationKey='hero-auction-cg-loading-navigation-v1';
 const internalTransition=consumeNavigation();
 let loadingStarted=false,loadingStopped=false,resumeGameplay=null;
 let sdk=null,playing=false,reported=false,loaded=false,roomData=null,roomReported='',joinHandler=null,pendingJoin=null,watching=false;
 const platform=window.HeroPlatform={basicLaunch:true,muteAudio:false,disableChat:true,
  gameplay(active){playing=Boolean(active);flush()},
  loaded(){loaded=true;finishLoading()},
  beforeNavigate(url){
   try{
    const from=new URL(window.location.href),to=new URL(url,from);
    if(to.origin!==from.origin||!to.pathname.startsWith('/crazygames/')||to.href===from.href||to.pathname===from.pathname&&to.search===from.search)return false;
    // Only a completed game boot can hand off to another internal screen.
    // This ticket is single-use, destination-bound, and never applies to reloads.
    if(internalTransition||loadingStopped){
     from.hash='';to.hash='';
     try{window.sessionStorage.setItem(navigationKey,JSON.stringify({from:from.href,to:to.href,at:Date.now()}))}catch{}
    }
    if(resumeGameplay===null)resumeGameplay=playing;platform.gameplay(false);return true;
   }catch{return false}
  },
  watchAccount(){watching=true},
  async identity(){
   await platform.ready;
   if(!sdk?.user?.isUserAccountAvailable)return {kind:'guest'};
   try{return {kind:'user',credential:await sdk.user.getUserToken()}}
   catch(e){if(e?.code==='userNotAuthenticated')return {kind:'guest'};throw Error('CrazyGames hesabına bağlanılamadı. Lütfen tekrar dene.')}
  },
  setRoom(room){
   roomData=room&&room.mode!=='bot'?{roomId:String(room.code),isJoinable:room.phase==='waiting'&&!room.players?.[1],inviteParams:{roomCode:String(room.code)}}:null;
   flushRoom();
  },
  onJoin(handler){joinHandler=handler;if(pendingJoin){const code=pendingJoin;pendingJoin=null;void handler(code)}},
  takeInviteCode(){const code=pendingJoin;pendingJoin=null;return code},
  get instantMultiplayer(){return Boolean(sdk?.game?.isInstantMultiplayer)},
  async inviteLink(code){
   await platform.ready;
   if(sdk)return sdk.game.inviteLink({roomCode:String(code)});
   const url=new URL('/crazygames/',location.origin);url.searchParams.set('join',code);return url.href;
  },
  async requestRewarded(){return {completed:false,reason:'adsDisabledBasicLaunch'}}
 };
 function consumeNavigation(){
  try{
   const raw=window.sessionStorage.getItem(navigationKey);
   window.sessionStorage.removeItem(navigationKey);
   if(!raw||window.performance.getEntriesByType('navigation')[0]?.type!=='navigate')return false;
   const ticket=JSON.parse(raw),here=new URL(window.location.href),from=new URL(document.referrer);
   here.hash='';from.hash='';
   return ticket.to===here.href&&ticket.from===from.href&&from.origin===here.origin&&here.pathname.startsWith('/crazygames/')&&Number.isFinite(ticket.at)&&Date.now()-ticket.at>=0&&Date.now()-ticket.at<60000;
  }catch{return false}
 }
 function finishLoading(){
  if(!sdk||!loaded||internalTransition||!loadingStarted||loadingStopped)return;
  if(call('loadingStop'))loadingStopped=true;
 }
 // Ordinary same-tab game links are transitions, not a fresh game boot.
 document.addEventListener?.('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target?.closest?.('a[href]');
  if(!link||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
  platform.beforeNavigate(link.href);
 });
 window.addEventListener?.('pageshow',event=>{
  if(event.persisted&&resumeGameplay!==null){const active=resumeGameplay;resumeGameplay=null;platform.gameplay(active)}
 });
 function call(method,...args){try{if(typeof sdk?.game?.[method]!=='function')return false;sdk.game[method](...args);return true}catch(error){console.warn('CrazyGames event unavailable',method);return false}}
 function flush(){if(!sdk||playing===reported)return;call(playing?'gameplayStart':'gameplayStop');reported=playing}
 function flushRoom(){if(!sdk)return;const value=JSON.stringify(roomData);if(value===roomReported)return;if(roomData)call('updateRoom',roomData);else call('leftRoom');roomReported=value}
 function receiveJoin(params){const code=String(params?.roomCode||'');if(!/^\d{3}$/.test(code))return;if(joinHandler)void joinHandler(code);else pendingJoin=code}
 // This distribution has no chat moderation service, so chat stays unavailable.
 function settings(value={}){platform.muteAudio=Boolean(value.muteAudio);platform.disableChat=true;document.documentElement.classList.toggle('cg-chat-disabled',true);window.dispatchEvent(new CustomEvent('hero:platform-settings'));}
 platform.ready=new Promise(resolve=>{
  let finished=false;
  const finish=()=>{if(finished)return;finished=true;clearTimeout(timeout);resolve()};
  const timeout=setTimeout(finish,8000);
  const script=document.createElement('script');script.src='https://sdk.crazygames.com/crazygames-sdk-v3.js';script.async=true;
  script.onerror=finish;
  script.onload=async()=>{try{
   const candidate=window.CrazyGames?.SDK;if(!candidate)return;await candidate.init();if(!['local','crazygames'].includes(candidate.environment))return;
   const late=finished;sdk=candidate;if(!internalTransition)loadingStarted=call('loadingStart');settings(sdk.game.settings);sdk.game.addSettingsChangeListener?.(settings);
   sdk.user?.addAuthListener?.(()=>{if(watching)window.dispatchEvent(new CustomEvent('hero:platform-auth'))});
   sdk.game.addJoinRoomListener?.(receiveJoin);receiveJoin(sdk.game.inviteParams);
   finishLoading();flush();flushRoom();
   if(late&&watching)window.dispatchEvent(new CustomEvent('hero:platform-auth'));
  }catch(error){console.warn('CrazyGames SDK unavailable; continuing as guest')}finally{finish()}};
  document.head.append(script);
 });
 const staticReady=()=>{if(/\/(?:ligler|crazygames-privacy)\.html$/.test(window.location?.pathname||''))platform.loaded()};
 if(document.readyState==='loading')document.addEventListener?.('DOMContentLoaded',staticReady,{once:true});else staticReady();
})();
