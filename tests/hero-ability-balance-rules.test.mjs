import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {abilityValue,validateHeroAbility} from '../public/hero-ability-rules.js';
import {calculateHeroRawDamage} from '../battle-damage-formula.js';
import {calculateSpecialHeal,calculateSplashRawDamage,resolveSpecialHealing} from '../battle-special-formulas.js';
import {applyServerSpecialHeal} from '../commander-live-special-heal.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
const roster=JSON.parse(fs.readFileSync(new URL('../battle-roster.json',import.meta.url))).characters;
const hero=name=>roster.find(h=>h.name===name);
const unit=(id,hp=100,extra={})=>({id,hp,maxHp:100,attack:100,defense:100,speed:50,shield:0,role:'fighter',lane:'front',position:0,...extra});
const combat=teams=>createLiveCommanderCombat({round:3,abilities:createLiveCommanderAbilities({matchKey:'balance:heal',energy:[0,0]}),teams,commanders:[{commanderId:'support'},{commanderId:'attack'}]});
test('all 50 trusted kits validate and both authoritative catalogues agree',()=>{
 assert.equal(roster.length,50);roster.forEach(validateHeroAbility);
 assert.deepEqual(roster,JSON.parse(fs.readFileSync(new URL('../commander-original-roster.json',import.meta.url))).characters);
});
test('rarity-specific protection and healing budgets are explicit',()=>{
 assert.equal(hero('Demir Sur').active.shieldRate,.4);assert.equal(hero('Brunn').active.shieldRate,.42);assert.equal(hero('Obsidyen Muhafız').active.shieldRate,.45);
 assert.equal(hero('Altın Muhafız').active.frontShieldRate,.20);
 assert.deepEqual(['Fener Şifacısı','Şafak Azizesi','Ruh Dokuyucu'].map(n=>hero(n).active.healRate),[.52,.58,.64]);
 assert.deepEqual(['Kum Hançeri','Kuzgun Hançer','Mor Hilal'].map(n=>hero(n).active.pierceRate),[.35,.40,.45]);
});
test('burst trades extra damage for delay and unique utility stays bounded',()=>{
 assert.deepEqual(['Alev Zırhı','Kael'].map(n=>[hero(n).active.power,hero(n).active.delay]),[[1.10,true],[1.12,true]]);
 assert.equal(hero('Gece Orağı').active.executeThreshold,.12);assert.equal(hero('Kül Bıçağı').active.hasteAmount,8);
 assert.equal(hero('Morvan').active.splashRate,.27);assert.equal(hero('Morvan').passive.value,.03);
 assert.equal(hero('Kan Büyücüsü').active.power,1.20);
});
for(const mutation of [h=>h.active.unknown=5,h=>h.active.shieldRate=Infinity,h=>h.active.shieldRate=null,h=>h.active.shieldRate='0.4',h=>h.active.shieldRate=.9,h=>h.active.delay=true,h=>h.passive.value=.9,h=>h.active.supportHybrid=true,h=>h.active.allyShieldRate=.2])test('strict validation rejects '+mutation.toString(),()=>{
 const h=structuredClone(hero('Demir Sur'));mutation(h);assert.throws(()=>validateHeroAbility(h));
});
test('legacy fixtures retain defaults; parametric damage/heal/splash change actual formulas',()=>{
 assert.equal(abilityValue(null,'healRate'),.52);
 assert.equal(calculateSpecialHeal({attack:100,missingHp:100}),52);
 assert.equal(calculateSpecialHeal({attack:100,missingHp:100,skill:{healRate:.64}}),64);
 assert.equal(calculateSpecialHeal({attack:100,missingHp:1,skill:{healRate:.64}}),1);
 assert.equal(calculateSplashRawDamage(100,{skill:{effect:'splash',splashRate:.3}}),30);
 assert.equal(calculateSplashRawDamage(100,{skill:{effect:'weaken'},role:'energy',special:true}),15);
 const actor=unit('a'),target=unit('b');
 assert.ok(calculateHeroRawDamage({unit:actor,target,skill:{effect:'pierce',power:1.12,pierceRate:.45},special:true})>calculateHeroRawDamage({unit:actor,target,skill:{effect:'pierce',power:1.12,pierceRate:.35},special:true}));
});
for(const name of ['Seraphine','Sancak Bekçisi'])for(const full of [false,true])test(name+' preserves ally healing + bounded ally shield, full='+full,()=>{
 const kit=hero(name),actor=unit('actor',100,{role:'support',active:kit.active});
 const target=unit('target',full?100:20),dead=unit('dead',0);const allies=[target,actor,dead];
 const selected=resolveSpecialHealing(actor,allies);assert.equal(selected.target,target);
 const expectedHeal=full?0:Math.round(100*kit.active.healRate),expectedShield=Math.round(100*kit.active.allyShieldRate);
 assert.equal(selected.heal,expectedHeal);assert.equal(selected.shield,expectedShield);
 assert.equal(target.hp,full?100:20,'selection must not mutate');
 const c=combat([allies,[unit('enemy')]]),r=applyServerSpecialHeal(c,{side:0,actorId:'actor'});
 assert.equal(c.teams[0][0].hp,(full?100:20)+expectedHeal);assert.equal(c.teams[0][0].shield,expectedShield);
 assert.equal(c.teams[0][1].healing,expectedHeal);assert.equal(c.teams[0][2].shield,0);assert.equal(c.teams[1][0].hp,100,'hybrid never attacks');
 assert.deepEqual(r.events.map(e=>e.action),full?['shield']:['heal','shield']);assert.ok(r.events.every(e=>e.version===1));
});
test('hybrid target remains same through overheal cap and shield cannot target fallen ally',()=>{
 const actor=unit('actor',100,{role:'support',active:hero('Seraphine').active}),target=unit('target',99),dead=unit('dead',0);
 const r=resolveSpecialHealing(actor,[dead,target,actor]);assert.equal(r.target,target);assert.equal(r.heal,1);assert.equal(r.shield,28);
});
test('full-health ordinary healer has no healing action; caller retains special fallback',()=>{
 const actor=unit('healer',100,{role:'support',active:hero('Ruh Dokuyucu').active});assert.equal(resolveSpecialHealing(actor,[actor]),null);
});
