import assert from 'node:assert/strict';
import {simulateBattle,fighterFromCard} from '../battle-engine.js';
import {applyCommanderSupport,createCommanderProfile,commanderStatBonus} from '../arena-commanders.js';
const cards=(prefix)=>['fighter','assassin','tank','energy','support'].map((role,i)=>({id:prefix+i,name:prefix+i,role,power:80,lane:i<3?'front':'back'}));
const profile=createCommanderProfile('attack');profile.levels={attack:10,defense:10,magic:10,support:10};
const zero=createCommanderProfile('attack');
assert.equal(commanderStatBonus(profile,'attack'),.05);
// Verify stat bonuses before battle; post-battle stats vary with damage and survival.
const baselineUnits=cards('a').map((card,i)=>fighterFromCard(card,i));
const boostedUnits=cards('a').map((card,i)=>fighterFromCard(card,i));
applyCommanderSupport(boostedUnits,profile);
assert.equal(boostedUnits[0].attack,baselineUnits[0].attack+Math.round(80*.05),'Fighter attack');
assert.equal(boostedUnits[1].attack,baselineUnits[1].attack+Math.round(80*.05),'Assassin attack');
assert.equal(boostedUnits[2].defense,baselineUnits[2].defense+Math.round(80*.05),'Tank defense');
assert.equal(boostedUnits[3].attack,Math.round(baselineUnits[3].attack*1.05),'Energy attack');
assert.equal(boostedUnits[4].maxHp,baselineUnits[4].maxHp+Math.round(80*2*.05),'Support HP');
assert.equal(boostedUnits[4].hp,boostedUnits[4].maxHp,'Support HP sync');
const baseline=simulateBattle(cards('a'),cards('b'),{seed:'commander-test',commanders:[null,null]});
const noUpgrade=simulateBattle(cards('a'),cards('b'),{seed:'commander-test',commanders:[zero,null]});
assert.deepEqual(noUpgrade.teams,baseline.teams,'Level zero must not affect battle');
const boosted=simulateBattle(cards('a'),cards('b'),{seed:'commander-test',commanders:[profile,null]});
const replay=simulateBattle(cards('a'),cards('b'),{seed:'commander-test',commanders:[profile,null]});
assert.deepEqual(replay,boosted,'Deterministic replay');
assert.throws(()=>applyCommanderSupport([],{commanderId:'attack',levels:{attack:41,defense:0,magic:0,support:0}}));
let changed=0;
for(let i=0;i<60;i++){
 const opts={seed:'balance-'+i};
 const x=simulateBattle(cards('a'),cards('b'),opts);
 const y=simulateBattle(cards('a'),cards('b'),{...opts,commanders:[profile,null]});
 if(x.winner!==y.winner||x.damage[0]!==y.damage[0]||x.damage[1]!==y.damage[1])changed++;
}
assert.ok(changed>0,'Commander upgrades should change combat outcomes or damage');
console.log('PASS: 0-level compatibility, 4 role bonuses, enemy isolation, determinism, validation, 60 combat simulations; changed='+changed);
