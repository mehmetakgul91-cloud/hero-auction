import test from 'node:test';import assert from 'node:assert/strict';
import {chooseAuditAction,mageAuditScore} from '../tools/compare-commander-diverse.mjs';
import {createLiveCommanderCombat} from '../commander-live-combat.js';import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveArenaRegistry} from '../commander-live-arena-registry.js';import {createLiveArenaPacer} from '../commander-live-arena-pacer.js';
const hero=(id,extra={})=>({id,hp:1000,maxHp:1000,attack:1,defense:0,speed:1,position:0,role:'fighter',lane:'front',shield:0,...extra});
test('reserve policy does not hoard unavailable ultimate in OFF arm and uses normals after its one ultimate',()=>{
 const combat={round:1,teams:[[hero('a')],[hero('b')]],commanders:[{commanderId:'attack'},{commanderId:'defense'}],ultimateUsed:[false,false]};const availability={canUseNormal:true,canUseUltimate:false};
 assert.equal(chooseAuditAction(combat,0,availability,'reserve-ultimate',true),null);
 assert.deepEqual(chooseAuditAction(combat,0,availability,'reserve-ultimate',false),{ability:'normal'});
 combat.ultimateUsed[0]=true;assert.deepEqual(chooseAuditAction(combat,0,availability,'reserve-ultimate',true),{ability:'normal'});
});
test('mixed policy pays normal opportunity cost before ultimate when normal is useful',()=>{
 const combat={round:3,teams:[[hero('a')],[hero('b')]],commanders:[{commanderId:'attack'},{commanderId:'defense'}],ultimateUsed:[false,false]};
 assert.equal(chooseAuditAction(combat,0,{canUseNormal:true,canUseUltimate:true},'mixed-normal-first',true).ability,'normal');
});
test('mage score considers unacted special AoE and avoids valuing wounded healer special as damage',()=>{
 const mage=hero('mage',{role:'energy',attack:100,active:{effect:'splash',power:1.1,splashRate:.25}}),healer=hero('heal',{role:'support',attack:100,active:{effect:'heal',power:1.1},hp:500}),enemies=[hero('x'),hero('y'),hero('z')];
 assert.ok(mageAuditScore(mage,[mage,healer],enemies,3)>mageAuditScore(healer,[mage,healer],enemies,3));
 assert.ok(mageAuditScore(mage,[mage],enemies,3)>mageAuditScore({...mage,lastActionRound:3},[mage],enemies,3));
});
test('casualty energy enables same-round revive and commander effect lock does not freeze hero pacing',()=>{
 const matchKey='midround:test',combat=createLiveCommanderCombat({teams:[[hero('victim',{hp:1,maxHp:1000,speed:0}),hero('survivor',{position:1})],[hero('killer',{attack:100,speed:100,position:1})]],commanders:[{commanderId:'support'},{commanderId:'attack'}],abilities:createLiveCommanderAbilities({matchKey,energy:[80,100],now:0})});
 const registry=createLiveArenaRegistry();registry.register({matchKey,tokens:['a','b'],combat,options:{parity:true}});const pacer=createLiveArenaPacer({registry,matchKey,token:'a',intervalMs:900});pacer.start(0);
 assert.equal(pacer.tick(900).kind,'hero');assert.equal(combat.teams[0][0].hp,0);assert.equal(combat.abilities.energy[0],90);
 registry.cast({matchKey,token:'a',ability:'ultimate',targetIds:['victim'],requestId:'revive_midround',now:900});assert.equal(combat.round,1);assert.equal(combat.abilities.ultimateEnergy[0],0);assert.equal(combat.teams[0][0].canActFromRound,2);
 assert.throws(()=>registry.cast({matchKey,token:'b',ability:'normal',requestId:'locked_cast_1',now:1800}),/Komutan efekti/);
 assert.equal(pacer.tick(1800).kind,'hero','hero proceeds before2100 cast lock expiry');assert.equal(combat.teams[0][1].lastActionRound,1);assert.equal(combat.teams[0][0].lastActionRound,1,'revived unit has only cast marker, not an extra action');
});

test('early-normal-then-reserve permits one early normal then saves for ultimate and OFF never phantom-reserves',()=>{
 const c={round:2,teams:[[hero('a')],[hero('b')]],commanders:[{commanderId:'attack'},{commanderId:'defense'}],ultimateUsed:[false,false]},a={canUseNormal:true,canUseUltimate:false};
 assert.equal(chooseAuditAction(c,0,a,'early-normal-then-reserve',true).ability,'normal');
 assert.equal(chooseAuditAction(c,0,a,'early-normal-then-reserve',true,{earlyNormalUsed:true}),null);
 assert.equal(chooseAuditAction(c,0,a,'early-normal-then-reserve',false,{earlyNormalUsed:true}).ability,'normal');
 c.round=3;assert.equal(chooseAuditAction(c,0,a,'early-normal-then-reserve',true),null);
 assert.equal(chooseAuditAction(c,0,{...a,canUseUltimate:true},'early-normal-then-reserve',true,{earlyNormalUsed:true}).ability,'ultimate');
});

test('defense audit explicitly chooses a living ally by lowest ratio with deterministic ID ties',()=>{
 const allies=[hero('dead',{hp:0}),hero('b',{hp:100,maxHp:1000}),hero('a',{hp:10,maxHp:100}),hero('healthy')];
 const combat={round:3,teams:[allies,[hero('enemy')]],commanders:[{commanderId:'defense'},{commanderId:'attack'}],ultimateUsed:[false,false]};
 const before=structuredClone(combat);
 assert.deepEqual(chooseAuditAction(combat,0,{canUseNormal:false,canUseUltimate:true},'reserve-ultimate',true),{ability:'ultimate',targetIds:['a']});
 assert.deepEqual(combat,before);
 combat.teams.reverse();combat.commanders.reverse();
 assert.deepEqual(chooseAuditAction(combat,1,{canUseNormal:false,canUseUltimate:true},'reserve-ultimate',true),{ability:'ultimate',targetIds:['a']});
});
