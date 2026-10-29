// Shared presentation pace only; no combat stats, damage or targeting logic.
export const HERO_NORMAL_MS=1400;
export const HERO_SPECIAL_MS=1900;
export const HERO_BASELINE_MS=900;
export function heroActionDuration(events=[]){
 const entries=Array.isArray(events)?events:[events];
 return entries.some(e=>['special','splash'].includes(e?.damageType)||(e?.round%3===0&&['heal','shield'].includes(e?.action)))?HERO_SPECIAL_MS:HERO_NORMAL_MS;
}
export function heroPlaybackInterval(events,speed=850){
 return Math.round(heroActionDuration(events)*Math.max(.8,Math.min(1.15,(Number(speed)||850)/850)));
}
