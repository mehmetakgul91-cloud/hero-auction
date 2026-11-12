// Versioned, server-owned hero cadence. Missing metadata is a historical battle,
// never a reason to invent completed actions from the current global round.
export const HERO_ACTION_CLOCK_VERSION=1;
export const usesHeroActionClock=unit=>unit?.heroActionClockVersion===HERO_ACTION_CLOCK_VERSION;
export function initializeHeroActionClocks(teams,version=HERO_ACTION_CLOCK_VERSION){
 if(![0,HERO_ACTION_CLOCK_VERSION].includes(version))throw Error('Invalid hero action clock version');
 for(const team of teams)for(const unit of team){
  if(version===0){delete unit.heroActionClockVersion;delete unit.completedActionTurns;continue;}
  const count=unit.completedActionTurns??0;
  if(!Number.isSafeInteger(count)||count<0)throw Error('Invalid completed hero actions');
  unit.heroActionClockVersion=version;unit.completedActionTurns=count;
 }
 return teams;
}
export function isHeroSpecialTurn(unit,round){
 return usesHeroActionClock(unit)?(unit.completedActionTurns+1)%3===0:round%3===0;
}
export function assertHeroActionAvailable(unit,round){
 if(!unit||unit.hp<=0||unit.canActFromRound>round)throw Error('Hero cannot act this round');
 if(usesHeroActionClock(unit)&&unit.lastActionRound>=round)throw Error('Hero already acted this round');
}
export function completeHeroAction(unit,round){
 assertHeroActionAvailable(unit,round);
 if(usesHeroActionClock(unit))unit.completedActionTurns++;
 unit.lastActionRound=round;
}
export function heroActionMetadata(unit,round,special=false){
 return usesHeroActionClock(unit)?{heroActionClockVersion:HERO_ACTION_CLOCK_VERSION,completedActionTurns:unit.completedActionTurns,heroSpecial:!!special}:{};
}
