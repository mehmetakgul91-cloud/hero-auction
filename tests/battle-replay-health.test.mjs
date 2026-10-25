import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';
const teams=[[{id:'a',maxHp:100}],[{id:'b',maxHp:100}]];
test('execute remainder reaches zero HP in non-live replay',()=>{
 const replay=createBattleReplayHealth(teams);
 replay.apply({side:0,actor:'a',target:'b',action:'attack',damageType:'normal',value:86});
 assert.deepEqual(replay.apply({side:0,actor:'a',target:'b',action:'Hilal Kesik',damageType:'special',value:3,absorbed:7,executedDamage:11}),[[100],[0]]);
});
test('distinct events in the same action apply once each; duplicate events do not',()=>{
 const replay=createBattleReplayHealth(teams);
 const hit={actionId:'3:0:a',side:0,actor:'a',target:'b',action:'special',damageType:'special',value:20};
 const shield={actionId:'3:0:a',side:0,actor:'a',target:'a',action:'shield',value:40};
 assert.deepEqual(replay.apply(hit),[[100],[80]]);
 assert.deepEqual(replay.apply(shield),[[100],[80]]);
 assert.deepEqual(replay.apply({...hit}),[[100],[80]]);
 assert.deepEqual(replay.apply({...hit,actionId:'6:0:a'}),[[100],[60]]);
});
test('healing is capped, non-damage statuses do not change HP, reset is independent',()=>{
 const replay=createBattleReplayHealth(teams);
 replay.apply({side:1,actor:'b',target:'a',action:'attack',value:20});
 assert.deepEqual(replay.apply({side:0,actor:'a',target:'a',action:'heal',value:99}),[[100],[100]]);
 for(const action of ['shield','delay','haste','armor-break','weaken'])assert.deepEqual(replay.apply({side:0,actor:'a',target:'b',action,value:80}),[[100],[100]]);
 assert.deepEqual(createBattleReplayHealth(teams).apply({side:0,actor:'a',target:'b',action:'attack',value:5}),[[100],[95]]);
});
test('an authoritative HP snapshot already contains damage and is not applied twice',()=>{
 const replay=createBattleReplayHealth(teams);
 const e={eventId:'1',side:0,actor:'a',target:'b',action:'attack',damageType:'special',value:3,executedDamage:11,hpSnapshot:[[100],[0]]};
 assert.deepEqual(replay.apply(e),[[100],[0]]);
 assert.deepEqual(replay.apply({...e}),[[100],[0]]);
});
test('shield absorption is never subtracted from HP a second time',()=>{
 assert.deepEqual(createBattleReplayHealth(teams).apply({side:0,actor:'a',target:'b',action:'attack',value:15,absorbed:35}),[[100],[85]]);
});
test('legacy named attacks without damageType remain compatible, while statuses stay non-damaging',()=>{
 const namedTeams=[[{id:'a',maxHp:100,active:{name:'Hilal Kesik',effect:'execute'}}],[{id:'b',maxHp:100}]];
 const replay=createBattleReplayHealth(namedTeams);
 assert.deepEqual(replay.apply({side:0,actor:'a',target:'b',action:'Hilal Kesik',value:10}),[[100],[90]]);
 assert.deepEqual(replay.apply({side:0,actor:'a',target:'b',action:'delay',value:10}),[[100],[90]]);
});
test('revival sets authoritative restored HP once; aggregate cast is not a second heal',()=>{
 const replay=createBattleReplayHealth(teams);
 replay.apply({actionId:'1:1:b',side:1,actor:'b',target:'a',action:'attack',damageType:'normal',value:100});
 const revive={version:2,side:0,actor:'commander:0',target:'a',action:'commander-revive',value:30};
 assert.deepEqual(replay.apply(revive),[[30],[100]]);
 assert.deepEqual(replay.apply({...revive}),[[30],[100]]);
 assert.deepEqual(replay.apply({version:2,side:0,actor:'commander:0',action:'commander-support-ultimate',value:30}),[[30],[100]]);
});
test('last-stand damage uses actual HP loss, not a fabricated heal or extra hit',()=>{
 const replay=createBattleReplayHealth(teams);
 assert.deepEqual(replay.apply({side:0,actor:'a',target:'b',action:'attack',damageType:'normal',value:99,guardTriggered:true}),[[100],[1]]);
});

test('arcane transfer reconstructs recipient status without extra HP mutation or duration reset',()=>{
 const t=[[{id:'a',maxHp:100}],[{id:'b',maxHp:100,arcaneSurgeBonusAttack:50,arcaneSurgeFromRound:1,arcaneSurgeUntilRound:3},{id:'c',maxHp:100}]];
 const replay=createBattleReplayHealth(t),event={version:1,round:2,side:0,actor:'a',target:'b',action:'attack',value:100,arcaneTransfer:{sourceId:'b',targetId:'c',fromRound:3,untilRound:3,bonusAttack:80}};
 assert.deepEqual(replay.apply(event),[[100],[0,100]]);
 assert.deepEqual(replay.statusSnapshot(),[[{}],[{},{arcaneSurgeBonusAttack:80,arcaneSurgeFromRound:3,arcaneSurgeUntilRound:3}]]);
 assert.deepEqual(replay.apply({...event}),[[100],[0,100]]);
 replay.apply({round:4,action:'delay'});assert.deepEqual(replay.statusSnapshot(),[[{}],[{},{}]]);
 assert.equal(t[1][1].arcaneSurgeBonusAttack,undefined);
});

test('final team surge never leaks into initial replay; committed grant supplies exact timing',()=>{
 const finalTeams=[[{id:'a',maxHp:100,arcaneSurgeBonusAttack:77,arcaneSurgeFromRound:6,arcaneSurgeUntilRound:8}],[{id:'b',maxHp:100}]];
 const replay=createBattleReplayHealth(finalTeams);assert.deepEqual(replay.statusSnapshot(),[[{}],[{}]]);
 replay.apply({round:2,side:0,actor:'commander:0',action:'commander-magic-ultimate',impacts:[{kind:'buff',target:'a',value:50,fromRound:3,untilRound:5}]});
 assert.deepEqual(replay.statusSnapshot(),[[{arcaneSurgeBonusAttack:50,arcaneSurgeFromRound:3,arcaneSurgeUntilRound:5}],[{}]]);
 replay.apply({round:6,action:'delay'});assert.deepEqual(replay.statusSnapshot(),[[{}],[{}]]);
 assert.equal(finalTeams[0][0].arcaneSurgeBonusAttack,77);
});
test('dead recipients cannot acquire or retain phantom surge status, including authoritative HP frames',()=>{
 const replay=createBattleReplayHealth([[{id:'a',maxHp:100}],[{id:'b',maxHp:100},{id:'c',maxHp:100}]]);
 replay.apply({round:1,side:0,actor:'a',target:'c',action:'attack',value:100});
 replay.apply({round:2,side:0,actor:'a',target:'b',action:'attack',value:100,arcaneTransfer:{sourceId:'b',targetId:'c',bonusAttack:70,fromRound:2,untilRound:3}});
 assert.deepEqual(replay.statusSnapshot(),[[{}],[{},{}]]);
 replay.apply({round:2,side:1,action:'commander-magic-ultimate',impacts:[{kind:'buff',target:'c',value:70,fromRound:2,untilRound:3}]});
 assert.deepEqual(replay.statusSnapshot(),[[{}],[{},{}]]);
 const fresh=createBattleReplayHealth([[{id:'a',maxHp:100}],[{id:'b',maxHp:100},{id:'c',maxHp:100}]]);
 fresh.apply({round:2,side:0,action:'attack',target:'b',hpSnapshot:[[100],[0,0]],arcaneTransfer:{sourceId:'b',targetId:'c',bonusAttack:70,fromRound:2,untilRound:3}});
 assert.deepEqual(fresh.statusSnapshot(),[[{}],[{},{}]]);
});
test('real committed mage cast replays its grant from final teams with exact delayed start',async()=>{
 const {createLiveCommanderCombat,castLiveCommanderCombat}=await import('../commander-live-combat.js');
 const {createLiveCommanderAbilities}=await import('../commander-live-abilities.js');
 const c=createLiveCommanderCombat({round:3,teams:[[{id:'a',hp:100,maxHp:100,attack:60,lastActionRound:3}],[{id:'b',hp:100,maxHp:100,attack:40}]],commanders:[{commanderId:'magic'},{commanderId:'defense'}],abilities:createLiveCommanderAbilities({matchKey:'replay',energy:[100,100],now:0})});
 const out=castLiveCommanderCombat(c,{side:0,ability:'ultimate',targetIds:['a'],requestId:'replay_cast_001',matchKey:'replay',now:1000});
 const replay=createBattleReplayHealth(c.teams);assert.deepEqual(replay.statusSnapshot(),[[{}],[{}]]);
 for(const event of out.events)replay.apply(event);
 assert.deepEqual(replay.statusSnapshot()[0][0],{arcaneSurgeBonusAttack:60,arcaneSurgeFromRound:4,arcaneSurgeUntilRound:6});
});
