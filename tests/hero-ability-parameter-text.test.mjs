import {combatEffectActors} from '../public/arena-combat-effects.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {abilityImpact,abilityText,translateAbilityDescription} from '../public/hero-ability-text.js';
import {translate} from '../public/crazygames-en.js';
import {describeBattleEvent} from '../public/battle-event-text.js';
const roster=JSON.parse(fs.readFileSync(new URL('../battle-roster.json',import.meta.url))).characters;
test('all roster descriptions render finite declared values, cadence and bilingual equivalents',()=>{
 for(const hero of roster)for(const kind of ['active','passive']){
  const ability=hero[kind],tr=abilityImpact(ability),en=abilityImpact(ability,{english:true});
  assert.doesNotMatch(tr,/undefined|NaN|\{\d+\}/);assert.doesNotMatch(en,/undefined|NaN|\{\d+\}/);
  assert.equal(translateAbilityDescription(tr),en,hero.name+' '+kind);
  assert.equal(translate(tr),en,hero.name+' '+kind+' DOM translation');
  if(kind==='active')assert.match(tr,/^Her 3 turda:/);
 }
});
test('custom rates display their actual fields rather than old hardcoded percentages',()=>{
 const cases=[['shield','shieldRate',.45,'45'],['heal','healRate',.64,'64'],['pierce','pierceRate',.35,'35'],['splash','splashRate',.3,'30'],['sunder','sunderRate',.18,'18'],['weaken','weakenRate',.14,'14'],['drain','drainRate',.18,'18'],['execute','executeThreshold',.12,'12']];
 for(const [effect,key,value,n]of cases)assert.match(abilityImpact({effect,[key]:value},{english:true}),new RegExp(n+'%'));
});
test('hybrid names ally heal and shield; burst describes delay not stun',()=>{
 const hybrid=abilityImpact({effect:'shield',supportHybrid:true,healRate:.52,allyShieldRate:.28},{english:true});
 assert.match(hybrid,/lowest health ratio/);assert.match(hybrid,/52%/);assert.match(hybrid,/28%/);assert.match(hybrid,/does not attack/);
 const burst=abilityText({name:'sersemletme',effect:'burst',power:1.12,delay:true},'Aktif');
 assert.doesNotMatch(burst,/Sersemletme|sersemletir/);assert.match(translate(burst),/without skipping its action/);
});
test('passives explain conditional permanence and speed is not dodge',()=>{
 assert.match(abilityImpact({effect:'rage',value:.12},{english:true}),/Once at round start below 50% health.*persists after healing/);
 assert.match(abilityImpact({effect:'evasion',value:.08},{english:true}),/initiative only, not evasion/);
});
test('delay event labels actual due round and never claims skipped turn',()=>{
 const e={action:'delay',round:3,dueRound:4,actor:'a',target:'b',value:0};
 assert.match(describeBattleEvent(e,{english:true}),/round 4 acts at the end; does not lose its turn/);
 assert.doesNotMatch(describeBattleEvent(e,{english:true}),/stun|damage/);
});
test('preparation preview number is explicitly approximate and has estimated-power accessibility label',()=>{
 const source=fs.readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(source,/⚡ GÜÇ ≈/);assert.match(source,/aria-label','Tahmini güç /);
 assert.match(translate('Tahmini güç 94.50'),/Estimated power 94.50/);
});
test('delay animation is a status cue, never another attack, projectile or impact',()=>{
 const source=fs.readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('function animateMove(e){'),source.indexOf("window.addEventListener('heroarena:experimental-move'"));
 const target={dataset:{heroId:'b'},animate(){throw Error('Delay must not animate a hit')}};
 const doc={documentElement:{lang:'en'},querySelectorAll(){return [target]}};
 const cues=[];
 const animate=Function('motion','document','floatingArenaEffect','comicBattleCue','combatEffectActors','return ('+body.trim()+')')(()=>true,doc,(...args)=>cues.push(args),()=>{throw Error('No attack comic cue')},combatEffectActors);
 animate({action:'delay',actorId:'a',targetId:'b',dueRound:4,value:0});
 assert.equal(cues.length,1);assert.equal(cues[0][0],target);assert.equal(cues[0][2],'ACTS LAST');
});
