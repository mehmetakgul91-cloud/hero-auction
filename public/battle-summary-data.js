// Derive the result from the full authoritative log, never the latest polling delta.
export function summarizeBattle(teams,log=[]){
 const rows=teams.map(team=>team.map(hero=>({id:hero.id,name:hero.name,dealt:0,taken:0,blocked:0,healing:0})));
 const commanders=[0,1].map(()=>({casts:0,dealt:0,healing:0,shield:0}));
 const actions=new Set();
 for(const [index,event] of log.entries()){
  const side=[0,1].includes(event.side)?event.side:teams.findIndex(team=>team.some(hero=>hero.id===event.actor));
  if(![0,1].includes(side))continue;
  const actor=rows[side].find(hero=>hero.id===event.actor);
  const commander=String(event.actor).startsWith('commander:');
  const damage=['normal','special','splash','commander'].includes(event.damageType)||['attack','commander-hit'].includes(event.action);
  const amount=Math.max(0,Number(event.value)||0);
  if(damage){
   const dealt=amount+Math.max(0,Number(event.executedDamage)||0);
   const target=rows[1-side].find(hero=>hero.id===event.target);
   if(actor)actor.dealt+=dealt;
   if(commander)commanders[side].dealt+=dealt;
   if(target){target.taken+=dealt;target.blocked+=Math.max(0,Number(event.absorbed)||0);}
  }
  if(actor&&['heal','passive-heal'].includes(event.action))actor.healing+=amount;
  if(commander&&event.action!=='commander-hit'){
   const key='commander:'+(event.version??event.sequence??index)+':'+side;
   if(!actions.has(key))commanders[side].casts++;
   actions.add(key);
   if(event.action.startsWith('commander-support-'))commanders[side].healing+=amount;
   if(event.action.startsWith('commander-defense-'))commanders[side].shield+=amount;
  }else if(actor&&!['passive-heal','rage','round-start'].includes(event.action)){
   // One hero turn may emit damage, splash, drain and status events together.
   actions.add('hero:'+side+':'+event.actor+':'+(event.version??event.round));
  }
 }
 return {actionCount:actions.size,teams:rows,commanders};
}

export function orientBattleSummary(summary,seat){
 return seat===1&&summary?{...summary,teams:[...summary.teams].reverse(),commanders:[...summary.commanders].reverse()}:summary;
}
