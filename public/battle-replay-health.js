// Read-only HP reconstruction for non-live logs. Live arena uses server snapshots.
// An atomic action can have multiple events: dedupe event identities, not action IDs.
export function createBattleReplayHealth(teams){
 const health=teams.map(team=>team.map(hero=>Math.max(0,Number(hero.maxHp)||0)));
 const surgeKeys=['arcaneSurgeBonusAttack','arcaneSurgeFromRound','arcaneSurgeUntilRound'];
 const lastStandKeys=['lastStandReady','lastStandPersistent','lastStandUntilRound','lastStandImmortalRounds','lastStandTriggeredRound','lastStandImmortalUntilRound'];
 const clearLastStand=status=>{for(const key of lastStandKeys)delete status[key];};
 const statuses=teams.map(team=>team.map(()=>({}))); // Supplied teams may be FINAL battle results.
 const seen=new Set(),objects=new WeakSet();let currentRound=0;
 const copy=()=>{if(health.some(team=>team.every(hp=>hp<=0)))for(const team of statuses)for(const status of team){delete status.commanderFocusUntilDeath;delete status.commanderStunNextAttack;delete status.commanderHuntNextAttack;clearLastStand(status);}for(let side=0;side<health.length;side++)for(let i=0;i<health[side].length;i++)if(health[side][i]<=0){for(const key of surgeKeys)delete statuses[side][i][key];delete statuses[side][i].commanderFocusUntilDeath;delete statuses[side][i].commanderStunNextAttack;delete statuses[side][i].commanderHuntNextAttack;clearLastStand(statuses[side][i]);}return health.map(team=>team.slice());};
 const amount=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
 const identity=entry=>entry.eventId!=null?'event:'+entry.eventId:
  entry.actionId!=null||entry.version!=null?JSON.stringify([entry.actionId??entry.version,entry.side,entry.actor,entry.action,entry.target,entry.damageType,entry.value,entry.absorbed,entry.executedDamage]):null;
 return {finish(){for(const team of statuses)for(const status of team){delete status.commanderFocusUntilDeath;delete status.commanderStunNextAttack;delete status.commanderHuntNextAttack;clearLastStand(status);}return copy();},statusSnapshot(){return statuses.map(team=>team.map(status=>({...status})));},apply(entry){
  if(!entry||typeof entry!=='object')return copy();
  const key=identity(entry);
  if(objects.has(entry)||(key!==null&&seen.has(key)))return copy();
  objects.add(entry);if(key!==null)seen.add(key);
  if(Number.isInteger(entry.round))currentRound=Math.max(currentRound,entry.round);
  for(const team of statuses)for(const status of team)if(Number.isInteger(entry.round)&&entry.round>status.arcaneSurgeUntilRound)for(const key of surgeKeys)delete status[key];
  for(const team of statuses)for(const status of team)if(Number.isInteger(entry.round)&&entry.round>status.lastStandImmortalUntilRound)clearLastStand(status);
  // Only explicit new-rule metadata grants multi-round protection in replay.
  // Historical one-hit logs must never be reinterpreted as immortality.
  if(entry.action==='commander-defense-ultimate'&&[0,1].includes(entry.side))for(const impact of entry.impacts||[]){
   const index=teams[entry.side].findIndex(hero=>hero.id===impact.target);
   if(impact.kind==='guard'&&impact.immortalRounds===2&&index>=0&&health[entry.side][index]>0)Object.assign(statuses[entry.side][index],{lastStandReady:true,lastStandPersistent:true,lastStandImmortalRounds:2});
  }
  if(entry.guardTriggered===true&&[0,1].includes(entry.side)){
   const targetSide=1-entry.side,index=teams[targetSide].findIndex(hero=>hero.id===entry.target);
   if(index>=0&&health[targetSide][index]>0){
    clearLastStand(statuses[targetSide][index]);
    if(Number.isInteger(entry.lastStandTriggeredRound)&&entry.lastStandTriggeredRound>=1&&Number.isInteger(entry.lastStandImmortalUntilRound)&&entry.lastStandImmortalUntilRound===entry.lastStandTriggeredRound+2&&Number.isInteger(entry.round)&&entry.round>=entry.lastStandTriggeredRound&&entry.round<=entry.lastStandImmortalUntilRound&&currentRound<=entry.lastStandImmortalUntilRound)Object.assign(statuses[targetSide][index],{lastStandTriggeredRound:entry.lastStandTriggeredRound,lastStandImmortalUntilRound:entry.lastStandImmortalUntilRound});
   }
  }
  if(entry.action==='commander-magic-ultimate'&&[0,1].includes(entry.side))for(const impact of entry.impacts||[]){
   const index=teams[entry.side].findIndex(hero=>hero.id===impact.target);
   if(impact.kind==='buff'&&index>=0&&health[entry.side][index]>0&&Number.isFinite(impact.value)&&impact.value>=0&&Number.isInteger(impact.fromRound)&&Number.isInteger(impact.untilRound)&&impact.untilRound>=impact.fromRound){
    Object.assign(statuses[entry.side][index],{arcaneSurgeBonusAttack:impact.value,arcaneSurgeFromRound:impact.fromRound,arcaneSurgeUntilRound:impact.untilRound});
   }
  }
  if(entry.action==='commander-attack-ultimate'&&entry.focusUntilDeath===true&&[0,1].includes(entry.side))for(const impact of entry.impacts||[]){
   const targetSide=1-entry.side,index=teams[targetSide].findIndex(hero=>hero.id===impact.target);
   if(impact.kind==='focus'&&impact.untilDeath===true&&index>=0&&health[targetSide][index]>0)statuses[targetSide][index].commanderFocusUntilDeath=true;
  }
  // Grant only from explicit new-rule metadata; historical focus-only logs stay unchanged.
  if(entry.action==='commander-attack-ultimate'&&[0,1].includes(entry.side))for(const impact of entry.impacts||[]){
   const index=teams[entry.side].findIndex(hero=>hero.id===impact.target);
   if(impact.kind==='hunt-buff'&&impact.nextAttack===true&&impact.value===20&&index>=0&&health[entry.side][index]>0)statuses[entry.side][index].commanderHuntNextAttack=true;
  }
  if(entry.huntAttackConsumed===true&&[0,1].includes(entry.side)){
   const index=teams[entry.side].findIndex(hero=>hero.id===entry.actor);
   if(index>=0)delete statuses[entry.side][index].commanderHuntNextAttack;
  }
  if(entry.action==='commander-magic-normal'&&[0,1].includes(entry.side))for(const impact of entry.impacts||[]){
   const targetSide=1-entry.side,index=teams[targetSide].findIndex(hero=>hero.id===impact.target);
   if(impact.kind==='stun'&&impact.nextAttack===true&&impact.value===1&&index>=0&&health[targetSide][index]>0)statuses[targetSide][index].commanderStunNextAttack=true;
  }
  if(['stun-skip','revive','commander-revive'].includes(entry.action)&&[0,1].includes(entry.side)){
   const id=entry.action==='stun-skip'?entry.actor:entry.target,index=teams[entry.side].findIndex(hero=>hero.id===id);
   if(index>=0){delete statuses[entry.side][index].commanderStunNextAttack;if(entry.action!=='stun-skip'){clearLastStand(statuses[entry.side][index]);delete statuses[entry.side][index].commanderHuntNextAttack;}}
  }
  const transfer=entry.arcaneTransfer;
  if(transfer&&Number.isFinite(transfer.bonusAttack)&&transfer.bonusAttack>=0&&Number.isInteger(transfer.fromRound)&&Number.isInteger(transfer.untilRound)&&transfer.untilRound>=transfer.fromRound){
   const side=[0,1].includes(entry.side)?1-entry.side:teams.findIndex(team=>team.some(hero=>hero.id===transfer.sourceId));
   const source=teams[side]?.findIndex(hero=>hero.id===transfer.sourceId),target=teams[side]?.findIndex(hero=>hero.id===transfer.targetId);
   if(source>=0&&target>=0&&source!==target&&health[side][target]>0){
    for(const key of surgeKeys)delete statuses[side][source][key];
    Object.assign(statuses[side][target],{arcaneSurgeBonusAttack:transfer.bonusAttack,arcaneSurgeFromRound:transfer.fromRound,arcaneSurgeUntilRound:transfer.untilRound});
   }
  }
  // A supplied authoritative HP frame already includes the event's damage.
  const frame=entry.hpSnapshot;
  if(Array.isArray(frame)&&frame.length===health.length&&frame.every((team,side)=>Array.isArray(team)&&team.length===health[side].length&&team.every(Number.isFinite))){
   for(let side=0;side<health.length;side++)for(let i=0;i<health[side].length;i++)health[side][i]=Math.max(0,Math.min(teams[side][i].maxHp,frame[side][i]));
   return copy();
  }
  const side=[0,1].includes(entry.side)?entry.side:teams.findIndex(team=>team.some(hero=>hero.id===entry.actor));
  if(![0,1].includes(side))return copy();
  const actor=teams[side].find(hero=>hero.id===entry.actor);
  const namedLegacyAttack=typeof actor?.active?.name==='string'&&entry.action===actor.active.name&&!['heal','passive-heal','shield','delay','haste','armor-break','weaken','rage','tank-front-shield','tank-self-shield'].includes(entry.action);
  if(entry.action==='revive'||entry.action==='commander-revive'){
   const index=teams[side].findIndex(hero=>hero.id===entry.target);
   if(index>=0)health[side][index]=Math.min(teams[side][index].maxHp,amount(entry.value));
  }else if(entry.action==='heal'||entry.action==='passive-heal'){
   const index=teams[side].findIndex(hero=>hero.id===(entry.target||entry.actor));
   if(index>=0)health[side][index]=Math.min(teams[side][index].maxHp,health[side][index]+amount(entry.value));
  }else if(['normal','special','splash','commander'].includes(entry.damageType)||['attack','commander-hit'].includes(entry.action)||amount(entry.executedDamage)>0||namedLegacyAttack){
   const targetSide=1-side,target=teams[targetSide].findIndex(hero=>hero.id===entry.target);
   if(target>=0)health[targetSide][target]=Math.max(0,health[targetSide][target]-amount(entry.value)-amount(entry.executedDamage));
  }
  return copy();
 }};
}
