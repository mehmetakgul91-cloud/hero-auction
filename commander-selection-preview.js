import {COMMANDERS,COMMANDER_STATS,createCommanderProfile,validateCommanderProfile} from './arena-commanders.js';
import {prepareLiveArenaTeams} from './commander-live-team-preparation.js';

const stats=['attack','defense','maxHp','speed'];
const totalStats=[...stats,'cardPower'];
const difference=(value,baseline,keys)=>Object.fromEntries(keys.map(key=>[key,value[key]-baseline[key]]));
function summarize(team){
 const heroes=team.map(({id,name,role,lane,power,attack,defense,maxHp,speed})=>({id,name,role,lane,power,attack,defense,maxHp,speed}));
 const totals=Object.fromEntries(totalStats.map(key=>[key,heroes.reduce((sum,hero)=>sum+hero[key==='cardPower'?'power':key],0)]));
 return {totals,heroes};
}

// Inputs must be the server's normalized cards in confirmed formation order.
// Starting stats only: active skills and later combat outcomes are not simulated.
// Keep the opponent commander absent in EVERY run, including the baseline, so a
// hidden selection cannot influence the response. Current start passives are
// self-only; if that changes, these are explicitly opponent-neutral previews.
export function commanderSelectionPreview(cardsA,cardsB,{seat,remainingCredits=[0,0],profile=null}={}){
 if(seat!==0&&seat!==1)throw Error('Invalid commander preview seat');
 if(profile!==null)validateCommanderProfile(profile);
 const levels=profile?Object.fromEntries(COMMANDER_STATS.map(stat=>[stat,profile.levels[stat]])):createCommanderProfile('attack').levels;
 const prepare=commander=>{
  const commanders=[null,null];commanders[seat]=commander;
  return summarize(prepareLiveArenaTeams(cardsA,cardsB,{remainingCredits,commanders,cardAdapter:'auction'})[seat]);
 };
 const baseline=prepare(null);
 const options=COMMANDERS.map(({id:commanderId})=>{
  // Preserve earned levels. The shared combat engine applies the selected
  // specialty's 40 / other branches' 20 effective caps without erasing levels.
  const candidate={commanderId,levels:{...levels}};
  const prepared=prepare(candidate);
  return {commanderId,profile:candidate,totals:prepared.totals,delta:difference(prepared.totals,baseline.totals,totalStats),
   heroes:prepared.heroes.map((hero,index)=>({...hero,delta:difference(hero,baseline.heroes[index],stats)}))};
 });
 return {options,baseline};
}
