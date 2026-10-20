import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {applyBattleLogHeroEvent} from '../commander-battle-log-bridge.js';
const setup=()=>createLiveCommanderCombat({
 abilities:createLiveCommanderAbilities({matchKey:'test:1',energy:[0,0],now:1000}),
 teams:[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:100,maxHp:100,attack:50,shield:0}))),
 commanders:[{commanderId:'attack'},{commanderId:'defense'}]
});
test('ordinary server hero hit updates shared HP and version',()=>{
 const c=setup();
 applyBattleLogHeroEvent(c,{round:1,side:0,actor:'0-0',target:'1-0',action:'attack',value:20,absorbed:0,rawDamage:20,damageType:'normal'});
 assert.equal(c.teams[1][0].hp,80);
 assert.equal(c.version,1);
});
test('next-round hero event adds twelve energy automatically',()=>{
 const c=setup();
 applyBattleLogHeroEvent(c,{round:2,side:0,actor:'0-0',target:'1-0',action:'attack',value:10,absorbed:0,rawDamage:10,damageType:'normal'});
 assert.deepEqual(c.abilities.energy,[12,12]);
 assert.equal(c.round,2);
});
test('unverifiable shielded logs and commander events fail closed',()=>{
 const c=setup();
 for(const event of [
  {round:1,side:0,actor:'0-0',target:'1-0',action:'attack',value:5,absorbed:3,damageType:'normal'},
  {round:1,side:0,actor:'0-0',target:'1-0',action:'splash',value:5,damageType:'splash'},
  {round:1,side:0,actor:'commander:0',target:'1-0',action:'commander-hit',value:5}
 ])assert.throws(()=>applyBattleLogHeroEvent(c,event));
 assert.equal(c.version,0);
});
test('old round events cannot modify latest HP',()=>{
 const c=setup();
 applyBattleLogHeroEvent(c,{round:2,side:0,actor:'0-0',target:'1-0',action:'attack',value:5,rawDamage:5,damageType:'normal'});
 assert.throws(()=>applyBattleLogHeroEvent(c,{round:1,side:0,actor:'0-0',target:'1-0',action:'attack',value:50,rawDamage:50,damageType:'normal'}),/Out-of-order/);
 assert.equal(c.teams[1][0].hp,95);
});

test('shield absorbs damage without double HP loss',()=>{
 const c=setup();
 applyBattleLogHeroEvent(c,{round:1,side:1,actor:'1-0',target:'1-1',action:'shield',value:20});
 const result=applyBattleLogHeroEvent(c,{round:1,side:0,actor:'0-0',target:'1-1',action:'attack',value:10,absorbed:20,rawDamage:30,damageType:'normal'});
 assert.equal(result.teams[1][1].shield,0);
 assert.equal(result.teams[1][1].hp,90);
});
test('splash damage uses raw damage and validates absorption',()=>{
 const c=setup();
 applyBattleLogHeroEvent(c,{round:1,side:0,actor:'0-0',target:'1-0',action:'splash',value:15,absorbed:0,rawDamage:15,damageType:'splash'});
 assert.equal(c.teams[1][0].hp,85);
 assert.throws(()=>applyBattleLogHeroEvent(c,{round:1,side:0,actor:'0-0',target:'1-0',action:'attack',value:50,absorbed:0,rawDamage:10,damageType:'normal'}),/trustworthy/);
});

test('invalid future-round damage does not advance round or grant energy',()=>{
 const c=setup();
 const before=structuredClone(c.teams);
 assert.throws(()=>applyBattleLogHeroEvent(c,{round:2,side:0,actor:'0-0',target:'1-0',action:'attack',value:30,absorbed:0,rawDamage:2,damageType:'normal'}),/trustworthy/);
 assert.equal(c.round,1);
 assert.deepEqual(c.abilities.energy,[0,0]);
 assert.deepEqual(c.teams,before);
 assert.equal(c.version,0);
});
test('unsupported debuff in next round leaves combat untouched',()=>{
 const c=setup();
 assert.throws(()=>applyBattleLogHeroEvent(c,{round:2,side:0,actor:'0-0',target:'1-0',action:'weaken',value:0}),/Unsupported/);
 assert.equal(c.round,1);
 assert.deepEqual(c.abilities.energy,[0,0]);
});
