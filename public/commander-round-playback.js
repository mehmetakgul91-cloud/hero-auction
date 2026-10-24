// Cosmetic only: the latest server snapshot owns hero health and the result.
// A slow/background tab must not retain an unbounded chain of stale animations.
const pending=[],MAX_PENDING=12;
let lastVersion=0,timer=null,stopped=false;
function clearPlayback(){
 pending.length=0;
 if(timer!==null){clearTimeout(timer);timer=null;}
}
function playNext(){
 if(stopped||document.hidden){clearPlayback();return;}
 const entry=pending.shift();if(!entry)return;
 window.dispatchEvent(new CustomEvent('heroarena:experimental-move',{detail:{event:entry}}));
 timer=setTimeout(()=>{timer=null;playNext();},220);
}
window.addEventListener('heroarena:commander-round',event=>{
 const {round,events,teams}=event.detail||{};
 if(stopped||!Number.isInteger(round)||round<1||!Array.isArray(events)||!Array.isArray(teams)||teams.length!==2)return;
 const fresh=events.filter(entry=>Number.isSafeInteger(entry?.version)&&entry.version>lastVersion);
 for(const entry of fresh)lastVersion=Math.max(lastVersion,entry.version);
 if(document.hidden){clearPlayback();return;}
 for(const entry of fresh)if(typeof entry.actor==='string'&&!entry.actor.startsWith('commander:'))pending.push(entry);
 if(pending.length>MAX_PENDING)pending.splice(0,pending.length-MAX_PENDING);
 if(timer===null)playNext();
});
window.addEventListener('heroarena:ready',()=>{clearPlayback();lastVersion=0;stopped=false;});
window.addEventListener('heroarena:battle-finished',()=>{stopped=true;clearPlayback();});
window.addEventListener('heroarena:connection-lost',()=>{stopped=true;clearPlayback();});
window.addEventListener('pagehide',clearPlayback);
document.addEventListener?.('visibilitychange',()=>{if(document.hidden)clearPlayback();});
