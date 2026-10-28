import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveArenaRegistry} from '../commander-live-arena-registry.js';
function fixture(kind='magic',matchKey='normal-authority'){
 const hero=(id,hp=100)=>({id,hp,maxHp:100,attack:30,defense:20,shield:0,speed:30,lane:'front',position:0});
 const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey,energy:[100,100],ultimateEnergy:[100,100],now:0}),teams:[[hero('a0',60),hero('a1'),hero('a2',0)],[hero('b0'),hero('b1')]],commanders:[{commanderId:kind},{commanderId:'defense'}]});
 const registry=createLiveArenaRegistry();registry.register({matchKey,tokens:['token-a','token-b'],combat,options:{parity:true}});
 const cast=(ability,now,targetIds,extra={})=>registry.cast({matchKey,token:'token-a',ability,now,requestId:'request_'+ability+'_'+now,...(targetIds?{targetIds}:{}),...extra});
 return {registry,combat,matchKey,cast,normal:()=>cast('normal',0,kind==='magic'?['b0']:undefined)};
}
for(const kind of ['magic','support'])test(`${kind}: invalid ultimate target cannot alter previous normal cooldown or either resource pool`,()=>{
 const f=fixture(kind);f.normal();assert.equal(f.combat.abilities.cooldownUntil[0],5000);
 const invalid=kind==='magic'?[['b0'],['a2'],['missing'],['a0','a1']]:[['b0'],['a0'],['missing'],['a2','a2']];
 for(const targets of invalid){const before=structuredClone(f.combat);assert.throws(()=>f.cast('ultimate',1200,targets));assert.deepEqual(f.combat,before);}
 const before=structuredClone(f.combat);assert.throws(()=>f.cast('ultimate',1200,[kind==='magic'?'a0':'a2'],{token:'stranger'}),/Unauthorized/);assert.deepEqual(f.combat,before);
 const view=f.registry.snapshot({matchKey:f.matchKey,token:'token-a',now:1200});assert.equal(view.abilities[0].normalCooldownUntil,5000);assert.equal(view.abilities[0].normalCooldownMs,3800);assert.equal(view.abilities[0].canUseUltimate,true);
});
for(const kind of ['magic','support'])test(`${kind}: ultimate retry/conflict preserves normal deadline, global lock and once flag`,()=>{
 const f=fixture(kind);f.normal();const target=kind==='magic'?'a0':'a2';const result=f.cast('ultimate',1200,[target],{side:1,requestId:'ultimate_authority'});
 assert.equal(result.cooldownUntil,5000);assert.equal(f.combat.abilities.ultimateUsed[0],true);assert.equal(f.combat.abilities.ultimateUsed[1],false);
 const before=structuredClone(f.combat);assert.equal(f.cast('ultimate',9999,[target],{requestId:'ultimate_authority'}).duplicate,true);assert.deepEqual(f.combat,before);
 assert.throws(()=>f.cast('ultimate',9999,['a1'],{requestId:'ultimate_authority'}),/conflict/);assert.deepEqual(f.combat,before);
 assert.throws(()=>f.cast('ultimate',9999,[target],{requestId:'different_request'}),/already used/);assert.deepEqual(f.combat,before);
 const reconnect=f.registry.snapshot({matchKey:f.matchKey,token:'token-a',now:2400});assert.equal(reconnect.abilities[0].normalCooldownUntil,5000);assert.equal(reconnect.abilities[0].ultimateUsed,true);assert.equal(reconnect.abilities[0].canUseUltimate,false);assert.equal(reconnect.abilities[1].normalCooldownUntil,null);
});
test('opponent global effect lock remains shared while normal timer and rematch reset stay independent',()=>{
 const f=fixture();f.normal();f.cast('ultimate',1200,['a0']);
 const other=now=>f.registry.cast({matchKey:f.matchKey,token:'token-b',side:0,ability:'ultimate',requestId:'opponent_ultimate',targetIds:['b0'],now});
 const before=structuredClone(f.combat);assert.throws(()=>other(2399),/efekti/);assert.deepEqual(f.combat,before);other(2400);
 assert.deepEqual(f.combat.abilities.cooldownUntil,[5000,0]);assert.deepEqual(f.combat.abilities.ultimateUsed,[true,true]);
 assert.equal(f.registry.snapshot({matchKey:f.matchKey,token:'token-b',now:3599}).abilities[1].canUseNormal,false);
 assert.equal(f.registry.snapshot({matchKey:f.matchKey,token:'token-b',now:3600}).abilities[1].canUseNormal,true);
 f.registry.remove(f.matchKey);assert.throws(()=>f.registry.snapshot({matchKey:f.matchKey,token:'token-a',now:5000}),/Unauthorized/);
 const fresh=fixture('magic','rematch-authority');const state=fresh.registry.snapshot({matchKey:fresh.matchKey,token:'token-a',now:0});
 assert.equal(state.abilities[0].normalCooldownUntil,0);assert.equal(state.abilities[0].effectLockMs,0);assert.equal(state.abilities[0].ultimateUsed,false);assert.equal(state.abilities[0].canUseUltimate,true);
});
test('ultimate near normal readiness does not reset five seconds but still holds the global1.2second effect lock',()=>{
 const f=fixture();f.normal();f.cast('ultimate',4900,['a0']);assert.equal(f.combat.abilities.cooldownUntil[0],5000);
 const readyTime=f.registry.snapshot({matchKey:f.matchKey,token:'token-a',now:5000}).abilities[0];
 assert.equal(readyTime.normalCooldownMs,0);assert.equal(readyTime.effectLockMs,1100);assert.equal(readyTime.canUseNormal,false);
 const before=structuredClone(f.combat);assert.throws(()=>f.cast('normal',6099,['b0']),/efekti/);assert.deepEqual(f.combat,before);
 f.cast('normal',6100,['b0']);assert.equal(f.combat.abilities.cooldownUntil[0],11100);assert.equal(f.combat.abilities.energy[0],20);
});
