import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
import {validateTurnCommand,validateCommanderTurnTargets,calculateNextTurnEnergy,calculateNextTurnUltimateEnergy} from '../commander-turns.js';
import {replayCommanderTranscript} from '../commander-transcript.js';
import {createRoomCommanderSession,submitRoomCommanderTurn,viewRoomCommanderSession} from '../commander-room-bridge.js';
const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,power:100,role:'tank',lane:'front',passive:{effect:'regen',value:1}}));
const commanders=[{commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}},{commanderId:'defense',levels:{attack:0,defense:0,magic:0,support:0}}];
const resourcePools=({targets,...pools})=>pools;
const opts={seed:'dual-pool',maxRounds:8,commanders};
test('normal-spending legacy transcript retains charge and ultimate leaves normal energy intact',()=>{
 const turns=Array.from({length:8},()=>[{command:'pass'},{command:'pass'}]);
 turns[1][0]={command:'normal'};turns[4][0]={command:'ultimate',targetIds:['b0']};turns[5][0]={command:'normal'};
 const r=replayCommanderTranscript(cards('a'),cards('b'),{...opts,turns});
 const normal=r.log.find(e=>e.action==='commander-attack-normal');
 const ult=r.log.find(e=>e.action==='commander-attack-ultimate');
 assert.equal(normal.energy,2);assert.equal(normal.ultimateEnergy,42);
 assert.equal(ult.energy,38);assert.equal(ult.ultimateEnergy,3);assert.equal(ult.ultimateUsed,true);
 assert.equal(r.commanderUltimateEnergy[0],3,'used charge freezes through subsequent rounds');
 assert.equal(r.commanderEnergy[0],34);assert.equal(r.commanderUltimateEnergy[1],100);
 assert.deepEqual(r.ultimateUsed,[true,false]);
});
test('each side gets independent capped round charge without changing normal energy',()=>{
 const r=simulateBattle(cards('a'),cards('b'),opts);
 assert.deepEqual(r.commanderEnergy,[100,100]);assert.deepEqual(r.commanderUltimateEnergy,[100,100]);
 const initial=simulateBattle(cards('a'),cards('b'),{...opts,maxRounds:1});
 assert.deepEqual(initial.commanderEnergy,[30,30]);assert.deepEqual(initial.commanderUltimateEnergy,[30,30]);
});
test('ultimate turn validation uses explicit authoritative charge, not high normal balance',()=>{
 assert.throws(()=>validateTurnCommand('ultimate',{side:0,round:5,energy:100,ultimateEnergy:74,commanderId:'attack'}),/Insufficient/);
 assert.throws(()=>validateTurnCommand('ultimate',{side:0,round:5,energy:100,commanderId:'attack'}),/Invalid commander energy/);
 assert.equal(validateTurnCommand('ultimate',{side:0,round:5,energy:0,ultimateEnergy:75,commanderId:'attack'}).ability,'ultimate');
 assert.throws(()=>validateTurnCommand('ultimate',{side:0,round:5,energy:100,ultimateEnergy:100,ultimateUsed:true,commanderId:'attack'}),/already used/);
});
test('next-turn helpers keep spending separate, cap grants, and freeze used charge',()=>{
 const profile={commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}};
 assert.equal(calculateNextTurnEnergy(0,{ability:'ultimate'},{commanderProfile:profile}),12);
 assert.equal(calculateNextTurnUltimateEnergy(75,{ability:'ultimate'},{commanderProfile:profile,lostHeroes:2}),0);
 assert.equal(calculateNextTurnUltimateEnergy(30,{ability:'normal'},{commanderProfile:profile,lostHeroes:2}),62);
 assert.equal(calculateNextTurnUltimateEnergy(95,null,{commanderProfile:profile,lostHeroes:2}),100);
 assert.equal(calculateNextTurnUltimateEnergy(3,{ability:'normal'},{commanderProfile:profile,ultimateUsed:true,lostHeroes:5}),3);
});
test('room views expose both pools for the authenticated seat and fresh matches reset',()=>{
 const room={code:'dualp',phase:'finished',created:1,matchNumber:1,players:[{token:'a'},{token:'b'}]};
 const bound=createRoomCommanderSession(room,{cardsA:cards('a'),cardsB:cards('b'),commanders});
 for(let round=1;round<=5;round++){
  submitRoomCommanderTurn(room,bound,{token:'a',round,command:round===2?'normal':round===5?'ultimate':'pass',...(round===5?{targetIds:['b0']}:{}),energy:1000,ultimateEnergy:1000});
  submitRoomCommanderTurn(room,bound,{token:'b',round,command:'pass'});
 }
 const a=viewRoomCommanderSession(room,bound,'a'),b=viewRoomCommanderSession(room,bound,'b');
 assert.equal(a.energy,50);assert.equal(a.ultimateEnergy,3);assert.equal(a.ultimateUsed,true);assert.equal(a.canUseUltimate,false);
 assert.equal(b.energy,90);assert.equal(b.ultimateEnergy,90);assert.equal(b.ultimateUsed,false);assert.equal(b.canUseUltimate,true);
 room.matchNumber=2;const fresh=createRoomCommanderSession(room,{cardsA:cards('a'),cardsB:cards('b'),commanders});
 assert.equal(viewRoomCommanderSession(room,fresh,'a').ultimateEnergy,30);
 assert.equal(viewRoomCommanderSession(room,fresh,'a').ultimateUsed,false);
});
test('hero casualties grant exactly ten to each unspent pool on the affected side',()=>{
 const weak=Array.from({length:5},(_,i)=>({id:'w'+i,power:1,role:'fighter',lane:'front'}));
 const strong=Array.from({length:5},(_,i)=>({id:'s'+i,power:100,role:'fighter',lane:'front'}));
 const result=simulateBattle(weak,strong,{seed:'deathgrant',maxRounds:1});
 assert.deepEqual(result.survivors,[0,5]);assert.deepEqual(result.commanderEnergy,[80,30]);assert.deepEqual(result.commanderUltimateEnergy,[80,30]);
});
test('all four prices apply to ultimate charge while normal balance remains independent',()=>{
 for(const [commanderId,cost] of Object.entries({attack:75,defense:85,magic:100,support:90})){
  const profile={commanderId,levels:{attack:0,defense:0,magic:0,support:0}};
  assert.equal(validateTurnCommand('ultimate',{side:0,round:7,energy:0,ultimateEnergy:cost,commanderId}).ability,'ultimate');
  assert.equal(calculateNextTurnUltimateEnergy(100,{ability:'ultimate'},{commanderProfile:profile}),100-cost);
  assert.equal(calculateNextTurnEnergy(100,{ability:'ultimate'},{commanderProfile:profile}),100);
 }
});
test('transcript ignores client-injected ultimate charge',()=>{
 assert.throws(()=>replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns:[[{command:'ultimate',ultimateEnergy:100,energy:100},{command:'pass'}]]}),/Insufficient commander energy/);
});
test('selected mage ultimate survives transcript forwarding and applies only to own selected hero',()=>{
 const magic=[{commanderId:'magic',levels:{attack:0,defense:0,magic:0,support:0}},commanders[1]];
 const turns=Array.from({length:7},()=>[{command:'pass'},{command:'pass'}]);
 turns[6][0]={command:'ultimate',targetIds:['a2'],energy:0,ultimateEnergy:0};
 const r=replayCommanderTranscript(cards('a'),cards('b'),{commanders:magic,turns});
 const event=r.log.find(e=>e.action==='commander-magic-ultimate');assert.equal(event.impacts[0].target,'a2');assert.equal(r.commanderUltimateEnergy[0],0);assert.equal(r.commanderEnergy[0],100);
 turns[6][0].targetIds=['b2'];assert.throws(()=>replayCommanderTranscript(cards('a'),cards('b'),{commanders:magic,turns}),/living friendly/);
 turns[6][0].targetIds=['a2','a2'];assert.throws(()=>replayCommanderTranscript(cards('a'),cards('b'),{commanders:magic,turns}),/Invalid commander targets/);
});
test('support selection validates dead-friendly state before pending mutation; successful cast is once and seat-owned',()=>{
 const own=cards('b');own[0]={id:'b0',power:1,role:'fighter',lane:'front'};
 const support={commanderId:'support',levels:{attack:0,defense:0,magic:0,support:0}};
 const room={code:'revive',phase:'finished',created:1,matchNumber:1,players:[{token:'a'},{token:'b'}]};
 const bound=createRoomCommanderSession(room,{cardsA:cards('a'),cardsB:own,commanders:[commanders[1],support]});
 for(let round=1;round<6;round++)for(const token of ['a','b'])submitRoomCommanderTurn(room,bound,{token,round,command:'pass'});
 assert.equal(bound.session.result.teams[1][0].hp,0);
 for(const targetIds of [['a0'],['b1'],['missing'],['b0','b0'],[]]){
  const before=structuredClone(bound.session);
  assert.throws(()=>submitRoomCommanderTurn(room,bound,{token:'b',side:0,round:6,command:'ultimate',targetIds,ultimateEnergy:1000}));
  assert.deepEqual(bound.session,before,'invalid target leaves pending/result/pools unchanged');
 }
 const targets=['b0'];submitRoomCommanderTurn(room,bound,{token:'b',side:0,round:6,command:'ultimate',targetIds:targets});targets[0]='a0';
 const resolved=submitRoomCommanderTurn(room,bound,{token:'a',round:6,command:'pass'});
 const event=resolved.result.log.find(e=>e.action==='commander-support-ultimate');assert.equal(event.side,1);assert.equal(event.impacts[0].target,'b0');
 assert.equal(resolved.result.ultimateUsed[1],true);assert.equal(viewRoomCommanderSession(room,bound,'b').canUseUltimate,false);
 const before=structuredClone(bound.session);
 assert.throws(()=>submitRoomCommanderTurn(room,bound,{token:'b',round:6,command:'ultimate',targetIds:['b0']}),/Stale/);assert.deepEqual(bound.session,before);
 assert.throws(()=>submitRoomCommanderTurn(room,bound,{token:'b',round:7,command:'ultimate',targetIds:['b0']}),/already used/);assert.deepEqual(bound.session,before);
});

test('selected target helper rejects a dead mage recipient and living revive recipient',()=>{
 const teams=[[{id:'a0',hp:0},{id:'a1',hp:10}],[{id:'b0',hp:10}]];
 assert.throws(()=>validateCommanderTurnTargets('ultimate',{commanderId:'magic',side:0,targetIds:['a0'],teams}),/living friendly/);
 assert.throws(()=>validateCommanderTurnTargets('ultimate',{commanderId:'support',side:0,targetIds:['a1'],teams}),/fallen friendly/);
 assert.throws(()=>validateCommanderTurnTargets('ultimate',{commanderId:'magic',side:0,targetIds:['b0'],teams}),/living friendly/);
});
test('round resource snapshots capture post-command balances with independent arrays',()=>{
 const r=simulateBattle(cards('a'),cards('b'),{...opts,commanderActions:[{round:2,side:0,ability:'normal'},{round:5,side:0,ability:'ultimate',targetIds:['b0']}]});
 assert.deepEqual(resourcePools(r.commanderResourcesByRound[0]),{round:1,energy:[30,30],ultimateEnergy:[30,30],ultimateUsed:[false,false]});
 assert.deepEqual(resourcePools(r.commanderResourcesByRound[1]),{round:2,energy:[2,42],ultimateEnergy:[42,42],ultimateUsed:[false,false]});
 assert.deepEqual(resourcePools(r.commanderResourcesByRound[4]),{round:5,energy:[38,78],ultimateEnergy:[3,78],ultimateUsed:[true,false]});
 assert.equal(r.commanderResourcesByRound[7].ultimateEnergy[0],3);
 r.commanderResourcesByRound[4].energy[0]=999;r.commanderResourcesByRound[4].ultimateEnergy[0]=999;r.commanderResourcesByRound[4].ultimateUsed[0]=false;
 assert.equal(r.commanderResourcesByRound[5].energy[0],50);assert.equal(r.commanderResourcesByRound[5].ultimateEnergy[0],3);assert.equal(r.commanderResourcesByRound[5].ultimateUsed[0],true);
 assert.equal(r.commanderUltimateEnergy[0],3);assert.equal(r.ultimateUsed[0],true);
});
test('round snapshots include prior-round casualty charge but not later same-round deaths',()=>{
 const weak=cards('a');weak[0]={id:'a0',power:1,role:'fighter',lane:'front'};
 const r=simulateBattle(weak,cards('b'),{...opts,maxRounds:2});
 assert.equal(r.teams[0][0].hp,0);
 assert.deepEqual(r.commanderResourcesByRound[0].energy,[30,30]);
 assert.deepEqual(r.commanderResourcesByRound[0].ultimateEnergy,[30,30]);
 assert.deepEqual(r.commanderResourcesByRound[1].energy,[52,42]);
 assert.deepEqual(r.commanderResourcesByRound[1].ultimateEnergy,[52,42]);
});
