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

test('commander ability banner and squad highlights last two seconds',()=>{
 assert.match(effect,/activeEffects\.delete\(item\)\},2000\)/);
 assert.match(effect,/banner\.remove\(\);cleanupTimer=null\},2000\)/);
});

test('commander matchup uses portraits and centered mobile ability area',()=>{
 const client=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(client,/arena-commander-portrait/);
 assert.match(html,/\.commander-ability-flash\{[^}]*left:50%;top:50%/);
 assert.match(html,/translate\(-50%,-50%\) scale\(1\)/);
});

test('live commander profile and ability buttons share a safe-area bottom dock',()=>{
 const client=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/battle-preview.css',import.meta.url),'utf8');
 assert.match(client,/function mountCommanderDock\(/);
 assert.match(client,/dock\.append\(matchup,controls\)/);
 assert.match(css,/\.arena-commander-dock\{position:fixed/);
 assert.match(css,/bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 8px\)/);
 assert.match(css,/\[data-command\]\{min-height:48px!important/);
});

test('commander controls initialize after the single page arena route changes',()=>{
 const client=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 const controls=readFileSync(new URL('../public/commander-experimental.js',import.meta.url),'utf8');
 const cooldown=readFileSync(new URL('../public/commander-live-cooldown.js',import.meta.url),'utf8');
 assert.match(client,/history\.replaceState\(null,'',url\)[\s\S]{0,160}heroarena:route-change/);
 assert.match(controls,/window\.addEventListener\('heroarena:route-change',initializeCommanderControls\)/);
 assert.match(cooldown,/window\.addEventListener\('heroarena:route-change',initializeCommanderCooldown\)/);
 assert.match(controls,/panel\.hidden=false/);
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
