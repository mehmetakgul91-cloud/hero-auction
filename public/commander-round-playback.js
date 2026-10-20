// Experimental committed-round playback; hero HP is updated only from server snapshots.
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let queue=Promise.resolve(),lastVersion=0;
window.addEventListener('heroarena:commander-round',event=>{
 const {round,events,teams,finished}=event.detail||{};
 if(!Number.isInteger(round)||round<1||!Array.isArray(events)||!Array.isArray(teams)||teams.length!==2)return;
 const fresh=events.filter(entry=>Number.isSafeInteger(entry?.version)&&entry.version>lastVersion);
 for(const entry of fresh)lastVersion=Math.max(lastVersion,entry.version);
 queue=queue.then(async()=>{
  // Hero actions are shown in the exact server log order; no local damage calculation.
  for(const entry of fresh){
   if(document.hidden)break;
   if(typeof entry?.actor!=='string'||entry.actor.startsWith('commander:'))continue;
   window.dispatchEvent(new CustomEvent('heroarena:experimental-move',{
    detail:{event:entry,teams}
   }));
   await sleep(220);
  }
  // The polling controller already applied the latest authoritative snapshot.
  // Queued visuals must never overwrite newer HP or a finished battle.
 }).catch(()=>{});
});
