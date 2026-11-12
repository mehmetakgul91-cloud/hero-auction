import {commanderMagicNormalDescription} from './commander-magic-presentation.js';
import {commanderUltimateName,commanderUltimateDescription} from './commander-ultimate-presentation.js';
// Shared presentation and server rules. The server supplies the saved profile.
export const COMMANDER_ABILITY_COSTS=Object.freeze({normal:40,ultimate:85});
// Compatibility table above remains for isolated legacy fixtures; gameplay uses
// the authenticated commander's per-archetype cost through these functions.
export const COMMANDER_NORMAL_COSTS=Object.freeze({attack:40,defense:40,magic:60,support:40});
export const COMMANDER_ULTIMATE_COSTS=Object.freeze({attack:75,defense:85,magic:100,support:90});
export function getUltimateEnergyCost(commanderId){
 if(!Object.hasOwn(COMMANDER_ULTIMATE_COSTS,commanderId))throw Error('Invalid commander');
 return COMMANDER_ULTIMATE_COSTS[commanderId];
}
export function getCommanderAbilityCost(commanderId,ability){
 const ultimate=getUltimateEnergyCost(commanderId);
 if(ability==='normal')return COMMANDER_NORMAL_COSTS[commanderId];
 if(ability==='ultimate')return ultimate;
 throw Error('Invalid commander ability');
}
export const COMMANDER_START_ENERGY=30;
export const COMMANDER_ROUND_ENERGY=12;
export const COMMANDER_LEVEL_EFFECT_BONUS=.01;
// Normal abilities add commander level to a fixed battle-start role share.
const rates={attack:[.10,.30],defense:[.20,.20],magic:[.05,.40],support:[.05,.30]};
export function commanderAbilityStats(profile){
 const base=rates[profile?.commanderId];if(!base)throw Error('Invalid commander');
 const level=profile.levels?.[profile.commanderId]??0;
 if(!Number.isInteger(level)||level<0||level>40)throw Error('Invalid commander ability level');
 const multiplier=1+level*COMMANDER_LEVEL_EFFECT_BONUS;
 return {level,bonusPercent:level,energyPerRound:COMMANDER_ROUND_ENERGY+Math.floor(level/2),normalBase:level,normalRate:base[0],ultimateRate:Number((base[1]*multiplier).toFixed(4))};
}
export function commanderEnergyPerRound(profile){return profile?commanderAbilityStats(profile).energyPerRound:COMMANDER_ROUND_ENERGY;}
export function commanderRoundEnergy(previous,round,profile){return round===1?COMMANDER_START_ENERGY:Math.min(100,previous+commanderEnergyPerRound(profile));}
export function commanderAbilityDescription(profile){
 const stats=commanderAbilityStats(profile),normal=(stats.normalRate*100).toLocaleString('tr-TR',{maximumFractionDigits:2});
 const fixed='Savaş başındaki değerler sabitlenir; sonraki ölümler, güçlendirmeler ve zayıflatmalar bu hesabı değiştirmez.';
 const text={
  attack:`Normal: ${stats.normalBase} + (%${normal} × savaş başındaki savaşçı ve suikastçıların toplam saldırısı) kadar toplam hasar yaşayan düşmanlara bölünür. ${fixed}`,
  defense:`Normal: ${stats.normalBase} + (%${normal} × savaş başındaki tankların toplam savunması) kadar toplam kalkan yaşayan müttefiklere paylaştırılır. ${fixed}`,
  support:`Normal: ${stats.normalBase} + (%${normal} × savaş başındaki desteklerin toplam ham şifa gücü) kadar toplam şifa verir. Ham şifa gücü = saldırı × temel şifa oranı; komutan şifa bonusu dahil değildir. Can oranı en düşük kahraman önceliklidir. ${fixed}`,
  magic:'Normal: '+commanderMagicNormalDescription()+' '+fixed
 };
 return text[profile.commanderId]+' Normal beceri '+getCommanderAbilityCost(profile.commanderId,'normal')+' normal enerji harcar; ulti dolumu azalmaz. Nihai ('+getUltimateEnergyCost(profile.commanderId)+' ulti dolumu): '+commanderUltimateName(profile.commanderId)+'. '+commanderUltimateDescription(profile.commanderId);
}
