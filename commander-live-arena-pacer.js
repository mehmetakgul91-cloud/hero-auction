// Experimental, server-owned paced hero actions. No browser-provided damage or turn commands.
// Clock is injected so deterministic tests never need real timers.
export function createLiveArenaPacer({registry,matchKey,intervalMs=900,clock=()=>Date.now()}){
 if(!registry||typeof registry.stepServerHero!=='function'||typeof registry.advanceServerRound!=='function'||typeof matchKey!=='string'||!matchKey||!Number.isSafeInteger(intervalMs)||intervalMs<100)throw Error('Invalid live arena pacer');
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
   // One authoritative hero action per tick; never fast-forward after tab sleep.
   // At round boundaries, advance the round and schedule its first action next tick.
   let action,kind='hero';
   try{
    action=registry.stepServerHero(matchKey);
   }catch(error){
    if(!/Round not ready to advance|No pending hero|No remaining hero|Round complete/i.test(String(error?.message)))throw error;
    action=registry.advanceServerRound(matchKey);
    kind='round';
   }
   steps++;
   nextAt=now+intervalMs;
   return {advanced:true,kind,action,running,finished,nextAt,steps};
  },
  status(){return {running,finished,nextAt,steps}}
 };
}
