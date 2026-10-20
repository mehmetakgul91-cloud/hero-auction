import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,viewLiveCommanderCombat} from '../commander-live-combat.js';
const make=()=>{
 const teams=[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:100,maxHp:100,attack:50,shield:0})));
 const abilities=createLiveCommanderAbilities({matchKey:'room:1',energy:[100,100],now:1000});
 return createLiveCommanderCombat({abilities,teams,commanders:[{commanderId:'attack'},{commanderId:'defense'}]});
};
test('cast updates shared HP and emits versioned events',()=>{
 const combat=make();
 const result=castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'request_001',matchKey:'room:1',now:2000});
 assert.equal(result.version,1);
 assert.equal(combat.abilities.energy[0],60);
 assert.ok(result.teams[1][0].hp<100);
 assert.ok(result.events.every(e=>e.version===1));
 assert.equal(viewLiveCommanderCombat(combat).version,1);
});
test('duplicate cast never applies damage or energy twice',()=>{
 const combat=make();
 castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'request_001',matchKey:'room:1',now:2000});
 const before=viewLiveCommanderCombat(combat);
 const second=castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'request_001',matchKey:'room:1',now:2001});
 assert.equal(second.duplicate,true);
 assert.equal(combat.abilities.energy[0],60);
 assert.deepEqual(viewLiveCommanderCombat(combat),before);
});
test('cooldown rejection leaves battle snapshot unchanged',()=>{
 const combat=make();
 castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'request_001',matchKey:'room:1',now:2000});
 const before=viewLiveCommanderCombat(combat);
 assert.throws(()=>castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'request_002',matchKey:'room:1',now:4000}),/cooldown/);
 assert.deepEqual(viewLiveCommanderCombat(combat),before);
});
test('both players see identical snapshots and incremental events',()=>{
 const combat=make();
 castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'request_001',matchKey:'room:1',now:2000});
 castLiveCommanderCombat(combat,{side:1,ability:'normal',requestId:'request_002',matchKey:'room:1',now:2001});
 assert.equal(viewLiveCommanderCombat(combat,{sinceVersion:1}).events.every(e=>e.version===2),true);
 assert.deepEqual(viewLiveCommanderCombat(combat).teams,viewLiveCommanderCombat(combat,{sinceVersion:1}).teams);
});
