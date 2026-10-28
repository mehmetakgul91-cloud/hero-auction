import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
import {replayCommanderTranscript} from '../commander-transcript.js';
import {createRoomCommanderSession,submitRoomCommanderTurn,viewRoomCommanderSession} from '../commander-room-bridge.js';
import {validateCommanderTurnTargets} from '../commander-turns.js';
const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,power:100,role:'tank',lane:'front',passive:{effect:'regen',value:1}}));
const profile=commanderId=>({commanderId,levels:{attack:0,defense:0,magic:0,support:0}});
const commanders=[profile('attack'),profile('attack')];
for(const side of [0,1])test(`legacy side${side} preserves explicitly selected enemy, not automatic lowest-health choice`,()=>{
 const targetIds=[side===0?'b4':'a4'];
 const result=simulateBattle(cards('a'),cards('b'),{seed:'selected-focus',maxRounds:5,commanders,commanderActions:[{round:5,side,ability:'ultimate',targetIds}]});
 const event=result.log.find(e=>e.action==='commander-attack-ultimate');assert.equal(event.impacts[0].target,targetIds[0]);assert.equal(event.side,side);
 const turns=Array.from({length:5},()=>[{command:'pass'},{command:'pass'}]);turns[4][side]={command:'ultimate',targetIds};
 const replay=replayCommanderTranscript(cards('a'),cards('b'),{seed:'selected-focus',commanders,turns});assert.deepEqual(replay.log,result.log);assert.equal(replay.commanderUltimateEnergy[side],3);
});
test('turn target validation rejects omitted, duplicate, own, dead and missing enemy IDs',()=>{
 const teams=[[{id:'a0',hp:100}],[{id:'b0',hp:100},{id:'b1',hp:0}]];
 for(const targetIds of [undefined,[],['b0','b0'],['a0'],['b1'],['missing']])assert.throws(()=>validateCommanderTurnTargets('ultimate',{commanderId:'attack',side:0,targetIds,teams}),/enemy/);
 assert.doesNotThrow(()=>validateCommanderTurnTargets('ultimate',{commanderId:'attack',side:0,targetIds:['b0'],teams}));
 assert.doesNotThrow(()=>validateCommanderTurnTargets('normal',{commanderId:'magic',side:0,teams}),'legacy normal magic targeting unchanged');
});
test('room target ownership comes from token; invalid selections do not consume charge or alter pending state',()=>{
 const room={code:'focus',phase:'finished',created:1,matchNumber:1,players:[{token:'a-token'},{token:'b-token'}]};
 const bound=createRoomCommanderSession(room,{cardsA:cards('a'),cardsB:cards('b'),commanders});
 for(let round=1;round<5;round++)for(const token of ['a-token','b-token'])submitRoomCommanderTurn(room,bound,{token,round,command:'pass'});
 for(const targetIds of [undefined,[],['b0'],['a0','a0'],['missing']]){const before=structuredClone(bound.session);assert.throws(()=>submitRoomCommanderTurn(room,bound,{token:'b-token',side:0,round:5,command:'ultimate',targetIds,ultimateEnergy:999}));assert.deepEqual(bound.session,before);}
 const targetIds=['a4'];submitRoomCommanderTurn(room,bound,{token:'b-token',side:0,round:5,command:'ultimate',targetIds});targetIds[0]='b0';
 const resolved=submitRoomCommanderTurn(room,bound,{token:'a-token',round:5,command:'pass'});
 const event=resolved.result.log.find(e=>e.action==='commander-attack-ultimate');assert.equal(event.side,1);assert.equal(event.impacts[0].target,'a4');assert.equal(viewRoomCommanderSession(room,bound,'b-token').ultimateEnergy,3);
 const before=structuredClone(bound.session);assert.throws(()=>submitRoomCommanderTurn(room,bound,{token:'b-token',round:5,command:'ultimate',targetIds:['a4']}),/Stale/);assert.deepEqual(bound.session,before);
 assert.throws(()=>submitRoomCommanderTurn(room,bound,{token:'b-token',round:6,command:'ultimate',targetIds:['a4']}),/already used/);assert.deepEqual(bound.session,before);
});
test('training target snapshots use exact per-round health and independent scalar copies',()=>{
 const weak=cards('b');weak[0]={id:'b0',power:1,role:'fighter',lane:'front'};
 const r=simulateBattle(cards('a'),weak,{seed:'target-snapshot',maxRounds:2,commanders});
 assert.equal(r.commanderResourcesByRound[0].targets[1][0].id,'b0');assert.ok(r.commanderResourcesByRound[0].targets[1][0].hp>0);
 assert.equal(r.commanderResourcesByRound[1].targets[1][0].hp,0);
 for(const snapshot of r.commanderResourcesByRound)for(let side=0;side<2;side++)for(const unit of snapshot.targets[side]){assert.deepEqual(Object.keys(unit).sort(),['hp','id']);assert.ok(r.teams[side].some(x=>x.id===unit.id&&typeof x.name==='string'));}
 r.commanderResourcesByRound[0].targets[1][0].id='mutated';r.commanderResourcesByRound[0].targets[1][0].hp=999;
 assert.deepEqual(r.commanderResourcesByRound[1].targets[1][0],{id:'b0',hp:0});assert.equal(r.teams[1][0].id,'b0');assert.equal(r.teams[1][0].hp,0);
});
test('legacy effect rejects missing, duplicated, friendly and already-dead selections without mutating input cards',()=>{
 const a=cards('a'),b=cards('b');b[0]={id:'b0',power:1,role:'fighter',lane:'front'};
 const before=structuredClone([a,b]);
 for(const targetIds of [undefined,[],['b4','b4'],['a4'],['b0'],['missing']]){
  assert.throws(()=>simulateBattle(a,b,{seed:'target-rejections',maxRounds:5,commanders,commanderActions:[{round:5,side:0,ability:'ultimate',...(targetIds===undefined?{}:{targetIds})}]}));
  assert.deepEqual([a,b],before);
 }
});
