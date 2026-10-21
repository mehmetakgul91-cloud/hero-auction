// Shared CrazyGames adapter. Basic Launch never requests advertisements.
(()=>{
 let sdk=null,playing=false,reported=false,loaded=false,roomData=null,roomReported='',joinHandler=null,pendingJoin=null,watching=false;
 const platform=window.HeroPlatform={basicLaunch:true,muteAudio:false,disableChat:true,
  gameplay(active){playing=Boolean(active);flush()},
  loaded(){loaded=true;if(sdk)call('loadingStop')},
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
 function call(method,...args){try{return sdk?.game?.[method]?.(...args)}catch(error){console.warn('CrazyGames event unavailable',method)}}
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
   const late=finished;sdk=candidate;call('loadingStart');settings(sdk.game.settings);sdk.game.addSettingsChangeListener?.(settings);
   sdk.user?.addAuthListener?.(()=>{if(watching)window.dispatchEvent(new CustomEvent('hero:platform-auth'))});
   sdk.game.addJoinRoomListener?.(receiveJoin);receiveJoin(sdk.game.inviteParams);
   if(loaded)call('loadingStop');flush();flushRoom();
   if(late&&watching)window.dispatchEvent(new CustomEvent('hero:platform-auth'));
  }catch(error){console.warn('CrazyGames SDK unavailable; continuing as guest')}finally{finish()}};
  document.head.append(script);
 });
})();
