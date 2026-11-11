import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMANDERS,createCommanderProfile,commanderLevelCap,commanderUpgradeCost,previewCommanderUpgrade,commanderStatBonus,applyCommanderSupport} from '../arena-commanders.js';
test('four commander types with 40 specialty and 20 other levels',()=>{
 assert.deepEqual(COMMANDERS.map(c=>c.id),['attack','defense','magic','support']);
 for(const c of COMMANDERS)for(const stat of ['attack','defense','magic','support'])
  assert.equal(commanderLevelCap(c.id,stat),c.specialty===stat?40:20);
});
test('each upgrade adds 0.5 percent and approved gold cost grows by 1.2 from 200',()=>{
 let p=createCommanderProfile('attack');
 assert.deepEqual(p.levels,{attack:0,defense:0,magic:0,support:0});
 assert.equal(commanderUpgradeCost(0),200);
 assert.equal(commanderUpgradeCost(1),240);
 assert.equal(commanderUpgradeCost(19),6390);
 assert.equal(commanderUpgradeCost(39),244962);
 const first=previewCommanderUpgrade(p,'magic',1000);
 assert.equal(first.cost,200);assert.equal(first.remainingGold,800);
 assert.equal(commanderStatBonus(first.profile,'magic'),0);
 assert.equal(p.levels.magic,0);
});
test('non-specialty upgrades are retained but inactive; specialty max 20 percent',()=>{
 let p=createCommanderProfile('attack');
 for(let i=0;i<20;i++)p=previewCommanderUpgrade(p,'defense',100000).profile;
 assert.equal(commanderStatBonus(p,'defense'),0);
 assert.throws(()=>previewCommanderUpgrade(p,'defense',100000),/sınırı/);
 for(let i=0;i<40;i++)p=previewCommanderUpgrade(p,'attack',1000000).profile;
 assert.equal(commanderStatBonus(p,'attack'),.2);
 assert.throws(()=>previewCommanderUpgrade(p,'attack',1000000),/sınırı/);
});
test('only matching hero classes get bonuses, speed never changes',()=>{
 const p={commanderId:'magic',levels:{attack:2,defense:3,magic:20,support:8}};
 const team=['energy','tank','fighter','assassin','support'].map(role=>({role,power:1000,attack:1000,defense:1000,maxHp:1000,hp:1000,speed:100}));
 applyCommanderSupport(team,p);
 assert.deepEqual(team.map(h=>h.attack),[1100,1000,1000,1000,1000]);
 assert.deepEqual(team.map(h=>h.defense),[1000,1000,1000,1000,1000]);
 assert.deepEqual(team.map(h=>h.maxHp),[1000,1000,1000,1000,1000]);
 assert.deepEqual(team.map(h=>h.speed),[100,100,100,100,100]);
});
test('insufficient gold and invalid upgrade rejected',()=>{
 const p=createCommanderProfile('support');
 assert.throws(()=>previewCommanderUpgrade(p,'attack',199),/Yetersiz/);
 assert.throws(()=>previewCommanderUpgrade(p,'speed',500),/Geçersiz/);
});

for(const commanderId of ['attack','defense','magic','support'])for(const level of [0,1,10,20,40])test(`${commanderId} ${level}: only selected role changes, all other levels retained`,()=>{
 const roles=['fighter','assassin','tank','energy','support'];
 const units=roles.map(role=>({role,power:100,attack:100,defense:100,maxHp:200,hp:200,speed:100}));
 const profile={commanderId,levels:{attack:40,defense:40,magic:40,support:40}};profile.levels[commanderId]=level;
 const before=structuredClone(profile),original=structuredClone(units),rate=level*.005;
 applyCommanderSupport(units,profile);
 for(let i=0;i<units.length;i++){
  const expected={...original[i]},role=roles[i];
  if(commanderId==='attack'&&['fighter','assassin'].includes(role))expected.attack=Number((100*(1+rate)).toFixed(6));
  if(commanderId==='defense'&&role==='tank')expected.defense=Number((100*(1+rate)).toFixed(6));
  if(commanderId==='magic'&&role==='energy')expected.attack=Number((100*(1+rate)).toFixed(6));
  if(commanderId==='support'&&role==='support'&&rate)expected.commanderHealingBonus=rate;
  assert.deepEqual(units[i],expected);
 }
 assert.deepEqual(profile,before);
 // An unrelated stored level must not leak into any combat stat.
 const selectedOnly={commanderId,levels:{attack:0,defense:0,magic:0,support:0}};selectedOnly.levels[commanderId]=level;
 const isolated=structuredClone(original);applyCommanderSupport(isolated,selectedOnly);assert.deepEqual(isolated,units);
});
