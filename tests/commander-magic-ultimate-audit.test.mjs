import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveArenaSession,castDuringLiveArena,stepLiveArenaHero,advanceLiveArenaRound,viewLiveArenaSession} from '../commander-live-arena-session.js';

const hero=(id,extra={})=>({id,hp:10000,maxHp:10000,attack:100,defense:0,speed:50,shield:0,role:'fighter',lane:'front',position:0,damage:0,healing:0,kills:0,...extra});
const profile=commanderId=>({commanderId,levels:{attack:0,defense:0,magic:0,support:0}});
function arena(teams,{side=0,round=1,energySplash=false}={}){
 const commanders=[profile('defense'),profile('defense')];commanders[side]=profile('magic');
 const combat=createLiveCommanderCombat({round,teams,commanders,abilities:createLiveCommanderAbilities({matchKey:'magic-duration-audit',energy:[100,100],now:0})});
 return createLiveArenaSession(combat,{parity:true,energySplash});
}
function cast(session,targetId,side=0){
 return castDuringLiveArena(session,{side,ability:'ultimate',requestId:'magic-audit-cast',matchKey:'magic-duration-audit',now:10000,targetIds:[targetId]});
}
function finishRound(session){
 const events=[];
 while(viewLiveArenaSession(session).nextHero){const {result}=stepLiveArenaHero(session);events.push(...(result.events||[result.event]));}
 return events;
}
function assertAttack(events,actor,round,attack,role='fighter'){
 const primary=events.find(event=>event.actor===actor&&event.action!=='splash'&&Number.isFinite(event.rawDamage));
 assert.ok(primary,`${actor} attacks in round ${round}`);
 const expected=Math.max(1,Math.floor(attack*(round%3===0?1.15:1)*(role==='energy'?.97:1)*.7*(primary.critical?1.3:1)));
 assert.equal(primary.rawDamage,expected,`${actor} fixed attack ${attack} in round ${round}`);
 for(const splash of events.filter(event=>event.actor===actor&&event.action==='splash'))assert.equal(splash.rawDamage,Math.max(1,Math.floor(expected*.15)),'AoE derives from the boosted primary once');
 return primary;
}

for(const side of [0,1])for(const alreadyActed of [false,true])test(`live cursor seat ${side}: mage ultimate lasts exactly three rounds when cast ${alreadyActed?'after':'before'} the selected hero acts`,()=>{
 const teams=[[hero('selected',{speed:100,role:'energy'})],[hero('enemy-a',{attack:1,speed:10}),hero('enemy-b',{attack:1,speed:10,position:1})]];
 if(side===1)teams.reverse();
 const session=arena(teams,{side,round:2,energySplash:true});
 if(alreadyActed){
  const {result}=stepLiveArenaHero(session);assertAttack([result.event],'selected',2,100,'energy');
  assert.equal(session.combat.teams[side][0].lastActionRound,2,'the real scheduler records the action before the cast');
 }
 cast(session,'selected',side);
 const start=alreadyActed?3:2,until=start+2;
 assert.deepEqual([session.combat.teams[side][0].arcaneSurgeFromRound,session.combat.teams[side][0].arcaneSurgeUntilRound],[start,until]);
 const seen=[];
 for(let round=2;round<=until+1;round++){
  const events=finishRound(session);
  if(!(alreadyActed&&round===2)){
   const boosted=round>=start&&round<=until;assertAttack(events,'selected',round,boosted?200:100,'energy');
   if(boosted)seen.push(round);
   if(round%3===0)assert.equal(events.filter(event=>event.actor==='selected'&&event.action==='splash').length,1,'real energy attack has an area hit');
  }
  assert.equal(session.combat.teams[side][0].attack,100,'base attack never compounds');
  if(round<=until)advanceLiveArenaRound(session);
 }
 assert.deepEqual(seen,[start,start+1,start+2]);
 assert.equal(session.combat.teams[side][0].arcaneSurgeBonusAttack,undefined,'round-start authority clears expired status');
 assert.equal(session.combat.teams[side][0].arcaneSurgeUntilRound,undefined);
 assert.equal(session.combat.abilities.ultimateUsed[side],true);
});

for(const originalActed of [false,true])test(`actual scheduled death transfers remaining mage duration without another same-round boost after original acted=${originalActed}`,()=>{
 const original=hero('original',{hp:1,attack:40,speed:100});
 const high=hero('high-current-hp',{hp:9000,attack:80,speed:70,lane:'back',position:1});
 const low=hero('highest-hp-percent',{hp:6000,maxHp:6000,attack:30,speed:60,lane:'back',position:2});
 const session=arena([[original,high,low],[hero('enemy',{speed:originalActed?90:110})]]);
 cast(session,'original');
 const expectedFrom=originalActed?2:1;
 for(let round=1;round<=4;round++){
  const events=finishRound(session);
  assertAttack(events,high.id,round,round>=expectedFrom&&round<=3?160:80);
  if(round===1){
   const transfers=events.filter(event=>event.arcaneTransfer);
   assert.equal(transfers.length,1);
   assert.deepEqual(transfers[0].arcaneTransfer,{sourceId:'original',targetId:high.id,fromRound:expectedFrom,untilRound:3,bonusAttack:80});
   assert.equal(session.combat.teams[0][0].hp,0);
   assert.equal(session.combat.teams[0][0].arcaneSurgeUntilRound,undefined);
   assert.equal(session.combat.teams[0][2].arcaneSurgeUntilRound,undefined,'maximum current HP, not HP percentage, wins transfer');
  }
  if(round<4)advanceLiveArenaRound(session);
 }
 assert.equal(session.combat.teams[0][1].attack,80);
 assert.equal(session.combat.teams[0][1].arcaneSurgeUntilRound,undefined,'transfer keeps original expiry');
});
