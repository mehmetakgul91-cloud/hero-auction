import test from 'node:test';import assert from 'node:assert/strict';
import {commanderUltimateDescription} from '../public/commander-ultimate-presentation.js';
import {translate} from '../public/crazygames-en.js';
test('Last Bastion describes original recipient, first lethal hit, persistence and no transfer',()=>{
 const tr=commanderUltimateDescription('defense'),en=commanderUltimateDescription('defense',{english:true});
 assert.match(tr,/Kullanım anında can oranı en düşük yaşayan müttefik/);assert.match(tr,/ilk ölümcül darbeden 1 canla/);assert.match(tr,/tetiklenene veya savaş bitene kadar/);assert.match(tr,/başka kahramana geçmez/);assert.doesNotMatch(tr,/sonraki tur/);
 assert.match(en,/when cast/);assert.match(en,/first lethal hit at 1 health/);assert.match(en,/until triggered or the battle ends/);assert.match(en,/does not transfer/);assert.doesNotMatch(en,/through next round/);assert.match(en,/once per battle/i);assert.equal(translate(tr),en);
});
test('persistent defense wording leaves attack focus and mage duration unchanged',()=>{
 assert.match(commanderUltimateDescription('attack',{english:true}),/selected living enemy.*next round/);assert.match(commanderUltimateDescription('magic',{english:true}),/3 action rounds/);
});
