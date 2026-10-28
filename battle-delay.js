// Server-owned initiative delay. A delayed hero still gets exactly one turn;
// this never removes actions, grants extra actions, or changes raw speed.
const scheduledId=entry=>entry.id??entry.unit?.id;
export function applyHeroDelay({teams,order,cursor,round,side,actorId,targetId}){
 if(!Array.isArray(teams)||teams.length!==2||!Array.isArray(order)||!Number.isSafeInteger(cursor)||cursor<0||cursor>order.length||!Number.isInteger(round)||round<1||![0,1].includes(side))throw Error('Invalid hero delay state');
 const actor=teams[side].find(unit=>unit.id===actorId&&unit.hp>0);
 const target=teams[1-side].find(unit=>unit.id===targetId&&unit.hp>0);
 if(!actor||!target||round%3!==0||actor.active?.effect!=='burst'||actor.active.delay!==true)return null;
 // Protect the delayed action and the complete following round. A second
 // source cannot keep rescheduling the same action or perpetually end-lock it.
 if(Number.isInteger(target.delayProtectedThroughRound)&&round<=target.delayProtectedThroughRound)return null;
 const index=order.findIndex(entry=>entry.side===1-side&&scheduledId(entry)===targetId);
 if(index<0)return null;
 const dueRound=index<cursor?round+1:round;
 target.delayDueRound=dueRound;
 target.delayProtectedThroughRound=dueRound+1;
 if(dueRound===round){const [entry]=order.splice(index,1);order.push(entry);}
 return {round,side,actor:actorId,action:'delay',target:targetId,value:0,dueRound,protectedThroughRound:dueRound+1};
}
// Called after any completed hero action, including heal-only turns. Pending
// markers are presentation/scheduling state, not a second opportunity to act.
export function finishHeroDelay(unit,round){
 if(unit&&Number.isInteger(unit.delayDueRound)&&unit.delayDueRound<=round)delete unit.delayDueRound;
}
