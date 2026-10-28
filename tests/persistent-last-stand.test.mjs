import test from 'node:test';import assert from 'node:assert/strict';
import {applyHeroDamage,grantLastStand,expireLastStandGuards} from '../battle-hp-damage.js';
import {applyLiveCommanderEffect} from '../commander-live-effects.js';
import {grantArcaneSurge,reviveCommanderAlly} from '../commander-ultimate-status.js';
const hero=(id,extra={})=>({id,hp:100,maxHp:100,shield:0,attack:40,defense:10,...extra});
test('new last stand persists through round15 and starts its fixed two-following-round protection only on first lethal hit',()=>{
 const t=hero('a',{hp:10});grantLastStand(t,1);assert.equal(t.lastStandPersistent,true);assert.equal(t.lastStandUntilRound,undefined);
 const saved=JSON.parse(JSON.stringify(t));assert.deepEqual(saved,t);
 for(let round=2;round<=15;round++)expireLastStandGuards([[saved]],round);
 const first=applyHeroDamage(saved,100,{round:15});assert.equal(first.guardTriggered,true);assert.equal(saved.hp,1);
 assert.equal(saved.lastStandReady,undefined);assert.equal(saved.lastStandPersistent,undefined);assert.equal(saved.lastStandUntilRound,undefined);
 assert.equal(saved.lastStandTriggeredRound,15);assert.equal(saved.lastStandImmortalUntilRound,17);
 for(const round of [15,16,17]){const hit=applyHeroDamage(saved,1,{round});assert.equal(hit.guardTriggered,true);assert.equal(saved.hp,1);assert.equal(saved.lastStandImmortalUntilRound,17);}
 const second=applyHeroDamage(saved,1,{round:18});assert.equal(second.guardTriggered,false);assert.equal(saved.hp,0);
});
test('nonlethal hits and shields do not consume persistent guard; execute is one atomic lethal hit',()=>{
 const t=hero('a',{hp:30,shield:100});grantLastStand(t,1);const first=applyHeroDamage(t,20,{round:10});assert.equal(first.absorbed,14);assert.equal(first.damage,6);assert.equal(first.guardTriggered,false);assert.equal(t.lastStandPersistent,true);
 const lethal=applyHeroDamage(t,60,{round:11,executeThreshold:.12});assert.equal(lethal.absorbed,42);assert.equal(lethal.guardTriggered,true);assert.equal(t.hp,1);assert.equal(lethal.damage+lethal.executedDamage,23);
});
test('old timed snapshot guards keep their original expiry without conversion',()=>{
 const t=hero('old',{hp:5,lastStandReady:true,lastStandUntilRound:3});expireLastStandGuards([[t]],3);assert.equal(t.lastStandReady,true);expireLastStandGuards([[t]],4);assert.equal(t.lastStandReady,undefined);assert.equal(applyHeroDamage(t,9,{round:4}).guardTriggered,false);
 const current=hero('old2',{hp:5,lastStandReady:true,lastStandUntilRound:3});assert.equal(grantLastStand(current,2),false);assert.equal(current.lastStandPersistent,undefined);assert.equal(current.lastStandUntilRound,3);
});
test('guard remains with its original chosen ally and cannot stack or renew',()=>{
 const teams=[[hero('a',{hp:40}),hero('b',{hp:80})],[hero('enemy')]];
 const first=applyLiveCommanderEffect(teams,{side:0,ability:'ultimate',commanderId:'defense',round:1,targetIds:['a']});assert.equal(first.teams[0][0].lastStandPersistent,true);assert.equal(first.teams[0][1].lastStandReady,undefined);
 first.teams[0][1].hp=1;expireLastStandGuards(first.teams,10);
 const second=applyLiveCommanderEffect(first.teams,{side:0,ability:'ultimate',commanderId:'defense',round:10,targetIds:['b']});assert.equal(second.log.at(-1).impacts.filter(x=>x.kind==='guard').length,0);assert.equal(second.teams[0][1].lastStandReady,undefined);assert.equal(second.teams[0][0].lastStandPersistent,true);
});
test('dead/invalid/consumed guard fields are cleaned; revival cannot restore a charge',()=>{
 const dead=hero('dead',{hp:0,lastStandReady:true,lastStandPersistent:true,lastStandUntilRound:999});expireLastStandGuards([[dead]],5);assert.equal(dead.lastStandPersistent,undefined);assert.equal(dead.lastStandReady,undefined);assert.equal(dead.lastStandUntilRound,undefined);
 const revived=hero('revived',{hp:0,lastStandReady:true,lastStandPersistent:true,lastStandUntilRound:999});reviveCommanderAlly(revived,5);for(const key of ['lastStandReady','lastStandPersistent','lastStandUntilRound'])assert.equal(revived[key],undefined);
 const invalid=hero('invalid',{lastStandReady:true,lastStandPersistent:'true'});expireLastStandGuards([[invalid]],5);assert.equal(invalid.lastStandReady,undefined);assert.equal(invalid.lastStandPersistent,undefined);
});
test('persistent guard prevents mage transfer until true subsequent death',()=>{
 const t=hero('a',{hp:5}),next=hero('b',{hp:80}),allies=[t,next];grantArcaneSurge(t,5);grantLastStand(t,1);
 const first=applyHeroDamage(t,50,{round:6,allies});assert.equal(first.guardTriggered,true);assert.equal(first.arcaneTransfer,undefined);assert.equal(next.arcaneSurgeBonusAttack,undefined);
 const second=applyHeroDamage(t,50,{round:6,allies});assert.equal(t.hp,1);assert.equal(second.arcaneTransfer,undefined);
 grantArcaneSurge(t,8);const death=applyHeroDamage(t,50,{round:9,allies});assert.equal(t.hp,0);assert.equal(death.arcaneTransfer.targetId,'b');assert.equal(next.arcaneSurgeUntilRound,10);assert.equal(next.lastStandReady,undefined);
});

test('legacy simulation serializes a still-unused persistent guard at battle end and fresh match has none',async()=>{
 const{simulateBattle}=await import('../battle-engine.js');const team=prefix=>Array.from({length:5},(_,i)=>({id:prefix+i,power:100,role:'tank',lane:'front',passive:{effect:'regen',value:1}}));
 const options={seed:'persistent-legacy',maxRounds:15,commanders:[{commanderId:'defense',levels:{attack:0,defense:40,magic:0,support:0}},null]};
 const result=simulateBattle(team('a'),team('b'),{...options,commanderActions:[{side:0,round:3,ability:'ultimate',targetIds:['a0']}]});
 const snapshots=JSON.parse(JSON.stringify(result));assert.ok(snapshots.teams[0].some(u=>u.lastStandPersistent===true));assert.ok(snapshots.teams.flat().every(u=>u.lastStandUntilRound===undefined));
 const rematch=simulateBattle(team('a'),team('b'),options);assert.ok(rematch.teams.flat().every(u=>u.lastStandReady===undefined&&u.lastStandPersistent===undefined));assert.deepEqual(rematch.ultimateUsed,[false,false]);
});
