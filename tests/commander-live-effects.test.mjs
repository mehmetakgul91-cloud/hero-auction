import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLiveCommanderEffect} from '../commander-live-effects.js';
const team=()=>Array.from({length:5},(_,i)=>({id:String(i),hp:100,maxHp:100,attack:50,shield:0}));
const teams=()=>[team(),team()];
test('attack deals damage to enemy only, preserving input',()=>{
 const initial=teams();
 const out=applyLiveCommanderEffect(initial,{side:0,ability:'normal',commanderId:'attack'});
 assert.ok(out.teams[1].every(u=>u.hp<100));
 assert.ok(out.teams[0].every(u=>u.hp===100));
 assert.equal(initial[1][0].hp,100);
 assert.ok(out.log.some(e=>e.action==='commander-hit'));
});
test('defense adds shields only to allies',()=>{
 const out=applyLiveCommanderEffect(teams(),{side:0,ability:'ultimate',commanderId:'defense',targetIds:['0']});
 assert.ok(out.teams[0].every(u=>u.shield>0));
 assert.ok(out.teams[1].every(u=>u.shield===0));
});
test('support normal heals injured units without exceeding max HP',()=>{
 const input=teams();input[0][0].hp=20;input[0][1].hp=50;
 const out=applyLiveCommanderEffect(input,{side:0,ability:'normal',commanderId:'support'});
 assert.ok(out.teams[0][0].hp>20);
 assert.ok(out.teams[0].every(u=>u.hp<=u.maxHp));
});
test('magic ultimate buffs exactly one living friendly hero without weakening enemies',()=>{
 const input=teams();
 const out=applyLiveCommanderEffect(input,{side:0,ability:'ultimate',commanderId:'magic',targetIds:['0'],round:2});
 assert.equal(out.teams[0][0].attack,50);assert.equal(out.teams[0][0].arcaneSurgeBonusAttack,50);
 assert.equal(out.teams[0][0].arcaneSurgeUntilRound,4);assert.deepEqual(out.teams[1],input[1]);
 assert.equal(out.teams[0].filter(u=>u.arcaneSurgeBonusAttack!==undefined).length,1);
 assert.throws(()=>applyLiveCommanderEffect(input,{side:0,ability:'ultimate',commanderId:'magic',targetIds:['0','1']}),/Select one/);
});
test('support ultimate revives exactly selected fallen ally instead of healing living allies',()=>{
 const input=teams();input[0][0].hp=0;input[0][1].hp=20;
 const out=applyLiveCommanderEffect(input,{side:0,ability:'ultimate',commanderId:'support',targetIds:['0'],round:2});
 assert.equal(out.teams[0][0].hp,40);assert.equal(out.teams[0][0].shield,0);assert.equal(out.teams[0][0].canActFromRound,3);
 assert.equal(out.teams[0][1].hp,20);assert.deepEqual(out.teams[1],input[1]);assert.equal(out.revivalUsed,true);assert.equal(input[0][0].hp,0);
});
test('rejects invalid commands and completed battles',()=>{
 assert.throws(()=>applyLiveCommanderEffect(teams(),{side:0,ability:'pass',commanderId:'attack'}),/Invalid ability/);
 const input=teams();for(const u of input[1])u.hp=0;
 assert.throws(()=>applyLiveCommanderEffect(input,{side:0,ability:'normal',commanderId:'attack'}),/finished/);
});

test('impact records report actual shield absorption and capped health loss',()=>{
 const input=teams();input[1][0].shield=50;input[1][1].hp=2;
 const out=applyLiveCommanderEffect(input,{side:0,ability:'normal',commanderId:'attack'}),impacts=out.log.at(-1).impacts;
 assert.deepEqual(impacts[0],{target:'0',kind:'damage',value:2,absorbed:4});
 assert.deepEqual(impacts[1],{target:'1',kind:'damage',value:2,absorbed:0});
 for(const effect of impacts)assert.equal(effect.value,input[1][Number(effect.target)].hp-out.teams[1][Number(effect.target)].hp);
});
test('healing impact records only the injured recipients actually healed',()=>{
 const input=teams();input[0][0].hp=20;input[0][1].hp=50;
 const out=applyLiveCommanderEffect(input,{side:0,ability:'normal',commanderId:'support'});
 assert.deepEqual(out.log.at(-1).impacts,[{target:'0',kind:'heal',value:16}]);
 assert.throws(()=>applyLiveCommanderEffect(teams(),{side:0,ability:'normal',commanderId:'support'}),/yaralı kahraman yok/);
});
test('shield impact records exclude dead heroes and report gained shield, not total shield',()=>{
 const input=teams();input[1][0].hp=0;input[1][1].shield=100;
 const out=applyLiveCommanderEffect(input,{side:1,ability:'ultimate',commanderId:'defense',targetIds:['1']});
 const shields=out.log.at(-1).impacts.filter(e=>e.kind==='shield'),guards=out.log.at(-1).impacts.filter(e=>e.kind==='guard');
 assert.equal(shields.length,4);assert.deepEqual(guards,[{target:'1',kind:'guard',value:1,immortalRounds:2}]);
 for(const impact of shields){assert.equal(impact.kind,'shield');assert.equal(impact.value,20);assert.notEqual(impact.target,'0');}
 assert.equal(out.teams[1][1].shield,120);
});
test('magic stun records only the chosen target without applying another weakening',()=>{
 const input=teams();input[1][2].commanderWeaken=.4;input[1][2].commanderWeakenNextAttack=true;
 const out=applyLiveCommanderEffect(input,{side:0,ability:'normal',commanderId:'magic',targetIds:['2']});
 assert.deepEqual(out.log.at(-1).impacts,[{target:'2',kind:'stun',value:1,nextAttack:true}]);
 assert.equal(out.teams[1][2].commanderStunNextAttack,true);
 assert.equal(out.teams[1][2].commanderWeaken,.4,'pre-existing legacy weakening is not amplified');
 assert.equal(out.teams[1].filter(u=>u.commanderStunNextAttack).length,1);
 assert.equal(input[1][2].commanderStunNextAttack,undefined,'effect preparation leaves its input unchanged');
});
