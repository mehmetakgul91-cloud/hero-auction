import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,applyServerHeroAction,beginServerCombatRound,castLiveCommanderCombat} from '../commander-live-combat.js';
const make=()=>{
 const teams=[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:100,maxHp:100,attack:50,shield:0})));
 const abilities=createLiveCommanderAbilities({matchKey:'room:1',energy:[40,40],now:1000});
 return createLiveCommanderCombat({abilities,teams,commanders:[{commanderId:'attack'},{commanderId:'support'}]});
};
test('trusted hero damage and commander casts use one versioned snapshot',()=>{
 const c=make();
 const hero=applyServerHeroAction(c,{side:0,actorId:'0-0',targetId:'1-0',value:30});
 assert.equal(hero.version,1);
 const cast=castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'request_001',matchKey:'room:1',now:2000});
 assert.equal(cast.version,2);
 assert.ok(c.teams[1][0].hp<70);
 assert.equal(c.events.at(-1).version,2);
});
test('hero casualty grants energy once and preserves max cap',()=>{
 const c=make();
 applyServerHeroAction(c,{side:0,actorId:'0-0',targetId:'1-0',value:200});
 assert.equal(c.abilities.energy[1],50);
 assert.throws(()=>applyServerHeroAction(c,{side:0,actorId:'0-0',targetId:'1-0',value:200}),/target/);
 assert.equal(c.abilities.energy[1],50);
});
test('round start adds twelve energy without forcing any ability',()=>{
 const c=make();
 const next=beginServerCombatRound(c,2);
 assert.deepEqual(next.energy,[52,52]);
 assert.equal(c.abilities.casts.length,0);
 assert.throws(()=>beginServerCombatRound(c,2),/Invalid/);
});
test('server hero healing cannot exceed maximum health',()=>{
 const c=make();
 applyServerHeroAction(c,{side:0,actorId:'0-0',targetId:'1-0',value:40});
 const healed=applyServerHeroAction(c,{side:1,actorId:'1-1',targetId:'1-0',action:'heal',value:100});
 assert.equal(healed.teams[1][0].hp,100);
 assert.equal(healed.event.value,40);
});

test('stale hero actions cannot roll back combat rounds or spend energy',()=>{
 const c=make();
 beginServerCombatRound(c,2);
 const before=structuredClone(c.teams),energy=[...c.abilities.energy];
 assert.throws(()=>applyServerHeroAction(c,{side:0,actorId:'0-0',targetId:'1-0',value:20,round:1}),/Invalid server hero action/);
 assert.deepEqual(c.teams,before);
 assert.deepEqual(c.abilities.energy,energy);
 assert.equal(c.version,1); // The valid round transition is versioned; the stale action adds nothing.
 assert.equal(c.events.length,1);
 assert.equal(c.events[0].action,'round-start');
});
test('negative, fractional and oversized hero damage is rejected',()=>{
 const c=make();
 for(const value of [-1,1.5,1000001,Infinity,NaN]){
  assert.throws(()=>applyServerHeroAction(c,{side:0,actorId:'0-0',targetId:'1-0',value}),/Invalid server hero action/);
 }
 assert.equal(c.version,0);
 assert.equal(c.teams[1][0].hp,100);
});
