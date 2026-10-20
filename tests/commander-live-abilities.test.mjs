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
 const cast=castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:1',now:2000});
 assert.equal(cast.energy,60);
 assert.equal(cast.cooldownMs,COMMANDER_COOLDOWN_MS);
 assert.equal(viewLiveCommanderAbilities(s,0,4000).cooldownMs,3000);
 assert.throws(()=>castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:1',now:6999}),/cooldown/);
 assert.equal(castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:1',now:7000}).energy,20);
});
test('ultimate costs 100 and never fires without enough energy',()=>{
 const s=setup();
 assert.equal(castLiveCommanderAbility(s,{side:1,ability:'ultimate',matchKey:'583:1',now:2000}).energy,0);
 assert.throws(()=>castLiveCommanderAbility(s,{side:1,ability:'normal',matchKey:'583:1',now:7000}),/energy/);
 grantLiveCommanderEnergy(s,1,50);
 assert.equal(viewLiveCommanderAbilities(s,1,7000).canUseNormal,true);
});
test('cooldown belongs to one player and persists in session',()=>{
 const s=setup();
 castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:1',now:2000});
 assert.equal(viewLiveCommanderAbilities(s,1,2001).canUseUltimate,true);
 assert.throws(()=>castLiveCommanderAbility(s,{side:0,ability:'normal',matchKey:'583:2',now:9000}),/expired/);
 assert.equal(s.casts.length,1);
});
test('invalid requests cannot spend energy or reset cooldown',()=>{
 const s=setup();
 for(const ability of ['pass','other']){
  assert.throws(()=>castLiveCommanderAbility(s,{side:0,ability,matchKey:'583:1',now:2000}),/Invalid/);
 }
 assert.deepEqual(s.energy,[100,100]);
 assert.deepEqual(s.cooldownUntil,[1000,1000]);
});
