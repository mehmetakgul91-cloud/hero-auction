import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateHeroRawDamage} from '../battle-damage-formula.js';
const unit={attack:100,role:'fighter'},target={defense:0,hp:100,shield:20};
test('basic and critical damage preserve original integer flooring',()=>{
 assert.equal(calculateHeroRawDamage({unit,target}),70);
 assert.equal(calculateHeroRawDamage({unit,target,critical:true}),91);
});
test('guard and pierce retain existing mitigation',()=>{
 const armored={...target,defense:100};
 assert.equal(calculateHeroRawDamage({unit,target:armored,guarded:true}),29);
 assert.equal(calculateHeroRawDamage({unit,target:armored,skill:{effect:'pierce'}}),43);
});
test('special multipliers, weakening and headshot preserve legacy behavior',()=>{
 assert.equal(calculateHeroRawDamage({unit,target,special:true}),80);
 assert.equal(calculateHeroRawDamage({unit,target,weakened:.3}),49);
 assert.equal(calculateHeroRawDamage({unit,target,skill:{effect:'headshot'}}),120);
});
