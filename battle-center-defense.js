// Fresh preparation only. The original second rear hero receives a permanent
// starting-stat bonus; casualties, revival and reconnect never reapply it.
export function initializeCenterDefenseBonus(team){
 if(!Array.isArray(team)||team.length!==5||team.some(unit=>!unit||typeof unit.id!=='string'||!unit.id||!Number.isFinite(unit.hp)||unit.hp<=0)||new Set(team.map(unit=>unit.id)).size!==5)return team;
 // Saved battles (including the former targeting rule) are never upgraded.
 if(team.some(unit=>Object.hasOwn(unit,'centerDefenseBonus')||Object.hasOwn(unit,'centerProtection')))return team;
 const front=team.filter(unit=>unit.lane==='front'),rear=team.filter(unit=>unit.lane==='back');
 if(front.length!==2||rear.length!==3)return team;
 const center=rear[1];
 if(!Number.isFinite(center.defense)||center.defense<0)return team;
 center.defense=Math.round(center.defense*1.15);
 center.centerDefenseBonus={version:1,multiplier:1.15};
 return team;
}
