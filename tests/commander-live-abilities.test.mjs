import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities,viewLiveCommanderAbilities,castLiveCommanderAbility,grantLiveCommanderEnergy,COMMANDER_COOLDOWN_MS} from '../commander-live-abilities.js';
const setup=()=>createLiveCommanderAbilities({matchKey:'583:1',energy:[100,100],now:1000});
test('cast is optional even at full energy',()=>{
 const s=setup();
 assert.equal(viewLiveCommanderAbilities(s,0,2000).energy,100);
 assert.equal(s.casts.length,0);
});
test('normal costs 40 and blocks both abilities for five seconds',()=>{
 const s=setup();
 const cast=castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:1',now:2000,requestId:'request_001'});
 assert.equal(cast.energy,60);
 assert.equal(cast.cooldownMs,COMMANDER_COOLDOWN_MS);
 assert.equal(viewLiveCommanderAbilities(s,0,4000).cooldownMs,3000);
 assert.throws(()=>castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:1',now:6999,requestId:'request_002'}),/cooldown/);
 assert.equal(castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:1',now:7000,requestId:'request_002'}).energy,20);
});
test('ultimate costs 100 and never fires without enough energy',()=>{
 const s=setup();
 assert.equal(castLiveCommanderAbility(s,{side:1,ability:'ultimate',matchKey:'583:1',now:2000,requestId:'request_001'}).energy,0);
 assert.throws(()=>castLiveCommanderAbility(s,{side:1,ability:'normal',matchKey:'583:1',now:7000,requestId:'request_002'}),/energy/);
 grantLiveCommanderEnergy(s,1,50);
 assert.equal(viewLiveCommanderAbilities(s,1,7000).canUseNormal,true);
});
test('personal cooldown stays independent after the shared 1.2-second effect lock',()=>{
 const s=setup();
 castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:1',now:2000,requestId:'request_001'});
 assert.equal(viewLiveCommanderAbilities(s,1,2001).canUseUltimate,false);
 assert.equal(viewLiveCommanderAbilities(s,1,3199).effectLockMs,1);
 assert.equal(viewLiveCommanderAbilities(s,1,3200).canUseUltimate,true);
 assert.equal(viewLiveCommanderAbilities(s,0,4000).canUseNormal,false);
 assert.throws(()=>castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:2',now:9000,requestId:'request_003'}),/expired/);
 assert.equal(s.casts.length,1);
});
test('duplicate cast request is idempotent even during cooldown',()=>{
 const s=setup();
 const first=castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:1',now:2000,requestId:'request_dup'});
 const again=castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:1',now:2001,requestId:'request_dup'});
 assert.equal(again.duplicate,true);
 assert.equal(again.cast.sequence,first.cast.sequence);
 assert.equal(s.energy[0],60);
 assert.equal(s.casts.length,1);
 assert.throws(()=>castLiveCommanderAbility(s,{side:0,ability:'ultimate',matchKey:'583:1',now:7000,requestId:'request_dup'}),/conflict/);
});
test('invalid requests cannot spend energy or reset cooldown',()=>{
 const s=setup();
 for(const ability of ['pass','other']){
  assert.throws(()=>castLiveCommanderAbility(s,{side:0,ability,matchKey:'583:1',now:2000,requestId:'request_001'}),/Invalid/);
 }
 assert.deepEqual(s.energy,[100,100]);
 assert.deepEqual(s.cooldownUntil,[1000,1000]);
});
