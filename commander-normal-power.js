import {abilityValue} from './public/hero-ability-rules.js';
import {commanderAbilityStats} from './public/commander-ability-rules.js';

function roleStat(hero,key){
 const value=hero[key]===undefined?0:hero[key];
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Invalid commander normal '+key);
 return value;
}

// Capture only after all server-side starting bonuses. This immutable basis
// survives deaths, revival and later stat changes; healing bonuses are excluded.
export function commanderNormalPower(team){
 if(!Array.isArray(team))throw Error('Invalid commander team');
 const power={attack:0,defense:0,support:0};
 for(const hero of team){
  if(!hero||typeof hero!=='object')throw Error('Invalid commander hero');
  if(hero.role==='fighter'||hero.role==='assassin')power.attack+=roleStat(hero,'attack');
  if(hero.role==='tank')power.defense+=roleStat(hero,'defense');
  if(hero.role==='support')power.support+=roleStat(hero,'attack')*abilityValue(hero.active,'healRate');
 }
 if(Object.values(power).some(value=>!Number.isFinite(value)))throw Error('Invalid commander normal power');
 return Object.freeze(power);
}

export function commanderNormalBudget(power,profile){
 const stats=commanderAbilityStats(profile),value=power?.[profile.commanderId];
 if(!['attack','defense','support'].includes(profile.commanderId)||typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Invalid commander normal power');
 // Round once, after adding the selected commander's level to the role budget.
 const total=Math.round(stats.normalBase+value*stats.normalRate);
 if(!Number.isSafeInteger(total)||total<0)throw Error('Invalid commander normal budget');
 return total;
}

export function splitCommanderNormalBudget(total,targetCount){
 if(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(targetCount)||targetCount<1)throw Error('Invalid commander normal distribution');
 const each=Math.floor(total/targetCount),remainder=total%targetCount;
 return Array.from({length:targetCount},(_,index)=>each+(index<remainder?1:0));
}
