// Commander progression domain model. Server must authorize wallet deductions atomically.
export const COMMANDER_STATS=Object.freeze(['attack','defense','maxHp','speed']);
export const COMMANDER_MAX_LEVEL=10;
export const COMMANDERS=Object.freeze([
 {id:'guardian',name:'Muhafız Komutan',icon:'🛡️',description:'Savunmada uzman',specialty:'defense'},
 {id:'strategist',name:'Stratejist Komutan',icon:'🎯',description:'Saldırıda uzman',specialty:'attack'},
 {id:'medic',name:'Şifacı Komutan',icon:'💚',description:'Dayanıklılıkta uzman',specialty:'maxHp'},
 {id:'scout',name:'Öncü Komutan',icon:'⚡',description:'Hızda uzman',specialty:'speed'}
]);
export function resolveCommander(id){return COMMANDERS.find(c=>c.id===id)||null;}
export function createCommanderProfile(commanderId){
 if(!resolveCommander(commanderId))throw Error('Geçersiz komutan');
 return {commanderId,levels:{attack:0,defense:0,maxHp:0,speed:0}};
}
export function validateCommanderProfile(profile){
 if(!profile||!resolveCommander(profile.commanderId))throw Error('Geçersiz komutan profili');
 if(!profile.levels||COMMANDER_STATS.some(stat=>!Number.isInteger(profile.levels[stat])||profile.levels[stat]<0||profile.levels[stat]>COMMANDER_MAX_LEVEL))throw Error('Geçersiz komutan seviyesi');
 return profile;
}
export function commanderUpgradeCost(currentLevel){
 if(!Number.isInteger(currentLevel)||currentLevel<0||currentLevel>=COMMANDER_MAX_LEVEL)throw Error('Geliştirme sınırı');
 return 100*(currentLevel+1);
}
export function previewCommanderUpgrade(profile,stat,gold){
 validateCommanderProfile(profile);
 if(!COMMANDER_STATS.includes(stat))throw Error('Geçersiz geliştirme alanı');
 if(!Number.isSafeInteger(gold)||gold<0)throw Error('Geçersiz altın bakiyesi');
 const cost=commanderUpgradeCost(profile.levels[stat]);
 if(gold<cost)throw Error('Yetersiz altın');
 return {profile:{commanderId:profile.commanderId,levels:{...profile.levels,[stat]:profile.levels[stat]+1}},cost,remainingGold:gold-cost};
}
export function commanderStatBonus(profile,stat){
 validateCommanderProfile(profile);
 if(!COMMANDER_STATS.includes(stat))throw Error('Geçersiz geliştirme alanı');
 const commander=resolveCommander(profile.commanderId);
 return (commander.specialty===stat?.05:0)+profile.levels[stat]*.01;
}
export function applyCommanderSupport(team,commanderOrProfile){
 const profile=typeof commanderOrProfile==='string'?createCommanderProfile(commanderOrProfile):commanderOrProfile;
 if(!profile)return team;
 validateCommanderProfile(profile);
 for(const hero of team){
  for(const stat of COMMANDER_STATS){
   const bonus=commanderStatBonus(profile,stat);
   if(!bonus)continue;
   hero[stat]=Math.max(1,Math.round(hero[stat]*(1+bonus)));
   if(stat==='maxHp')hero.hp=hero.maxHp;
  }
 }
 return team;
}
