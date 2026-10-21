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
 let now=0,id=0;const handlers=new Map(),timers=new Map(),elements=[];
 const makeElement=()=>({children:[],style:{setProperty(name,value){this[name]=value}},setAttribute(name,value){this[name]=value},append(...nodes){this.children.push(...nodes)},remove(){this.removed=true}});
 const cards=[0,1].map(side=>['same','other'].map((heroId,index)=>({dataset:{heroId},querySelector:selector=>selector==='.arena-portrait'?{getBoundingClientRect:()=>({left:side*200+index*80,top:100,width:50,height:50})}:{textContent:heroId}})));
 const window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:()=>{}};
 const document={hidden:false,addEventListener:(name,fn)=>handlers.set(name,fn),getElementById:id=>({querySelectorAll:()=>cards[id==='team-a'?0:1]}),body:{classList:{contains:()=>false},append:el=>elements.push(el)},createElement:makeElement};
 runInNewContext(effect,{window,document,Date:{now:()=>now},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id},clearTimeout:id=>timers.delete(id)});
 return {window,document,elements,emit:entry=>handlers.get('heroarena:commander-round')({detail:{events:[entry]}}),reset:()=>handlers.get('heroarena:ready')(),hide:()=>{document.hidden=true;handlers.get('visibilitychange')()},
 advance(time){for(;;){const next=[...timers].filter(([,t])=>t.at<=time).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=time;}};
}
test('duplicate cues do not replay and successive commander portraits never overlap',()=>{
 const h=effectHarness(),first={action:'commander-attack-normal',side:0,sequence:1};
 h.emit(first);h.emit(first);h.emit({action:'commander-defense-ultimate',side:1,sequence:2});
 assert.equal(h.elements.length,1);
 assert.match(h.elements[0].children[0].children[0].src,/Sava/);
 h.advance(1199);assert.equal(h.elements[0].removed,undefined);
 h.advance(1200);assert.equal(h.elements[0].removed,true);assert.equal(h.elements.length,2);
 assert.match(h.elements[1].children[0].children[0].src,/Aslan/);
 h.advance(2400);assert.equal(h.elements[1].removed,true);assert.equal(h.window.heroCommanderEffectUntil,0);
});
test('commander portrait holds the visual lock for exactly 1.2 seconds',()=>{
 const h=effectHarness();h.emit({action:'commander-magic-normal',side:0,sequence:1});
 assert.equal(h.window.heroCommanderEffectUntil,1200);
 h.advance(1199);assert.equal(h.elements[0].removed,undefined);
 h.advance(1200);assert.equal(h.elements[0].removed,true);assert.equal(h.window.heroCommanderEffectUntil,0);
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

for(const [kind,side,value,expected,left] of [['damage',0,12,'−12','200px'],['heal',0,9,'+9','0px'],['shield',1,20,'+20','200px'],['weaken',1,40,'−%40','0px']])test(kind+' marks only the correct hero after the portrait, even with duplicate IDs on both teams',()=>{
 const h=effectHarness();const commander={damage:'attack',heal:'support',shield:'defense',weaken:'magic'}[kind];
 const entry={action:'commander-'+commander+'-normal',side,sequence:1,impacts:[{target:'same',kind,value}]};
 h.emit(entry);h.emit(entry);h.advance(1199);assert.equal(h.elements.length,1);
 h.advance(1200);assert.equal(h.elements[0].removed,true);assert.equal(h.elements.length,2);
 const impact=h.elements[1];assert.equal(impact.style.left,left);assert.equal(impact.children[0].children[1].textContent,expected);
 assert.match(impact['aria-label'],/same/);assert.equal(h.window.heroCommanderEffectUntil,0);
 h.advance(2400);assert.equal(impact.removed,true);
});
test('fully absorbed damage reports the shield amount and zero health damage',()=>{
 const h=effectHarness();h.emit({action:'commander-attack-normal',side:0,sequence:1,impacts:[{target:'other',kind:'damage',value:0,absorbed:8}]});h.advance(1200);
 const label=h.elements[1].children[0];assert.equal(label.children[1].textContent,'−0');assert.match(label.children[2].textContent,/8 engellendi/);
});
test('zero healing produces no false positive and a rematch removes old effects and timers',()=>{
 const h=effectHarness();h.emit({action:'commander-support-normal',side:0,sequence:1,impacts:[{target:'same',kind:'heal',value:0}]});h.advance(1200);assert.equal(h.elements.length,1);
 h.emit({action:'commander-defense-normal',side:0,sequence:2,impacts:[{target:'same',kind:'shield',value:8}]});h.advance(2400);assert.equal(h.elements.length,3);
 h.reset();assert.equal(h.elements[2].removed,true);assert.equal(h.window.heroCommanderEffectUntil,0);h.advance(10000);assert.equal(h.elements.length,3);
 h.emit({action:'commander-defense-normal',side:0,sequence:2});assert.equal(h.elements.length,4);
 h.hide();assert.equal(h.elements[3].removed,true);h.advance(12000);assert.equal(h.elements.length,4);
});
test('queued impacts appear together after the last portrait without extending the ability lock',()=>{
 const h=effectHarness();h.emit({action:'commander-attack-normal',side:0,sequence:1,impacts:[{target:'same',kind:'damage',value:4}]});
 h.advance(400);h.emit({action:'commander-support-normal',side:1,sequence:2,impacts:[{target:'other',kind:'heal',value:7}]});
 assert.equal(h.window.heroCommanderEffectUntil,2400);h.advance(1200);assert.equal(h.elements.length,2);
 h.advance(2400);assert.equal(h.elements.length,4);assert.equal(h.window.heroCommanderEffectUntil,0);
});
