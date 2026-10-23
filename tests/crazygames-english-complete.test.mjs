import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translate} from '../public/crazygames-en.js';
import {battlePhrases,translateCommanderDescription} from '../public/crazygames-battle-phrases.js';
import {abilityImpact,abilityText} from '../public/hero-ability-text.js';
import {commanderAbilityDescription} from '../public/commander-ability-rules.js';
const roster=JSON.parse(readFileSync(new URL('../battle-roster.json',import.meta.url))).characters;
const numbers = text => (text.match(/\d+(?:[.,]\d+)?/g)||[]).map(n=>Number(n.replace(',','.')));

test('every battle, formation and ability phrase has its exact English output',()=>{
 for(const [tr,en] of Object.entries(battlePhrases)){
  assert.equal(translate(tr),en,tr);
  assert.equal(translate(en),en,`idempotent: ${en}`);
 }
});

test('every roster active and passive impact is English and preserves quantities',()=>{
 for(const hero of roster) for(const kind of ['active','passive']){
  const tr=abilityImpact(hero[kind]),en=translate(tr);
  assert.notEqual(en,tr,hero.id+' '+kind+' '+tr);
  assert.doesNotMatch(en,/[çğıöşüÇĞİÖŞÜ]/u,hero.id+' '+kind+' '+en);
  assert.deepEqual(numbers(en),numbers(tr),hero.id+' '+kind+' quantities');
  assert.equal(translate(en),en);
 }
});

test('every roster active and passive name/effect presentation is English',()=>{
 for(const hero of roster) for(const [kind,label] of [['active','Aktif'],['passive','Pasif']]){
  const tr=abilityText(hero[kind],label),en=translate(tr);
  assert.doesNotMatch(en,/[çğıöşüÇĞİÖŞÜ]/u,hero.id+' '+kind+' '+en);
  assert.doesNotMatch(en,/\b(?:Aktif|Pasif|kalkan|hasar|can|saldırı|savunma)\b/u);
  assert.deepEqual(numbers(en),numbers(tr));
  assert.equal(translate(en),en);
 }
});

test('all 164 commander descriptions translate their actual numeric templates',()=>{
 for(const commanderId of ['attack','defense','magic','support']) for(let level=0;level<=40;level++){
  const tr=commanderAbilityDescription({commanderId,levels:{[commanderId]:level}});
  const expected=translateCommanderDescription(tr),en=translate(tr);
  assert.notEqual(expected,tr);
  assert.equal(en,expected,commanderId+' '+level);
  assert.doesNotMatch(en,/[çğıöşüÇĞİÖŞÜ]/u);
  // Magic uses written-out target counts in English; percentages remain identical.
  assert.equal(translate(en),en);
 }
});
