// Shared presentation cadence: about 21% shorter than the previous 1400/1900ms.
// Both intervals align with the existing 50ms server scheduler.
// Keep full source/travel/contact visuals; only their fading tail may overlap
// the next preparation. No combat stats, damage or targeting logic changes.
export const HERO_NORMAL_MS=1100;
export const HERO_SPECIAL_MS=1500;
export const HERO_BASELINE_MS=900;
export function heroActionDuration(events=[]){
 const entries=Array.isArray(events)?events:[events];
 return entries.some(e=>['special','splash'].includes(e?.damageType)||(e?.round%3===0&&['heal','shield'].includes(e?.action)))?HERO_SPECIAL_MS:HERO_NORMAL_MS;
}
export function heroPlaybackInterval(events,speed=850){
 return Math.round(heroActionDuration(events)*Math.max(.8,Math.min(1.15,(Number(speed)||850)/850)));
}
