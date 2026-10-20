import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSplashRawDamage,calculateSpecialHeal} from '../battle-special-formulas.js';
test('splash skill deals exactly 25 percent of raw primary damage',()=>{
 assert.equal(calculateSplashRawDamage(101,{skill:{effect:'splash'},special:true}),25);
 assert.equal(calculateSplashRawDamage(1,{skill:{effect:'splash'},special:true}),1);
});
test('energy specialist has 15 percent splash on special rounds only',()=>{
 assert.equal(calculateSplashRawDamage(101,{role:'energy',special:true}),15);
 assert.equal(calculateSplashRawDamage(101,{role:'energy',special:false}),0);
 assert.equal(calculateSplashRawDamage(101,{role:'fighter',special:true}),0);
});
test('special heal preserves legacy rounding and missing HP cap',()=>{
 assert.equal(calculateSpecialHeal({attack:101,missingHp:100}),53);
 assert.equal(calculateSpecialHeal({attack:101,missingHp:12}),12);
 assert.equal(calculateSpecialHeal({attack:1,missingHp:0}),0);
});
