import {commanderAbilityStats} from './public/commander-ability-rules.js';
// Experimental server-owned arena registry. Never exposes direct hero-action inputs.
// Route activation must wait until all hero mechanics reach legacy parity.
import {createLiveArenaSession,castDuringLiveArena,stepLiveArenaHero,advanceLiveArenaRound,viewLiveArenaSession} from './commander-live-arena-session.js';
import {viewLiveCommanderAbilities} from './commander-live-abilities.js';
export function createLiveArenaRegistry(){
 const matches=new Map();
 function requireMatch(key,token){
  const entry=matches.get(key);
  if(!entry||typeof token!=='string'||!entry.tokens.includes(token))throw Error('Unauthorized live arena');
  return {entry,side:entry.tokens.indexOf(token)};
 }
 return {
  register({matchKey,tokens,combat,options={}}){
   if(typeof matchKey!=='string'||!matchKey||!Array.isArray(tokens)||tokens.length!==2||tokens.some(t=>typeof t!=='string'||!t)||tokens[0]===tokens[1]||matches.has(matchKey))throw Error('Invalid live arena registration');
   const session=createLiveArenaSession(combat,options);
   matches.set(matchKey,{tokens:[...tokens],session});
   return true;
  },
  snapshot({matchKey,token,sinceVersion=0,now=Date.now()}){
   const {entry,side}=requireMatch(matchKey,token);
   if(!Number.isFinite(now))throw Error('Invalid snapshot time');
   const own=viewLiveCommanderAbilities(entry.session.combat.abilities,side,now);
   return {...viewLiveArenaSession(entry.session,{sinceVersion}),side,commanderId:entry.session.combat.commanders[side].commanderId,abilityStats:commanderAbilityStats(entry.session.combat.commanders[side]),abilities:[0,1].map(i=>i===side?own:{energy:null,ultimateEnergy:null,normalCooldownMs:null,normalCooldownUntil:null,cooldownMs:null,cooldownUntil:null,finished:entry.session.combat.finished})};
  },
  cast({matchKey,token,ability,requestId,targetIds,now}){
   const {entry,side}=requireMatch(matchKey,token);
   return castDuringLiveArena(entry.session,{side,ability,requestId,targetIds,matchKey,now});
  },
  stepServerHero(matchKey){
   const entry=matches.get(matchKey);
   if(!entry)throw Error('Unknown live arena');
   return stepLiveArenaHero(entry.session);
  },
  advanceServerRound(matchKey){
   const entry=matches.get(matchKey);
   if(!entry)throw Error('Unknown live arena');
   return advanceLiveArenaRound(entry.session);
  },
  remove(matchKey){return matches.delete(matchKey)}
 };
}
