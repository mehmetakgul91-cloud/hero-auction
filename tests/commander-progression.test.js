import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMANDERS,createCommanderProfile,commanderUpgradeCost,previewCommanderUpgrade,commanderStatBonus,applyCommanderSupport} from '../arena-commanders.js';
test('four commanders and persistent starting profile',()=>{
 assert.equal(COMMANDERS.length,4);
 const profile=createCommanderProfile('guardian');
 assert.deepEqual(profile.levels,{attack:0,defense:0,maxHp:0,speed:0});
 assert.equal(commanderStatBonus(profile,'defense'),.05);
 assert.equal(commanderStatBonus(profile,'attack'),0);
});
test('upgrades charge increasing gold without mutating input',()=>{
 const initial=createCommanderProfile('guardian');
 const first=previewCommanderUpgrade(initial,'attack',500);
 assert.equal(first.cost,100);assert.equal(first.remainingGold,400);
 assert.equal(first.profile.levels.attack,1);assert.equal(initial.levels.attack,0);
 const second=previewCommanderUpgrade(first.profile,'attack',400);
 assert.equal(second.cost,200);assert.equal(second.remainingGold,200);
 assert.equal(commanderStatBonus(second.profile,'attack'),.02);
});
test('insufficient gold and invalid upgrades rejected',()=>{
 const p=createCommanderProfile('medic');
 assert.throws(()=>previewCommanderUpgrade(p,'attack',99),/Yetersiz/);
 assert.throws(()=>previewCommanderUpgrade(p,'unknown',500),/Geçersiz/);
 assert.throws(()=>createCommanderProfile('unknown'),/Geçersiz/);
});
test('five heroes receive their commander stat bonuses',()=>{
 const profile=previewCommanderUpgrade(createCommanderProfile('strategist'),'maxHp',100).profile;
 const team=Array.from({length:5},()=>({attack:100,defense:100,maxHp:100,hp:100,speed:100}));
 applyCommanderSupport(team,profile);
 assert.equal(team.length,5);
 for(const hero of team){assert.equal(hero.attack,105);assert.equal(hero.maxHp,101);assert.equal(hero.hp,101)}
});
