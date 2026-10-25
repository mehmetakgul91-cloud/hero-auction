// Attack commander's server-owned focus order. It changes one ordinary/special
// damage target per living ally, never grants an extra action or interrupts healing.
export function consumeCommanderFocus(actor){
 if(!actor)return;
 delete actor.commanderFocusTargetId;
 delete actor.commanderFocusUntilRound;
}
export function chooseCommanderFocusEnemy(enemies){
 return enemies.filter(unit=>unit.hp>0&&unit.maxHp>0).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0))[0]??null;
}
export function grantCommanderFocus(allies,enemies,round,targetId){
 if(!Array.isArray(allies)||!Array.isArray(enemies)||!Number.isInteger(round)||round<1)throw Error('Invalid commander focus');
 // An outstanding order cannot be refreshed to grant another focused attack.
 // Clear expired/dead-target tokens first, so an obsolete mark cannot block a cast.
 for(const ally of allies){if(ally.hp<=0)consumeCommanderFocus(ally);else if(selectCommanderFocusTarget(ally,enemies,round))return null;}
 // Omitted selection is reserved for internal deterministic focus fixtures.
 // All player-facing effects validate an explicit enemy ID before calling here.
 const target=targetId===undefined?chooseCommanderFocusEnemy(enemies):enemies.find(unit=>unit.id===targetId&&unit.hp>0&&unit.maxHp>0);
 if(!target)return null;
 const living=allies.filter(unit=>unit.hp>0);
 if(!living.length)return null;
 const untilRound=round+1;
 for(const ally of living){ally.commanderFocusTargetId=target.id;ally.commanderFocusUntilRound=untilRound;}
 return {targetId:target.id,allyIds:living.map(unit=>unit.id),untilRound};
}
export function selectCommanderFocusTarget(actor,enemies,round){
 if(!actor?.commanderFocusTargetId)return null;
 const valid=Number.isInteger(actor.commanderFocusUntilRound)&&Number.isInteger(round)&&round<=actor.commanderFocusUntilRound;
 const target=valid?enemies.find(unit=>unit.id===actor.commanderFocusTargetId&&unit.hp>0):null;
 if(!target){consumeCommanderFocus(actor);return null;}
 return target;
}
export function expireCommanderFocus(teams,round){
 if(!Array.isArray(teams)||teams.length!==2||!Number.isInteger(round)||round<1)throw Error('Invalid commander focus expiry');
 for(let side=0;side<2;side++)for(const unit of teams[side]){
  if(unit.hp<=0)consumeCommanderFocus(unit);
  else if(unit.commanderFocusTargetId)selectCommanderFocusTarget(unit,teams[1-side],round);
 }
}
