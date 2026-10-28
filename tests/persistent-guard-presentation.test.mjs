import test from 'node:test';import assert from 'node:assert/strict';
import {commanderUltimateDescription} from '../public/commander-ultimate-presentation.js';
import {translate} from '../public/crazygames-en.js';
test('Last Bastion describes original recipient, first lethal hit, persistence and no transfer',()=>{
 const tr=commanderUltimateDescription('defense'),en=commanderUltimateDescription('defense',{english:true});
 assert.match(tr,/Seçilen yaşayan müttefik/);assert.match(tr,/ilk ölümcül darbeden 1 canla/);assert.match(tr,/sonraki 2 tam tur/);assert.match(tr,/başka kahramana geçmez/);assert.match(tr,/kullanımda değil ölümcül darbede/);
 assert.match(en,/selected living ally/);assert.match(en,/first lethal hit at 1 health/);assert.match(en,/rest of that round and the next 2 full rounds/);assert.match(en,/not on cast/);assert.match(en,/does not transfer/);assert.match(en,/once per battle/i);assert.equal(translate(tr),en);
});
test('persistent defense, until-death attack focus and three-round mage duration stay distinct',()=>{
 assert.match(commanderUltimateDescription('attack',{english:true}),/selected living enemy.*Until the target dies/);assert.match(commanderUltimateDescription('magic',{english:true}),/3 action rounds/);
});
