import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {commanderUltimateName,commanderUltimateDescription} from '../public/commander-ultimate-presentation.js';
import {commanderAbilityDescription,getCommanderAbilityCost} from '../public/commander-ability-rules.js';
import {translate} from '../public/crazygames-en.js';
for(const [id,cost]of Object.entries({attack:75,defense:85,magic:100,support:90}))test(`${id} ultimate name, cost and bilingual description stay aligned`,()=>{
 const profile={commanderId:id,levels:{[id]:0}},description=commanderAbilityDescription(profile);
 assert.equal(getCommanderAbilityCost(id,'ultimate'),cost);assert.match(description,new RegExp('Nihai \\('+cost+' ulti dolumu\\)'));
 assert.ok(description.includes(commanderUltimateName(id)));
 assert.equal(translate(commanderUltimateDescription(id)),commanderUltimateDescription(id,{english:true}));
 assert.doesNotMatch(translate(description),/[çğıöşüÇĞİÖŞÜ]/u);
});
test('mage description promises a fixed snapshot bonus, not compounding current damage',()=>{
 const text=commanderUltimateDescription('magic',{english:true});assert.match(text,/fixed extra hit power equal to its attack when cast/);assert.match(text,/3 action rounds/);assert.match(text,/not healing or shields/);assert.doesNotMatch(text,/×2|doubles/i);
});
test('revival and focus semantics are explicit and no static ultimate85 label remains',()=>{
 assert.match(commanderUltimateDescription('support',{english:true}),/40% max health.*once per battle.*Shield becomes 0.*no extra action/);
 assert.match(commanderUltimateDescription('attack',{english:true}),/lowest health ratio.*next attack/);
 const html=fs.readFileSync(new URL('../public/battle-preview.html',import.meta.url),'utf8');assert.doesNotMatch(html,/Nihai · 85/);
 const css=fs.readFileSync(new URL('../public/commander-arena-magic-targeting.css',import.meta.url),'utf8');assert.match(css,/content:attr\(data-commander-target-label\)/);
});

test('every ultimate is once per battle and mage transfer does not reset duration',()=>{
 for(const id of ['attack','defense','magic','support'])assert.match(commanderUltimateDescription(id,{english:true}),/once per battle/i);
 assert.match(commanderUltimateDescription('magic',{english:true}),/transfers.*highest current health; remaining duration is preserved.*new bearer/);
});
