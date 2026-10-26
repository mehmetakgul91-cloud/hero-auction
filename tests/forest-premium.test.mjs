import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('public/theme.css');
const asset=new URL('../public/images/arena-themes/ruins-premium.webp',import.meta.url);
const rule=css.match(/\.battle-arena\{([^}]+)\}/g).find(r=>r.includes("ruins-premium.webp"));
test('approved forest derivative is one bounded static WebP, not a replacement drawing',()=>{
 const b=readFileSync(asset);
 assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WEBP');
 assert.equal(createHash('sha256').update(b).digest('hex'),'deeeda596bce940f360c11e60b931bd9b1b53320d075392d6e2bf0e1ae090056');
 assert.ok(statSync(asset).size<800*1024);
});
test('forest uses proportional cover and responsive crop without a broad dark veil',()=>{
 assert.match(rule,/background-image:url\('\/images\/arena-themes\/ruins-premium\.webp'\)/);
 assert.match(rule,/background-size:cover/);assert.match(rule,/background-position:center 18%/);
 assert.doesNotMatch(rule,/gradient|inset 0 0|filter|opacity|animation|transition|transform|100% 100%/);
 assert.match(css,/@media\(max-width:600px\)\{body:has\(#battle-arena\) \.battle-arena\{background-position:center center\}\}/);
});
test('only forest gains the raster; no eager loading of other themes or original PNG',()=>{
 assert.equal((css.match(/ruins-premium\.webp/g)||[]).length,1);
 for(const id of ['courtyard','savanna','fjord','space']){assert.ok(statSync(new URL('../public/images/arena-themes/'+id+'.svg',import.meta.url)).size>0);assert.ok(!css.includes("url('/images/arena-themes/"+id+".svg')"));}
 for(const f of ['public/battle-preview.html','public/battle-preview.js','public/arena-theme.js'])assert.doesNotMatch(read(f),/ruins-premium|Premium-Konsept|new Image\(|rel=["']preload/);
});
test('forest name plate is local and AA even over the brightest possible background',()=>{
 assert.match(css,/\.battle-arena \.arena-hero-label\{background:#17212be6;border-radius:3px;text-shadow:0 1px 2px #000\}/);
 const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const plate=[23,33,43].map(v=>v*230/255+255*25/255);
 assert.ok((luminance([231,237,241])+.05)/(luminance(plate)+.05)>4.5);
});
test('preview follows current independent 60-track placement, not the rejected fixed-row layout',()=>{
 const compositor=read('tools/arena-theme-preview/build-forest-composites.py');
 assert.match(compositor,/start-1\+span\/2\)\/60\*teamh/);
 assert.match(compositor,/forest-web-delivery\.png/);
 assert.doesNotMatch(compositor,/scene-revision-v2|courtyard-mobile|space-mobile/);
});
