import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const effect=readFileSync(new URL('../public/commander-arena-effects.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/battle-preview.html',import.meta.url),'utf8');
test('commander visual effects listen to existing arena move events',()=>{
 assert.match(effect,/heroarena:move/);
 assert.match(html,/commander-arena-effects\.js/);
});
test('each commander type has a distinct hero effect class',()=>{
 for(const kind of ['attack','defense','support','magic']){
  assert.match(html,new RegExp('commander-hero-'+kind));
 }
});
test('commander effect layer does not mutate combat health or winner',()=>{
 assert.doesNotMatch(effect,/\.hp\s*=|\.winner\s*=|\.energy\s*=/);
});

test('commander overlays skip background catch-up frames',()=>{
 assert.match(effect,/document\.hidden\|\|document\.body\.classList\.contains\('arena-catching-up'\)/);
});
test('repeated commander cues clear previous hero highlights',()=>{
 assert.match(effect,/function clearHeroEffects\(/);
 assert.match(effect,/clearHeroEffects\(\)/);
});
