import {HERO_NORMAL_MS,HERO_BASELINE_MS} from './public/hero-battle-timing.js';
// Match-local combat time preserves normal cooldown/reaction eligibility while
// wall time gives each authoritative hero action its readable presentation beat.
export function createReadableBattleClock({now,normalMs=HERO_NORMAL_MS,baselineMs=HERO_BASELINE_MS}){
 let wallStart=now,combatStart=now,span=normalMs;
 const time=wall=>combatStart+Math.round(Math.max(0,wall-wallStart)*baselineMs/span*1e6)/1e6;
 return {time,begin(wall,duration){combatStart=time(wall);wallStart=wall;span=duration;},
  wallDuration:combatMs=>Math.max(0,combatMs)*span/baselineMs,
  get duration(){return span}};
}
