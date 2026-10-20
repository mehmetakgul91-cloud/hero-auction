// Experimental server-owned arena registry. Never exposes direct hero-action inputs.
// Route activation must wait until all hero mechanics reach legacy parity.
import {createLiveArenaSession,castDuringLiveArena,stepLiveArenaHero,viewLiveArenaSession} from './commander-live-arena-session.js';
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
  snapshot({matchKey,token,sinceVersion=0}){
   const {entry,side}=requireMatch(matchKey,token);
   return {...viewLiveArenaSession(entry.session,{sinceVersion}),side,abilities:[0,1].map(i=>({
    energy:i===side?entry.session.combat.abilities.energy[i]:null,
    cooldownUntil:i===side?entry.session.combat.abilities.cooldownUntil[i]:null,
    finished:entry.session.combat.finished
   }))};
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
  remove(matchKey){return matches.delete(matchKey)}
 };
}
