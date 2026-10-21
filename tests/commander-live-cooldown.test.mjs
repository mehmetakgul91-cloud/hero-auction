import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../public/commander-live-cooldown.js',import.meta.url),'utf8');
function harness(){
 let now=0,tick;const events=new Map(),label={textContent:''},window={heroCommanderEffectUntil:0,addEventListener:(name,fn)=>events.set(name,fn)};
 runInNewContext(src,{window,document:{querySelector:()=>label},Date:{now:()=>now},setInterval:fn=>{tick=fn;}});
 return {label,window,snapshot:data=>events.get('heroarena:commander-state')({detail:data}),advance:time=>{now=time;tick();}};
}
test('cooldown uses the acting seat snapshot and prioritizes the shared effect',()=>{
 const h=harness();h.snapshot({side:1,abilities:[{}, {cooldownMs:5000,effectLockMs:1200}],finished:false});
 assert.match(h.label.textContent,/Komutan efekti · 1,2/);
 h.advance(1200);assert.match(h.label.textContent,/bekleme süresi: 4/);
 h.advance(5000);assert.match(h.label.textContent,/becerini kullanabilirsin/);
 h.window.heroCommanderEffectUntil=6500;h.advance(5100);assert.match(h.label.textContent,/Komutan efekti · 1,4/);
 h.snapshot({side:1,abilities:[{},{}],finished:true});assert.equal(h.label.textContent,'Savaş tamamlandı');
});
test('cooldown shares the control snapshot without extra network calls',()=>{
 assert.doesNotMatch(src,/fetch\s*\(/);
 const controls=readFileSync(new URL('../public/commander-experimental.js',import.meta.url),'utf8');
 assert.match(controls,/heroarena:commander-state/);
});
