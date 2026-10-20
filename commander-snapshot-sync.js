// Applies only newer authoritative combat snapshots; never replays the same cast twice.
// A missed version is recovered by the full snapshot, not by re-applying damage.
export function createCommanderSnapshotSync(){
 return {version:0,teams:null,events:[],finished:false};
}
export function acceptCommanderSnapshot(sync,payload){
 if(!sync||!Number.isSafeInteger(sync.version)||!payload||!Number.isSafeInteger(payload.version)||payload.version<0)throw Error('Invalid commander sync version');
 if(!Array.isArray(payload.teams)||payload.teams.length!==2||payload.teams.some(team=>!Array.isArray(team)))throw Error('Invalid commander snapshot');
 if(payload.version<=sync.version)return {accepted:false,version:sync.version,events:[]};
 const events=Array.isArray(payload.events)?payload.events.filter(e=>Number.isSafeInteger(e?.version)&&e.version>sync.version&&e.version<=payload.version):[];
 sync.version=payload.version;
 sync.teams=structuredClone(payload.teams);
 sync.finished=!!payload.finished;
 sync.events.push(...structuredClone(events));
 return {accepted:true,version:sync.version,events,teams:structuredClone(sync.teams),finished:sync.finished};
}
