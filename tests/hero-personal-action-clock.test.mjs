import test from 'node:test';
import assert from 'node:assert/strict';
import {isHeroSpecialTurn,completeHeroAction,heroActionMetadata,initializeHeroActionClocks} from '../public/hero-action-clock.js';
import {createLiveCommanderAbilities,grantLiveCommanderEnergy} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,applyServerHeroAction,beginServerCombatRound} from '../commander-live-combat.js';
import {createLiveArenaSession,stepLiveArenaHero,advanceLiveArenaRound,viewLiveArenaSession} from '../commander-live-arena-session.js';
import {applyServerSpecialHeal} from '../commander-live-special-heal.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {stepBasicHeroCombat} from '../commander-incremental-basic.js';
import {stepParityEnergySplash} from '../commander-parity-energy-splash.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
import {stepParityStatSpecial} from '../commander-parity-stat-special.js';
import {stepParityExecute} from '../commander-parity-execute.js';
import {applyLegacyRoundPassives,applyLegacyStartPassives} from '../commander-parity-passives.js';
import {applyHeroDamage} from '../battle-hp-damage.js';
import {reviveCommanderAlly} from '../commander-ultimate-status.js';
import {simulateBattle} from '../battle-engine.js';

const hero=(id,extra={})=>({id,hp:10000,maxHp:10000,attack:100,defense:50,speed:50,position:0,role:'fighter',lane:'front',shield:0,damage:0,kills:0,healing:0,...extra});
function make({side=0,round=1,actor={},version,legacy=false}={}){
 const teams=[[hero('actor',actor),hero('ally',{position:1,speed:20})],[hero('enemy'),hero('rear',{position:1,lane:'back'})]];
 const commanders=[{commanderId:'defense'},{commanderId:'magic'}];
 if(side){teams.reverse();commanders.reverse();}
 return createLiveCommanderCombat({teams,commanders,round,abilities:createLiveCommanderAbilities({matchKey:'personal-clock',energy:[100,100],now:0}),...(!legacy?{heroActionClockVersion:version??1}:{})});
}
const actorOf=c=>c.teams.flat().find(u=>u.id==='actor');
function stun(c,side=0,id='stun'){
 grantLiveCommanderEnergy(c.abilities,1-side,100);
 return castLiveCommanderCombat(c,{side:1-side,ability:'normal',targetIds:['actor'],requestId:'clock-'+id,matchKey:'personal-clock',now:10000+c.round*10000+(id==='again'?5000:0)});
}
function unchangedOnRepeat(c,run){
 const before=structuredClone(c);
 try{run();}catch(error){assert.ok(error instanceof Error);}
 assert.deepEqual(c,before,'a duplicate direct action must not mutate combat');
}
function assertMetadata(events,count,special){
 assert.ok(events.length);
 for(const event of events){assert.equal(event.heroActionClockVersion,1);assert.equal(event.completedActionTurns,count);assert.equal(event.heroSpecial,special);}
}

test('personal clock uses completed actions; legacy records use global round without migration',()=>{
 const unit={heroActionClockVersion:1,completedActionTurns:2};
 assert.equal(isHeroSpecialTurn(unit,4),true);
 assert.equal(isHeroSpecialTurn({...unit,completedActionTurns:1},3),false);
 assert.equal(isHeroSpecialTurn({},3),true);
 assert.equal(isHeroSpecialTurn({},4),false);
 completeHeroAction(unit,4);
 assert.equal(unit.completedActionTurns,3);assert.equal(unit.lastActionRound,4);
 assert.equal(isHeroSpecialTurn(unit,6),false);
 const metadata=heroActionMetadata(unit,4,true);
 assert.equal(metadata.heroActionClockVersion,1);assert.equal(metadata.completedActionTurns,3);assert.equal(metadata.heroSpecial,true);
});
test('initializer preserves supplied action history and defaults unknown counts to zero',()=>{
 const teams=[[hero('a',{completedActionTurns:5})],[hero('b')]];
 initializeHeroActionClocks(teams);
 assert.equal(teams[0][0].completedActionTurns,5);assert.equal(teams[1][0].completedActionTurns,0);
 assert.ok(teams.flat().every(u=>u.heroActionClockVersion===1));
});
test('new round-one combat defaults to personal clocks; mid-battle records retain legacy semantics',()=>{
 const fresh=make({legacy:true});assert.equal(fresh.heroActionClockVersion,1);
 assert.ok(fresh.teams.flat().every(u=>u.heroActionClockVersion===1&&u.completedActionTurns===0));
 const saved=make({round:7,legacy:true});assert.notEqual(saved.heroActionClockVersion,1);
 assert.ok(saved.teams.flat().every(u=>u.heroActionClockVersion!==1&&u.completedActionTurns===undefined));
 const restored=make({round:7,actor:{completedActionTurns:5}});
 assert.equal(actorOf(restored).completedActionTurns,5);assert.equal(restored.teams[0][1].completedActionTurns,0);
 assert.deepEqual(JSON.parse(JSON.stringify(restored)).teams,restored.teams);
});
for(const side of [0,1])for(const skips of [[3],[3,6]])test(`seat ${side}: ${skips.length} skipped actions shift specials to ${skips.length===1?'4,7':'4,8'}`,()=>{
 const c=make({side,actor:{active:{effect:'burst',name:'clock-burst',power:1.12},speed:100}});
 const session=createLiveArenaSession(c,{parity:true,damageSpecial:true});
 for(let round=1;round<=8;round++){
  if(skips.includes(round))stun(c,side,'stun-'+round);
  while(viewLiveArenaSession(session).nextHero)stepLiveArenaHero(session);
  assert.equal(actorOf(c).completedActionTurns,round-skips.filter(r=>r<=round).length);
  if(round<8)advanceLiveArenaRound(session);
 }
 const special=c.events.filter(e=>e.actor==='actor'&&e.damageType==='special');
 assert.deepEqual(special.map(e=>e.round),skips.length===1?[4,7]:[4,8]);
 assert.deepEqual(special.map(e=>e.completedActionTurns),[3,6]);
 assert.ok(special.every(e=>e.heroSpecial===true));
 assert.deepEqual(c.events.filter(e=>e.actor==='actor'&&e.action==='stun-skip').map(e=>e.round),skips);
});
for(const action of ['attack','heal','shield'])test(`direct ${action} counts once, emits metadata and rejects repeated calls`,()=>{
 const c=make({actor:{hp:9000}});
 const run=()=>applyServerHeroAction(c,{side:0,actorId:'actor',targetId:action==='attack'?'enemy':'actor',action,value:10});
 const result=run();assert.equal(actorOf(c).completedActionTurns,1);assertMetadata([result.event],1,false);
 unchangedOnRepeat(c,run);
});
const specials=[
 ...['burst','pierce','splash','headshot'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},stepParityDamageSpecial]),
 ...['shield','drain'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},stepParityShieldDrain]),
 ...['sunder','weaken','haste'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},stepParityStatSpecial]),
 ['execute',{role:'assassin',active:{effect:'execute',name:'execute',power:1.12}},stepParityExecute],
 ['hybrid',{role:'support',hp:8000,active:{effect:'shield',supportHybrid:true,allyShieldRate:.15,healRate:.5}},applyServerSpecialHeal],
 ['pure heal',{role:'support',hp:8000,active:{effect:'heal',healRate:.5}},applyServerSpecialHeal],
 ['support heal',{role:'support',hp:8000},applyServerSpecialHeal],
 ['energy splash',{role:'energy'},stepParityEnergySplash]
];
for(const [name,extra,step] of specials)test(`${name}: direct special follows personal third action on round four and counts all impact events once`,()=>{
 const c=make({round:4,actor:{...extra,completedActionTurns:2}}),start=c.events.length;
 const run=()=>step(c,{side:0,actorId:'actor',critical:false});run();
 assert.equal(actorOf(c).completedActionTurns,3);assert.equal(actorOf(c).lastActionRound,4);
 assertMetadata(c.events.slice(start),3,true);
 if(name==='hybrid')assert.deepEqual(c.events.slice(start).map(e=>e.action),['heal','shield']);
 if(name==='splash')assert.ok(c.events.length-start>1);
 unchangedOnRepeat(c,run);
 const notDue=make({round:3,actor:{...extra,completedActionTurns:1}}),before=structuredClone(notDue);
 assert.throws(()=>step(notDue,{side:0,actorId:'actor',critical:false}));assert.deepEqual(notDue,before);
});
for(const [name,extra,step] of [['basic',{},stepParityBasicAttack],['prototype',{},stepBasicHeroCombat]])test(`${name}: ordinary direct action advances once`,()=>{
 const c=make({actor:extra});const run=()=>step(c,{side:0,actorId:'actor',critical:false});run();
 assert.equal(actorOf(c).completedActionTurns,1);assertMetadata(c.events,1,false);unchangedOnRepeat(c,run);
});

test('new stun impact advertises passive silence, stays through skip, and does not stack',()=>{
 const c=make({round:3,actor:{completedActionTurns:2}});const result=stun(c);
 const impact=result.events.flatMap(e=>e.impacts||[]).find(i=>i.kind==='stun');
 assert.equal(impact.stunVersion,2);assert.equal(impact.blockedRound,3);assert.equal(impact.passiveSilence,true);
 stun(c,0,'again');assert.equal(actorOf(c).commanderStunBlockedRound,3);
 const skip=applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'enemy',value:10});assert.equal(skip.event.action,'stun-skip');
 assert.equal(actorOf(c).completedActionTurns,2);assert.equal(actorOf(c).lastActionRound,3);
 assert.equal(actorOf(c).commanderStunNextAction,undefined);assert.equal(actorOf(c).commanderStunVersion,2);assert.equal(actorOf(c).commanderStunBlockedRound,3);
 unchangedOnRepeat(c,()=>applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'enemy',value:10}));
 beginServerCombatRound(c,4);assert.equal(isHeroSpecialTurn(actorOf(c),4),true);
 applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'enemy',value:10});assert.equal(actorOf(c).completedActionTurns,3);
});
test('cast after action blocks next round without delaying clock or undoing current round',()=>{
 const c=make({actor:{hp:8000,passive:{effect:'regen',value:.05}}});
 applyLegacyRoundPassives(c);applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'enemy',value:10});stun(c);
 assert.equal(actorOf(c).commanderStunBlockedRound,2);assert.equal(actorOf(c).completedActionTurns,1);
 beginServerCombatRound(c,2);const before=actorOf(c).hp;applyLegacyRoundPassives(c);assert.equal(actorOf(c).hp,before);
 assert.equal(applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'enemy',value:10}).event.action,'stun-skip');
 beginServerCombatRound(c,3);applyLegacyRoundPassives(c);assert.equal(actorOf(c).hp,before+500);
});
for(const passive of ['regen','rage'])for(const side of [0,1])test(`${passive}, seat ${side}: new passive suppressed before and after stun skip, resumes next round`,()=>{
 const c=make({side,actor:{hp:4000,passive:{effect:passive,value:.1}}});stun(c,side);
 const before=structuredClone(actorOf(c));applyLegacyRoundPassives(c);
 assert.equal(actorOf(c).hp,before.hp);assert.equal(actorOf(c).attack,before.attack);assert.equal(actorOf(c).rageActivated,undefined);
 applyServerHeroAction(c,{side,actorId:'actor',targetId:'enemy',value:1});applyLegacyRoundPassives(c);
 assert.equal(actorOf(c).hp,before.hp);assert.equal(actorOf(c).attack,before.attack);assert.equal(actorOf(c).completedActionTurns,0);
 beginServerCombatRound(c,2);applyLegacyRoundPassives(c);
 if(passive==='regen')assert.equal(actorOf(c).hp,before.hp+1000);else assert.equal(actorOf(c).attack,110);
 assert.equal(actorOf(c).completedActionTurns,0,'passives themselves are not completed actions');
});
test('silence leaves preexisting rage, start buffs, shields and incoming allied healing intact',()=>{
 const c=make({actor:{hp:4000,shield:500,rageActivated:true,passive:{effect:'rage',value:.1}}});
 c.teams=applyLegacyStartPassives(c.teams.map(team=>team.map(u=>u.id==='actor'?{...u,passive:{effect:'focus',value:.2}}:u)));
 const attack=actorOf(c).attack;stun(c);const hp=actorOf(c).hp,shield=actorOf(c).shield;
 assert.equal(actorOf(c).attack,attack);assert.equal(actorOf(c).rageActivated,true);
 applyLegacyRoundPassives(c);assert.equal(actorOf(c).shield,shield);
 applyServerHeroAction(c,{side:0,actorId:'ally',targetId:'actor',action:'heal',value:100});
 assert.equal(actorOf(c).hp,hp+100);assert.equal(actorOf(c).completedActionTurns,0);assert.equal(actorOf(c).commanderStunNextAction,true);
});
for(const flag of ['commanderStunNextAction','commanderStunNextAttack'])test(`historical ${flag} does not acquire passive silence or personal action clock`,()=>{
 const c=make({round:3,legacy:true,actor:{hp:4000,passive:{effect:'regen',value:.1},[flag]:true}});
 applyLegacyRoundPassives(c);assert.equal(actorOf(c).hp,5000);assert.equal(actorOf(c).heroActionClockVersion,undefined);
 assert.equal(actorOf(c).commanderStunVersion,undefined);
});
test('new casts silence passives in historical battles without upgrading their clock',()=>{
 const c=make({round:3,legacy:true,actor:{hp:4000,passive:{effect:'regen',value:.1}}});stun(c);
 const hp=actorOf(c).hp;applyLegacyRoundPassives(c);assert.equal(actorOf(c).hp,hp);
 assert.equal(actorOf(c).heroActionClockVersion,undefined);assert.equal(actorOf(c).completedActionTurns,undefined);
 assert.equal(isHeroSpecialTurn(actorOf(c),3),true);
});
test('death and revival clear stun metadata but preserve completed actions; revived eligibility delays stun round',()=>{
 const c=make({round:3,actor:{completedActionTurns:2}});stun(c);
 let actor=actorOf(c);applyHeroDamage(actor,100000,{round:3,allies:c.teams[0]});
 for(const key of ['commanderStunNextAction','commanderStunVersion','commanderStunBlockedRound'])assert.equal(actor[key],undefined);
 assert.equal(actor.completedActionTurns,2);
 assert.throws(()=>applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'enemy',value:10}));assert.equal(actor.completedActionTurns,2);
 reviveCommanderAlly(actor,3);assert.equal(actor.completedActionTurns,2);assert.equal(actor.canActFromRound,4);
 stun(c,0,'again');actor=actorOf(c);assert.equal(actor.commanderStunBlockedRound,4);
 unchangedOnRepeat(c,()=>applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'enemy',value:10}));
 assert.equal(actorOf(c).completedActionTurns,2);
});
test('finish removes passive-silence metadata from survivors without resetting their clock',()=>{
 const c=make({round:15,actor:{completedActionTurns:12,speed:100}});
 const session=createLiveArenaSession(c,{parity:true});stepLiveArenaHero(session);stun(c);
 while(viewLiveArenaSession(session).nextHero)stepLiveArenaHero(session);
 assert.equal(c.finished,true);assert.equal(actorOf(c).completedActionTurns,13);
 for(const unit of c.teams.flat())for(const key of ['commanderStunNextAction','commanderStunVersion','commanderStunBlockedRound'])assert.equal(unit[key],undefined);
});

const cards=prefix=>Array.from({length:5},(_,i)=>({id:prefix+i,power:100,role:i===4?'support':'tank',lane:i<2?'front':'back',active:i===4?{effect:'heal',name:'heal',healRate:.5}:null,passive:{effect:'regen',value:.5}}));
for(const side of [0,1])test(`simulator seat ${side}: personal healing specials shift with two stuns while explicit version zero preserves round clock`,()=>{
 const teams=[cards('a'),cards('b')],target=(side?'b':'a')+'4';
 const commanders=[{commanderId:'defense',levels:{attack:0,defense:0,magic:0,support:0}},{commanderId:'magic',levels:{attack:0,defense:0,magic:40,support:0}}];if(side)commanders.reverse();
 const options={seed:'personal-clock-parity',maxRounds:8,partial:true,remainingCredits:[10000,10000],commanders,commanderActions:[3,6].map(round=>({round,side:1-side,ability:'normal',targetIds:[target]}))};
 const result=simulateBattle(...teams,options);
 assert.equal(result.heroActionClockVersion,1);
 const unit=result.teams.flat().find(u=>u.id===target);assert.ok(unit.hp>0,'target survives the fixture');assert.equal(unit.completedActionTurns,6);
 const events=result.log.filter(e=>e.actor===target&&e.action==='heal');
 assert.deepEqual([...new Set(events.map(e=>e.round))],[4,8]);assert.ok(events.every(e=>e.heroSpecial===true));
 const legacy=simulateBattle(...teams,{...options,heroActionClockVersion:0});
 assert.notEqual(legacy.heroActionClockVersion,1);assert.ok(legacy.teams.flat().every(u=>u.heroActionClockVersion!==1));
 assert.equal(legacy.log.some(e=>e.actor===target&&e.action==='heal'&&[4,8].includes(e.round)),false);
});

test('legacy direct actions retain repeat-call semantics while new units are fenced',()=>{
 const c=make({round:2,legacy:true});
 for(let i=0;i<2;i++)applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'enemy',value:10});
 assert.equal(c.teams[1][0].hp,9980);assert.equal(actorOf(c).completedActionTurns,undefined);
 assert.equal(c.events.length,2);
});
test('basic special fallback follows the third personal action rather than global round',()=>{
 const c=make({round:4,actor:{completedActionTurns:2}});
 const run=()=>stepParityBasicAttack(c,{side:0,actorId:'actor',specialFallback:true,critical:false});
 const out=run();assert.equal(out.event.damageType,'special');assertMetadata([out.event],3,true);unchangedOnRepeat(c,run);
});
for(const side of [0,1])test(`live and deterministic simulator agree on hero action numbering and specials after two stuns, seat ${side}`,()=>{
 const active={effect:'heal',name:'heal',healRate:.5};
 const live=make({side,actor:{role:'support',hp:6000,active}}),session=createLiveArenaSession(live,{parity:true,specialHealing:true});
 for(let round=1;round<=8;round++){
  if([3,6].includes(round))stun(live,side,'parity-'+round);
  while(viewLiveArenaSession(session).nextHero)stepLiveArenaHero(session);
  if(round<8)advanceLiveArenaRound(session);
 }
 const commanders=[{commanderId:'defense',levels:{attack:0,defense:0,magic:0,support:0}},{commanderId:'magic',levels:{attack:0,defense:0,magic:40,support:0}}];if(side)commanders.reverse();
 const target=(side?'b':'a')+'4';
 const simulated=simulateBattle(cards('a'),cards('b'),{seed:'clock-live-parity',maxRounds:8,partial:true,remainingCredits:[10000,10000],commanders,commanderActions:[3,6].map(round=>({round,side:1-side,ability:'normal',targetIds:[target]}))});
 const summarize=(events,id)=>events.filter(e=>e.actor===id&&['heal','stun-skip'].includes(e.action)).map(({round,action,completedActionTurns,heroSpecial})=>({round,action,completedActionTurns,heroSpecial}));
 assert.deepEqual(summarize(live.events,'actor'),summarize(simulated.log,target));
 assert.equal(actorOf(live).completedActionTurns,simulated.teams[side].find(u=>u.id===target).completedActionTurns);
});

for(const passive of ['regen','rage'])test(`${passive}: a recast after skip preserves silence for the consumed round and queues just one following skip`,()=>{
 const c=make({round:3,actor:{hp:4000,completedActionTurns:2,passive:{effect:passive,value:.1}}});
 stun(c);applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'enemy',value:1});
 stun(c,0,'again');assert.equal(actorOf(c).commanderStunConsumedRound,3);assert.equal(actorOf(c).commanderStunBlockedRound,4);
 const before=actorOf(c).hp;applyLegacyRoundPassives(c);assert.equal(actorOf(c).hp,before);assert.equal(actorOf(c).rageActivated,undefined);
 beginServerCombatRound(c,4);assert.equal(actorOf(c).commanderStunConsumedRound,undefined);applyLegacyRoundPassives(c);assert.equal(actorOf(c).hp,before);
 assert.equal(applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'enemy',value:1}).event.action,'stun-skip');assert.equal(actorOf(c).completedActionTurns,2);
 beginServerCombatRound(c,5);applyLegacyRoundPassives(c);
 if(passive==='regen')assert.equal(actorOf(c).hp,before+1000);else assert.equal(actorOf(c).rageActivated,true);
});
test('direct basic special uses the central personal clock when caller omits fallback flag',()=>{
 const c=make({round:4,actor:{completedActionTurns:2}});
 const result=stepParityBasicAttack(c,{side:0,actorId:'actor',critical:false});
 assert.equal(result.event.damageType,'special');assert.equal(result.event.heroSpecial,true);assert.equal(actorOf(c).completedActionTurns,3);
});
