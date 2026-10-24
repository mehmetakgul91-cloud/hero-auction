// One lazy HTMLAudioElement preserves Safari gesture permission and does not
// fetch/decode the whole playlist. A match keeps its selected track on resume.
export function createArenaAudio({audio,canPlay,canPrime=()=>false,fallbackSrc,volume=.60,startProcedural=()=>{},stopProcedural=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,loadTimeoutMs=15000}){
 audio.loop=true;audio.preload='none';audio.volume=volume;
 let track=null,stage=0,mode='stopped',version=0,pending=null,watchdog=null,assigned=false,destroyed=false;
 const allowed=()=>!destroyed&&(mode==='play'?canPlay():mode==='prime'&&canPrime());
 const clearWatchdog=()=>{if(watchdog!==null){clearTimer(watchdog);watchdog=null}};
 function stop(){mode='stopped';version++;pending=null;clearWatchdog();audio.pause();stopProcedural()}
 function release(){stop();assigned=false;audio.removeAttribute('src');audio.load()}
 function assign(){
  const src=stage===0?track?.src:fallbackSrc;
  if(!src)return false;
  if(!assigned){audio.src=src;audio.load();assigned=true}
  return true;
 }
 function watch(token){
  if(watchdog!==null)return;
  watchdog=setTimer(()=>{watchdog=null;if(token===version&&allowed())fail(token)},loadTimeoutMs);
 }
 function fail(token){
  if(token!==version||!allowed())return;
  version++;pending=null;clearWatchdog();audio.pause();assigned=false;
  if(stage===0&&fallbackSrc){stage=1;void playCurrent()}
  else{stage=2;audio.removeAttribute('src');audio.load();if(mode==='play'&&allowed())startProcedural()}
 }
 function playCurrent(){
  if(!track||!allowed())return Promise.resolve(false);
  if(stage===2){if(mode==='play')startProcedural();return Promise.resolve(false)}
  // muted, rather than only volume=0, also guarantees silent priming on iOS.
  audio.muted=mode==='prime';audio.volume=mode==='prime'?0:volume;
  if(pending)return pending;
  if(!assign())return Promise.resolve(false);
  const token=++version;
  clearWatchdog();
  watch(token);
  let result;
  // Do not await a fetch, metadata event or timer before this gesture-bound call.
  try{result=audio.play()}catch(error){result=Promise.reject(error)}
  const promise=Promise.resolve(result).then(()=>{
   if(token!==version)return false;
   pending=null;clearWatchdog();
   if(!allowed()){audio.pause();return false}
   stopProcedural();return true;
  },error=>{
   if(token!==version)return false;
   pending=null;clearWatchdog();
   // Autoplay denial is not a broken asset. Retry the same track on a gesture.
   if(error?.name!=='NotAllowedError'&&error?.name!=='AbortError')fail(token);
   return false;
  });
  if(token===version)pending=promise;return promise;
 }
 function onError(){if(audio.error)fail(version)}
 function onPlaying(){clearWatchdog();if(allowed())stopProcedural();else audio.pause()}
 function onWaiting(){if(allowed()&&stage<2)watch(version)}
 audio.addEventListener('error',onError);audio.addEventListener('playing',onPlaying);
 audio.addEventListener('waiting',onWaiting);audio.addEventListener('stalled',onWaiting);
 return {
  setTrack(next){
   if(destroyed||track?.id===next?.id)return;
   release();track=next;stage=0;
  },
  play(){if(destroyed)return Promise.resolve(false);mode='play';return playCurrent()},
  prime(){if(destroyed)return Promise.resolve(false);mode='prime';return playCurrent()},
  stop,release,
  get paused(){return audio.paused},
  get track(){return track},
  destroy(){
   if(destroyed)return;
   release();destroyed=true;
   audio.removeEventListener('error',onError);audio.removeEventListener('playing',onPlaying);
   audio.removeEventListener('waiting',onWaiting);audio.removeEventListener('stalled',onWaiting);
  }
 };
}
