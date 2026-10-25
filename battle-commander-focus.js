// A new Hunt Order is owned by the selected enemy, not by individual attackers.
// The JSON-safe mark is visible to every opposing hero, including revived allies.
// It changes only normal target selection: no extra action/damage or forced heal.
// Historical per-ally timed tokens remain timed/one-use; never upgrade them.
export function consumeCommanderFocus(actor){
 if(!actor)return;
 delete actor.commanderFocusTargetId;
 delete actor.commanderFocusUntilRound;
}
export function clearCommanderFocus(teams){
 for(const team of teams)for(const unit of team){consumeCommanderFocus(unit);delete unit.commanderFocusUntilDeath;}
}
export function chooseCommanderFocusEnemy(enemies){
 return enemies.filter(unit=>unit.hp>0&&unit.maxHp>0).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0))[0]??null;
}
export function hasCommanderFocus(allies,enemies,round){
 return enemies.some(unit=>unit.hp>0&&unit.commanderFocusUntilDeath===true)||allies.some(unit=>unit.hp>0&&Number.isInteger(unit.commanderFocusUntilRound)&&unit.commanderFocusUntilRound>=round&&enemies.some(enemy=>enemy.hp>0&&enemy.id===unit.commanderFocusTargetId));
}
export function grantCommanderFocus(allies,enemies,round,targetId){
 if(!Array.isArray(allies)||!Array.isArray(enemies)||!Number.isInteger(round)||round<1)throw Error('Invalid commander focus');
 // Clear obsolete legacy tokens without converting an outstanding old order.
 for(const ally of allies){if(ally.hp<=0)consumeCommanderFocus(ally);else selectCommanderFocusTarget(ally,enemies,round);}
 if(hasCommanderFocus(allies,enemies,round))return null;
 // Omitted selection remains reserved for deterministic internal fixtures.
 // All player-facing effects validate an explicit enemy ID before calling here.
 const target=targetId===undefined?chooseCommanderFocusEnemy(enemies):enemies.find(unit=>unit.id===targetId&&unit.hp>0&&unit.maxHp>0);
 const living=allies.filter(unit=>unit.hp>0);
 if(!target||!living.length)return null;
 target.commanderFocusUntilDeath=true;
 return {targetId:target.id,allyIds:living.map(unit=>unit.id),untilDeath:true};
}
export function selectCommanderFocusTarget(actor,enemies,round){
 if(!actor||!Number.isInteger(round)||round<1)return null;
 // Atomic damage removes this mark at the first actual death. A 1-HP guard
 // is not a death. Reviving the same ID cannot recreate a consumed mark.
 for(const enemy of enemies)if(enemy.hp<=0)delete enemy.commanderFocusUntilDeath;
 const marked=enemies.find(unit=>unit.hp>0&&unit.commanderFocusUntilDeath===true);
 if(marked)return marked;
 if(!actor.commanderFocusTargetId)return null;
 const valid=Number.isInteger(actor.commanderFocusUntilRound)&&round<=actor.commanderFocusUntilRound;
 const target=valid?enemies.find(unit=>unit.id===actor.commanderFocusTargetId&&unit.hp>0):null;
 if(!target){consumeCommanderFocus(actor);return null;}
 return target;
}
export function expireCommanderFocus(teams,round){
 if(!Array.isArray(teams)||teams.length!==2||!Number.isInteger(round)||round<1)throw Error('Invalid commander focus expiry');
 if(teams.some(team=>team.every(unit=>unit.hp<=0))){clearCommanderFocus(teams);return;}
 for(let side=0;side<2;side++)for(const unit of teams[side]){
  if(unit.hp<=0){consumeCommanderFocus(unit);delete unit.commanderFocusUntilDeath;}
  else if(unit.commanderFocusTargetId){
   // Validate legacy tokens directly; a new opposing mark must not hide expiry.
   if(!Number.isInteger(unit.commanderFocusUntilRound)||round>unit.commanderFocusUntilRound||!teams[1-side].some(enemy=>enemy.id===unit.commanderFocusTargetId&&enemy.hp>0))consumeCommanderFocus(unit);
  }
 }
}
