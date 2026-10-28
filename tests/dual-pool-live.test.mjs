import test from 'node:test';import assert from 'node:assert/strict';
import {createLiveCommanderAbilities,castLiveCommanderAbility,grantLiveCommanderEnergy,viewLiveCommanderAbilities} from '../commander-live-abilities.js';
const cast=(s,ability,now=0)=>castLiveCommanderAbility(s,{side:0,ability,matchKey:s.matchKey,requestId:'request_'+now,now});
test('normal spending never drains ultimate charge and ultimate never drains normal energy',()=>{
 const s=createLiveCommanderAbilities({matchKey:'dual',energy:[100,30],ultimateEnergy:[85,30],now:0});
 cast(s,'normal');assert.equal(s.energy[0],60);assert.equal(s.ultimateEnergy[0],85);
 const result=cast(s,'ultimate',5000);assert.equal(result.energy,60);assert.equal(result.ultimateEnergy,0);assert.equal(s.ultimateUsed[0],true);
 grantLiveCommanderEnergy(s,0,25);assert.equal(s.energy[0],85);assert.equal(s.ultimateEnergy[0],0);
 assert.throws(()=>cast(s,'ultimate',10000),/already used/);
});
test('each ability checks its own pool and independent grants cap both',()=>{
 const s=createLiveCommanderAbilities({matchKey:'dual',energy:[0,95],ultimateEnergy:[85,90],now:0});
 assert.equal(viewLiveCommanderAbilities(s,0,0).canUseNormal,false);assert.equal(viewLiveCommanderAbilities(s,0,0).canUseUltimate,true);
 assert.throws(()=>cast(s,'normal'),/energy/);cast(s,'ultimate');
 grantLiveCommanderEnergy(s,1,12);assert.deepEqual(s.energy,[0,100]);assert.deepEqual(s.ultimateEnergy,[0,100]);
});
test('ultimate charge initialized independently, validated and never aliases supplied arrays',()=>{
 const s=createLiveCommanderAbilities({matchKey:'dual',now:0});assert.deepEqual(s.ultimateEnergy,[30,30]);assert.notEqual(s.energy,s.ultimateEnergy);
 for(const ultimateEnergy of [[-1,30],[101,30],[30],null])assert.throws(()=>createLiveCommanderAbilities({matchKey:'dual',ultimateEnergy}),/Invalid/);
});

test('authoritative registry keeps both pools across reconnect views, rejects forged funds and invalid targets',async()=>{
 const {createLiveCommanderCombat}=await import('../commander-live-combat.js');
 const {createLiveArenaRegistry}=await import('../commander-live-arena-registry.js');
 const hero=(id,hp=100)=>({id,hp,maxHp:100,attack:50,defense:30,speed:50,shield:0});
 for(const side of [0,1]){
  const abilities=createLiveCommanderAbilities({matchKey:'registry',energy:[40,40],ultimateEnergy:[100,100],now:0});
  const c=createLiveCommanderCombat({abilities,teams:[[hero('a')],[hero('b')]],commanders:[{commanderId:'magic'},{commanderId:'magic'}]});
  const r=createLiveArenaRegistry();r.register({matchKey:'registry',tokens:['token-a','token-b'],combat:c});
  const token=side?'token-b':'token-a',own=side?'b':'a',enemy=side?'a':'b';
  r.cast({matchKey:'registry',token,ability:'normal',targetIds:[enemy],requestId:'normal_registry',now:0});
  const before=r.snapshot({matchKey:'registry',token,now:5000});assert.equal(before.abilities[side].energy,0);assert.equal(before.abilities[side].ultimateEnergy,100);assert.equal(before.abilities[1-side].ultimateEnergy,null);
  assert.throws(()=>r.cast({matchKey:'registry',token,ability:'ultimate',targetIds:[enemy],requestId:'invalid_registry',now:5000,energy:100,ultimateEnergy:100}));
  assert.equal(r.snapshot({matchKey:'registry',token,now:5000}).abilities[side].ultimateEnergy,100);
  const request={matchKey:'registry',token,ability:'ultimate',targetIds:[own],requestId:'ultimate_registry',now:5000};r.cast(request);assert.equal(r.cast(request).duplicate,true);
  const refreshed=r.snapshot({matchKey:'registry',token,now:10000});assert.equal(refreshed.abilities[side].energy,0);assert.equal(refreshed.abilities[side].ultimateEnergy,0);assert.equal(refreshed.abilities[side].ultimateUsed,true);
  assert.throws(()=>r.cast({...request,requestId:'forged_registry',now:10000,ultimateEnergy:100}),/already used/);
  assert.equal(r.snapshot({matchKey:'registry',token:side?'token-a':'token-b',now:10000}).abilities[1-side].ultimateEnergy,100);
 }
});
