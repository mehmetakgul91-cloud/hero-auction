import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {computeArenaSceneLayout} from '../public/arena-scene-layout.js';
import {arenaDecorativeCacheControl} from '../arena-decorative-assets.js';
const css=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');
const section=css.split('/* Forest/savanna full composition:')[1];
const hashes={ruins:'3a5fb26a',savanna:'88137c78'};
test('only selected ready theme requests decorative terrain below untouched original',()=>{
 for(const [theme,hash] of Object.entries(hashes)){
  const rule=section.split(`body:has(#battle-arena) #battle-arena[data-arena-theme="${theme}"][data-arena-scene-layout="ready"]{`)[1]?.split('}')[0];
  assert.ok(rule?.includes(`background-image:url('/images/arena-themes/${theme}-premium.webp'),linear-gradient(#10171038,#10171038),url('/images/arena-themes/${theme}-side-extension-${hash}.webp')`));
  assert.equal((css.match(new RegExp(theme+'-side-extension-'+hash,'g'))||[]).length,1);
 }
 assert.ok(section.includes('background-size:var(--arena-scene-art-width) var(--arena-scene-art-height),auto,cover'));
 assert.ok(section.includes('background-position:var(--arena-scene-art-left) var(--arena-scene-art-top),center,center'));
 for(const file of ['public/battle-preview.html','public/battle-preview.js','public/arena-theme.js'])assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/side-extension|rel=["']preload/);
 assert.doesNotMatch(section,/filter:|animation:|transform:|background-size:cover/);
});
test('decorative cover fills extreme arena sizes independently of complete proportional foreground',()=>{
 for(const width of [256,308,378,418,600,850,1138])for(const height of [180,280,330,400,530,760,1000]){
  const l=computeArenaSceneLayout(width,height),scale=Math.max(width/1774,height/887);
  assert.ok(1774*scale>=width-1e-6&&887*scale>=height-1e-6);
  assert.ok(l.art.width<=width+1e-6&&l.art.height<=height+1e-6);
  assert.ok(Math.abs(l.art.height/l.art.width-1.5)<1e-6);
 }
});
test('rim is outward-only, never masking or tinting original edge pixels',()=>{
 const rule=section.split('::before{')[1]?.split('}')[0];assert.ok(rule);
 for(const property of ['left','top','width','height'])assert.ok(rule.includes(property+':var(--arena-scene-art-'+property+')'));
 assert.ok(rule.includes('background:none'));assert.ok(rule.includes('box-shadow:0 0 0 1px'));
 assert.doesNotMatch(rule,/inset\s+[0-9]|filter:|opacity:|mask/);
});
test('only byte-addressed lossless decorative assets get immutable caching',()=>{
 for(const [theme,hash]of Object.entries(hashes)){
  const relative=`images/arena-themes/${theme}-side-extension-${hash}.webp`,b=readFileSync(new URL('../public/'+relative,import.meta.url));
  assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WEBP');assert.ok(b.includes(Buffer.from('VP8L')));
  assert.ok(b.length<4*1024*1024);assert.equal(createHash('sha256').update(b).digest('hex').slice(0,8),hash);
  assert.equal(arenaDecorativeCacheControl(relative),'public, max-age=31536000, immutable');
 }
 for(const relative of ['theme.css','index.html','app.js','images/arena-themes/ruins-premium.webp','images/arena-themes/savanna-premium.webp','images/arena-themes/forest-leaf.svg','images/arena-themes/ruins-side-extension-deadbeef.webp',undefined,null])assert.equal(arenaDecorativeCacheControl(relative),'no-store');
});
