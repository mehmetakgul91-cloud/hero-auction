// Presentation only: elapsed countdown never declares a winner or refunds money.
export function roomReturnStatus(room,{now=Date.now(),receivedAt=now,english=false}={}) {
 const p=room?.presence;
 if(!p||p.arenaExempt||room.idleClosed||room.forfeit||room.cancelled||room.mode==='bot'||!['auction','finished'].includes(room.phase))return '';
 if(p.candidate!==room.me||!Number.isFinite(p.deadline)||!p.seats?.[room.me]?.connected)return '';
 const baseline=Number.isFinite(p.serverNow)?p.serverNow:Number.isFinite(p.remainingMs)?p.deadline-p.remainingMs:null;
 if(baseline===null)return '';
 const seconds=Math.max(0,Math.ceil((p.deadline-baseline-Math.max(0,now-receivedAt))/1000));
 if(seconds===0)return english?'The return period ended. Waiting for the server to confirm the result.':'Dönüş süresi doldu. Sonucun sunucu tarafından doğrulanması bekleniyor.';
 return english?`Opponent return time: ${seconds} seconds. Stay in the room until the timer ends. If you leave too, neither player wins.`:`Rakibin için dönüş süresi: ${seconds} saniye. Süre dolana kadar odada kal. Sen de ayrılırsan kazanan olmaz.`;
}
