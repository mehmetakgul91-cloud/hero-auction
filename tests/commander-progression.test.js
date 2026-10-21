import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMANDERS,createCommanderProfile,commanderLevelCap,commanderUpgradeCost,commanderDiamondUpgradeCost,previewCommanderUpgrade,commanderStatBonus,applyCommanderSupport} from '../arena-commanders.js';
test('four commander types with 40 specialty and 20 other levels',()=>{
 assert.deepEqual(COMMANDERS.map(c=>c.id),['attack','defense','magic','support']);
 for(const c of COMMANDERS)for(const stat of ['attack','defense','magic','support'])
  assert.equal(commanderLevelCap(c.id,stat),c.specialty===stat?40:20);
});
test('each upgrade adds 0.5 percent and gold cost rises from 200',()=>{
 let p=createCommanderProfile('attack');
 assert.deepEqual(p.levels,{attack:0,defense:0,magic:0,support:0});
 assert.equal(commanderUpgradeCost(0),200);
 assert.equal(commanderUpgradeCost(1),400);
 assert.equal(commanderUpgradeCost(19),4000);
 assert.equal(commanderUpgradeCost(39),8000);
 const first=previewCommanderUpgrade(p,'magic',1000);
 assert.equal(first.cost,200);assert.equal(first.remainingGold,800);
 assert.equal(commanderStatBonus(first.profile,'magic'),.005);
 assert.equal(p.levels.magic,0);
});
test('future diamond pricing starts at 10 and increases by 10',()=>{
 assert.equal(commanderDiamondUpgradeCost(0),10);
 assert.equal(commanderDiamondUpgradeCost(1),20);
 assert.equal(commanderDiamondUpgradeCost(19),200);
 assert.equal(commanderDiamondUpgradeCost(39),400);
});
test('non-specialty max 10 percent and specialty max 20 percent',()=>{
 let p=createCommanderProfile('attack');
 for(let i=0;i<20;i++)p=previewCommanderUpgrade(p,'defense',100000).profile;
 assert.equal(commanderStatBonus(p,'defense'),.1);
 assert.throws(()=>previewCommanderUpgrade(p,'defense',100000),/sınırı/);
 for(let i=0;i<40;i++)p=previewCommanderUpgrade(p,'attack',100000).profile;
 assert.equal(commanderStatBonus(p,'attack'),.2);
 assert.throws(()=>previewCommanderUpgrade(p,'attack',100000),/sınırı/);
});
test('only matching hero classes get bonuses, speed never changes',()=>{
 const p={commanderId:'magic',levels:{attack:2,defense:3,magic:20,support:8}};
 const team=['energy','tank','fighter','assassin','support'].map(role=>({role,power:1000,attack:1000,defense:1000,maxHp:1000,hp:1000,speed:100}));
 applyCommanderSupport(team,p);
 assert.deepEqual(team.map(h=>h.attack),[1100,1000,1010,1010,1000]);
 assert.deepEqual(team.map(h=>h.defense),[1000,1015,1000,1000,1000]);
 assert.deepEqual(team.map(h=>h.maxHp),[1000,1000,1000,1000,1080]);
 assert.deepEqual(team.map(h=>h.speed),[100,100,100,100,100]);
});
test('insufficient gold and invalid upgrade rejected',()=>{
 const p=createCommanderProfile('support');
 assert.throws(()=>previewCommanderUpgrade(p,'attack',199),/Yetersiz/);
 assert.throws(()=>previewCommanderUpgrade(p,'speed',500),/Geçersiz/);
});
