// CrazyGames Basic Launch: no ad UI, no external accounts, no client gold grants.
(()=>{
 let sdk=null,playing=false,reported=false,loaded=false;
 const platform=window.HeroPlatform={basicLaunch:true,muteAudio:false,disableChat:false,
  gameplay(active){playing=Boolean(active);flush()},
  loaded(){loaded=true;if(sdk)call('loadingStop')},
  // Basic Launch deliberately never requests ads or grants a reward.
  async requestRewarded(){return {completed:false,reason:'adsDisabledBasicLaunch'}}
 };
 function call(method){try{sdk?.game?.[method]?.()}catch(error){console.warn('CrazyGames event unavailable',method)}}
 function flush(){if(!sdk||playing===reported)return;call(playing?'gameplayStart':'gameplayStop');reported=playing}
 function settings(value={}){platform.muteAudio=Boolean(value.muteAudio);platform.disableChat=Boolean(value.disableChat);document.documentElement.classList.toggle('cg-chat-disabled',platform.disableChat);window.dispatchEvent(new CustomEvent('hero:platform-settings'));}
 platform.ready=new Promise(resolve=>{
  let finished=false;
  const finish=()=>{if(finished)return;finished=true;clearTimeout(timeout);resolve()};
  const timeout=setTimeout(finish,8000);
  const script=document.createElement('script');script.src='https://sdk.crazygames.com/crazygames-sdk-v3.js';script.async=true;
  script.onerror=finish;
  script.onload=async()=>{try{const candidate=window.CrazyGames?.SDK;if(!candidate)return;await candidate.init();if(!['local','crazygames'].includes(candidate.environment))return;sdk=candidate;call('loadingStart');settings(sdk.game.settings);sdk.game.addSettingsChangeListener?.(settings);if(loaded)call('loadingStop');flush()}catch(error){console.warn('CrazyGames SDK unavailable; continuing as guest')}finally{finish()}};
  document.head.append(script);
 });
})();
