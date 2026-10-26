import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {ARENA_THEME_IDS} from '../public/arena-theme.js';
const css=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');
const scenes=css.slice(css.indexOf('/* Cosmetic scene only:'),css.indexOf('body:has(#battle-arena) .arena-side h2'));
const path=id=>new URL('../public/images/arena-themes/'+id+'.svg',import.meta.url);
test('five self-contained static scene assets are distinct and below 4 KB each',()=>{
 const assets=ARENA_THEME_IDS.map(id=>{
  const svg=readFileSync(path(id),'utf8');
  assert.ok(statSync(path(id)).size<4096,id);
  assert.match(svg,/<svg[^>]*viewBox="0 0 1200 800"/);assert.match(svg,/<title id="title">[^<]+<\/title>/);
  assert.doesNotMatch(svg,/<(?:script|image|foreignObject|filter|animate|animateTransform|set)\b|(?:href|onload|onclick)=|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i);
  assert.ok(scenes.includes('/images/arena-themes/'+id+'.svg'),id);
  return svg.replace(/#[0-9a-f]{6}/g,'COLOR');
 });
 assert.equal(new Set(assets).size,5,'not merely recoloured copies');
 assert.match(assets[0],/pattern id="paving"/);assert.match(assets[1],/Afrika savanası/);assert.match(assets[2],/pattern id="slabs"/);assert.match(assets[3],/sarmaşıklar/);assert.match(assets[4],/pattern id="panels"/);
});
test('scene layer changes no geometry, scrolling, stacking, input or resource styling',()=>{
 const clean=scenes.replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(clean,/(?:^|[;{])\s*(?:display|visibility|position|z-index|pointer-events|content|width|height|min-width|max-width|min-height|max-height|padding|margin|inset|overflow(?:-x|-y)?|grid[^:;{]*|touch-action|border-width|animation|transition|filter|backdrop-filter|transform)\s*:/m);
 assert.doesNotMatch(clean,/\.arena-(?:hero|portrait|shield)|\.hp\b|data-command|@keyframes|@import/);
 assert.match(clean,/\.battle-arena::before\{background:none\}/);
 assert.match(clean,/\.arena-blue\{[^}]*border-style:solid/);assert.match(clean,/\.arena-red\{[^}]*border-style:dashed/);
});
const lum=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
test('hero text stays AA against the brightest main floor of every scene',()=>{
 for(const bg of ['#47493f','#51483a','#3e4b50','#424c40','#414857'])assert.ok(contrast('#e7edf1',bg)>=4.5,bg);
 assert.ok(contrast('#f0e7cd','#303a3f')>=4.5,'VS emblem');
});
