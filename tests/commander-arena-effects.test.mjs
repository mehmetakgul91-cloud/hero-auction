import test from 'node:test';
import {runInNewContext} from 'node:vm';
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

function effectHarness(){
 let now=0;const handlers=new Map(),timers=[],elements=[];
 const window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:()=>{}};
 const document={hidden:false,body:{classList:{contains:()=>false},append:el=>elements.push(el)},
 createElement:()=>({children:[],setAttribute(){},append(...nodes){this.children.push(...nodes)},remove(){this.removed=true}})};
 runInNewContext(effect,{window,document,Date:{now:()=>now},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},setTimeout:(fn,delay)=>timers.push({fn,at:now+delay})});
 return {window,elements,emit:entry=>handlers.get('heroarena:commander-round')({detail:{events:[entry]}}),
 advance(time){now=time;for(const t of [...timers])if(!t.done&&t.at<=now){t.done=true;t.fn();}}};
}
test('duplicate cues do not replay and successive commander portraits never overlap',()=>{
 const h=effectHarness(),first={action:'commander-attack-normal',side:0,sequence:1};
 h.emit(first);h.emit(first);h.emit({action:'commander-defense-ultimate',side:1,sequence:2});
 assert.equal(h.elements.length,1);
 assert.match(h.elements[0].children[0].children[0].src,/Sava/);
 h.advance(1999);assert.equal(h.elements[0].removed,undefined);
 h.advance(2000);assert.equal(h.elements[0].removed,true);assert.equal(h.elements.length,2);
 assert.match(h.elements[1].children[0].children[0].src,/Aslan/);
 h.advance(4000);assert.equal(h.elements[1].removed,true);assert.equal(h.window.heroCommanderEffectUntil,0);
});
test('commander portrait holds the visual lock for exactly two seconds',()=>{
 const h=effectHarness();h.emit({action:'commander-magic-normal',side:0,sequence:1});
 assert.equal(h.window.heroCommanderEffectUntil,2000);
 h.advance(1999);assert.equal(h.elements[0].removed,undefined);
 h.advance(2000);assert.equal(h.elements[0].removed,true);assert.equal(h.window.heroCommanderEffectUntil,0);
});

test('commander matchup uses portraits and centered mobile ability area',()=>{
 const client=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(client,/arena-commander-portrait/);
 assert.match(html,/\.commander-ability-flash\{[^}]*left:50%;top:50%/);
 assert.match(html,/translate\(-50%,-50%\) scale\(1\)/);
});

test('live commander controls occupy their own space below the arena',()=>{
 const client=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/battle-preview.css',import.meta.url),'utf8');
 assert.match(client,/function mountCommanderDock\(/);
 assert.match(client,/dock\.append\(matchup,controls\)/);
 assert.match(client,/arena\.after\(dock\)/);
 assert.match(css,/\.arena-commander-dock\{position:relative/);
 assert.match(css,/\.arena-commander-dock\[hidden\]\{display:none!important/);
 assert.match(css,/\[data-command\]\{[^}]*min-height:44px!important/);
});

test('commander controls initialize after the single page arena route changes',()=>{
 const client=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 const controls=readFileSync(new URL('../public/commander-experimental.js',import.meta.url),'utf8');
 const cooldown=readFileSync(new URL('../public/commander-live-cooldown.js',import.meta.url),'utf8');
 assert.match(client,/history\.replaceState\(null,'',url\)[\s\S]{0,160}heroarena:route-change/);
 assert.match(controls,/window\.addEventListener\('heroarena:route-change',initializeCommanderControls\)/);
 assert.match(cooldown,/window\.addEventListener\('heroarena:commander-state'/);
 assert.match(controls,/panel\.hidden=false/);
});

test('arena omits training shortcut and reports unsupported bot rooms clearly',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/MANUEL KOMUTAN EĞİTİM ARENASI/);
 assert.match(server,/Komutan enerjisi ve becerileri yalnızca iki gerçek oyunculu odalarda kullanılabilir/);
});

test('experimental committed round feeds commander visuals without altering replay',()=>{
 const client=readFileSync(new URL('../public/commander-experimental.js',import.meta.url),'utf8');
 assert.match(client,/heroarena:commander-round/);
 assert.match(effect,/addEventListener\('heroarena:commander-round',showCommanderAbility\)/);
 assert.match(client,/data\.events\|\|\[\]/);
 assert.match(client,/heroarena:experimental-round-end/);
});
