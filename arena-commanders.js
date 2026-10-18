// Isolated commander prototype. No account/wallet mutations.
// Commanders support five heroes; they never become a sixth fighter.
export const COMMANDERS=Object.freeze([
 {id:'guardian',name:'Muhafız Komutan',icon:'🛡️',description:'Takım savunması +%5',bonus:{stat:'defense',value:.05}},
 {id:'strategist',name:'Stratejist Komutan',icon:'🎯',description:'Takım saldırısı +%5',bonus:{stat:'attack',value:.05}},
 {id:'medic',name:'Şifacı Komutan',icon:'💚',description:'Takım maksimum canı +%5',bonus:{stat:'maxHp',value:.05}},
 {id:'scout',name:'Öncü Komutan',icon:'⚡',description:'Takım hızı +%5',bonus:{stat:'speed',value:.05}}
]);
export function resolveCommander(id){
 return COMMANDERS.find(c=>c.id===id)||null;
}
export function applyCommanderSupport(team,commanderId){
 const commander=resolveCommander(commanderId);
 if(!commander)return team;
 const {stat,value}=commander.bonus;
 for(const hero of team){
  hero[stat]=Math.max(1,Math.round(hero[stat]*(1+value)));
  if(stat==='maxHp')hero.hp=hero.maxHp;
 }
 return team;
}
