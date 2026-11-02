// Navigation uses only a server-authenticated recovery response. Terminal rooms
// stay in the lobby document's result renderer and can never enter the arena.
export function roomResumePath(recovery) {
 const r=recovery?.room,stage=recovery?.resumeStage;
 if(!r||!recovery.token||r.idleClosed||r.forfeit||r.cancellation||!['formation','arena'].includes(stage))return null;
 const params=new URLSearchParams({auctionCode:r.code,auctionToken:recovery.token});
 if(stage==='arena'){params.set('room','arena');params.set('commanderTest','1');}
 return '/battle-preview.html?'+params;
}
