import {validateCommanderProfile} from './arena-commanders.js';

// Call after every server-side starting bonus. A numeric snapshot cannot change
// when its source heroes later die, revive, or gain/lose attack.
export function captureMagicNormalPower(team){
 if(!Array.isArray(team))throw Error('Invalid commander magic team');
 let power=0;
 for(const hero of team){
  if(!hero||typeof hero!=='object'||Array.isArray(hero))throw Error('Invalid commander magic hero');
  if(hero.role!=='energy')continue;
  const attack=hero.attack===undefined?0:hero.attack;
  if(typeof attack!=='number'||!Number.isFinite(attack)||attack<0)throw Error('Invalid commander magic attack');
  power+=attack;
 }
 if(!Number.isFinite(power))throw Error('Invalid commander magic power');
 return power;
}

// The server supplies its captured power and selected profile. Target selection
// and neighborhood geometry deliberately remain outside this pure calculation.
export function commanderMagicNormalBudget(power,profile){
 validateCommanderProfile(profile);
 if(profile.commanderId!=='magic')throw Error('Invalid commander magic profile');
 if(typeof power!=='number'||!Number.isFinite(power)||power<0)throw Error('Invalid commander magic power');
 const mainDamage=Math.round(profile.levels.magic+power*.05);
 if(!Number.isSafeInteger(mainDamage)||mainDamage<0)throw Error('Invalid commander magic budget');
 // Each occupied adjacent target gets 25% of the rounded main damage; this is
 // not a shared total, nor 25% of the unrounded formula or post-mitigation damage.
 const areaDamage=Math.round(mainDamage*.25);
 return Object.freeze({mainDamage,areaDamage});
}
