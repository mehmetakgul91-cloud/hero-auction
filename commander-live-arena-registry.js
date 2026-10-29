import {commanderAbilityStats} from './public/commander-ability-rules.js';
// Experimental server-owned arena registry. Never exposes direct hero-action inputs.
// Route activation must wait until all hero mechanics reach legacy parity.
import {createLiveArenaSession,castDuringLiveArena,stepLiveArenaHero,advanceLiveArenaRound,viewLiveArenaSession} from './commander-live-arena-session.js';
import {COMMANDER_EFFECT_MS,viewLiveCommanderAbilities} from './commander-live-abilities.js';
export function createLiveArenaRegistry(){
 const matches=new Map();
 function requireMatch(key,token){
  const entry=matches.get(key);
  if(!entry||typeof token!=='string'||!entry.tokens.includes(token))throw Error('Unauthorized live arena');
  return {entry,side:entry.tokens.indexOf(token)};
 }
 return {
  register({matchKey,tokens,combat,options={},timeline=null}){
   if(typeof matchKey!=='string'||!matchKey||!Array.isArray(tokens)||tokens.length!==2||tokens.some(t=>typeof t!=='string'||!t)||tokens[0]===tokens[1]||matches.has(matchKey))throw Error('Invalid live arena registration');
   const session=createLiveArenaSession(combat,options);
   matches.set(matchKey,{tokens:[...tokens],session,timeline,wallEffectUntil:0});
   return true;
  },
  snapshot({matchKey,token,sinceVersion=0,now=Date.now()}){
   const {entry,side}=requireMatch(matchKey,token);
   if(!Number.isFinite(now))throw Error('Invalid snapshot time');
   const combatNow=entry.timeline?entry.timeline.time(now):now;
   const abilities=entry.session.combat.abilities;
   const own=viewLiveCommanderAbilities(abilities,side,combatNow);
   if(entry.timeline){
    own.combatNormalCooldownMs=own.normalCooldownMs;
    own.normalCooldownMs=own.cooldownMs=entry.timeline.wallDuration(own.normalCooldownMs);
    own.normalCooldownUntil=own.cooldownUntil=now+own.normalCooldownMs;
    own.combatEffectLockMs=own.effectLockMs;
    own.effectLockMs=Math.max(entry.timeline.wallDuration(own.effectLockMs),Math.max(0,entry.wallEffectUntil-now));
    own.effectUntil=now+own.effectLockMs;
    own.canUseNormal=own.canUseNormal&&own.effectLockMs===0;
    own.canUseUltimate=own.canUseUltimate&&own.effectLockMs===0;
   }
   return {...viewLiveArenaSession(entry.session,{sinceVersion}),...(entry.timeline?{combatTime:combatNow,presentationDurationMs:entry.timeline.duration}:{}),side,commanderId:entry.session.combat.commanders[side].commanderId,abilityStats:commanderAbilityStats(entry.session.combat.commanders[side]),abilities:[0,1].map(i=>i===side?own:{energy:null,ultimateEnergy:null,normalCooldownMs:null,normalCooldownUntil:null,cooldownMs:null,cooldownUntil:null,finished:entry.session.combat.finished})};
  },
  cast({matchKey,token,ability,requestId,targetIds,now=Date.now()}){
   const {entry,side}=requireMatch(matchKey,token);
   if(!entry.timeline)return castDuringLiveArena(entry.session,{side,ability,requestId,targetIds,matchKey,now});
   if(!Number.isFinite(now))throw Error('Invalid cast time');
   const combatNow=entry.timeline.time(now),abilities=entry.session.combat.abilities;
   // Keep the original tactical lock plus the real cinematic floor. A slower
   // hero pace must not make normal→ultimate or opposing casts legal earlier.
   const duplicate=abilities.requests.has(side+':'+requestId);
   if(!duplicate&&now<entry.wallEffectUntil)throw Error('Komutan efekti sürüyor. Efektin bitmesini bekle.');
   const result=castDuringLiveArena(entry.session,{side,ability,requestId,targetIds,matchKey,now:combatNow});
   if(!result.duplicate)entry.wallEffectUntil=now+COMMANDER_EFFECT_MS;
   if(Number.isFinite(result.normalCooldownMs)){
    const remaining=entry.timeline.wallDuration(result.normalCooldownMs);
    return {...result,combatTime:combatNow,combatNormalCooldownMs:result.normalCooldownMs,normalCooldownMs:remaining,normalCooldownUntil:now+remaining,cooldownUntil:now+remaining};
   }
   return {...result,combatTime:combatNow};
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
