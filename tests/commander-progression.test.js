import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMANDERS,createCommanderProfile,commanderLevelCap,previewCommanderUpgrade,commanderStatBonus,applyCommanderSupport} from '../arena-commanders.js';
test('four classes and 10 percent specialty versus 4 percent other caps',()=>{
 assert.deepEqual(COMMANDERS.map(c=>c.id),['attack','defense','magic','support']);
 for(const c of COMMANDERS)for(const stat of ['attack','defense','magic','support'])
  assert.equal(commanderLevelCap(c.id,stat),c.specialty===stat?10:4);
});
test('progression starts at zero and charges increasing gold',()=>{
 const initial=createCommanderProfile('attack');
 assert.deepEqual(initial.levels,{attack:0,defense:0,magic:0,support:0});
 const first=previewCommanderUpgrade(initial,'magic',500);
 assert.equal(first.cost,100);assert.equal(first.remainingGold,400);
 assert.equal(first.profile.levels.magic,1);assert.equal(initial.levels.magic,0);
});
test('non-specialty cannot exceed 4 and specialty can reach 10',()=>{
 let p=createCommanderProfile('attack');
 for(let i=0;i<4;i++)p=previewCommanderUpgrade(p,'defense',10000).profile;
 assert.equal(commanderStatBonus(p,'defense'),.04);
 assert.throws(()=>previewCommanderUpgrade(p,'defense',10000),/sınırı/);
 for(let i=0;i<10;i++)p=previewCommanderUpgrade(p,'attack',10000).profile;
 assert.equal(commanderStatBonus(p,'attack'),.1);
 assert.throws(()=>previewCommanderUpgrade(p,'attack',10000),/sınırı/);
});
test('only matching hero class receives buff',()=>{
 const p={commanderId:'magic',levels:{attack:2,defense:3,magic:10,support:4}};
 const team=['energy','tank','fighter','assassin','support'].map(role=>({role,attack:100,defense:100,maxHp:100,hp:100,speed:100}));
 applyCommanderSupport(team,p);
 assert.deepEqual(team.map(h=>h.attack),[110,100,102,102,100]);
 assert.deepEqual(team.map(h=>h.defense),[100,103,100,100,100]);
 assert.deepEqual(team.map(h=>h.maxHp),[100,100,100,100,104]);
 assert.deepEqual(team.map(h=>h.speed),[100,100,100,100,100]);
});
test('invalid stat and insufficient gold rejected',()=>{
 const p=createCommanderProfile('support');
 assert.throws(()=>previewCommanderUpgrade(p,'attack',99),/Yetersiz/);
 assert.throws(()=>previewCommanderUpgrade(p,'speed',500),/Geçersiz/);
});
