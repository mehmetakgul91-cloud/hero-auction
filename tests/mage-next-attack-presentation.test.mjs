import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {commanderAbilityStats,commanderAbilityDescription,getCommanderAbilityCost} from '../public/commander-ability-rules.js';
import {translate} from '../public/crazygames-en.js';
for(const [level,rate] of [[0,.35],[10,.385],[20,.42],[40,.49]])test(`mage level ${level}: fixed next-attack stun and translated scope`,()=>{
 const profile={commanderId:'magic',levels:{magic:level}},stats=commanderAbilityStats(profile),description=commanderAbilityDescription(profile),normal=description.split(' Normal beceri ')[0];
 // Legacy numeric rate remains available for old saved snapshots, not new casts.
 assert.equal(stats.normalRate,rate);assert.match(normal,/sersemletir/);assert.match(normal,/bir sonraki saldırısı/);assert.match(normal,/tur değişiminde bitmez/);assert.match(normal,/Şifa ve kalkan eylemleri etkilenmez/);assert.match(normal,/her seviyede 1 saldırı/);assert.doesNotMatch(normal,/%|azalır/);
 const en=translate(normal);assert.match(en,/stuns the selected living enemy/);assert.match(en,/skips its next attack and all area hits/);assert.match(en,/Healing and shield actions are unaffected/);assert.match(en,/persists across rounds/);assert.match(en,/Does not stack/);assert.doesNotMatch(en,/[çğıöşüÇĞİÖŞÜ]/u);
 assert.equal(getCommanderAbilityCost('magic','normal'),40);assert.equal(getCommanderAbilityCost('magic','ultimate'),100);
});
test('other normal rates and mage ultimate scaling remain unchanged',()=>{
 for(const [id,normal,ultimate]of [['attack',.12,.3],['defense',.08,.2],['support',.12,.3],['magic',.35,.4]]){const stats=commanderAbilityStats({commanderId:id,levels:{[id]:0}});assert.equal(stats.normalRate,normal);assert.equal(stats.ultimateRate,ultimate);}
 const source=readFileSync(new URL('../public/commander-arena-effects.js',import.meta.url),'utf8');assert.match(source,/weaken:text\('SONRAKİ SALDIRI','NEXT ATTACK'\)/);
});
