import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {commanderAbilityStats,commanderAbilityDescription,getCommanderAbilityCost} from '../public/commander-ability-rules.js';
import {translate} from '../public/crazygames-en.js';
for(const [level,rate,percentage] of [[0,.35,'35'],[10,.385,'38,5'],[20,.42,'42']])test(`mage level ${level}: next-attack rate and translated scope`,()=>{
 const profile={commanderId:'magic',levels:{magic:level}},stats=commanderAbilityStats(profile),description=commanderAbilityDescription(profile),normal=description.split(' Normal beceri ')[0];
 assert.equal(stats.normalRate,rate);assert.match(normal,new RegExp('%'+percentage));assert.match(normal,/yapacağı ilk saldırının gücü/);assert.match(normal,/saldırana kadar bekler/);assert.match(normal,/aynı saldırının tüm alan vuruşlarına/);assert.match(normal,/Şifa ve kalkan etkilenmez/);assert.doesNotMatch(normal,/tur/);
 const en=translate(normal);assert.match(en,/next actual attack/);assert.match(en,/every area hit of that attack/);assert.match(en,/Healing and shields are unaffected/);assert.doesNotMatch(en,/[çğıöşüÇĞİÖŞÜ]/u);assert.doesNotMatch(en,/round/);
 assert.equal(getCommanderAbilityCost('magic','normal'),40);assert.equal(getCommanderAbilityCost('magic','ultimate'),100);
});
test('other normal rates and mage ultimate scaling remain unchanged',()=>{
 for(const [id,normal,ultimate]of [['attack',.12,.3],['defense',.08,.2],['support',.12,.3],['magic',.35,.4]]){const stats=commanderAbilityStats({commanderId:id,levels:{[id]:0}});assert.equal(stats.normalRate,normal);assert.equal(stats.ultimateRate,ultimate);}
 const source=readFileSync(new URL('../public/commander-arena-effects.js',import.meta.url),'utf8');assert.match(source,/weaken:text\('SONRAKİ SALDIRI','NEXT ATTACK'\)/);
});
