import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommanderSupport} from '../arena-commanders.js';
import {calculateHeroRawDamage} from '../battle-damage-formula.js';
import {calculateSplashRawDamage,calculateSpecialHeal,resolveSpecialHealing,heroHealingRate} from '../battle-special-formulas.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {applyServerSpecialHeal} from '../commander-live-special-heal.js';
const profile=id=>({commanderId:id,levels:{attack:30,defense:30,magic:30,support:30}});
const unit=(role,extra={})=>({id:role,name:role,role,power:90,attack:50,defense:50,maxHp:200,hp:100,speed:50,shield:0,position:0,lane:'front',active:null,passive:null,...extra});
for(const [id,role,field] of [['attack','fighter','attack'],['attack','assassin','attack'],['defense','tank','defense'],['magic','energy','attack']])test(`${id}/${role}: 50 × 1.15 = 57.5, independent of card power`,()=>{
 const hero=unit(role),before={...hero};applyCommanderSupport([hero],profile(id));
 assert.equal(hero[field],57.5);assert.deepEqual(hero,{...before,[field]:57.5});
 const enemy=unit('enemy');
 const combat=createLiveCommanderCombat({teams:[[hero],[enemy]],commanders:[profile(id),profile('attack')],abilities:createLiveCommanderAbilities({matchKey:'fractions'})});
 assert.doesNotThrow(()=>stepParityBasicAttack(combat,{side:0,actorId:role}));
});
test('magic fraction affects normal, special and splash damage once with final damage rounding',()=>{
 const hero=unit('energy'),target=unit('tank');applyCommanderSupport([hero],profile('magic'));
 for(const special of [false,true]){
  const skill=special?{effect:'splash',power:1.2,splashRate:.3}:null;
  const raw=calculateHeroRawDamage({unit:hero,target,skill,special});
  assert.equal(raw,Math.floor(57.5*(special?1.2:1)*.97*.7*100/150));
  assert.equal(calculateSplashRawDamage(raw,{skill,role:'energy',special}),special?Math.max(1,Math.floor(raw*.3)):0);
 }
});
for(const hybrid of [false,true])test(`support ${hybrid?'hybrid':'heal'}: 40% + 15 points = 55%, attack/HP/shield unchanged`,()=>{
 const actor=unit('support',{active:{effect:hybrid?'shield':'heal',healRate:.4,...(hybrid?{supportHybrid:true,allyShieldRate:.2}:{})}}),before=structuredClone(actor);
 applyCommanderSupport([actor],profile('support'));
 assert.deepEqual(actor,{...before,commanderHealingBonus:.15});assert.equal(heroHealingRate(actor),.55);
 const resolved=resolveSpecialHealing(actor,[actor]);assert.equal(resolved.heal,28);assert.equal(resolved.shield,hybrid?10:0);
 const combat=createLiveCommanderCombat({round:3,teams:[[actor],[unit('tank')]],commanders:[profile('support'),profile('attack')],abilities:createLiveCommanderAbilities({matchKey:'healing'})});
 const result=applyServerSpecialHeal(combat,{side:0,actorId:'support'});
 assert.equal(result.teams[0][0].hp,128);assert.equal(result.teams[0][0].attack,50);assert.equal(result.teams[0][0].maxHp,200);
 assert.equal(result.teams[0][0].shield,hybrid?10:0);
 actor.hp=199;assert.equal(resolveSpecialHealing(actor,[actor]).heal,1,'cannot overheal');
 actor.hp=0;assert.equal(resolveSpecialHealing(actor,[actor]),null,'dead healer cannot act');
});
test('healing bonus is added after trusted roster rate validation, not capped at the old base-rate ceiling',()=>{
 assert.equal(calculateSpecialHeal({attack:100,missingHp:1000,skill:{healRate:.75},healingBonus:.2}),95);
 for(const healingBonus of [-1,.21,NaN,Infinity])assert.throws(()=>calculateSpecialHeal({attack:100,missingHp:100,healingBonus}));
 assert.throws(()=>calculateSpecialHeal({attack:100,missingHp:100,skill:{healRate:.9},healingBonus:.2}),'base roster remains validated');
});
