import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeCenterProtection,isCenterProtected} from '../battle-center-protection.js';
import {selectBattleTarget} from '../battle-target-selection.js';
import {applyHeroDamage,grantLastStand} from '../battle-hp-damage.js';
import {reviveCommanderAlly} from '../commander-ultimate-status.js';
import {applyLiveCommanderEffect} from '../commander-live-effects.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,viewLiveCommanderCombat} from '../commander-live-combat.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
import {stepParityExecute} from '../commander-parity-execute.js';
import {stepParityStatSpecial} from '../commander-parity-stat-special.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
import {stepParityEnergySplash} from '../commander-parity-energy-splash.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {simulateBattle} from '../battle-engine.js';
import {battleRoster} from '../battle-roster.js';

const h=(id,position=0,lane='front',extra={})=>({id,name:id,position,lane,role:'fighter',hp:1000,maxHp:1000,attack:50,defense:50,speed:50,shield:0,damage:0,kills:0,healing:0,...extra});
const team=(prefix='e',front=2)=>Array.from({length:5},(_,i)=>h(prefix+i,i,i<front?'front':'back'));
const protectedTeam=()=>initializeCenterProtection(team());
const center=units=>units.find(u=>u.centerProtection||u.centerDefenseBonus);
const combat=(defenders,actor=h('actor',0,'front',{role:'assassin'}),round=1)=>createLiveCommanderCombat({teams:[[actor],defenders],round,commanders:[{commanderId:'attack'},{commanderId:'support'}],abilities:createLiveCommanderAbilities({matchKey:'center:test',energy:[100,100],ultimateEnergy:[100,100],now:0})});

test('only the initial 2+3 composition marks exactly the second rear hero and its four allies',()=>{
 for(let front=0;front<=5;front++){
  const units=team('e',front);initializeCenterProtection(units);
  assert.equal(units.filter(u=>u.centerProtection).length,front===2?1:0);
  if(front===2){assert.equal(center(units).id,'e3');assert.deepEqual(center(units).centerProtection,{version:1,protectorIds:['e0','e1','e2','e4'],broken:false});}
 }
 const interleaved=team();[interleaved[1].lane,interleaved[3].lane]=['back','front'];initializeCenterProtection(interleaved);
 assert.equal(center(interleaved).id,'e2','the rendered rear order, not a hard-coded global slot, defines the center');
 for(const units of [team().slice(1),[...team(),h('extra')],team().map(u=>({...u,id:'same'})),team().map((u,i)=>({...u,hp:i===0?0:1000})),team().map((u,i)=>({...u,hp:i===0?NaN:1000}))]){
  initializeCenterProtection(units);assert.equal(units.some(u=>u.centerProtection),false);
 }
});

test('automatic basic and special-round selection excludes only the protected center and keeps role priorities',()=>{
 const units=protectedTeam(),before=structuredClone(units);
 for(const role of ['fighter','tank','energy','support','assassin'])for(let round=1;round<=15;round++)for(let position=0;position<5;position++){
  const target=selectBattleTarget(units,{role,position},round);
  assert.notEqual(target.id,'e3');assert.equal(target.lane,role==='assassin'?'back':'front');
 }
 assert.deepEqual(units,before,'selection does not rebuild positions or mutate the cover mark');
 assert.equal(isCenterProtected(center(units),[...units].reverse()),true,'the protected identity stays fixed after serialization/reordering');
});

for(const protectorId of ['e0','e1','e2','e4'])test('first actual death of '+protectorId+' opens the center permanently without changing lane priority',()=>{
 const units=protectedTeam(),victim=units.find(u=>u.id===protectorId),middle=center(units);
 applyHeroDamage(victim,2000,{round:1,allies:units});
 assert.equal(victim.hp,0);assert.equal(middle.centerProtection.broken,true);assert.equal(isCenterProtected(middle,units),false);
 assert.ok([1,2,3,4,5].some(round=>selectBattleTarget(units,{role:'assassin',position:0},round).id===middle.id));
 assert.equal(selectBattleTarget(units,{role:'fighter',position:0},1).lane,'front','a surviving frontline still has ordinary priority');
 reviveCommanderAlly(victim,1);initializeCenterProtection(units);
 assert.equal(middle.centerProtection.broken,true);assert.equal(isCenterProtected(middle,units),false,'revival cannot recreate lost protection');
 const copied=JSON.parse(JSON.stringify(units));assert.equal(center(copied).centerProtection.broken,true);
});

test('Last Bastion at one HP and absorbed/nonlethal hits do not count as deaths; execute does',()=>{
 const units=protectedTeam(),victim=units[0];victim.hp=10;grantLastStand(victim,1);
 const hit=applyHeroDamage(victim,100,{round:1,allies:units,executeThreshold:.5});
 assert.equal(hit.guardTriggered,true);assert.equal(victim.hp,1);assert.equal(isCenterProtected(center(units),units),true);
 applyHeroDamage(victim,100,{round:4,allies:units});assert.equal(center(units).centerProtection.broken,true);
 const next=protectedTeam();next[0].hp=400;
 applyHeroDamage(next[0],1,{round:1,allies:next,executeThreshold:.5});assert.equal(next[0].hp,0);assert.equal(center(next).centerProtection.broken,true);
 const shielded=protectedTeam();shielded[0].shield=1000;applyHeroDamage(shielded[0],10,{round:1,allies:shielded});
 assert.equal(isCenterProtected(center(shielded),shielded),true);
});

test('Hunt Order overrides cover for all attacking roles until the marked enemy dies',()=>{
 const units=protectedTeam(),teams=[[h('actor')],units];
 const effect=applyLiveCommanderEffect(teams,{side:0,ability:'ultimate',commanderId:'attack',round:1,targetIds:['e3']});
 for(const role of ['fighter','tank','energy','support','assassin'])assert.equal(selectBattleTarget(effect.teams[1],{role,position:0},1).id,'e3');
 assert.equal(isCenterProtected(center(effect.teams[1]),effect.teams[1]),true,'manual focus bypasses, rather than destroys, formation cover');
 const c=combat(effect.teams[1],h('actor',0,'front',{role:'fighter'}));
 const result=stepParityBasicAttack(c,{side:0,actorId:'actor'});assert.equal(result.event.target,'e3');assert.ok(c.teams[1][3].hp<1000);
});

test('all explicit commander target types and commander area damage keep their existing effects',()=>{
 const units=protectedTeam();
 const stun=applyLiveCommanderEffect([[h('a')],units],{side:0,ability:'normal',commanderId:'magic',round:1,targetIds:['e3']});
 assert.equal(stun.teams[1][3].commanderStunNextAttack,true);
 for(const commanderId of ['defense','magic']){
  const result=applyLiveCommanderEffect([units,[h('b')]],{side:0,ability:'ultimate',commanderId,round:1,targetIds:['e3']});
  assert.ok(commanderId==='defense'?result.teams[0][3].lastStandReady:result.teams[0][3].arcaneSurgeBonusAttack);
  assert.equal(isCenterProtected(result.teams[0][3],result.teams[0]),true);
 }
 const marked=applyLiveCommanderEffect([[h('a')],units],{side:0,ability:'normal',commanderId:'attack',attackBasis:100,round:1});
 const plain=structuredClone(units);delete plain[3].centerProtection;
 const legacy=applyLiveCommanderEffect([[h('a')],plain],{side:0,ability:'normal',commanderId:'attack',attackBasis:100,round:1});
 assert.deepEqual(marked.log,legacy.log);assert.ok(marked.teams[1][3].hp<1000);
 assert.equal(isCenterProtected(marked.teams[1][3],marked.teams[1]),true);
});

test('a center killed by an exempt effect can be revived without moving the protected identity',()=>{
 const units=protectedTeam();applyHeroDamage(units[3],2000,{round:1,allies:units});
 const result=applyLiveCommanderEffect([units,[h('b')]],{side:0,ability:'ultimate',commanderId:'support',round:2,targetIds:['e3']});
 assert.equal(result.teams[0][3].hp,400);assert.equal(isCenterProtected(result.teams[0][3],result.teams[0]),true);
 assert.equal(result.teams[0].filter(u=>u.centerProtection).length,1);
});

test('splash reaches the protected center unchanged, including multi-death casts and later revival',()=>{
 const actor=h('mage',0,'front',{role:'energy',active:{effect:'splash',name:'Area',power:1.2,splashRate:.25}});
 const marked=combat(protectedTeam(),actor,3),plain=combat(team(),actor,3);
 const args={side:0,actorId:'mage',round:3,critical:false};
 const a=stepParityDamageSpecial(marked,args),b=stepParityDamageSpecial(plain,args);
 assert.deepEqual(a.events,b.events,'cover cannot modify AoE targeting, raw damage, shields, or event order');
 assert.ok(a.events.some(e=>e.target==='e3'&&e.damageType==='splash'&&e.value>0));
 assert.equal(isCenterProtected(marked.teams[1][3],marked.teams[1]),true);
 const dying=protectedTeam();dying[0].hp=1;dying[2].hp=1;dying[4].hp=1;
 const c=combat(dying,actor,3);stepParityDamageSpecial(c,args);
 assert.equal(center(c.teams[1]).centerProtection.broken,true);
 for(const i of [0,2,4]){assert.equal(c.teams[1][i].hp,0);reviveCommanderAlly(c.teams[1][i],3);}
 assert.equal(isCenterProtected(center(c.teams[1]),c.teams[1]),false);
});

test('every automatic primary handler respects center cover, including named special and fallback attacks',()=>{
 const handlers=[
  [null,(c,a)=>stepParityBasicAttack(c,a),1],
  [{effect:'burst',name:'Burst',power:1.2},stepParityDamageSpecial,3],
  [{effect:'pierce',name:'Pierce',power:1.2},stepParityDamageSpecial,3],
  [{effect:'headshot',name:'Headshot',power:1.2},stepParityDamageSpecial,3],
  [{effect:'execute',name:'Execute',power:1.2},stepParityExecute,3],
  [{effect:'sunder',name:'Sunder',power:1.2},stepParityStatSpecial,3],
  [{effect:'weaken',name:'Weaken',power:1.2},stepParityStatSpecial,3],
  [{effect:'haste',name:'Haste',power:1.2},stepParityStatSpecial,3],
  [{effect:'drain',name:'Drain',power:1.2},stepParityShieldDrain,3],
  [{effect:'shield',name:'Shield',power:1.2},stepParityShieldDrain,3]
 ];
 for(const [active,step,round]of handlers){
  const c=combat(protectedTeam(),h('actor',0,'front',{role:'assassin',active}),round),result=step(c,{side:0,actorId:'actor',round,critical:false});
  const primary=(result.events||[result.event]).find(e=>e.actor==='actor'&&(e.action==='attack'||e.damageType==='special'));
  assert.ok(primary,active?.effect);assert.notEqual(primary.target,'e3',active?.effect);assert.equal(c.teams[1].find(u=>u.id===primary.target).lane,'back');
 }
 const c=combat(protectedTeam(),h('actor',0,'front',{role:'energy'}),3);const result=stepParityEnergySplash(c,{side:0,actorId:'actor',round:3});
 assert.ok(result.events.some(e=>e.target==='e3'&&e.damageType==='splash'));
});

test('unmarked older snapshots keep previous target rotation and are not upgraded at load',()=>{
 const units=team(),c=combat(units);
 assert.equal(c.teams[1].some(u=>u.centerProtection),false);
 assert.equal(selectBattleTarget(c.teams[1],{role:'assassin',position:0},1).id,'e3');
 const marked=protectedTeam();applyHeroDamage(marked[0],2000,{round:1,allies:marked});reviveCommanderAlly(marked[0],1);
 const loaded=combat(JSON.parse(JSON.stringify(marked)));
 assert.deepEqual(viewLiveCommanderCombat(loaded).teams[1],marked);assert.equal(isCenterProtected(center(loaded.teams[1]),loaded.teams[1]),false);
});

test('fresh live preparation honors swapped order and never trusts incoming stale/client cover metadata',()=>{
 const cards=battleRoster.slice(0,5).map((hero,i)=>({id:hero.id,power:50,lane:i<2?'front':'back',centerProtection:{version:1,protectorIds:['fake'],broken:true}}));
 [cards[2],cards[3]]=[cards[3],cards[2]];
 const first=prepareLiveArenaTeams(cards,cards,{cardAdapter:'auction'});
 assert.equal(center(first[0]).id,cards[3].id);assert.deepEqual(center(first[0]).centerDefenseBonus,{version:1,multiplier:1.15});
 applyHeroDamage(first[0][0],10000,{round:1,allies:first[0]});
 const rematch=prepareLiveArenaTeams(cards,cards,{cardAdapter:'auction'});assert.equal(center(rematch[0]).centerDefenseBonus.multiplier,1.15);
 const changed=cards.map((c,i)=>({...c,lane:i<3?'front':'back'}));assert.equal(prepareLiveArenaTeams(changed,cards,{cardAdapter:'auction'})[0].some(u=>u.centerDefenseBonus),false);
 const zeroHp=cards.map(c=>({...c,power:1}));
 const zeroStart=prepareLiveArenaTeams(zeroHp,zeroHp,{remainingCredits:[-99,-99],cardAdapter:'auction'});
 assert.equal(zeroStart.flat().some(u=>u.centerDefenseBonus),false,'cover is initialized after final HP preparation, not before credit multipliers');
});

test('deterministic simulation installs permanent center defense and allows immediate targeting',()=>{
 const cards=team('a').map(u=>({id:u.id,role:'assassin',power:60,lane:u.lane})),defenders=team('b').map(u=>({id:u.id,role:'fighter',power:60,lane:u.lane}));
 const result=simulateBattle(cards,defenders,{seed:'protected-center',maxRounds:15});
 assert.equal(center(result.teams[0]).id,'a3');assert.equal(center(result.teams[1]).id,'b3');
 assert.ok(result.log.some(event=>event.target==='b3'&&event.damageType==='normal'&&event.round===1));
 assert.deepEqual(center(result.teams[1]).centerDefenseBonus,{version:1,multiplier:1.15});
 assert.deepEqual(simulateBattle(cards,defenders,{seed:'protected-center',maxRounds:15}),result);
});
