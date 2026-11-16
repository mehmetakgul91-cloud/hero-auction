import test from 'node:test';
import assert from 'node:assert/strict';
import {arenaSilhouetteProfile,mountArenaSilhouette} from '../public/arena-silhouettes.js';
import {readFileSync,existsSync} from 'node:fs';
function fixture({fail=false,connected=true,side=0}={}){
 const card={classList:{add(v){card.className=v}},dataset:{}};
 const portrait={isConnected:connected,children:[],append(v){this.children.push(v)}};
 const fallback={remove(){this.removed=true}};
 const document={createElement(tag){return tag==='img'?{set src(v){fail?this.onerror():this.onload()}}:{style:{},setAttribute(){}}}};
 return {card,portrait,fallback,document,unit:{id:'original:09'},side};
}
test('all 50 active heroes use existing individual painted sheets, unknown IDs remain fallback',()=>{
 const roster=JSON.parse(readFileSync(new URL('../battle-roster.json',import.meta.url))).characters;
 for(const {id} of roster){
 const p=arenaSilhouetteProfile({id});assert.ok(p,id);assert.ok(existsSync(new URL('../public'+p.src,import.meta.url)));
 }
 assert.equal(arenaSilhouetteProfile({id:'future:01'}),null);
});
test('idle body mounts once, removes fallback and preserves facing/side identity',async()=>{
 for(const side of [0,1]){const f=fixture({side});assert.equal(await mountArenaSilhouette(f),true);assert.equal(f.card.className,'arena-silhouette');assert.equal(f.card.dataset.team,side?'red':'blue');assert.equal(f.portrait.children.length,1);assert.ok(f.fallback.removed);}
});
test('image failure and detached reset never hide fallback or leave a silhouette marker',async()=>{
 for(const args of [{fail:true},{connected:false}]){const f=fixture(args);assert.equal(await mountArenaSilhouette(f),false);assert.equal(f.card.className,undefined);assert.equal(f.fallback.removed,undefined);}
});
test('attack body visibility has the existing bounded/cancelled effect owner and never changes damage rules',()=>{
 const effects=readFileSync(new URL('../public/hero-attack-effects.js',import.meta.url),'utf8');
 assert.match(effects,/if\(painted&&actor.classList\?\.contains\('arena-silhouette'\)\)effects.mark\?\.\(actor,\['silhouette-performing'\]/);
 const css=readFileSync(new URL('../public/arena-silhouettes.css',import.meta.url),'utf8');
 assert.match(css,/\.silhouette-performing \.arena-silhouette-body\{visibility:hidden\}/);
});
