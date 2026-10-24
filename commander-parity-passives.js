// Exact legacy start-of-combat and round-start passive rules.
// All operations are server-owned and applied atomically to cloned combat teams.
export function applyLegacyStartPassives(teams){
 if(!Array.isArray(teams)||teams.length!==2)throw Error('Invalid teams');
 const next=structuredClone(teams);
 for(const team of next)for(const u of team){
  const p=u.passive;
  if(!p)continue;
  if(!Number.isFinite(p.value)||p.value<0)throw Error('Invalid passive value');
  if(['guard','resist'].includes(p.effect))u.defense=Math.round(u.defense*(1+p.value));
  if(p.effect==='focus')u.attack=Math.round(u.attack*(1+p.value));
  if(['evasion','momentum'].includes(p.effect))u.speed=Math.round(u.speed*(1+p.value));
 }
 return next;
}
export function applyLegacyRoundPassives(combat){
 if(!combat||combat.finished||!Array.isArray(combat.teams)||!Number.isInteger(combat.round))throw Error('Invalid passive combat');
 const next=structuredClone(combat.teams),events=[];
 for(const team of next)for(const u of team){
  if(u.hp<=0||!u.passive)continue;
  const {effect,value}=u.passive;
  if(!Number.isFinite(value)||value<0)throw Error('Invalid passive value');
  if(effect==='regen'){
   const healed=Math.min(u.maxHp-u.hp,Math.max(1,Math.floor(u.maxHp*value)));
   u.hp+=healed;u.healing=(u.healing||0)+healed;
   if(healed)events.push({round:combat.round,actor:u.id,action:'passive-heal',value:healed});
  }
  if(effect==='rage'&&u.hp/u.maxHp<.5&&!u.rageActivated){
   u.attack=Math.max(u.attack,Math.min(180,u.attack+Math.max(1,Math.floor(u.attack*value))));
   u.rageActivated=true;
   events.push({round:combat.round,actor:u.id,action:'rage',value:u.attack});
  }
 }
 combat.teams=next;
 if(events.length){
  combat.version++;
  combat.events.push(...events.map(event=>({...event,version:combat.version})));
 }
 return {version:combat.version,events,teams:structuredClone(next)};
}
