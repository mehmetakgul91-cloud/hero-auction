import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {replayCommanderTranscript} from '../commander-transcript.js';
import {viewRoomCommanderSession} from '../commander-room-bridge.js';
import assert from 'node:assert/strict';
import {grantCommanderFocus,selectCommanderFocusTarget,expireCommanderFocus,consumeCommanderFocus} from '../battle-commander-focus.js';
import {selectBattleTarget} from '../battle-target-selection.js';
import {applyHeroDamage,grantLastStand} from '../battle-hp-damage.js';
import {reviveCommanderAlly} from '../commander-ultimate-status.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,viewLiveCommanderCombat,applyServerHeroAction,beginServerCombatRound} from '../commander-live-combat.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
import {stepParityEnergySplash} from '../commander-parity-energy-splash.js';
import {stepParityExecute} from '../commander-parity-execute.js';
import {stepParityStatSpecial} from '../commander-parity-stat-special.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
import {applyServerSplashAction} from '../commander-live-splash.js';
import {createBasicTurnSession,peekBasicTurn,stepBasicTurn,advanceBasicTurnSession} from '../commander-basic-turn-session.js';
import {createLiveArenaSession,stepLiveArenaHero,viewLiveArenaSession} from '../commander-live-arena-session.js';
import {createCommanderSnapshotSync,acceptCommanderSnapshot} from '../commander-snapshot-sync.js';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';
import {chooseBotCast} from '../bot-strategy.js';
import {battleRoster} from '../battle-roster.js';
import {simulateBattle,fighterFromCard} from '../battle-engine.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
const hero=(id,extra={})=>({id,name:id,hp:10000,maxHp:10000,attack:20,defense:50,speed:50,position:0,role:'fighter',lane:'front',shield:0,...extra});
const make=({round=1,actor={},target={},allies}={})=>createLiveCommanderCombat({round,teams:[allies??[hero('actor',{speed:90,...actor}),hero('ally',{speed:80,position:1})],[hero('front',{speed:20}),hero('chosen',{speed:10,lane:'back',position:1,...target})]],abilities:createLiveCommanderAbilities({matchKey:'hunt',energy:[100,100],ultimateEnergy:[100,100],now:0}),commanders:[{commanderId:'attack'},{commanderId:'support'}]});
const cast=c=>castLiveCommanderCombat(c,{side:0,ability:'ultimate',targetIds:['chosen'],requestId:'hunt-first',matchKey:'hunt',now:0});
const marked=c=>c.teams[1].find(u=>u.id==='chosen');
const options={parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true};

test('all five allies keep focus across six actual rounds and repeated attacks; no action or damage bonus',()=>{
 const c=make({allies:Array.from({length:5},(_,i)=>hero('ally-'+i,{speed:90-i,position:i}))}),before=c.teams.map(t=>t.map(u=>[u.hp,u.attack,u.defense,u.speed]));
 const r=cast(c);assert.deepEqual(c.teams.map(t=>t.map(u=>[u.hp,u.attack,u.defense,u.speed])),before);assert.equal(r.events.length,1);assert.equal(r.events[0].focusUntilDeath,true);assert.equal(r.events[0].impacts[0].untilDeath,true);assert.deepEqual([c.abilities.energy[0],c.abilities.ultimateEnergy[0],c.abilities.ultimateUsed[0]],[100,25,true]);
 const s=createBasicTurnSession(c,options);
 for(let round=1;round<=6;round++){
  let actions=0;
  while(peekBasicTurn(s)){const {result}=stepBasicTurn(s);actions++;for(const event of result.events??[result.event])if(event.side===0&&event.rawDamage!==undefined){assert.equal(event.target,'chosen');assert.equal(event.action==='splash',false);}}
  assert.equal(actions,7,'one scheduled action per living hero');assert.equal(marked(c).commanderFocusUntilDeath,true);if(round<6)advanceBasicTurnSession(s);
 }
 const ownHits=c.events.filter(e=>e.side===0&&e.rawDamage!==undefined);assert.equal(ownHits.length,30);
 const a=stepParityBasicAttack(c,{side:0,actorId:'ally-0'}),b=stepParityBasicAttack(c,{side:0,actorId:'ally-0'});assert.equal(a.event.target,'chosen');assert.equal(b.event.target,'chosen');assert.equal(a.event.rawDamage,b.event.rawDamage);
 assert.ok(c.teams[0].every(u=>u.commanderFocusUntilRound===undefined&&u.commanderFocusTargetId===undefined));
 const json=JSON.stringify(viewLiveCommanderCombat(c));assert.equal(JSON.parse(json).teams[1][1].commanderFocusUntilDeath,true);assert.doesNotMatch(json,/Infinity|untilRound.*null/);
});

for(const [name,actor,step]of[
 ['basic',{},c=>stepParityBasicAttack(c,{side:0,actorId:'actor'})],
 ['assassin',{role:'assassin'},c=>stepParityBasicAttack(c,{side:0,actorId:'actor'})],
 ...['burst','pierce','splash','headshot'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityDamageSpecial(c,{side:0,actorId:'actor'})]),
 ['energy',{role:'energy'},c=>stepParityEnergySplash(c,{side:0,actorId:'actor'})],
 ['execute',{role:'assassin',active:{effect:'execute',name:'execute',power:1.12}},c=>stepParityExecute(c,{side:0,actorId:'actor'})],
 ...['sunder','weaken','haste'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityStatSpecial(c,{side:0,actorId:'actor'})]),
 ...['shield','drain'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityShieldDrain(c,{side:0,actorId:'actor'})])
])test(name+' honors persistent focus on successive attacks without changing secondary AoE targets',()=>{
 const c=make({round:3,actor});if(name==='headshot')grantLastStand(marked(c),3);cast(c);
 for(let i=0;i<2;i++){const r=step(c),events=r.events??[r.event],damage=events.filter(e=>e.rawDamage!==undefined);assert.equal(damage[0].target,'chosen');for(const e of damage.slice(1))assert.equal(e.target,'front');assert.equal(marked(c).commanderFocusUntilDeath,name==='headshot'&&i===1?undefined:true);}
});

test('first death cancels immediately; next hero returns to normal targeting, revival never restores focus',()=>{
 const c=make({target:{hp:1}});cast(c);stepParityBasicAttack(c,{side:0,actorId:'actor'});assert.equal(marked(c).hp,0);assert.equal(marked(c).commanderFocusUntilDeath,undefined);
 assert.equal(stepParityBasicAttack(c,{side:0,actorId:'ally'}).event.target,'front');
 reviveCommanderAlly(marked(c),1);assert.equal(selectBattleTarget(c.teams[1],c.teams[0][0],2).id,'front');assert.equal(marked(c).commanderFocusUntilDeath,undefined);
 assert.throws(()=>castLiveCommanderCombat(c,{side:0,ability:'ultimate',targetIds:['chosen'],requestId:'hunt-second',matchKey:'hunt',now:5000}),/ultimate already used/);
});
test('a 1-HP Last Bastion guard does not end focus; the following lethal hit does',()=>{
 const c=make({target:{hp:2}});grantLastStand(marked(c),1);cast(c);const hit=stepParityBasicAttack(c,{side:0,actorId:'actor'});assert.equal(hit.event.guardTriggered,true);assert.equal(marked(c).hp,1);assert.equal(marked(c).commanderFocusUntilDeath,true);
 assert.equal(stepParityBasicAttack(c,{side:0,actorId:'ally'}).event.target,'chosen');assert.equal(marked(c).hp,0);assert.equal(marked(c).commanderFocusUntilDeath,undefined);
});
test('execute cancels on the atomic death before any expiry pass or revival',()=>{
 const c=make({round:3,actor:{attack:1,role:'assassin',active:{effect:'execute',name:'execute',power:1.12}},target:{hp:100,maxHp:1000}});cast(c);
 const r=stepParityExecute(c,{side:0,actorId:'actor'});assert.ok(r.event.executedDamage>0);assert.equal(marked(c).hp,0);assert.equal(marked(c).commanderFocusUntilDeath,undefined);reviveCommanderAlly(marked(c),3);assert.equal(selectBattleTarget(c.teams[1],c.teams[0][1],4).id,'front');
});
test('commander damage, secondary AoE death and simultaneous AoE casualties end the original order',()=>{
 for(const method of ['commander','secondary','multi']){
  const c=make({round:3,actor:{role:'energy',attack:100},target:{hp:1}});if(method==='multi')c.teams[1][0].hp=1;cast(c);
  if(method==='commander')castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'normal-kill',matchKey:'hunt',now:1200});
  else if(method==='secondary')applyServerSplashAction(c,{side:0,actorId:'actor',primaryTargetId:'front',primaryRaw:100});
  else stepParityEnergySplash(c,{side:0,actorId:'actor'});
  assert.equal(marked(c).hp,0,method);assert.equal(marked(c).commanderFocusUntilDeath,undefined,method);
  if(method!=='multi'){reviveCommanderAlly(marked(c),3);assert.equal(selectBattleTarget(c.teams[1],c.teams[0][1],4).id,'front');}else assert.equal(c.finished,true);
 }
});
test('an allied revival joins the team order without carrying a stale per-hero token',()=>{
 const c=make({allies:[hero('actor'),hero('fallen',{hp:0,speed:90})]});cast(c);reviveCommanderAlly(c.teams[0][1],1);assert.equal(c.teams[0][1].commanderFocusTargetId,undefined);beginServerCombatRound(c,2);assert.equal(stepParityBasicAttack(c,{side:0,actorId:'fallen'}).event.target,'chosen');
});
test('target death and revival inside one sequence cannot restore a JSON-safe mark',()=>{
 const c=make({target:{hp:1}});cast(c);const target=marked(c);applyHeroDamage(target,1,{round:1,allies:c.teams[1]});reviveCommanderAlly(target,1);assert.equal(selectCommanderFocusTarget(c.teams[0][0],c.teams[1],2),null);
});
test('healing and hybrid shielding stay non-attacks after the old next-round expiry',()=>{
 for(const active of[{effect:'heal',name:'heal',power:1.12},{effect:'shield',name:'hybrid',supportHybrid:true,healRate:.52,allyShieldRate:.28}]){
  const c=make({actor:{role:'support',active}});cast(c);for(let r=2;r<=6;r++)beginServerCombatRound(c,r);c.teams[0][1].hp=500;const before=marked(c).hp;const session=createBasicTurnSession(c,options);const {result}=stepBasicTurn(session);assert.equal(marked(c).hp,before);assert.equal(marked(c).commanderFocusUntilDeath,true);assert.ok((result.events??[result.event]).some(e=>e.action==='heal'));assert.equal(c.teams[0][0].damage??0,0);
 }
});
test('elimination and final-round finish clear the mark even when the chosen enemy survives',()=>{
 const c=make({allies:[hero('actor',{hp:1})]});cast(c);applyServerHeroAction(c,{side:1,actorId:'front',targetId:'actor',value:1});assert.equal(c.finished,true);assert.equal(marked(c).commanderFocusUntilDeath,undefined);
 const d=make({round:15});cast(d);const session=createLiveArenaSession(d,options);let last;while(!d.finished)last=stepLiveArenaHero(session);assert.equal(marked(d).commanderFocusUntilDeath,undefined);assert.equal(last.result.teams[1][1].commanderFocusUntilDeath,undefined);assert.equal(viewLiveArenaSession(session).finished,true);
});
test('reconnect ignores stale snapshots after first death and cannot recreate focus',()=>{
 const c=make({target:{hp:1}});cast(c);const sync=createCommanderSnapshotSync(),active=JSON.parse(JSON.stringify(viewLiveCommanderCombat(c)));assert.equal(acceptCommanderSnapshot(sync,active).accepted,true);stepParityBasicAttack(c,{side:0,actorId:'actor'});const ended=viewLiveCommanderCombat(c);assert.equal(acceptCommanderSnapshot(sync,ended).accepted,true);assert.equal(acceptCommanderSnapshot(sync,active).accepted,false);assert.equal(sync.teams[1][1].commanderFocusUntilDeath,undefined);
});
test('forged focus state and target IDs in cast payload do not override authoritative manual selection',()=>{
 const c=make(),before=structuredClone(c);assert.throws(()=>castLiveCommanderCombat(c,{side:0,ability:'ultimate',requestId:'bad-mark',matchKey:'hunt',now:0,targetIds:['missing'],teams:[[],[{id:'missing',hp:1,commanderFocusUntilDeath:true}]],commanderFocusTargetId:'chosen',commanderFocusUntilDeath:true}));assert.deepEqual(c,before);
 const result=castLiveCommanderCombat(c,{side:0,ability:'ultimate',requestId:'good-mark',matchKey:'hunt',now:0,targetIds:['chosen'],commanderFocusTargetId:'front',focusUntilDeath:false});assert.equal(result.teams[1][0].commanderFocusUntilDeath,undefined);assert.equal(result.teams[1][1].commanderFocusUntilDeath,true);
});
test('new battle preparation drops injected or previous-match focus flags',()=>{
 const card=id=>({id,power:80,role:'fighter',commanderFocusUntilDeath:true,commanderFocusTargetId:'previous',commanderFocusUntilRound:999});const a=battleRoster.slice(0,5).map(u=>card(u.id)),b=battleRoster.slice(5,10).map(u=>card(u.id));
 const teams=prepareLiveArenaTeams(a,b,{cardAdapter:'auction'});assert.ok(teams.flat().every(u=>u.commanderFocusUntilDeath===undefined&&u.commanderFocusTargetId===undefined));assert.equal(fighterFromCard(a[0]).commanderFocusUntilDeath,undefined);
});
test('old timed per-ally tokens remain one-use and expire rather than becoming until-death',()=>{
 const a=[hero('a',{commanderFocusTargetId:'chosen',commanderFocusUntilRound:3})],e=[hero('front'),hero('chosen',{lane:'back'})];assert.equal(selectBattleTarget(e,a[0],3).id,'chosen');consumeCommanderFocus(a[0]);assert.equal(selectBattleTarget(e,a[0],3).id,'front');a[0].commanderFocusTargetId='chosen';a[0].commanderFocusUntilRound=3;expireCommanderFocus([a,e],4);assert.equal(selectBattleTarget(e,a[0],4).id,'front');assert.ok(e.every(u=>u.commanderFocusUntilDeath===undefined));
});
test('bot sees an active until-death order without legacy timer fields or state mutation',()=>{
 const c=make();cast(c);const snapshot={round:100,teams:c.teams,abilities:[{energy:100,ultimateEnergy:100,canUseNormal:true,canUseUltimate:true},{}]},before=structuredClone(snapshot);assert.equal(chooseBotCast(snapshot,'attack','hard',{side:0,now:10000,lastCastAt:0,startedAt:0}),null);assert.deepEqual(snapshot,before);
});
test('replay reconstructs focus from its new cast event only, ends on execute/death, never on revival',()=>{
 const teams=[[hero('actor')],[hero('front'),hero('chosen',{hp:0,maxHp:100})]],replay=createBattleReplayHealth(teams);const event={round:1,side:0,actor:'commander:0',action:'commander-attack-ultimate',focusUntilDeath:true,impacts:[{kind:'focus',target:'chosen',value:1,untilDeath:true}],version:1};replay.apply(event);assert.equal(replay.statusSnapshot()[1][1].commanderFocusUntilDeath,true);replay.apply({round:9,side:0,actor:'actor',action:'execute',target:'chosen',value:1,executedDamage:99,damageType:'special',version:2});assert.equal(replay.statusSnapshot()[1][1].commanderFocusUntilDeath,undefined);replay.apply({round:9,side:1,actor:'commander:1',action:'commander-revive',target:'chosen',value:40,version:3});replay.apply(structuredClone(event));assert.equal(replay.statusSnapshot()[1][1].commanderFocusUntilDeath,undefined);
 const old=createBattleReplayHealth(teams);old.apply({...event,focusUntilDeath:undefined});assert.equal(old.statusSnapshot()[1][1].commanderFocusUntilDeath,undefined);
});
test('legacy/training simulation keeps the chosen target beyond one attack/next round without extra actions',()=>{
 const cards=prefix=>Array.from({length:5},(_,i)=>({id:prefix+i,power:100,role:'tank',lane:i<2?'front':'back',passive:{effect:'regen',value:1}}));
 const result=simulateBattle(cards('a'),cards('b'),{maxRounds:10,seed:'hunt-stable',remainingCredits:[1000,1000],commanders:[{commanderId:'attack',levels:{attack:40,defense:0,magic:0,support:0}},{commanderId:'defense',levels:{attack:0,defense:0,magic:0,support:0}}],commanderActions:[{round:3,side:0,ability:'ultimate',targetIds:['b4']}]});
 const cast=result.log.find(e=>e.action==='commander-attack-ultimate');assert.equal(cast.focusUntilDeath,true);const hits=result.log.filter(e=>e.side===0&&e.rawDamage!==undefined&&e.round>=3);assert.equal(hits.length,40);assert.ok(hits.every(e=>e.target==='b4'));assert.ok(hits.some(e=>e.round===10));assert.ok(result.teams.flat().every(u=>u.commanderFocusUntilDeath===undefined));
});

test('interim transcript and round snapshot retain focus; terminal transcript clears it',()=>{
 const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,power:100,role:'tank',passive:{effect:'regen',value:1}}));
 const commanders=['attack','defense'].map(commanderId=>({commanderId,levels:{attack:40,defense:0,magic:0,support:0}}));commanders[1].levels.attack=0;
 const turns=Array.from({length:6},(_,i)=>[{command:i===2?'ultimate':'pass',...(i===2?{targetIds:['b4']}:{})},{command:'pass'}]);
 const result=replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns,remainingCredits:[1000,1000]});assert.equal(result.teams[1][4].commanderFocusUntilDeath,true);
 const room={code:'123',created:1,players:[{token:'left'},{token:'right'}]},bound={code:'123',matchKey:'1:1',session:{commanders,result,round:7,turns,pending:[undefined,undefined],finished:false}};
 assert.equal(viewRoomCommanderSession(room,bound,'left').roundTeams[1][4].commanderFocusUntilDeath,true);
 const terminal=replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns,maxRounds:6,remainingCredits:[1000,1000]});assert.equal(terminal.teams[1][4].commanderFocusUntilDeath,undefined);
});
test('shipped live snapshot handler removes omitted focus on death, revival and final snapshot',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8'),listeners=new Map(),states=[[hero('actor')],[hero('chosen')]];
 const context={window:{addEventListener:(name,fn)=>listeners.set(name,fn)},timer:null,states,victoryRevealDone:false,feedbackVersion:0,render(){},$:()=>({}),liveArenaMode:false,appendBattleFeedback(){},showBattleFeedback(){}};
 const start=source.indexOf("window.addEventListener('heroarena:experimental-round-end'"),end=source.indexOf('const arenaArtCache=',start);runInNewContext(source.slice(start,end),context);
 const update=(hp,active=false,finished=false)=>listeners.get('heroarena:experimental-round-end')({detail:{teams:[[hero('actor')],[hero('chosen',{hp,...(active?{commanderFocusUntilDeath:true}:{})})]],round:3,events:[],finished}});
 update(100,true);assert.equal(states[1][0].commanderFocusUntilDeath,true);update(0);assert.equal(states[1][0].commanderFocusUntilDeath,undefined);update(40);assert.equal(states[1][0].commanderFocusUntilDeath,undefined);update(40,true,true);assert.equal(states[1][0].commanderFocusUntilDeath,undefined);
});
test('shipped replay frame and finish handler clear focus rather than merging stale state',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8'),states=[[hero('actor')],[hero('chosen',{commanderFocusUntilDeath:true})]],listeners=new Map();
 const context={states,last:{snapshot:[[100],[40]],statusSnapshot:[[{}],[{}]]},window:{addEventListener:(name,fn)=>listeners.set(name,fn)},syncArenaWeather(){},stopArenaMusic(){},releaseArenaWakeLock(){},battlePresentationFinished:false};
 const start=source.indexOf(' states.forEach((t,side)=>t.forEach((u,i)=>{u.hp=last.snapshot'),end=source.indexOf('\n const defeatedSide=',start);runInNewContext(source.slice(start,end),context);assert.equal(states[1][0].commanderFocusUntilDeath,undefined);
 states[1][0].commanderFocusUntilDeath=true;const finish=source.indexOf("window.addEventListener('heroarena:battle-finished',()=>{");runInNewContext(source.slice(finish,source.indexOf("window.addEventListener('heroarena:connection-lost'",finish)),context);listeners.get('heroarena:battle-finished')();assert.equal(states[1][0].commanderFocusUntilDeath,undefined);
 const replay=createBattleReplayHealth(states);replay.apply({side:0,action:'commander-attack-ultimate',focusUntilDeath:true,impacts:[{kind:'focus',target:'chosen',untilDeath:true}]});assert.equal(replay.statusSnapshot()[1][0].commanderFocusUntilDeath,true);replay.finish();assert.equal(replay.statusSnapshot()[1][0].commanderFocusUntilDeath,undefined);
 assert.match(source,/if\(!liveArenaMode&&events.length\)\{replayHealth.finish\(\)/);
});
