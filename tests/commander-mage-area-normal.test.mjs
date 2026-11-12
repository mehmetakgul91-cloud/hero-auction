import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities,grantLiveCommanderEnergy} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,viewLiveCommanderCombat} from '../commander-live-combat.js';
import {applyBattleLogHeroEvent} from '../commander-battle-log-bridge.js';
import {createLiveArenaRegistry} from '../commander-live-arena-registry.js';
import {captureMagicNormalPower} from '../commander-magic-normal-power.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {grantArcaneSurge} from '../commander-ultimate-status.js';
import {grantLastStand} from '../battle-hp-damage.js';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';
import {createCommanderSnapshotSync,acceptCommanderSnapshot} from '../commander-snapshot-sync.js';
import {summarizeBattle} from '../public/battle-summary-data.js';
const profile=(level=15)=>({commanderId:'magic',levels:{attack:0,defense:0,magic:level,support:0}});
const hero=(id,extra={})=>({id,hp:1000,maxHp:1000,attack:100,defense:20,shield:0,speed:50,position:0,lane:'front',role:'fighter',...extra});
const allies=()=>[hero('a0',{role:'energy',attack:120}),hero('a1',{role:'energy',attack:80}),hero('a2'),hero('a3'),hero('a4')];
const enemies=()=>Array.from({length:5},(_,i)=>hero('b'+i,{position:i,lane:i<2?'front':'back'}));
function make({level=15,side=0,enemy=enemies(),own=allies(),energy=100,round=2}={}){
 const teams=side?[enemy,own]:[own,enemy];
 return createLiveCommanderCombat({teams,commanders:[profile(level),profile(level)],round,abilities:createLiveCommanderAbilities({matchKey:'mage-area',energy:[energy,energy],now:0})});
}
const cast=(c,extra={})=>castLiveCommanderCombat(c,{side:0,ability:'normal',targetIds:['b3'],requestId:'mage-area-cast',matchKey:'mage-area',now:1000,...extra});
const hits=result=>result.events.filter(event=>event.action==='commander-hit');
const stun=result=>result.events.at(-1).impacts.filter(impact=>impact.kind==='stun');
for(const side of [0,1])test(`seat ${side}: 25 main plus 6 EACH adjacent/diagonal, one main-only next-action stun`,()=>{
 const c=make({side}),result=cast(c,{side});
 assert.deepEqual(hits(result).map(e=>[e.target,e.rawDamage,e.value]),[['b3',25,25],['b0',6,6],['b1',6,6],['b2',6,6],['b4',6,6]]);
 assert.deepEqual(stun(result),[{target:'b3',kind:'stun',value:1,nextAction:true,stunVersion:2,blockedRound:2,passiveSilence:true}]);
 assert.equal(result.events.at(-1).value,49);
 assert.deepEqual(c.teams[1-side].map(u=>u.commanderStunNextAction),[undefined,undefined,undefined,true,undefined]);
 assert.ok(c.teams[1-side].every(u=>u.commanderStunNextAttack===undefined));
 assert.equal(c.abilities.energy[side],40);assert.equal(c.abilities.ultimateEnergy[side],100);
 assert.equal(c.abilities.cooldownUntil[side],6000);assert.equal(c.abilities.effectUntil,2200);
});
for(const [level,power,main,area] of [[0,0,0,0],[0,270,14,4],[15,12.4,16,4],[40,200,50,13]])test(`rounding/zero main ${main} gives each neighbor ${area}`,()=>{
 const c=make({level,own:[hero('source',{role:'energy',attack:power})]}),out=cast(c);
 assert.deepEqual(hits(out).map(e=>e.rawDamage),[main,area,area,area,area]);
 assert.equal(c.teams[1][3].commanderStunNextAction,true,'even zero damage can stun a living selected target');
});
test('rear edge hits nearest front and rear center, not farther diagonal or other rear edge',()=>{
 const out=cast(make(),{targetIds:['b2']});
 assert.deepEqual(hits(out).map(e=>e.target),['b2','b0','b3']);
});
test('dead original slots remain holes; current lane/position/order cannot redistribute recipients',()=>{
 const c=make(),basis=structuredClone(c.commanderFormations);
 c.teams[1][0].hp=0;c.teams[1][3].hp=0;
 // Original b2 neighbors b0/b3 are both dead. Rear b4 may not slide into b3.
 for(const unit of c.teams[1]){unit.lane='front';unit.position=99;}
 c.teams[1].reverse();
 const out=cast(c,{targetIds:['b2']});
 assert.deepEqual(hits(out).map(e=>e.target),['b2']);assert.deepEqual(c.commanderFormations,basis);
 assert.equal(c.teams[1].find(u=>u.id==='b4').hp,1000);
});
test('revived original neighbor receives area in its existing slot, without a new geometry capture',()=>{
 const enemy=enemies();enemy[2].hp=0;const c=make({enemy});
 c.teams[1][2].hp=550;
 assert.deepEqual(hits(cast(c)).map(e=>e.target),['b3','b0','b1','b2','b4']);
 assert.equal(c.teams[1][2].hp,544);
});
test('single front with four backs hits only the middle two backs',()=>{
 const enemy=enemies();enemy[1].lane='back';
 assert.deepEqual(hits(cast(make({enemy}),{targetIds:['b0']})).map(e=>e.target),['b0','b2','b3']);
});
test('battle-start power, profile and formation survive deaths/buffs/source mutations; forged cast fields ignored',()=>{
 for(const side of [0,1]){
  const own=allies(),enemy=enemies(),c=make({own,enemy,side});
  own[0].attack=999999;enemy[0].id='forged';
  c.teams[side][0].hp=0;c.teams[side][1].hp=0;
  for(const unit of c.teams[side]){unit.attack=999999;unit.role='energy';}
  const out=cast(c,{side,magicPower:999999,commanderMagicNormalPower:[999999,999999],enemyFormation:{b3:['b3']},commanderFormations:[],mainDamage:999999,areaDamage:999999,commanderProfile:profile(40),commanderLevel:40});
  assert.deepEqual(hits(out).map(e=>e.rawDamage),[25,6,6,6,6]);assert.equal(c.commanderMagicNormalPower[side],200);
  assert.equal(viewLiveCommanderCombat(c).commanderMagicNormalPower,undefined);assert.equal(viewLiveCommanderCombat(c).commanderFormations,undefined);
  assert.ok(Object.isFrozen(c.commanderMagicNormalPower));assert.ok(Object.isFrozen(c.commanderFormations));
 }
});
test('power capture includes formation, credits, selected commander and starting focus bonuses',()=>{
 const cards=['original:08','original:05','original:15','original:01','original:expansion-01'].map((id,i)=>({id,power:80,lane:i<2?'front':'back'}));
 const commanders=[profile(15),profile(15)],prepared=prepareLiveArenaTeams(cards,cards,{commanders,remainingCredits:[3,3],cardAdapter:'auction'});
 const c=createLiveCommanderCombat({teams:prepared,commanders,abilities:createLiveCommanderAbilities({matchKey:'mage-area',energy:[100,100],now:0})});
 assert.equal(c.commanderMagicNormalPower[0],captureMagicNormalPower(prepared[0]));
 assert.equal(c.commanderMagicNormalPower[0],Math.round(Math.round(Math.round(80*1.08)*1.03)*1.075*1.06));
 const main=Math.round(15+c.commanderMagicNormalPower[0]*.05);
 assert.equal(hits(cast(c,{targetIds:[prepared[1][3].id]}))[0].rawDamage,main);
});
test('60 energy is required; failed cast/invalid targets do not mutate HP, status, resources or request cache',()=>{
 const c=make({energy:59});let before=structuredClone(c);
 assert.throws(()=>cast(c),/Insufficient commander energy/);assert.deepEqual(c,before);
 grantLiveCommanderEnergy(c.abilities,0,1);c.teams[1][0].hp=0;
 for(const targetIds of [undefined,[],['b0'],['a0'],['missing'],['b2','b3'],[3]]){
  before=structuredClone(c);assert.throws(()=>cast(c,{targetIds}),/magic targets/);assert.deepEqual(c,before);
 }
 assert.equal(cast(c).energy,0,'rejected request remains usable');
});
test('request duplicates and conflicts never settle another hit or spend a second cost',()=>{
 const c=make();const first=cast(c),before=structuredClone(c);
 assert.equal(cast(c).duplicate,true);assert.deepEqual(c,before);
 assert.throws(()=>cast(c,{targetIds:['b2']}),/conflict/);assert.deepEqual(c,before);
 assert.equal(first.events.length,6);
});
test('registry ignores forged area IDs/amounts and rejects another seat token',()=>{
 const c=make(),registry=createLiveArenaRegistry();registry.register({matchKey:'mage-area',tokens:['left','right'],combat:c});
 const before=structuredClone(c);assert.throws(()=>registry.cast({matchKey:'mage-area',token:'bad',ability:'normal',targetIds:['b3'],requestId:'forged-token',now:1000}),/Unauthorized/);assert.deepEqual(c,before);
 const out=registry.cast({matchKey:'mage-area',token:'left',ability:'normal',targetIds:['b3'],areaTargetIds:['a0'],enemyFormation:{b3:['a0']},magicPower:99999,requestId:'valid-token',now:1000});
 assert.deepEqual(hits(out).map(e=>e.rawDamage),[25,6,6,6,6]);
});
test('each target uses existing 70% shield absorption; area derives from raw main, not mitigated HP loss',()=>{
 const c=make();for(const u of c.teams[1])u.shield=100;
 const out=cast(c);
 assert.deepEqual(hits(out).map(e=>[e.rawDamage,e.absorbed,e.value]),[[25,17,8],[6,4,2],[6,4,2],[6,4,2],[6,4,2]]);
 assert.equal(out.events.at(-1).value,16);assert.equal(c.teams[1][3].shield,83);
});
test('lethal main is capped and not stunned; captured living areas still settle in original order',()=>{
 const c=make();c.teams[1][3].hp=1;
 const out=cast(c);assert.equal(hits(out)[0].value,1);assert.equal(c.teams[1][3].hp,0);assert.deepEqual(stun(out),[]);
 assert.deepEqual(hits(out).map(e=>e.target),['b3','b0','b1','b2','b4']);assert.equal(out.events.at(-1).value,25);
});
test('guarded main survives at one, gains stun; area deaths clear their statuses and cannot steal it',()=>{
 const c=make();c.teams[1][3].hp=1;grantLastStand(c.teams[1][3],2);c.teams[1][0].hp=2;c.teams[1][0].commanderStunNextAction=true;
 const out=cast(c);assert.equal(c.teams[1][3].hp,1);assert.equal(c.teams[1][3].lastStandImmortalUntilRound,3);assert.equal(c.teams[1][3].commanderStunNextAction,true);
 assert.equal(c.teams[1][0].hp,0);assert.equal(c.teams[1][0].commanderStunNextAction,undefined);assert.equal(hits(out)[0].guardTriggered,true);
});
test('main and area deaths transfer arcane surge in chronological hit order',()=>{
 const c=make();for(const u of c.teams[1])u.hp=1;c.teams[1][0].hp=2;
 grantArcaneSurge(c.teams[1][3],2);
 const out=cast(c),transfers=hits(out).map(e=>e.arcaneTransfer).filter(Boolean);
 assert.deepEqual(transfers.map(t=>[t.sourceId,t.targetId]),[['b3','b0'],['b0','b1'],['b1','b2'],['b2','b4']]);
 assert.ok(c.teams[1].every(u=>u.hp===0&&u.arcaneSurgeBonusAttack===undefined));assert.equal(out.finished,true);
});
test('damage events + summary impacts replay once, preserve action-stun, and summarize without double damage',()=>{
 const c=make(),initial=structuredClone(c.teams),out=cast(c),replay=createBattleReplayHealth(initial);
 for(const e of out.events)replay.apply(e);
 const expected=c.teams.map(t=>t.map(u=>u.hp));assert.deepEqual(replay.apply(out.events.at(-1)),expected);
 assert.equal(replay.statusSnapshot()[1][3].commanderStunNextAction,true);
 for(const e of structuredClone(out.events))assert.deepEqual(replay.apply(e),expected);
 const summary=summarizeBattle(c.teams,out.events);assert.equal(summary.commanders[0].dealt,49);assert.equal(summary.commanders[0].casts,1);
 assert.deepEqual(summary.teams[1].map(u=>u.taken),[6,6,6,25,6]);
 const sync=createCommanderSnapshotSync(),snapshot=viewLiveCommanderCombat(c);
 assert.equal(acceptCommanderSnapshot(sync,snapshot).accepted,true);assert.equal(sync.teams[1][3].commanderStunNextAction,true);
 assert.equal(acceptCommanderSnapshot(sync,snapshot).accepted,false);assert.deepEqual(sync.teams,c.teams);
});

test('historical passive-heal bridge preserves automatic healing without consuming pending action stun',()=>{
 const c=make();const target=c.teams[1][3];target.hp-=5;target.commanderStunNextAction=true;const before=target.hp; // Historical action-only snapshot has no stunVersion.
 const out=applyBattleLogHeroEvent(c,{round:2,side:1,actor:'b3',target:'b3',action:'passive-heal',value:2});
 assert.equal(out.event.action,'passive-heal');assert.equal(c.teams[1][3].hp,before+2);
 assert.equal(c.teams[1][3].commanderStunNextAction,true);assert.equal(c.teams[1][3].lastActionRound,undefined);
 const active=applyBattleLogHeroEvent(c,{round:2,side:1,actor:'b3',target:'b3',action:'heal',value:2});
 assert.equal(active.event.action,'stun-skip');assert.equal(c.teams[1][3].hp,before+2);assert.equal(c.teams[1][3].commanderStunNextAction,undefined);
});
