// Cosmetic only: the latest server snapshot owns hero health and the result.
// A slow/background tab must not retain an unbounded chain of stale animations.
const pending=[],MAX_PENDING=12,MAX_CAST_EVENTS=32;
let lastVersion=0,timer=null,stopped=false;
function clearPlayback(){
 pending.length=0;
 if(timer!==null){clearTimeout(timer);timer=null;}
}
function playNext(){
 if(stopped||document.hidden){clearPlayback();return;}
 const cast=pending.shift();if(!cast)return;
 // One committed version is one hero action, including every splash/shield/heal.
 // Dispatch synchronously so all targets share the same visual cast, without
 // delaying or replaying the authoritative health snapshot.
 for(const entry of cast)window.dispatchEvent(new CustomEvent('heroarena:experimental-move',{detail:{event:entry}}));
 timer=setTimeout(()=>{timer=null;playNext();},220);
}
window.addEventListener('heroarena:commander-round',event=>{
 const {round,events,teams}=event.detail||{};
 if(stopped||!Number.isInteger(round)||round<1||!Array.isArray(events)||!Array.isArray(teams)||teams.length!==2)return;
 const fresh=events.filter(entry=>Number.isSafeInteger(entry?.version)&&entry.version>lastVersion);
 for(const entry of fresh)lastVersion=Math.max(lastVersion,entry.version);
 if(document.hidden){clearPlayback();return;}
 const casts=new Map();
 for(const entry of fresh){
  if(typeof entry.actor!=='string'||entry.actor.startsWith('commander:'))continue;
  if(!casts.has(entry.version))casts.set(entry.version,[]);
  const cast=casts.get(entry.version);
  // Defensive limit: omit an oversized decorative cast whole, never retain an
  // unbounded group or show a misleading subset of its targets.
  if(cast&&cast.length<MAX_CAST_EVENTS)cast.push(entry);else casts.set(entry.version,null);
 }
 for(const cast of casts.values())if(cast)pending.push(cast);
 // Evict whole stale casts rather than cutting a multi-target special in half.
 if(pending.length>MAX_PENDING)pending.splice(0,pending.length-MAX_PENDING);
 if(timer===null)playNext();
});
window.addEventListener('heroarena:ready',()=>{clearPlayback();lastVersion=0;stopped=false;});
window.addEventListener('heroarena:battle-finished',()=>{stopped=true;clearPlayback();});
window.addEventListener('heroarena:connection-lost',()=>{stopped=true;clearPlayback();});
window.addEventListener('pagehide',clearPlayback);
document.addEventListener?.('visibilitychange',()=>{if(document.hidden)clearPlayback();});
