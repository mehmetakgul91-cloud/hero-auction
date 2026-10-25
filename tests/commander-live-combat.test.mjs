import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,viewLiveCommanderCombat,beginServerCombatRound} from '../commander-live-combat.js';
const make=(kind='attack')=>{
 const teams=[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:100,maxHp:100,attack:50,shield:0})));
 const abilities=createLiveCommanderAbilities({matchKey:'room:1',energy:[100,100],now:1000});
 return createLiveCommanderCombat({abilities,teams,commanders:[{commanderId:kind},{commanderId:'defense'}]});
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
 const before=viewLiveCommanderCombat(combat);
 assert.throws(()=>castLiveCommanderCombat(combat,{side:1,ability:'normal',requestId:'request_002',matchKey:'room:1',now:3199}),/Komutan efekti/);
 assert.deepEqual(viewLiveCommanderCombat(combat),before);
 assert.equal(combat.abilities.energy[1],100);
 castLiveCommanderCombat(combat,{side:1,ability:'normal',requestId:'request_002',matchKey:'room:1',now:3200});
 assert.equal(viewLiveCommanderCombat(combat,{sinceVersion:1}).events.every(e=>e.version===2),true);
 assert.deepEqual(viewLiveCommanderCombat(combat).teams,viewLiveCommanderCombat(combat,{sinceVersion:1}).teams);
});

test('magic normal requires one living enemy; ultimate buffs one living ally',()=>{
 const combat=make('magic');
 const before=viewLiveCommanderCombat(combat);
 for(const targets of [undefined,[],['0-0'],['1-0','1-1'],['1-0','1-0']]){
  assert.throws(()=>castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'bad_magic_001',matchKey:'room:1',now:2000,targetIds:targets}),/Invalid magic targets/);
 }
 assert.deepEqual(viewLiveCommanderCombat(combat),before);
 assert.equal(combat.abilities.energy[0],100);
 assert.equal(combat.abilities.cooldownUntil[0],1000);
 const cast=castLiveCommanderCombat(combat,{side:0,ability:'ultimate',requestId:'magic_valid_001',matchKey:'room:1',now:2000,targetIds:['0-1']});
 assert.equal(cast.version,1);
 assert.equal(combat.teams[0][1].arcaneSurgeBonusAttack,50);
 assert.equal(combat.teams[0][1].arcaneSurgeUntilRound,3);
 assert.equal(combat.teams[1][0].commanderWeaken,undefined);
 assert.equal(combat.abilities.energy[0],0);
 assert.throws(()=>castLiveCommanderCombat(combat,{side:0,ability:'ultimate',requestId:'magic_valid_001',matchKey:'room:1',now:2001,targetIds:['1-2','1-3']}),/conflict/);
});
test('magic cannot target dead enemy and rejected selection costs no energy',()=>{
 const combat=make('magic');
 combat.teams[1][2].hp=0;
 assert.throws(()=>castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'dead_target_01',matchKey:'room:1',now:2000,targetIds:['1-2']}),/Invalid magic targets/);
 assert.equal(combat.abilities.energy[0],100);
 assert.equal(combat.version,0);
});

test('magic ultimate rejects enemy, dead ally, multiple or missing targets atomically',()=>{
 const combat=make('magic');combat.teams[0][2].hp=0;
 const before=viewLiveCommanderCombat(combat);
 for(const targetIds of [undefined,[],['1-0'],['0-2'],['0-0','0-1']]){
  assert.throws(()=>castLiveCommanderCombat(combat,{side:0,ability:'ultimate',requestId:'invalid_ult_001',matchKey:'room:1',now:2000,targetIds}),/friendly hero/);
  assert.deepEqual(viewLiveCommanderCombat(combat),before);
 }
 const result=castLiveCommanderCombat(combat,{side:0,ability:'ultimate',requestId:'valid_ult_001',matchKey:'room:1',now:2000,targetIds:['0-0']});
 assert.equal(result.version,1);assert.equal(combat.abilities.energy[0],0);
 assert.equal(combat.abilities.cooldownUntil[0],7000);
 assert.equal(combat.teams[0][0].arcaneSurgeBonusAttack,50);
 assert.ok(combat.teams[1].every(u=>u.commanderWeaken===undefined));
});

test('round changes increment snapshot version and announce magic expiration',()=>{
 const combat=make('magic');
 castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'magic_round_01',matchKey:'room:1',now:2000,targetIds:['1-0']});
 const first=beginServerCombatRound(combat,2);
 assert.equal(first.version,2);
 assert.equal(viewLiveCommanderCombat(combat,{sinceVersion:1}).events[0].action,'round-start');
 beginServerCombatRound(combat,3);
 beginServerCombatRound(combat,4);
 assert.equal(combat.teams[1][0].commanderWeaken,undefined);
 assert.equal(combat.version,4);
 assert.equal(viewLiveCommanderCombat(combat,{sinceVersion:3}).events[0].round,4);
});
