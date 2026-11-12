// Legacy version-1 saved battle compatibility. New preparation uses
// battle-center-defense.js; do not install targeting immunity in new battles.
// Only fresh combat preparation calls this initializer. The ordered roster is
// the same order rendered by the arena: in a 2-front/3-back formation its second
// rear hero is protected until any of the other four heroes first dies.
// A saved battle without this versioned mark keeps its original targeting.
export function initializeCenterProtection(team){
 if(!Array.isArray(team)||team.length!==5||team.some(unit=>!unit||typeof unit.id!=='string'||!unit.id||!Number.isFinite(unit.hp)||unit.hp<=0)||new Set(team.map(unit=>unit.id)).size!==5)return team;
 // Never reconstruct or re-arm a saved mark after casualties or a revival.
 if(team.some(unit=>Object.hasOwn(unit,'centerProtection')))return team;
 const front=team.filter(unit=>unit.lane==='front'),rear=team.filter(unit=>unit.lane==='back');
 if(front.length!==2||rear.length!==3)return team;
 const center=rear[1];
 center.centerProtection={version:1,protectorIds:team.filter(unit=>unit!==center).map(unit=>unit.id),broken:false};
 return team;
}

function validMark(unit){
 const mark=unit?.centerProtection;
 return mark?.version===1&&Array.isArray(mark.protectorIds)&&mark.protectorIds.length===4&&new Set(mark.protectorIds).size===4&&mark.protectorIds.every(id=>typeof id==='string'&&id&&id!==unit.id)?mark:null;
}

export function isCenterProtected(unit,team){
 const mark=validMark(unit);
 return !!(unit?.hp>0&&mark&&mark.broken===false&&mark.protectorIds.every(id=>team.some(ally=>ally.id===id&&ally.hp>0)));
}

// Settle the first actual death in the same atomic damage transaction, including
// splash/commander damage and execute. A 1-HP death guard does not break cover.
// Keep the broken mark through revival, snapshots, reconnects and later rounds.
export function breakCenterProtectionOnDeath(unit,team){
 if(unit?.hp!==0||!Array.isArray(team))return;
 for(const ally of team){
  const mark=validMark(ally);
  if(mark&&mark.protectorIds.includes(unit.id))mark.broken=true;
 }
}
