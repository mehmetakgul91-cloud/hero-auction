// Commander progression prototype. Gold spending must be validated and persisted server-side.
export const COMMANDER_STATS=Object.freeze(['attack','defense','magic','support']);
export const COMMANDER_SPECIALTY_MAX_LEVEL=40;
export const COMMANDER_OTHER_MAX_LEVEL=20;
export const COMMANDERS=Object.freeze([
 {id:'attack',name:'Saldırı Komutanı',icon:'⚔️',description:'Savaşçı ve suikastçı kahramanlarını güçlendirir',specialty:'attack'},
 {id:'defense',name:'Savunma Komutanı',icon:'🛡️',description:'Tank kahramanlarını güçlendirir',specialty:'defense'},
 {id:'magic',name:'Büyücü Komutanı',icon:'🔮',description:'Enerji kahramanlarını güçlendirir',specialty:'magic'},
 {id:'support',name:'Destek Komutanı',icon:'💚',description:'Destek kahramanlarını güçlendirir',specialty:'support'}
]);
export function resolveCommander(id){return COMMANDERS.find(c=>c.id===id)||null;}
export function commanderLevelCap(commanderId,stat){
 const commander=resolveCommander(commanderId);
 if(!commander||!COMMANDER_STATS.includes(stat))throw Error('Geçersiz komutan veya geliştirme alanı');
 return commander.specialty===stat?COMMANDER_SPECIALTY_MAX_LEVEL:COMMANDER_OTHER_MAX_LEVEL;
}
export function createCommanderProfile(commanderId){
 if(!resolveCommander(commanderId))throw Error('Geçersiz komutan');
 return {commanderId,levels:{attack:0,defense:0,magic:0,support:0}};
}
export function validateCommanderProfile(profile){
 if(!profile||!resolveCommander(profile.commanderId))throw Error('Geçersiz komutan profili');
 if(!profile.levels||COMMANDER_STATS.some(stat=>!Number.isInteger(profile.levels[stat])||profile.levels[stat]<0||profile.levels[stat]>COMMANDER_SPECIALTY_MAX_LEVEL))throw Error('Geçersiz komutan seviyesi');
 return profile;
}
export function commanderUpgradeCost(currentLevel){
 if(!Number.isInteger(currentLevel)||currentLevel<0||currentLevel>=COMMANDER_SPECIALTY_MAX_LEVEL)throw Error('Geliştirme sınırı');
 return 200*(currentLevel+1);
}
// Reserved for a future diamond wallet; diamonds cannot be spent yet.
export function commanderDiamondUpgradeCost(currentLevel){
 if(!Number.isInteger(currentLevel)||currentLevel<0||currentLevel>=COMMANDER_SPECIALTY_MAX_LEVEL)throw Error('Geliştirme sınırı');
 return 10*(currentLevel+1);
}
export function previewCommanderUpgrade(profile,stat,gold){
 validateCommanderProfile(profile);
 if(!COMMANDER_STATS.includes(stat))throw Error('Geçersiz geliştirme alanı');
 if(!Number.isSafeInteger(gold)||gold<0)throw Error('Geçersiz altın bakiyesi');
 if(profile.levels[stat]>=commanderLevelCap(profile.commanderId,stat))throw Error('Geliştirme sınırı');
 const cost=commanderUpgradeCost(profile.levels[stat]);
 if(gold<cost)throw Error('Yetersiz altın');
 return {profile:{commanderId:profile.commanderId,levels:{...profile.levels,[stat]:profile.levels[stat]+1}},cost,remainingGold:gold-cost};
}
export function commanderStatBonus(profile,stat){
 validateCommanderProfile(profile);
 if(!COMMANDER_STATS.includes(stat))throw Error('Geçersiz geliştirme alanı');
 return Math.min(profile.levels[stat],commanderLevelCap(profile.commanderId,stat))*.005;
}
export function applyCommanderSupport(team,commanderOrProfile){
 if(!commanderOrProfile)return team;
 const profile=typeof commanderOrProfile==='string'?createCommanderProfile(commanderOrProfile):commanderOrProfile;
 validateCommanderProfile(profile);
 // Add the bonus from the card's original power, independently of the capped formation multiplier.
 for(const hero of team){
  const role=hero.role;
  if(role==='fighter'||role==='assassin'){
   const bonus=commanderStatBonus(profile,'attack');
   if(bonus)hero.attack=Math.max(1,hero.attack+Math.round(hero.power*bonus));
  }else if(role==='tank'){
   const bonus=commanderStatBonus(profile,'defense');
   if(bonus)hero.defense=Math.max(1,hero.defense+Math.round(hero.power*bonus));
  }else if(role==='energy'){
   const bonus=commanderStatBonus(profile,'magic');
   if(bonus)hero.attack=Math.max(1,Math.round(hero.attack*(1+bonus)));
  }else if(role==='support'){
   const bonus=commanderStatBonus(profile,'support');
   if(bonus){hero.maxHp=Math.max(1,hero.maxHp+Math.round(hero.power*2*bonus));hero.hp=hero.maxHp}
  }
 }
 return team;
}
