import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMANDERS,createCommanderProfile,previewCommanderUpgrade,commanderStatBonus,applyCommanderSupport} from '../arena-commanders.js';
test('four commander specialties and independent upgrade paths',()=>{
 assert.deepEqual(COMMANDERS.map(c=>c.id),['attack','defense','magic','support']);
 const profile=createCommanderProfile('defense');
 assert.deepEqual(profile.levels,{attack:0,defense:0,magic:0,support:0});
 assert.equal(commanderStatBonus(profile,'defense'),.05);
});
test('gold upgrade cost increases without changing input',()=>{
 const initial=createCommanderProfile('attack');
 const first=previewCommanderUpgrade(initial,'magic',500);
 assert.equal(first.cost,100);assert.equal(first.remainingGold,400);
 assert.equal(first.profile.levels.magic,1);assert.equal(initial.levels.magic,0);
 const second=previewCommanderUpgrade(first.profile,'magic',400);
 assert.equal(second.cost,200);assert.equal(second.remainingGold,200);
});
test('insufficient gold and invalid stats rejected',()=>{
 const p=createCommanderProfile('support');
 assert.throws(()=>previewCommanderUpgrade(p,'attack',99),/Yetersiz/);
 assert.throws(()=>previewCommanderUpgrade(p,'speed',500),/Geçersiz/);
});
test('magic buffs only energy heroes, support buffs team hp',()=>{
 const team=[{role:'energy',attack:100,defense:100,maxHp:100,hp:100},{role:'tank',attack:100,defense:100,maxHp:100,hp:100}];
 applyCommanderSupport(team,'magic');
 assert.equal(team[0].attack,105);assert.equal(team[1].attack,100);
 applyCommanderSupport(team,'support');
 assert.equal(team[0].maxHp,105);assert.equal(team[1].maxHp,105);
});
