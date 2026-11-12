import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {commanderAbilityStats,commanderAbilityDescription,getCommanderAbilityCost} from '../public/commander-ability-rules.js';
import {translate} from '../public/crazygames-en.js';
for(const [level,rate] of [[0,.05],[10,.05],[20,.05],[40,.05]])test(`mage level ${level}: fixed 5% damage and next-action stun and translated scope`,()=>{
 const profile={commanderId:'magic',levels:{magic:level}},stats=commanderAbilityStats(profile),description=commanderAbilityDescription(profile),normal=description.split(' Normal beceri ')[0];
 assert.equal(stats.normalRate,rate);assert.match(normal,/%5/);assert.match(normal,/%25/);assert.match(normal,/şifa ve kalkan dahil sonraki eylemini/);assert.match(normal,/kendi tetiklediği pasifler de engellenir/);
 const en=translate(normal);assert.match(en,/5%/);assert.match(en,/25%/);assert.match(en,/skips its next action, including healing and shields/);assert.match(en,/Self-triggered passives are also blocked/);assert.match(en,/does not stack/);assert.doesNotMatch(en,/[çğıöşüÇĞİÖŞÜ]/u);
 assert.equal(getCommanderAbilityCost('magic','normal'),60);assert.equal(getCommanderAbilityCost('magic','ultimate'),100);
});
test('non-mage normal rates use fixed role formulas and mage ultimate scaling remains unchanged',()=>{
 for(const [id,normal,ultimate]of [['attack',.10,.3],['defense',.20,.2],['support',.05,.3],['magic',.05,.4]]){const stats=commanderAbilityStats({commanderId:id,levels:{[id]:0}});assert.equal(stats.normalRate,normal);assert.equal(stats.ultimateRate,ultimate);}
 const source=readFileSync(new URL('../public/commander-arena-effects.js',import.meta.url),'utf8');assert.match(source,/weaken:text\('SONRAKİ SALDIRI','NEXT ATTACK'\)/);
});
