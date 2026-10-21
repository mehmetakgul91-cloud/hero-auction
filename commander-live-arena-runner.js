// Experimental server-only runner. An injected scheduler keeps production timers
// outside the combat engine and makes lifecycle behavior deterministic in tests.
import {createLiveArenaPacer} from './commander-live-arena-pacer.js';
export function createLiveArenaRunner({registry,matchKey,token,intervalMs=900,clock=()=>Date.now(),scheduler=setInterval,canceller=clearInterval,onError=()=>{},onFinish=()=>{}}){
 if(typeof scheduler!=='function'||typeof canceller!=='function'||typeof onError!=='function')throw Error('Invalid live arena runner');
 const pacer=createLiveArenaPacer({registry,matchKey,token,intervalMs,clock});
 let handle=null,lastError=null;
 function stop(){
  if(handle!==null){canceller(handle);handle=null}
  pacer.stop();
  return {running:false,lastError};
 }
 function tick(){
  if(handle===null)return {advanced:false,running:false};
  try{
   const result=pacer.tick(clock());
   if(result.finished){stop();onFinish(registry.snapshot({matchKey,token,now:clock()}));}
   return result;
  }catch(error){
   lastError=error;
   stop();
   onError(error);
   return {advanced:false,running:false,error};
  }
 }
 function start(){
  if(handle!==null)return {running:true};
  if(lastError)throw Error('Arena runner stopped after error');
  pacer.start(clock());
  handle=scheduler(tick,intervalMs);
  if(handle===null||handle===undefined){pacer.stop();throw Error('Invalid scheduler handle')}
  return {running:true};
 }
 return {start,stop,tick,status(){return {...pacer.status(),scheduled:handle!==null,lastError}}};
}
