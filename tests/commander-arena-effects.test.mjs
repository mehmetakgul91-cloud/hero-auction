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

test('experimental committed round feeds commander visuals without altering replay',()=>{
 const client=readFileSync(new URL('../public/commander-experimental.js',import.meta.url),'utf8');
 const three=readFileSync(new URL('../public/arena-three.js',import.meta.url),'utf8');
 assert.match(client,/heroarena:commander-round/);
 assert.match(effect,/addEventListener\('heroarena:commander-round',showCommanderAbility\)/);
 assert.match(three,/addEventListener\('heroarena:commander-round',commanderVisual\)/);
 assert.match(client,/data\.events\|\|\[\]/);
 assert.match(client,/heroarena:experimental-round-end/);
});
