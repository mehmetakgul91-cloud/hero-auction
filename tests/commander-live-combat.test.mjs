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

test('magic requires one living enemy for normal, two distinct enemies for ultimate',()=>{
 const combat=make();combat.commanders[0]={commanderId:'magic'};
 const before=viewLiveCommanderCombat(combat);
 for(const targets of [undefined,[],['0-0'],['1-0','1-1'],['1-0','1-0']]){
  assert.throws(()=>castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'bad_magic_001',matchKey:'room:1',now:2000,targetIds:targets}),/Invalid magic targets/);
 }
 assert.deepEqual(viewLiveCommanderCombat(combat),before);
 assert.equal(combat.abilities.energy[0],100);
 assert.equal(combat.abilities.cooldownUntil[0],1000);
 const cast=castLiveCommanderCombat(combat,{side:0,ability:'ultimate',requestId:'magic_valid_001',matchKey:'room:1',now:2000,targetIds:['1-1','1-3']});
 assert.equal(cast.version,1);
 assert.equal(combat.teams[1][1].commanderWeaken,.4);
 assert.equal(combat.teams[1][3].commanderWeaken,.4);
 assert.equal(combat.teams[1][0].commanderWeaken,undefined);
 assert.equal(combat.abilities.energy[0],0);
 assert.throws(()=>castLiveCommanderCombat(combat,{side:0,ability:'ultimate',requestId:'magic_valid_001',matchKey:'room:1',now:2001,targetIds:['1-2','1-3']}),/conflict/);
});
test('magic cannot target dead enemy and rejected selection costs no energy',()=>{
 const combat=make();combat.commanders[0]={commanderId:'magic'};
 combat.teams[1][2].hp=0;
 assert.throws(()=>castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'dead_target_01',matchKey:'room:1',now:2000,targetIds:['1-2']}),/Invalid magic targets/);
 assert.equal(combat.abilities.energy[0],100);
 assert.equal(combat.version,0);
});

test('magic ultimate accepts one target when only one enemy survives',()=>{
 const combat=make();combat.commanders[0]={commanderId:'magic'};
 for(let i=1;i<5;i++)combat.teams[1][i].hp=0;
 const result=castLiveCommanderCombat(combat,{side:0,ability:'ultimate',requestId:'sole_enemy_001',matchKey:'room:1',now:2000,targetIds:['1-0']});
 assert.equal(result.version,1);
 assert.equal(combat.teams[1][0].commanderWeaken,.4);
 assert.equal(combat.teams[1][0].commanderWeakenUntilRound,3);
 assert.equal(combat.abilities.energy[0],0);
 assert.equal(combat.abilities.cooldownUntil[0],7000);
});
test('magic ultimate still requires two distinct targets when two enemies survive',()=>{
 const combat=make();combat.commanders[0]={commanderId:'magic'};
 for(let i=2;i<5;i++)combat.teams[1][i].hp=0;
 assert.throws(()=>castLiveCommanderCombat(combat,{side:0,ability:'ultimate',requestId:'two_enemy_001',matchKey:'room:1',now:2000,targetIds:['1-0']}),/Invalid magic targets/);
 assert.equal(combat.abilities.energy[0],100);
 assert.equal(combat.version,0);
 const result=castLiveCommanderCombat(combat,{side:0,ability:'ultimate',requestId:'two_enemy_001',matchKey:'room:1',now:2000,targetIds:['1-0','1-1']});
 assert.equal(result.version,1);
});
