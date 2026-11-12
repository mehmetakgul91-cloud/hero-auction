import test from 'node:test';
import assert from 'node:assert/strict';
import {captureMagicNormalPower,commanderMagicNormalBudget} from '../commander-magic-normal-power.js';

const profile=(level=15)=>({commanderId:'magic',levels:{attack:40,defense:40,magic:level,support:40}});
const energy=(id,attack)=>({id,role:'energy',attack});

test('level 15 and 200 magic power produce 25 main damage and 6 for each area target',()=>{
 const power=captureMagicNormalPower([energy('one',120),energy('two',80)]);
 assert.equal(power,200);
 const budget=commanderMagicNormalBudget(power,profile());
 assert.deepEqual(budget,{mainDamage:25,areaDamage:6});
 assert.ok(Object.isFrozen(budget));
});

test('only the selected mage level contributes, at levels 0, 15 and 40',()=>{
 for(const [level,mainDamage,areaDamage] of [[0,10,3],[15,25,6],[40,50,13]]){
  assert.deepEqual(commanderMagicNormalBudget(200,profile(level)),{mainDamage,areaDamage});
  const changed=profile(level);
  changed.levels.attack=0;changed.levels.defense=0;changed.levels.support=0;
  assert.deepEqual(commanderMagicNormalBudget(200,changed),{mainDamage,areaDamage});
 }
});

test('magic power includes only energy-role attack, not other roles or other stats',()=>{
 const team=[
  energy('one',120),energy('two',80),
  {role:'fighter',attack:1000},{role:'assassin',attack:2000},
  {role:'tank',attack:3000,defense:4000},
  {role:'support',attack:5000,active:{healRate:.52}},
  {role:'energy',defense:6000,magic:7000,power:8000},
  {role:'other',attack:NaN}
 ];
 assert.equal(captureMagicNormalPower(team),200);
});

test('missing energy attack and absent energy heroes contribute zero without a minimum',()=>{
 for(const team of [[],[{role:'energy'}],[{role:'fighter',attack:1000}]]){
  assert.equal(captureMagicNormalPower(team),0);
  for(const level of [0,15,40]){
   assert.deepEqual(commanderMagicNormalBudget(captureMagicNormalPower(team),profile(level)),{
    mainDamage:level,areaDamage:Math.round(level*.25)
   });
  }
 }
});

test('fractional attack is retained until the complete main damage is rounded',()=>{
 const power=captureMagicNormalPower([energy('one',6.2),energy('two',6.2)]);
 assert.equal(power,12.4);
 assert.deepEqual(commanderMagicNormalBudget(power,profile()),{mainDamage:16,areaDamage:4});
 const beforeBoundary=captureMagicNormalPower([energy('one',4.9),energy('two',4.9)]);
 assert.equal(beforeBoundary,9.8);
 assert.deepEqual(commanderMagicNormalBudget(beforeBoundary,profile(0)),{mainDamage:0,areaDamage:0});
});

test('area damage uses rounded main damage: raw 13.5 becomes main 14 and area 4',()=>{
 const budget=commanderMagicNormalBudget(270,profile(0));
 assert.deepEqual(budget,{mainDamage:14,areaDamage:4});
 assert.equal(Math.round((270*.05)*.25),3,'rounding the unrounded main would instead produce 3');
});

test('captured power and frozen budgets survive mutation of their source inputs',()=>{
 const team=[energy('one',120),energy('two',80)],selected=profile();
 const power=captureMagicNormalPower(team),budget=commanderMagicNormalBudget(power,selected);
 team[0].attack=999999;team[0].hp=0;team[1].attack=0;team[1].role='fighter';
 team.push(energy('three',999999));
 selected.levels.magic=40;
 assert.equal(power,200);
 assert.deepEqual(budget,{mainDamage:25,areaDamage:6});
 assert.throws(()=>{budget.mainDamage=999999;},TypeError);
 assert.deepEqual(commanderMagicNormalBudget(power,profile()),budget,'repeat calculation uses the same snapshot');
});

test('capture rejects malformed teams, heroes, provided energy attack and overflow',()=>{
 for(const team of [null,undefined,{},'energy',1])assert.throws(()=>captureMagicNormalPower(team),/Invalid commander magic team/);
 for(const hero of [null,undefined,0,'energy',[],true])assert.throws(()=>captureMagicNormalPower([hero]),/Invalid commander magic hero/);
 for(const attack of [null,-1,NaN,Infinity,-Infinity,'100',true,{},[],1n]){
  assert.throws(()=>captureMagicNormalPower([energy('bad',attack)]),/Invalid commander magic attack/);
 }
 assert.throws(()=>captureMagicNormalPower([energy('one',Number.MAX_VALUE),energy('two',Number.MAX_VALUE)]),/Invalid commander magic power/);
});

test('budget requires authoritative numeric power and a valid selected mage profile',()=>{
 for(const power of [null,undefined,-1,NaN,Infinity,-Infinity,'200',true,{},[],{magic:200},1n]){
  assert.throws(()=>commanderMagicNormalBudget(power,profile()),/Invalid commander magic power/);
 }
 assert.throws(()=>commanderMagicNormalBudget(Number.MAX_VALUE,profile()),/Invalid commander magic budget/);
 for(const level of [-1,41,.5,NaN,Infinity,'15',null,undefined]){
  const invalid=profile();invalid.levels.magic=level;
  assert.throws(()=>commanderMagicNormalBudget(200,invalid),/Geçersiz komutan seviyesi/);
 }
 for(const invalid of [null,undefined,{},'magic',{commanderId:'magic'}, {...profile(),levels:{magic:15}}]){
  assert.throws(()=>commanderMagicNormalBudget(200,invalid));
 }
 for(const commanderId of ['attack','defense','support']){
  assert.throws(()=>commanderMagicNormalBudget(200,{...profile(),commanderId}),/Invalid commander magic profile/);
 }
 const invalidOtherLevel=profile();invalidOtherLevel.levels.attack=41;
 assert.throws(()=>commanderMagicNormalBudget(200,invalidOtherLevel),/Geçersiz komutan seviyesi/);
});
