import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const path=new URL('../../artifacts/arena-themes/',import.meta.url),html=fs.readFileSync(new URL('Hero-Auction-Bes-Arena-Temasi-Onizleme.html',path),'utf8');
const payload=html.match(/<script id="preview-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
class Element{constructor(dataset={}){this.dataset=dataset;this.children=[];this.style={};this.attrs={}}setAttribute(k,v){this.attrs[k]=v}append(n){this.children.push(n)}}
const nodes=Object.fromEntries(['preview-data','arena-preview','current','wrap','themes'].map(id=>[id,new Element()]));nodes['preview-data'].textContent=payload;
const views=[1150,390,320,844].map(width=>new Element({width:String(width)})),layouts=['normal','all-front'].map(layout=>new Element({layout}));
const document={getElementById:id=>nodes[id],createElement:()=>new Element(),querySelectorAll:s=>s==='[data-width]'?views:s==='[data-layout]'?layouts:s==='[data-theme]'?nodes.themes.children:[]};
vm.runInNewContext(fs.readFileSync(new URL('preview-runtime.js',path),'utf8'),{document});
assert.equal(nodes.themes.children.length,5);let checked=0;
for(const theme of nodes.themes.children)for(const view of views)for(const layout of layouts){theme.onclick();view.onclick();layout.onclick();const child=nodes['arena-preview'].srcdoc;
 assert.ok(child.includes('data-arena-theme="'+theme.dataset.theme+'"'));assert.equal((child.match(/class="hero arena-hero /g)||[]).length,10);assert.equal((child.match(/class="arena-shield"/g)||[]).length,10);assert.equal((child.match(/class="hp"/g)||[]).length,10);assert.ok(child.includes("connect-src 'none'"));assert.ok(child.includes("script-src 'none'"));assert.doesNotMatch(child,/__ARENA_ASSET_|<script|<link|src="\/|href="https?:/);assert.equal(nodes.wrap.style.width,view.dataset.width+'px');checked++;
}
assert.equal(checked,40);assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/);
console.log(JSON.stringify({themes:5,viewports:4,formations:2,sourceDerivedSampleStates:checked,cardsPerState:10,shieldMetersPerState:10,network:'blocked by CSP, no network code',browserLayoutQA:false},null,2));
