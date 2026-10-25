import test from 'node:test';
import assert from 'node:assert/strict';
import {orderHeroActions,nextScheduledHeroAction} from '../battle-action-scheduler.js';
import {applyHeroDelay,finishHeroDelay} from '../battle-delay.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,viewLiveCommanderCombat} from '../commander-live-combat.js';
import {createBasicTurnSession,peekBasicTurn,stepBasicTurn,advanceBasicTurnSession} from '../commander-basic-turn-session.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {calculateHeroRawDamage} from '../battle-damage-formula.js';
import {createCommanderSnapshotSync,acceptCommanderSnapshot} from '../commander-snapshot-sync.js';
const hero=(id,speed,position=0,extra={})=>({id,name:id,hp:1000,maxHp:1000,attack:1,defense:50,shield:0,speed,position,lane:'front',role:'fighter',damage:0,healing:0,kills:0,...extra});
const burst={effect:'burst',name:'Delay strike',power:1.12,delay:true};
function teams({targetFirst=false,secondBurst=false}={}){return [[hero('actor',targetFirst?30:40,0,{active:{...burst}}),hero('ally',20,1,{active:secondBurst?{...burst}:null})],[hero('target',targetFirst?40:30),hero('rear',10,1,{lane:'back'})]];}
function combat(ts,round=3){return createLiveCommanderCombat({teams:ts,round,abilities:createLiveCommanderAbilities({matchKey:'delay:test',energy:[30,30]}),commanders:[{commanderId:'attack'},{commanderId:'defense'}]});}
const opts={parity:true,damageSpecial:true,specialHealing:true};
const ids=order=>order.map(x=>x.id??x.unit.id);

test('delay moves an unacted target to this round end without dropping or duplicating any action',()=>{
 const ts=teams(),order=orderHeroActions(ts,{round:3});
 const event=applyHeroDelay({teams:ts,order,cursor:1,round:3,side:0,actorId:'actor',targetId:'target'});
 assert.equal(event.dueRound,3);assert.deepEqual(ids(order),['actor','ally','rear','target']);
 const actions=['actor'];let cursor=1,next;
 while((next=nextScheduledHeroAction(order,cursor))){cursor=next.nextCursor;actions.push(next.unit.id);finishHeroDelay(next.unit,3);}
 assert.equal(new Set(actions).size,4);assert.equal(actions.length,4);
 assert.equal(ts[1][0].delayDueRound,undefined);assert.equal(ts[1][0].delayProtectedThroughRound,4);
});
test('already acted target is deferred next round and retains its current action',()=>{
 const ts=teams({targetFirst:true}),order=orderHeroActions(ts,{round:3});
 const event=applyHeroDelay({teams:ts,order,cursor:2,round:3,side:0,actorId:'actor',targetId:'target'});
 assert.equal(event.dueRound,4);assert.deepEqual(ids(order),['target','actor','ally','rear']);
 assert.deepEqual(ids(orderHeroActions(ts,{round:4})),['actor','ally','rear','target']);
 assert.equal(ts[1][0].delayProtectedThroughRound,5);
});
test('multiple delay sources cannot chain the same target and immunity expires after its protected round',()=>{
 const ts=teams({secondBurst:true});let order=orderHeroActions(ts,{round:3});
 assert.ok(applyHeroDelay({teams:ts,order,cursor:1,round:3,side:0,actorId:'actor',targetId:'target'}));
 assert.equal(applyHeroDelay({teams:ts,order,cursor:2,round:3,side:0,actorId:'ally',targetId:'target'}),null);
 assert.deepEqual(ids(order),['actor','ally','rear','target']);finishHeroDelay(ts[1][0],3);
 // Even an artificial repeat call cannot mutate a protected target.
 ts[1][0].delayProtectedThroughRound=6;
 order=orderHeroActions(ts,{round:6});
 assert.equal(applyHeroDelay({teams:ts,order,cursor:1,round:6,side:0,actorId:'actor',targetId:'target'}),null);
 order=orderHeroActions(ts,{round:9});
 assert.ok(applyHeroDelay({teams:ts,order,cursor:1,round:9,side:0,actorId:'actor',targetId:'target'}));
});
test('ordinary attacks, non-delay skills, dead or missing targets never apply delay',()=>{
 const ts=teams(),order=orderHeroActions(ts,{round:3});const call=extra=>applyHeroDelay({teams:ts,order,cursor:1,round:3,side:0,actorId:'actor',targetId:'target',...extra});
 assert.equal(call({round:2}),null);ts[0][0].active.delay=false;assert.equal(call(),null);ts[0][0].active.delay=true;
 ts[1][0].hp=0;assert.equal(call(),null);assert.equal(call({targetId:'missing'}),null);assert.equal(ts[1][0].delayDueRound,undefined);
});
test('death before a delayed action skips that hero only',()=>{
 const ts=teams(),order=orderHeroActions(ts,{round:3});applyHeroDelay({teams:ts,order,cursor:1,round:3,side:0,actorId:'actor',targetId:'target'});ts[1][0].hp=0;
 const actions=[];let cursor=1,next;while((next=nextScheduledHeroAction(order,cursor))){cursor=next.nextCursor;actions.push(next.unit.id);}
 assert.deepEqual(actions,['ally','rear']);
});
test('haste does not reorder this round; next-round delay priority still wins over raw speed',()=>{
 const ts=teams({targetFirst:true}),order=orderHeroActions(ts,{round:3});applyHeroDelay({teams:ts,order,cursor:2,round:3,side:0,actorId:'actor',targetId:'target'});ts[1][0].speed=999;
 assert.deepEqual(ids(order),['target','actor','ally','rear']);assert.equal(ids(orderHeroActions(ts,{round:4})).at(-1),'target');
 finishHeroDelay(ts[1][0],4);assert.equal(ids(orderHeroActions(ts,{round:5}))[0],'target');
});
test('live cursor emits one atomic delay and executes each living actor exactly once',()=>{
 const c=combat(teams({secondBurst:true})),s=createBasicTurnSession(c,opts),actions=[];
 while(peekBasicTurn(s)){actions.push(peekBasicTurn(s).actorId);stepBasicTurn(s);}
 assert.deepEqual(actions,['actor','ally','rear','target']);assert.equal(c.events.filter(e=>e.action==='delay').length,1);
 assert.equal(c.events.find(e=>e.action==='delay').version,1);assert.equal(c.teams[1][0].delayDueRound,undefined);
 assert.throws(()=>stepBasicTurn(s),/No scheduled hero action/);
});
test('live already-acted target moves to next-round end and status survives authoritative snapshots',()=>{
 const c=combat(teams({targetFirst:true})),s=createBasicTurnSession(c,opts);stepBasicTurn(s);const second=stepBasicTurn(s);
 assert.equal(c.teams[1][0].delayDueRound,4);assert.equal(second.result.teams[1][0].delayDueRound,4);
 const sync=createCommanderSnapshotSync(),snapshot=viewLiveCommanderCombat(c);assert.equal(acceptCommanderSnapshot(sync,snapshot).accepted,true);assert.equal(sync.teams[1][0].delayDueRound,4);
 assert.equal(acceptCommanderSnapshot(sync,snapshot).accepted,false);
 while(peekBasicTurn(s))stepBasicTurn(s);advanceBasicTurnSession(s);assert.equal(s.order.at(-1).id,'target');
 const next=[];while(peekBasicTurn(s)){next.push(peekBasicTurn(s).actorId);stepBasicTurn(s);}assert.equal(next.at(-1),'target');assert.equal(new Set(next).size,4);
});
test('full-health healer fallback uses its special power, with correct damage metadata and shield absorption',()=>{
 const ts=[[hero('heal',40,0,{attack:100,role:'support',active:{effect:'heal',name:'Full health prayer',power:1.12}})],[hero('target',10,0,{shield:100})]];
 const c=combat(ts),r=stepParityBasicAttack(c,{side:0,actorId:'heal',critical:false,allowHealActive:true,specialFallback:true});
 const raw=calculateHeroRawDamage({unit:ts[0][0],target:ts[1][0],skill:ts[0][0].active,special:true});
 assert.equal(raw,53);assert.equal(r.event.rawDamage,53);assert.equal(r.event.absorbed,37);assert.equal(r.event.value,16);assert.equal(r.event.damageType,'special');assert.equal(r.event.action,'Full health prayer');
});
test('live cursor dispatches full-health healer fallback rather than losing special multiplier',()=>{
 const ts=[[hero('heal',40,0,{attack:100,role:'support',active:{effect:'heal',name:'Prayer',power:1.12}})],[hero('target',10)]];
 const c=combat(ts),s=createBasicTurnSession(c,opts),{result}=stepBasicTurn(s);
 assert.equal(result.event.action,'Prayer');assert.equal(result.event.damageType,'special');
 assert.equal(result.event.rawDamage,calculateHeroRawDamage({unit:ts[0][0],target:ts[1][0],skill:ts[0][0].active,special:true,critical:result.event.critical}));
});
test('no-active support full-health fallback uses legacy 1.15, ordinary rounds remain normal',()=>{
 for(const round of [1,3]){const ts=[[hero('support',40,0,{attack:100,role:'support'})],[hero('target',10)]];const c=combat(ts,round),s=createBasicTurnSession(c,opts),{result}=stepBasicTurn(s);assert.equal(result.event.rawDamage,calculateHeroRawDamage({unit:ts[0][0],target:ts[1][0],special:round===3,critical:result.event.critical}));assert.equal(result.event.action,round===3?'special':'attack');}
});
test('special fallback cannot be requested on normal rounds or for utility skills',()=>{
 const c=combat(teams(),1);assert.throws(()=>stepParityBasicAttack(c,{side:0,actorId:'actor',specialFallback:true,allowDamageActive:true}),/Invalid special fallback/);
 c.round=3;assert.throws(()=>stepParityBasicAttack(c,{side:0,actorId:'actor',specialFallback:true,allowDamageActive:true}),/Invalid special fallback/);
});
test('same hero IDs on opposite teams do not confuse the delayed side',()=>{
 const ts=[[hero('mirror',40,0,{active:{...burst}})],[hero('mirror',30),hero('other',10,1,{lane:'back'})]];
 const order=orderHeroActions(ts,{round:3});const event=applyHeroDelay({teams:ts,order,cursor:1,round:3,side:0,actorId:'mirror',targetId:'mirror'});
 assert.ok(event);assert.equal(ts[0][0].delayDueRound,undefined);assert.equal(ts[1][0].delayDueRound,3);assert.equal(order.at(-1).side,1);assert.equal(order.at(-1).unit.id,'mirror');
});
test('a delayed hybrid support still performs its full-health shield action once and clears pending marker',()=>{
 const ts=[[hero('support',90,0,{role:'support',delayDueRound:3,delayProtectedThroughRound:4,active:{effect:'shield',name:'Hybrid',power:1.12,supportHybrid:true,healRate:.52,allyShieldRate:.28}})],[hero('enemy',10)]];
 // Enemy cannot injure the support enough to invalidate the full-HP dispatch check.
 const c=combat(ts),s=createBasicTurnSession(c,{...opts,shieldDrain:true});
 assert.equal(peekBasicTurn(s).actorId,'enemy');stepBasicTurn(s);c.teams[0][0].hp=c.teams[0][0].maxHp;
 const before=c.teams[1][0].hp,{result}=stepBasicTurn(s);
 assert.equal(result.events.length,1);assert.equal(result.events[0].action,'shield');assert.equal(c.teams[1][0].hp,before);
 assert.equal(c.teams[0][0].delayDueRound,undefined);assert.equal(c.teams[0][0].delayProtectedThroughRound,4);assert.equal(peekBasicTurn(s),null);
});
