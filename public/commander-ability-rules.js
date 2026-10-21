// Shared presentation and server rules. The server supplies the saved profile.
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
 const stats=commanderAbilityStats(profile),percent=value=>(value*100).toLocaleString('tr-TR',{maximumFractionDigits:1});
 const normal=percent(stats.normalRate),ultimate=percent(stats.ultimateRate);
 const text={attack:`Normal: takım saldırısının %${normal}'i; nihai: %${ultimate}'i kadar toplam hasar düşmanlara bölünür.`,defense:`Normal: yaşayan takımın azami canının %${normal}'i; nihai: %${ultimate}'i kadar toplam kalkan paylaşılır.`,support:`Normal: eksik canın %${normal}'i; nihai: %${ultimate}'i iyileştirilir. Can oranı en düşük kahraman önceliklidir.`,magic:`Normal: seçilen 1 hedefin saldırısı %${normal}; nihai: en fazla 2 hedefin saldırısı %${ultimate} azalır.`};
 return text[profile.commanderId];
}
