// Shared deterministic hero action scheduler for legacy and incremental combat.
// The ordering is recalculated at round start, not after each action.
export function orderHeroActions(teams){
 if(!Array.isArray(teams)||teams.length!==2||teams.some(t=>!Array.isArray(t)))throw Error('Invalid hero teams');
 return teams.flatMap((team,side)=>team.map(unit=>({unit,side})))
  .sort((a,b)=>b.unit.speed-a.unit.speed||a.side-b.side||a.unit.position-b.unit.position);
}
// A cursor identifies the next actor; defeated actors are skipped without
// changing the round's originally scheduled order.
export function nextScheduledHeroAction(order,cursor=0){
 if(!Array.isArray(order)||!Number.isSafeInteger(cursor)||cursor<0||cursor>order.length)throw Error('Invalid action cursor');
 for(let i=cursor;i<order.length;i++)if(order[i].unit.hp>0)return {index:i,nextCursor:i+1,side:order[i].side,unit:order[i].unit};
 return null;
}
