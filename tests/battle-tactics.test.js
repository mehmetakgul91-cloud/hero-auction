import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
const team=(prefix,role='fighter')=>Array.from({length:5},(_,i)=>({id:prefix+i,name:prefix+i,power:65,role:i===0?'tank':role}));
test('identical seed produces identical tactical combat',()=>{const a=team('a'),b=team('b');assert.deepEqual(simulateBattle(a,b,{seed:'fixed'}),simulateBattle(a,b,{seed:'fixed'}))});
test('normal attackers hit living front line before rear line',()=>{const a=team('a'),b=team('b');const result=simulateBattle(a,b,{seed:'front',maxRounds:1});const first=result.log.find(e=>e.side===0&&e.target);assert.ok(first);assert.match(first.target,/^b[01]$/)});
test('rear placement preserves each hero class',()=>{const a=team('a'),b=team('b');const result=simulateBattle(a,b,{seed:'ranged',maxRounds:1});for(const side of result.teams){assert.deepEqual(side.map(u=>u.role),['tank','fighter','fighter','fighter','fighter']);assert.ok(side[2].compositionMultiplier<=1.15)}});
test('five frontliners and five ranged units are both legal',()=>{for(const lane of ['front','back']){const a=team('a').map((u,i)=>({...u,lane,role:lane==='front'?(i%2?'fighter':'tank'):'energy'}));const b=team('b');const result=simulateBattle(a,b,{seed:lane,maxRounds:1});assert.equal(result.teams[0].length,5);assert.ok(result.teams[0].every(u=>u.lane===lane));assert.ok(result.teams[0].every(u=>lane==='back'?u.role==='energy':['tank','fighter'].includes(u.role)))}});
test('formation bonuses are bounded to fifteen percent',()=>{for(const front of [0,1,2,3,4,5]){const cards=team('x').map((c,i)=>({...c,power:90,lane:i<front?'front':'back',role:i<front?'tank':'energy'}));const result=simulateBattle(cards,team('y'),{seed:'cap-'+front,maxRounds:1});for(const hero of result.teams[0])assert.ok(hero.compositionMultiplier>=.85&&hero.compositionMultiplier<=1.15)}});
test('90 auction power retains higher base combat stats than 70 under worst formation multiplier',()=>{const a=team('a').map(c=>({...c,power:90,lane:'front',role:'tank'}));const b=team('b').map((c,i)=>({...c,power:70,lane:i<2?'front':'back',role:i<2?'fighter':'energy'}));const result=simulateBattle(a,b,{seed:'power-priority',maxRounds:1});assert.ok(Math.min(...result.teams[0].map(x=>x.attack))>Math.max(...result.teams[1].map(x=>x.attack)));});

test('four unspent credits boost all five heroes by four percent',()=>{const a=team('a'),b=team('b');const baseline=simulateBattle(a,b,{seed:'credits',maxRounds:1});const boosted=simulateBattle(a,b,{seed:'credits',maxRounds:1,remainingCredits:[4,0]});for(let i=0;i<5;i++){assert.equal(boosted.teams[0][i].auctionCreditMultiplier,1.04);assert.equal(boosted.teams[1][i].auctionCreditMultiplier,1);assert.equal(boosted.teams[0][i].maxHp,Math.round(baseline.teams[0][i].maxHp*1.04))}});
test('negative integer credits apply a penalty while fractional or non-finite credits are rejected',()=>{
 const a=team('a'),b=team('b');
 const result=simulateBattle(a,b,{remainingCredits:[-1,0],maxRounds:1});
 assert.equal(result.teams[0][0].auctionCreditMultiplier,.99);
 assert.equal(result.teams[1][0].auctionCreditMultiplier,1);
 for(const value of [1.5,-1.5,NaN,Infinity])assert.throws(()=>simulateBattle(a,b,{remainingCredits:[value,0]}));
});

test('each remaining credit gives one percent',()=>{for(const [credits,expected] of [[0,1],[4,1.04],[8,1.08],[9,1.09],[10,1.10],[12,1.12],[20,1.20]]){const result=simulateBattle(team('a'),team('b'),{remainingCredits:[credits,0],maxRounds:1});for(const hero of result.teams[0])assert.ok(Math.abs(hero.auctionCreditMultiplier-expected)<1e-10)}});
