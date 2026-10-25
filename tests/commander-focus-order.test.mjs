import test from 'node:test';
import assert from 'node:assert/strict';
import {grantCommanderFocus,consumeCommanderFocus,expireCommanderFocus,selectCommanderFocusTarget} from '../battle-commander-focus.js';
import {selectBattleTarget} from '../battle-target-selection.js';
import {orderHeroActions,nextScheduledHeroAction} from '../battle-action-scheduler.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,viewLiveCommanderCombat} from '../commander-live-combat.js';
import {createBasicTurnSession,peekBasicTurn,stepBasicTurn,advanceBasicTurnSession} from '../commander-basic-turn-session.js';
const h=(id,extra={})=>({id,hp:1000,maxHp:1000,attack:1,defense:50,speed:50,position:0,role:'fighter',lane:'front',shield:0,...extra});
const combat=(teams,round=3)=>createLiveCommanderCombat({teams,round,commanders:[{commanderId:'attack'},{commanderId:'defense'}],abilities:createLiveCommanderAbilities({matchKey:'focus:test',energy:[100,100]})});
const options={parity:true,damageSpecial:true,specialHealing:true,shieldDrain:true};
test('focus marks each living ally, selects lowest HP ratio with stable ID tie and grants no immediate damage',()=>{
 const a=[h('a'),h('dead',{hp:0}),h('b')],e=[h('z',{hp:100,maxHp:200,lane:'back'}),h('x',{hp:50,maxHp:100}),h('q',{hp:0}),h('full')];
 const before=e.map(u=>u.hp),r=grantCommanderFocus(a,e,3);assert.deepEqual(r,{targetId:'x',allyIds:['a','b'],untilRound:4});assert.deepEqual(e.map(u=>u.hp),before);assert.equal(a[1].commanderFocusTargetId,undefined);
 assert.equal(selectBattleTarget(e,a[0],3).id,'x');assert.equal(a[0].commanderFocusTargetId,'x','selection itself does not consume');consumeCommanderFocus(a[0]);assert.equal(a[0].commanderFocusTargetId,undefined);
});
test('active focus cannot refresh or grant another attack; completed/dead-target orders can be replaced',()=>{
 const a=[h('a'),h('b')],e=[h('low',{hp:100}),h('high')];grantCommanderFocus(a,e,2);consumeCommanderFocus(a[0]);assert.equal(grantCommanderFocus(a,e,3),null);assert.equal(a[0].commanderFocusTargetId,undefined);e[0].hp=0;
 assert.equal(grantCommanderFocus(a,e,3).targetId,'high');assert.equal(a[0].commanderFocusUntilRound,4);
});
test('focus expires after next round and never retargets when focused enemy dies',()=>{
 const a=[h('a')],e=[h('low',{hp:1}),h('high')];grantCommanderFocus(a,e,3);assert.equal(selectCommanderFocusTarget(a[0],e,4).id,'low');expireCommanderFocus([a,e],5);assert.equal(a[0].commanderFocusTargetId,undefined);
 grantCommanderFocus(a,e,5);e[0].hp=0;assert.equal(selectCommanderFocusTarget(a[0],e,5),null);assert.equal(a[0].commanderFocusTargetId,undefined);
});
test('focused rear enemy overrides role target preference but consumes exactly one actual damaging turn',()=>{
 const c=combat([[h('actor',{speed:90})],[h('front',{speed:20}),h('rear',{hp:900,lane:'back',speed:10,position:1})]],1);grantCommanderFocus(c.teams[0],c.teams[1],1);const s=createBasicTurnSession(c,options),{result}=stepBasicTurn(s);
 assert.equal(result.event.target,'rear');assert.equal(c.teams[0][0].commanderFocusTargetId,undefined);assert.equal(c.teams[0][0].lastActionRound,1);assert.equal(c.teams[0][0].damage,result.event.value);assert.equal(peekBasicTurn(s).actorId,'front');
});
test('healing and hybrid shield actions do not consume focus or create a forced attack',()=>{
 for(const active of[{effect:'heal',name:'heal',power:1.12},{effect:'shield',name:'hybrid',power:1.12,supportHybrid:true,healRate:.52,allyShieldRate:.28}]){
  const c=combat([[h('support',{role:'support',active,speed:90}),h('ally',{hp:500,speed:20,position:1})],[h('enemy',{speed:10})]]);grantCommanderFocus(c.teams[0],c.teams[1],3);const s=createBasicTurnSession(c,options);stepBasicTurn(s);
  assert.equal(c.teams[1][0].hp,1000);assert.equal(c.teams[0][0].commanderFocusTargetId,'enemy');assert.equal(c.teams[0][0].lastActionRound,3);assert.equal(c.teams[0][0].damage||0,0);
 }
});
test('focus and hero delay share the same primary target without an extra action',()=>{
 const c=combat([[h('actor',{speed:90,active:{effect:'burst',name:'delay',power:1.12,delay:true}}),h('ally',{speed:20,position:1})],[h('front',{speed:80}),h('rear',{hp:900,speed:70,lane:'back',position:1})]]);grantCommanderFocus(c.teams[0],c.teams[1],3);const s=createBasicTurnSession(c,options);const {result}=stepBasicTurn(s);
 assert.equal(result.events.find(e=>e.damageType==='special').target,'rear');assert.equal(result.events.find(e=>e.action==='delay').target,'rear');assert.equal(s.order.at(-1).id,'rear');assert.equal(c.teams[0][0].commanderFocusTargetId,undefined);
});
test('revived hero cannot act in casting round, even if its old order slot has not passed',()=>{
 const ts=[[h('revived',{hp:0,speed:90})],[h('enemy',{speed:20})]],c=combat(ts,3),s=createBasicTurnSession(c,options);
 c.teams[0][0].hp=100;c.teams[0][0].canActFromRound=4;c.teams[0][0].lastActionRound=3;
 assert.equal(peekBasicTurn(s).actorId,'enemy');stepBasicTurn(s);assert.equal(peekBasicTurn(s),null);advanceBasicTurnSession(s);assert.equal(peekBasicTurn(s).actorId,'revived');stepBasicTurn(s);assert.equal(c.teams[0][0].lastActionRound,4);
});
test('round-aware pure scheduler skips pending revival and permits it next round',()=>{
 const teams=[[h('r',{speed:90,canActFromRound:4})],[h('b',{speed:20})]],order=orderHeroActions(teams,{round:3});assert.equal(nextScheduledHeroAction(order,0,{round:3}).unit.id,'b');assert.equal(nextScheduledHeroAction(order,0,{round:4}).unit.id,'r');
});

test('live focus cast costs75 once, snapshots carry marks and active refresh fails atomically',()=>{
 const c=combat([[h('a'),h('ally')],[h('enemy')]],2),now=c.abilities.cooldownUntil[0]+1000;
 const request={side:0,ability:'ultimate',requestId:'focus_cast_01',matchKey:'focus:test',now};
 const result=castLiveCommanderCombat(c,request);assert.equal(result.energy,25);
 assert.equal(result.events.filter(e=>e.action==='commander-hit').length,0);
 assert.equal(result.teams[0][0].commanderFocusUntilRound,3);
 assert.equal(castLiveCommanderCombat(c,{...request,now:now+1}).duplicate,true);
 c.abilities.energy[0]=100;
 const before=viewLiveCommanderCombat(c),cooldown=c.abilities.cooldownUntil[0];
 assert.throws(()=>castLiveCommanderCombat(c,{...request,requestId:'focus_refresh_02',now:now+6000}),/ultimate already used/);
 assert.deepEqual(viewLiveCommanderCombat(c),before);assert.equal(c.abilities.energy[0],100);assert.equal(c.abilities.cooldownUntil[0],cooldown);
});
