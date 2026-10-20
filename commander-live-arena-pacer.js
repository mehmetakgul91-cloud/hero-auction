// Experimental, server-owned paced hero actions. No browser-provided damage or turn commands.
// Clock is injected so deterministic tests never need real timers.
export function createLiveArenaPacer({registry,matchKey,intervalMs=900,clock=()=>Date.now(),token}){
 if(!registry||typeof registry.stepServerHero!=='function'||typeof registry.advanceServerRound!=='function'||typeof registry.snapshot!=='function'||typeof matchKey!=='string'||!matchKey||typeof token!=='string'||!token||!Number.isSafeInteger(intervalMs)||intervalMs<100)throw Error('Invalid live arena pacer');
 let running=false,nextAt=null,finished=false,steps=0;
 return {
  start(now=clock()){
   if(finished)throw Error('Arena pacer finished');
   if(!Number.isFinite(now))throw Error('Invalid pacer clock');
   if(!running){running=true;nextAt=now+intervalMs}
   return {running,nextAt};
  },
  stop(){running=false;nextAt=null;return {running}},
  tick(now=clock()){
   if(!Number.isFinite(now))throw Error('Invalid pacer clock');
   if(!running||finished||now<nextAt)return {advanced:false,running,finished,nextAt};
   // Read-only server snapshot determines boundaries; never infer them from arbitrary errors.
   const state=registry.snapshot({matchKey,token,now});
   if(state.finished||state.round>=15&&!state.nextHero){
    running=false;finished=true;nextAt=null;
    return {advanced:false,running,finished,nextAt};
   }
   const kind=state.nextHero?'hero':'round';
   const action=kind==='hero'?registry.stepServerHero(matchKey):registry.advanceServerRound(matchKey);
   steps++;
   nextAt=now+intervalMs;
   return {advanced:true,kind,action,running,finished,nextAt,steps};
  },
  status(){return {running,finished,nextAt,steps}}
 };
}
