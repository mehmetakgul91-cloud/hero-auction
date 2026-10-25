import test from 'node:test';
import assert from 'node:assert/strict';
import {describeBattleEvent as text} from '../public/battle-event-text.js';
test('damage, shields and finishers use actual server values without mutation',()=>{
 const e=Object.freeze({actor:'a',target:'b',action:'attack',damageType:'special',value:12,absorbed:8,executedDamage:5,critical:true});
 assert.equal(text(e,{english:true,names:new Map([['a','Hero A'],['b','Hero B']])}),'Hero A → Hero B · Critical hit · 12 damage · 8 blocked by shield · Finisher +5');
});
test('healing, shield and debuffs never masquerade as damage',()=>{
 for(const action of ['heal','passive-heal','shield','armor-break','weaken','haste','rage','commander-support-ultimate','commander-defense-normal','commander-magic-normal'])assert.doesNotMatch(text({actor:'a',action,value:10},{english:true}),/damage/);
 assert.match(text({actor:'commander:0',action:'commander-support-normal',value:16},{english:true}),/Commander · Normal ability · \+16 health restored/);
 assert.match(text({actor:'a',action:'armor-break',value:0},{english:true}),/Defense reduced/);
});
test('default remains Turkish and unknown actions never leak internal identifiers',()=>{
 assert.match(text({actor:'a',action:'shield',value:9}),/kalkan/);
 assert.doesNotMatch(text({actor:'a',action:'new-internal-event',value:9},{english:true}),/new-internal-event/);
});
test('ultimate guard and revival labels explain committed effects, not invented damage',()=>{
 assert.match(text({actor:'a',target:'b',action:'attack',damageType:'special',value:9,guardTriggered:true},{english:true}),/9 damage.*Survived a lethal hit at 1 health/);
 assert.match(text({actor:'commander:0',target:'a',action:'commander-revive',value:30},{english:true}),/Revival · 30 health/);
 assert.doesNotMatch(text({actor:'commander:0',action:'commander-attack-ultimate',value:5},{english:true}),/5.*damage/);
});

test('arcane transfer is described as status with unchanged duration, not an extra attack',()=>{
 const description=text({side:0,actor:'a',target:'b',action:'attack',value:100,arcaneTransfer:{targetId:'c',bonusAttack:80}},{english:true});
 assert.match(description,/Arcane Surge transfer → c · \+80 hit power; duration is not reset/);
});
