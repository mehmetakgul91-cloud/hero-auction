import test from 'node:test';
import assert from 'node:assert/strict';
import {reviveCommanderAlly} from '../commander-ultimate-status.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,viewLiveCommanderCombat} from '../commander-live-combat.js';
import {createCommanderSnapshotSync,acceptCommanderSnapshot} from '../commander-snapshot-sync.js';
import {orderHeroActions,nextScheduledHeroAction} from '../battle-action-scheduler.js';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';
import {describeBattleEvent} from '../public/battle-event-text.js';
import {commanderUltimateDescription} from '../public/commander-ultimate-presentation.js';
import {auctionCommanderView} from '../public/auction-commander.js';
import {renderCommanderSkills} from '../public/commander-profile-view.js';
import {translate} from '../public/crazygames-en.js';

const hero=(id,extra={})=>({id,hp:100,maxHp:100,attack:50,defense:40,speed:50,shield:0,role:'fighter',lane:'front',position:0,...extra});
for(const [maxHp,expected] of [[1,1],[2,1],[3,1],[19,10],[100,55],[101,55],[103,56],[180,99],[1001,550]])test(`revival restores floor(55% of ${maxHp}), bounded from 1 to max HP`,()=>{
 const target=hero('chosen',{hp:0,maxHp,shield:80});
 assert.deepEqual(reviveCommanderAlly(target,3),{value:expected,canActFromRound:4});
 assert.equal(target.hp,expected);assert.ok(target.hp>=1&&target.hp<=maxHp);assert.equal(target.shield,0);
 assert.deepEqual([target.revivedAtRound,target.lastActionRound,target.canActFromRound],[3,3,4]);
});

test('55% revival clears every temporary commander status without changing permanent stats or history',()=>{
 const fields=['arcaneSurgeBonusAttack','arcaneSurgeFromRound','arcaneSurgeUntilRound','commanderHuntNextAttack','commanderStunNextAttack','commanderWeaken','commanderWeakenUntilRound','commanderWeakenNextAttack','delayDueRound','delayProtectedThroughRound','lastStandReady','lastStandPersistent','lastStandUntilRound','lastStandImmortalRounds','lastStandTriggeredRound','lastStandImmortalUntilRound','commanderFocusTargetId','commanderFocusUntilRound','commanderFocusUntilDeath','focusTargetId','focusUntilRound','focusRemaining'];
 const permanent={attack:117,defense:63,speed:91,rageActivated:true,damage:17,healing:9,kills:2,commanderHealingBonus:.2,centerDefenseBonus:{version:1,multiplier:1.15}};
 const target=hero('chosen',{hp:0,maxHp:103,shield:500,...permanent,...Object.fromEntries(fields.map(key=>[key,true]))});
 reviveCommanderAlly(target,4);assert.equal(target.hp,56);assert.equal(target.shield,0);
 for(const key of fields)assert.equal(Object.hasOwn(target,key),false,key);
 for(const [key,value] of Object.entries(permanent))assert.deepEqual(target[key],value,key);
});

for(const side of [0,1])test(`seat ${side}: selected 55% revival agrees across server, events, replay, snapshots and UI`,()=>{
 const teams=[0,1].map(()=>[hero('living'),hero('chosen',{hp:0,maxHp:103,shield:50,speed:100,position:1}),hero('other-fallen',{hp:0,maxHp:101,position:2})]);
 const combat=createLiveCommanderCombat({teams,round:3,commanders:[{commanderId:'support'},{commanderId:'support'}],abilities:createLiveCommanderAbilities({matchKey:'revival-55',energy:[100,100],now:0})});
 const before=structuredClone(combat.teams),request={side,ability:'ultimate',targetIds:['chosen'],requestId:'revival_55',matchKey:'revival-55',now:1000};
 const result=castLiveCommanderCombat(combat,request),target=combat.teams[side][1];
 assert.equal(target.hp,56);assert.equal(target.shield,0);assert.equal(target.canActFromRound,4);
 assert.deepEqual(combat.teams[1-side],before[1-side]);assert.deepEqual(combat.teams[side][0],before[side][0]);assert.deepEqual(combat.teams[side][2],before[side][2]);
 assert.equal(combat.revivalUsed[side],true);assert.equal(combat.abilities.ultimateUsed[side],true);
 assert.equal(result.ultimateEnergy,10);assert.equal(result.energy,100);
 const revive=result.events.find(event=>event.action==='commander-revive'),summary=result.events.at(-1);
 assert.deepEqual([revive.side,revive.target,revive.value,revive.canActFromRound],[side,'chosen',56,4]);
 assert.equal(summary.value,56);assert.deepEqual(summary.impacts,[{target:'chosen',kind:'revive',value:56}]);
 assert.match(describeBattleEvent(revive,{english:true}),/Revival · 56 health/);
 assert.match(describeBattleEvent(revive),/Diriliş · 56 can/);
 const order=orderHeroActions(combat.teams,{round:3});
 assert.notEqual(nextScheduledHeroAction(order,0,{round:3}).unit.id,'chosen');
 assert.equal(nextScheduledHeroAction(order,0,{round:4}).unit.id,'chosen');
 const replay=createBattleReplayHealth(combat.teams);
 for(const [deadSide,team] of before.entries())for(const unit of team.filter(unit=>unit.hp===0))replay.apply({side:1-deadSide,actor:'living',target:unit.id,action:'attack',value:unit.maxHp});
 const expected=combat.teams.map(team=>team.map(unit=>unit.hp));
 for(const event of result.events)assert.deepEqual(replay.apply(event),expected);
 for(const event of result.events)assert.deepEqual(replay.apply({...event}),expected,'duplicate events never heal twice');
 const snapshot=viewLiveCommanderCombat(combat),sync=createCommanderSnapshotSync();
 assert.equal(acceptCommanderSnapshot(sync,snapshot).accepted,true);assert.deepEqual(sync.teams,combat.teams);
 assert.equal(acceptCommanderSnapshot(sync,snapshot).accepted,false);assert.deepEqual(sync.teams,combat.teams);
 const committed=structuredClone(combat);assert.equal(castLiveCommanderCombat(combat,request).duplicate,true);assert.deepEqual(combat,committed);
 assert.throws(()=>castLiveCommanderCombat(combat,{...request,requestId:'revival_again',targetIds:['other-fallen'],now:10000}),/already used/);assert.deepEqual(combat,committed);
});

test('historical replay keeps its committed 40 HP instead of recalculating at 55%',()=>{
 const replay=createBattleReplayHealth([[hero('living'),hero('chosen')],[hero('enemy')]]);
 replay.apply({side:1,actor:'enemy',target:'chosen',action:'attack',value:100});
 const event={version:2,side:0,actor:'commander:0',target:'chosen',action:'commander-revive',value:40};
 assert.deepEqual(replay.apply(event),[[100,40],[100]]);
 assert.deepEqual(replay.apply({...event}),[[100,40],[100]]);
});

for(const english of [false,true])test(`support skill and auction descriptions show 55% in ${english?'English':'Turkish'}`,()=>{
 class Element{
  constructor(){this.children=[];this.text='';}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;this.text='';}
 }
 const document={createElement:()=>new Element()},root=new Element();
 renderCommanderSkills(root,{commanderId:'support',levels:{support:40}},{english,document});
 const pattern=english?/55% max health/:/%55 azami can/;
 assert.match(root.children[1].textContent,pattern);assert.doesNotMatch(root.children[1].textContent,/40%|%40/);
 assert.match(commanderUltimateDescription('support',{english}),pattern);
 assert.match(auctionCommanderView({commanderId:'support'},{english}).ultimate,english?/55% health/:/%55 canla/);
 assert.equal(translate(commanderUltimateDescription('support')),commanderUltimateDescription('support',{english:true}));
});
