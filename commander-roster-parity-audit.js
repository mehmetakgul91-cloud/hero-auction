// Audit the entire real roster against the opt-in incremental turn engine.
// Reporting readiness never enables unsupported mechanics or changes the live game.
import {battleRoster} from './battle-roster.js';
const START_PASSIVES=new Set(['guard','resist','focus','evasion','momentum','regen','rage']);
const SUPPORTED_PASSIVES=new Set([...START_PASSIVES,'thorns']);
const SUPPORTED_ACTIVE=new Set(['heal','shield','drain','sunder','weaken','haste','execute']);
export function auditIncrementalRoster(roster=battleRoster){
 if(!Array.isArray(roster))throw Error('Invalid hero roster');
 const rows=roster.map(hero=>{
  const issues=[];
  const passive=hero.passive?.effect;
  const active=hero.active?.effect;
  if(passive&&!SUPPORTED_PASSIVES.has(passive))issues.push('unsupported-passive:'+passive);
  if(active&&!SUPPORTED_ACTIVE.has(active))issues.push('unsupported-active:'+active);
  if(active==='heal'&&passive==='thorns')issues.push('heal-thorns-combination');
  if(hero.role==='energy'&&active&&active!=='heal')issues.push('energy-special-combination');
  if(hero.role==='tank'&&['sunder','weaken','haste','execute'].includes(active))issues.push('tank-special-combination');
  if(hero.role==='energy'&&['shield','drain'].includes(active))issues.push('energy-shield-drain-combination');
  if(active==='heal'&&hero.role==='support'&&passive==='thorns')issues.push('support-heal-thorns-combination');
  // Burst, pierce, splash and headshot have no complete atomic parity path.
  return {id:hero.id,role:hero.role,active:active||null,passive:passive||null,ready:issues.length===0,issues};
 });
 const unsupported=rows.filter(x=>!x.ready);
 const issueCounts={};
 for(const row of unsupported)for(const issue of row.issues)issueCounts[issue]=(issueCounts[issue]||0)+1;
 return {total:rows.length,ready:rows.length-unsupported.length,blocked:unsupported.length,issueCounts,rows};
}
