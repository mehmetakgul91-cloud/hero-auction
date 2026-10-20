// Experimental lifecycle owner. Not imported by production server.
// Owns the registry and one server-side runner per match, with explicit cleanup.
import {createLiveArenaRegistry} from './commander-live-arena-registry.js';
import {createLiveArenaRunner} from './commander-live-arena-runner.js';
export function createLiveArenaLifecycle({registry=createLiveArenaRegistry(),intervalMs=900,clock=()=>Date.now(),scheduler=setInterval,canceller=clearInterval,onError=()=>{}}={}){
 const active=new Map();
 function stop(matchKey){
  const current=active.get(matchKey);
  if(!current)return false;
  active.delete(matchKey);
  current.runner.stop();
  registry.remove(matchKey);
  return true;
 }
 return {
  begin({matchKey,tokens,combat,options={}}){
   if(active.has(matchKey))throw Error('Live arena match already active');
   registry.register({matchKey,tokens,combat,options});
   try{
    const runner=createLiveArenaRunner({registry,matchKey,token:tokens[0],intervalMs,clock,scheduler,canceller,onError:error=>{onError(error,matchKey)}});
    active.set(matchKey,{runner,tokens:[...tokens]});
    runner.start();
    return {matchKey,running:true};
   }catch(error){active.delete(matchKey);registry.remove(matchKey);throw error}
  },
  cast(args){
   if(!active.has(args?.matchKey))throw Error('Unknown active live arena');
   return registry.cast(args);
  },
  snapshot(args){
   if(!active.has(args?.matchKey))throw Error('Unknown active live arena');
   return registry.snapshot(args);
  },
  end(matchKey){return stop(matchKey)},
  endRoom(roomCode){
   if(typeof roomCode!=='string'||!roomCode)throw Error('Invalid room code');
   let count=0;
   for(const key of [...active.keys()])if(key.startsWith(roomCode+':')){stop(key);count++}
   return count;
  },
  status(matchKey){return active.get(matchKey)?.runner.status()??null}
 };
}
