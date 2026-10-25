import test from 'node:test';import assert from 'node:assert/strict';
import{createLiveCommanderAbilities,castLiveCommanderAbility,viewLiveCommanderAbilities}from'../commander-live-abilities.js';
const make=()=>createLiveCommanderAbilities({matchKey:'normal-only',energy:[100,100],ultimateEnergy:[100,100],now:0});
const cast=(s,ability,now,side=0,id=ability+'_'+now)=>castLiveCommanderAbility(s,{matchKey:s.matchKey,side,ability,now,requestId:'request_'+id});
test('normal then ultimate waits only shared effect lock, not normal five seconds',()=>{
 const s=make();cast(s,'normal',0);assert.throws(()=>cast(s,'ultimate',1199),/efekti/);
 const ready=viewLiveCommanderAbilities(s,0,1200);assert.equal(ready.canUseUltimate,true);assert.equal(ready.canUseNormal,false);assert.equal(ready.normalCooldownMs,3800);
 cast(s,'ultimate',1200);assert.equal(s.cooldownUntil[0],5000);assert.equal(s.energy[0],60);assert.equal(s.ultimateEnergy[0],15);
 assert.throws(()=>cast(s,'normal',4999),/cooldown/);cast(s,'normal',5000);assert.equal(s.cooldownUntil[0],10000);
});
test('ultimate first never starts normal cooldown; normal becomes legal after1.2seconds',()=>{
 const s=make();cast(s,'ultimate',0);assert.equal(s.cooldownUntil[0],0);
 assert.throws(()=>cast(s,'normal',1199),/efekti/);assert.equal(viewLiveCommanderAbilities(s,0,1200).canUseNormal,true);cast(s,'normal',1200);assert.equal(s.cooldownUntil[0],6200);
});
test('duplicate ultimate cannot extend normal cooldown or effect lock and other seat remains independent',()=>{
 const s=make();cast(s,'normal',0);cast(s,'ultimate',1200);const before=structuredClone({energy:s.energy,ultimateEnergy:s.ultimateEnergy,cooldown:s.cooldownUntil,effectUntil:s.effectUntil});
 assert.equal(cast(s,'ultimate',9999,0,'ultimate_1200').duplicate,true);assert.deepEqual({energy:s.energy,ultimateEnergy:s.ultimateEnergy,cooldown:s.cooldownUntil,effectUntil:s.effectUntil},before);
 assert.equal(viewLiveCommanderAbilities(s,1,2399).canUseNormal,false);assert.equal(viewLiveCommanderAbilities(s,1,2400).canUseNormal,true);cast(s,'normal',2400,1);assert.deepEqual(s.cooldownUntil,[5000,7400]);
});

test('hard bot uses ready ultimate during normal cooldown but cannot evade normal deadline',async()=>{
 const{createLiveCommanderCombat,castLiveCommanderCombat,viewLiveCommanderCombat}=await import('../commander-live-combat.js');const{chooseBotCast}=await import('../bot-strategy.js');
 const unit=id=>({id,hp:1000,maxHp:1000,attack:50,defense:30,shield:0});const c=createLiveCommanderCombat({abilities:make(),teams:[[unit('a')],[unit('b')]],commanders:[{commanderId:'attack'},{commanderId:'defense'}]});
 const execute=(ability,now,id)=>castLiveCommanderCombat(c,{side:0,ability,now,requestId:id,matchKey:c.abilities.matchKey,...(ability==='ultimate'?{targetIds:['b']}:{})});execute('normal',0,'bot_normal_000');
 const view=now=>({...viewLiveCommanderCombat(c),abilities:[viewLiveCommanderAbilities(c.abilities,0,now),{}]});
 assert.deepEqual(chooseBotCast(view(1500),'attack','hard',{side:0,now:1500,lastCastAt:0,startedAt:0}),{ability:'ultimate',targetIds:['b']});execute('ultimate',1500,'bot_ultimate_001');
 assert.equal(chooseBotCast(view(3000),'attack','hard',{side:0,now:3000,lastCastAt:1500,startedAt:0}),null);
 assert.deepEqual(chooseBotCast(view(5000),'attack','hard',{side:0,now:5000,lastCastAt:1500,startedAt:0}),{ability:'normal'});
});
