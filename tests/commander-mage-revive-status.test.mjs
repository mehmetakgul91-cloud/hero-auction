import test from'node:test';import assert from'node:assert/strict';
import{grantArcaneSurge,arcaneDamageAttack,expireCommanderUltimateStatuses,reviveCommanderAlly}from'../commander-ultimate-status.js';
import{calculateHeroRawDamage}from'../battle-damage-formula.js';
import{calculateSplashRawDamage,calculateSpecialHeal,resolveSpecialHealing}from'../battle-special-formulas.js';
import{applyHeroDamage}from'../battle-hp-damage.js';
const unit=(extra={})=>({id:'hero',hp:100,maxHp:100,attack:100,defense:100,speed:80,shield:0,role:'fighter',lane:'front',position:0,damage:17,healing:9,kills:2,...extra});
test('arcane surge snapshots attack once, never compounds repeated attacks',()=>{
 const h=unit();assert.equal(grantArcaneSurge(h,3),true);assert.equal(h.attack,100);assert.equal(h.arcaneSurgeBonusAttack,100);assert.equal(h.arcaneSurgeFromRound,3);assert.equal(h.arcaneSurgeUntilRound,5);
 assert.deepEqual([3,3,4,5].map(r=>arcaneDamageAttack(h,r)),[200,200,200,200]);assert.equal(arcaneDamageAttack(h,2),100);assert.equal(arcaneDamageAttack(h,6),100);assert.equal(arcaneDamageAttack(h),100);
});
test('surge on already-acted target starts next round and lasts three inclusive rounds',()=>{
 const h=unit({lastActionRound:3});grantArcaneSurge(h,3);assert.deepEqual([h.arcaneSurgeFromRound,h.arcaneSurgeUntilRound],[4,6]);assert.deepEqual([3,4,5,6,7].map(r=>arcaneDamageAttack(h,r)),[100,200,200,200,100]);
});
test('active and pending surges cannot stack or refresh; expired surge takes new snapshot',()=>{
 const h=unit({lastActionRound:2});grantArcaneSurge(h,2);h.attack=110;const original=structuredClone(h);assert.equal(grantArcaneSurge(h,2),false);assert.deepEqual(h,original);assert.equal(grantArcaneSurge(h,5),false);assert.deepEqual(h,original);assert.equal(grantArcaneSurge(h,6),true);assert.equal(h.arcaneSurgeBonusAttack,110);
});
test('rage and permanent debuffs affect base, fixed cast bonus is not recomputed',()=>{
 const h=unit();grantArcaneSurge(h,2);h.attack=110;assert.equal(arcaneDamageAttack(h,2),210);h.attack=90;assert.equal(arcaneDamageAttack(h,3),190);expireCommanderUltimateStatuses([[h],[]],5);assert.equal(h.attack,90);assert.equal(h.arcaneSurgeBonusAttack,undefined);assert.equal(arcaneDamageAttack(h,5),90);
});
test('surge does not scale heal or shield stat bases',()=>{
 const h=unit({role:'support',active:{effect:'shield',name:'hybrid',supportHybrid:true,healRate:.52,allyShieldRate:.28}}),ally=unit({id:'ally',hp:10});const before=resolveSpecialHealing(h,[h,ally]);grantArcaneSurge(h,1);const after=resolveSpecialHealing(h,[h,ally]);assert.equal(after.heal,before.heal);assert.equal(after.shield,before.shield);assert.equal(after.heal,52);assert.equal(after.shield,28);assert.equal(calculateSpecialHeal({attack:h.attack,missingHp:100,skill:{healRate:.64}}),64);
});
test('primary and area damage derive one snapshot boost, never a second area multiplier',()=>{
 const h=unit(),target=unit({defense:0,hp:1000,maxHp:1000});const skill={effect:'splash',power:1,splashRate:.3};const primary=calculateHeroRawDamage({unit:h,target,skill,special:true,round:2}),splash=calculateSplashRawDamage(primary,{skill,role:h.role,special:true});grantArcaneSurge(h,2);const boosted=calculateHeroRawDamage({unit:h,target,skill,special:true,round:2}),boostedSplash=calculateSplashRawDamage(boosted,{skill,role:h.role,special:true});assert.deepEqual([primary,splash,boosted,boostedSplash],[70,21,140,42]);
 for(const [raw,expected]of[[primary,21],[splash,7],[boosted,42],[boostedSplash,13]]){const victim=unit({hp:1000,maxHp:1000,shield:1000});const hit=applyHeroDamage(victim,raw,{round:2});assert.equal(hit.damage,expected);assert.ok(hit.absorbed<=Math.floor(raw*7/10));}
});
test('real energy role has one damage boost with integer rounding',()=>{
 const h=unit({role:'energy'}),target=unit({defense:80});const skill={effect:'splash',power:1.14,splashRate:.3};const before=calculateHeroRawDamage({unit:h,target,skill,special:true,round:3});grantArcaneSurge(h,3);const after=calculateHeroRawDamage({unit:h,target,skill,special:true,round:3});assert.ok(after>=2*before&&after<=2*before+1);assert.equal(calculateSplashRawDamage(after,{skill,role:h.role,special:true}),Math.max(1,Math.floor(after*.3)));
});
for(const bad of[0,-1,1.5,NaN,Infinity])test('invalid arcane/revive round rejected '+bad,()=>{assert.throws(()=>grantArcaneSurge(unit(),bad));assert.throws(()=>reviveCommanderAlly(unit({hp:0}),bad));});
test('dead, invalid attack, and invalid target cannot gain surge',()=>{for(const h of[unit({hp:0}),unit({attack:Infinity}),unit({attack:-1}),null])assert.throws(()=>grantArcaneSurge(h,1));});
test('revive restores forty-percent HP, zero shield and no same-round action',()=>{
 const h=unit({hp:0,maxHp:101,shield:50});const r=reviveCommanderAlly(h,4);assert.deepEqual(r,{value:40,canActFromRound:5});assert.equal(h.hp,40);assert.equal(h.shield,0);assert.equal(h.revivedAtRound,4);assert.equal(h.lastActionRound,4);assert.equal(h.canActFromRound,5);assert.throws(()=>reviveCommanderAlly(h,4));
});
test('revive clears temporary statuses without rebuilding stats or reapplying rage',()=>{
 const h=unit({hp:0,attack:117,defense:63,speed:91,rageActivated:true,arcaneSurgeBonusAttack:100,arcaneSurgeFromRound:2,arcaneSurgeUntilRound:4,commanderWeaken:.3,commanderWeakenUntilRound:4,delayDueRound:3,delayProtectedThroughRound:4,lastStandReady:true,lastStandUntilRound:4,commanderFocusTargetId:'enemy',commanderFocusUntilRound:4});reviveCommanderAlly(h,3);
 assert.deepEqual([h.attack,h.defense,h.speed,h.rageActivated,h.damage,h.healing,h.kills],[117,63,91,true,17,9,2]);for(const key of['arcaneSurgeBonusAttack','arcaneSurgeFromRound','arcaneSurgeUntilRound','commanderWeaken','commanderWeakenUntilRound','delayDueRound','delayProtectedThroughRound','lastStandReady','lastStandUntilRound','commanderFocusTargetId','commanderFocusUntilRound'])assert.equal(h[key],undefined,key);
 assert.equal(arcaneDamageAttack(h,4),117);
});
test('revival HP bounds and invalid targets',()=>{const tiny=unit({hp:0,maxHp:1});reviveCommanderAlly(tiny,1);assert.equal(tiny.hp,1);for(const h of[unit(),unit({hp:-1}),unit({hp:0,maxHp:0}),unit({hp:0,maxHp:Infinity}),unit({hp:0,maxHp:.5}),null])assert.throws(()=>reviveCommanderAlly(h,1));});
