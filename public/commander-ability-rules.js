import {commanderUltimateName,commanderUltimateDescription} from './commander-ultimate-presentation.js';
// Shared presentation and server rules. The server supplies the saved profile.
export const COMMANDER_ABILITY_COSTS=Object.freeze({normal:40,ultimate:85});
// Compatibility table above remains for isolated legacy fixtures; gameplay uses
// the authenticated commander's per-archetype cost through these functions.
export const COMMANDER_ULTIMATE_COSTS=Object.freeze({attack:75,defense:85,magic:100,support:90});
export function getUltimateEnergyCost(commanderId){
 if(!Object.hasOwn(COMMANDER_ULTIMATE_COSTS,commanderId))throw Error('Invalid commander');
 return COMMANDER_ULTIMATE_COSTS[commanderId];
}
export function getCommanderAbilityCost(commanderId,ability){
 const ultimate=getUltimateEnergyCost(commanderId);
 if(ability==='normal')return 40;
 if(ability==='ultimate')return ultimate;
 throw Error('Invalid commander ability');
}
export const COMMANDER_START_ENERGY=30;
export const COMMANDER_ROUND_ENERGY=12;
export const COMMANDER_LEVEL_EFFECT_BONUS=.01;
const rates={attack:[.12,.30],defense:[.08,.20],magic:[.30,.40],support:[.12,.30]};
export function commanderAbilityStats(profile){
 const base=rates[profile?.commanderId];if(!base)throw Error('Invalid commander');
 const level=profile.levels?.[profile.commanderId]??0;
 if(!Number.isInteger(level)||level<0||level>40)throw Error('Invalid commander ability level');
 const multiplier=1+level*COMMANDER_LEVEL_EFFECT_BONUS;
 return {level,bonusPercent:level,energyPerRound:COMMANDER_ROUND_ENERGY+Math.floor(level/2),normalRate:Number((base[0]*multiplier).toFixed(4)),ultimateRate:Number((base[1]*multiplier).toFixed(4))};
}
export function commanderEnergyPerRound(profile){return profile?commanderAbilityStats(profile).energyPerRound:COMMANDER_ROUND_ENERGY;}
export function commanderRoundEnergy(previous,round,profile){return round===1?COMMANDER_START_ENERGY:Math.min(100,previous+commanderEnergyPerRound(profile));}
export function commanderAbilityDescription(profile){
 const stats=commanderAbilityStats(profile),normal=(stats.normalRate*100).toLocaleString('tr-TR',{maximumFractionDigits:2});
 const text={attack:`Normal: savaş başındaki takım saldırısının %${normal}'i kadar toplam hasar düşmanlara bölünür.`,defense:`Normal: yaşayan takımın azami canının %${normal}'i kadar toplam kalkan paylaşılır.`,support:`Normal: eksik canın %${normal}'i iyileştirilir. Can oranı en düşük kahraman önceliklidir.`,magic:`Normal: seçilen 1 rakibin saldırısı %${normal} azalır.`};
 return text[profile.commanderId]+' Nihai ('+getUltimateEnergyCost(profile.commanderId)+' enerji): '+commanderUltimateName(profile.commanderId)+'. '+commanderUltimateDescription(profile.commanderId);
}
