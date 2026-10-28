import test from'node:test';import assert from'node:assert/strict';
import{createLiveCommanderCombat,castLiveCommanderCombat,viewLiveCommanderCombat}from'../commander-live-combat.js';
import{createLiveCommanderAbilities,grantLiveCommanderEnergy}from'../commander-live-abilities.js';
import{orderHeroActions,nextScheduledHeroAction}from'../battle-action-scheduler.js';
const hero=(id,extra={})=>({id,hp:100,maxHp:100,attack:100,defense:80,speed:50,shield:0,role:'fighter',lane:'front',position:0,damage:0,healing:0,kills:0,...extra});
const profile=commanderId=>({commanderId,levels:{attack:0,defense:0,magic:0,support:0}});
function setup(type,{energy=100,dead=false,round=3}={}){return createLiveCommanderCombat({round,abilities:createLiveCommanderAbilities({matchKey:'mage-revive:1',energy:[energy,100],now:0}),teams:[[hero('ally'),hero('chosen',{hp:dead?0:100,position:1,speed:100})],[hero('enemy'),hero('enemy-dead',{hp:0,position:1})]],commanders:[profile(type),profile('defense')]});}
const cast=(c,target,extra={})=>castLiveCommanderCombat(c,{side:0,ability:'ultimate',targetIds:[target],requestId:'request_001',matchKey:'mage-revive:1',now:1000,...extra});
for(const type of['magic','support'])test(type+' rejects wrong-side/invalid targets before charging',()=>{for(const targets of[['enemy'],['enemy-dead'],[],['chosen','ally'],['missing']]){const c=setup(type,{dead:type==='support'}),before=structuredClone(c.teams);assert.throws(()=>cast(c,'chosen',{targetIds:targets}));assert.deepEqual(c.teams,before);assert.equal(c.abilities.energy[0],100);assert.deepEqual(c.revivalUsed,[false,false]);assert.equal(c.abilities.casts.length,0);}});
test('mage selected living ally receives snapshot, charges100 once, recast cannot refresh',()=>{
 const c=setup('magic');c.teams[0][1].lastActionRound=3;const result=cast(c,'chosen');assert.equal(result.ultimateEnergy,0);assert.equal(result.energy,100);const target=c.teams[0][1];assert.deepEqual([target.attack,target.arcaneSurgeBonusAttack,target.arcaneSurgeFromRound,target.arcaneSurgeUntilRound],[100,100,4,6]);const duplicate=cast(c,'chosen');assert.equal(duplicate.duplicate,true);assert.equal(c.abilities.ultimateEnergy[0],0);grantLiveCommanderEnergy(c.abilities,0,100);assert.throws(()=>cast(c,'chosen',{requestId:'request_002',now:7000}),/ultimate already used/);assert.equal(c.abilities.energy[0],100);assert.equal(c.teams[0][1].arcaneSurgeUntilRound,6);
});
test('support revive charges90 once, no same-round action and next-round eligibility',()=>{
 const c=setup('support',{dead:true});const result=cast(c,'chosen');assert.equal(result.ultimateEnergy,10);assert.equal(result.energy,100);assert.deepEqual(c.revivalUsed,[true,false]);assert.equal(c.teams[0][1].hp,40);assert.equal(c.teams[0][1].shield,0);const order=orderHeroActions(c.teams,{round:3});assert.notEqual(nextScheduledHeroAction(order,0,{round:3}).unit.id,'chosen');assert.equal(nextScheduledHeroAction(order,0,{round:4}).unit.id,'chosen');assert.deepEqual(viewLiveCommanderCombat(c).revivalUsed,[true,false]);
 const duplicate=cast(c,'chosen');assert.equal(duplicate.duplicate,true);assert.equal(c.abilities.ultimateEnergy[0],10);assert.equal(c.teams[0][1].hp,40);
 c.teams[0][1].hp=0;grantLiveCommanderEnergy(c.abilities,0,100);assert.throws(()=>cast(c,'chosen',{requestId:'request_002',now:7000}),/already used/);assert.equal(c.abilities.energy[0],100);assert.equal(c.teams[0][1].hp,0);
});
for(const type of['magic','support'])test(type+' insufficient energy leaves prepared effects uncommitted',()=>{
 const energy=type==='support'?89:99;const c=setup(type,{dead:type==='support',energy}),before=structuredClone(c.teams);assert.throws(()=>cast(c,'chosen'),/Insufficient/);assert.deepEqual(c.teams,before);assert.equal(c.abilities.energy[0],energy);assert.deepEqual(c.revivalUsed,[false,false]);assert.equal(c.version,0);assert.equal(c.abilities.casts.length,0);
});
test('revival cannot restart a finished or all-dead match',()=>{
 const c=setup('support',{dead:true});c.finished=true;assert.throws(()=>cast(c,'chosen'),/finished/);assert.equal(c.abilities.energy[0],100);const allDead=setup('support',{dead:true});allDead.teams[0][0].hp=0;assert.throws(()=>cast(allDead,'chosen'),/finished/);assert.equal(allDead.abilities.energy[0],100);
});
test('duplicate request with a different target is rejected without another charge',()=>{
 const c=setup('magic');cast(c,'chosen');assert.throws(()=>cast(c,'ally'),/conflict/);assert.equal(c.abilities.ultimateEnergy[0],0);assert.equal(c.teams[0][0].arcaneSurgeBonusAttack,undefined);
});
