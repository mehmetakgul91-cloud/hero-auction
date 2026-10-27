import test from 'node:test';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const effect=readFileSync(new URL('../public/commander-arena-effects.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/battle-preview.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/battle-preview.html',import.meta.url),'utf8');
test('commander visual effects listen to existing arena move events',()=>{
 assert.match(effect,/heroarena:move/);
 assert.match(html,/commander-arena-effects\.js/);
});
test('each commander type has a distinct hero effect class',()=>{
 for(const kind of ['attack','defense','support','magic']){
  assert.match(css,new RegExp('commander-target-fx\\.'+kind));
 }
});
test('commander effect layer does not mutate combat health or winner',()=>{
 assert.doesNotMatch(effect,/\.hp\s*=|\.winner\s*=|\.energy\s*=/);
});

test('commander overlays skip background catch-up frames',()=>{
 assert.match(effect,/document\.hidden\|\|document\.body\.classList\.contains\('arena-catching-up'\)/);
});

function effectHarness({english=false,dockWidth=null}={}){
 let now=0,id=0;const handlers=new Map(),timers=new Map(),elements=[];
 const makeElement=(tag='div')=>{
  const node={tagName:tag.toUpperCase(),children:[],dataset:{},className:'',style:{setProperty(name,value){this[name]=value}},
   setAttribute(name,value){this[name]=value},getAttribute(name){return this[name]},
   append(...nodes){for(const child of nodes){child.parentElement=this;child.parentNode=this;this.children.push(child);elements.push(child)}},
   remove(){this.removed=true;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this)},
   getBoundingClientRect:()=>({left:0,top:100,width:50,height:50}),
   matches(selector){return selector.startsWith('.')?this.className.split(' ').includes(selector.slice(1)):selector.startsWith('#')?this.id===selector.slice(1):this.tagName===selector.toUpperCase()},
   querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)])},
   querySelector(selector){return this.querySelectorAll(selector)[0]||null},
   closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null}};
  node.classList={contains:name=>node.className.split(' ').includes(name),add:(...names)=>{node.className+=' '+names.join(' ')},remove:(...names)=>{node.className=node.className.split(' ').filter(name=>!names.includes(name)).join(' ')}};
  return node;
 };
 const body=makeElement('body'),teams=[],headings=[],portraits=[[],[]];
 for(const side of [0,1]){
  const section=makeElement('section');section.className='arena-side';const heading=makeElement('h2');heading.textContent='Team '+side;headings.push(heading);
  const team=makeElement();team.id=side===0?'team-a':'team-b';team.className='team';teams.push(team);body.append(section);section.append(heading,team);
  for(const heroId of ['same','other']){const card=makeElement();card.className='hero';card.dataset.heroId=heroId;const portrait=makeElement();portrait.className='arena-portrait';portrait.getBoundingClientRect=()=>({left:side*200,top:100,width:50,height:50});portraits[side].push(portrait);const label=makeElement();label.className='arena-hero-label';label.textContent=heroId;card.append(portrait,label);team.append(card);}
 }
 const commanders=[];
 if(dockWidth!==null)for(const side of [0,1]){const commander=makeElement();commander.id=side===0?'arena-commander-left':'arena-commander-right';commander.getBoundingClientRect=()=>({left:side*200,top:300,width:dockWidth,height:dockWidth?60:0});body.append(commander);commanders.push(commander);}
 elements.length=0;
 const on=(name,fn)=>{if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn)};
 const dispatch=(name,detail)=>{for(const fn of handlers.get(name)||[])fn({type:name,detail})};
 const window={addEventListener:on,dispatchEvent:event=>dispatch(event.type,event.detail),location:{search:english?'?platform=crazygames':''}};
 const document={hidden:false,documentElement:{lang:english?'en':'tr',dataset:{}},addEventListener:on,getElementById:id=>body.querySelector('#'+id),querySelector:selector=>body.querySelector(selector),body,createElement:makeElement};
 runInNewContext(effect,{window,document,URLSearchParams,Date:{now:()=>now},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id},clearTimeout:id=>timers.delete(id)});
 return {window,document,elements,teams,headings,portraits,commanders,timers,dispatch,
  cues:()=>elements.filter(el=>el.className?.split(' ').includes('commander-cast-cue')),targetFx:()=>elements.filter(el=>el.className?.split(' ').includes('commander-target-fx')),impacts:()=>elements.filter(el=>el.className?.split(' ').includes('commander-hero-impact')),
  emit:entry=>dispatch('heroarena:commander-round',{events:[entry]}),reset:()=>dispatch('heroarena:ready'),hide:()=>{document.hidden=true;dispatch('visibilitychange')},
  advance(time){for(;;){const next=[...timers].filter(([,t])=>t.at<=time).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=time;}};
}
const textOf=node=>[node.textContent||'',...node.children.map(textOf)].join(' ');
test('duplicate cues do not replay and successive local cues never overlap',()=>{
 const h=effectHarness(),first={action:'commander-attack-normal',side:0,sequence:1};
 h.emit(first);h.emit(first);h.emit({action:'commander-defense-ultimate',side:1,sequence:2});
 assert.equal(h.cues().length,1);assert.equal(h.cues()[0].querySelectorAll('img').length,0);
 h.advance(1199);assert.notEqual(h.cues()[0].removed,true);
 h.advance(1200);assert.equal(h.cues()[0].removed,true);assert.equal(h.cues().length,2);
 h.advance(2400);assert.equal(h.cues()[1].removed,true);assert.equal(h.window.heroCommanderEffectUntil,0);
});
test('local cue holds the unchanged visual lock for exactly 1.2 seconds',()=>{
 const h=effectHarness();h.emit({action:'commander-magic-normal',side:0,sequence:1});
 assert.equal(h.window.heroCommanderEffectUntil,1200);
 h.advance(1199);assert.notEqual(h.cues()[0].removed,true);
 h.advance(1200);assert.equal(h.cues()[0].removed,true);assert.equal(h.window.heroCommanderEffectUntil,0);
});
test('matchup retains portraits but cast effects never create a portrait or fullscreen cinematic',()=>{
 const client=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(client,/arena-commander-portrait/);
 assert.doesNotMatch(effect,/createElement\(['"]img['"]\)|commander-cinematic/);
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

test('arena omits the old manual training shortcut',()=>{
 assert.doesNotMatch(html,/MANUEL KOMUTAN EĞİTİM ARENASI/);
 // Bot rooms now use the same authenticated live API (behavior covered by bot-live-http).
});

test('experimental committed round feeds commander visuals without altering replay',()=>{
 const client=readFileSync(new URL('../public/commander-experimental.js',import.meta.url),'utf8');
 assert.match(client,/heroarena:commander-round/);
 assert.match(effect,/addEventListener\('heroarena:commander-round',showCommanderAbility\)/);
 assert.match(client,/data\.events\|\|\[\]/);
 assert.match(client,/heroarena:experimental-round-end/);
});

for(const [kind,side,value,expected,targetSide] of [['damage',0,12,'−12',1],['heal',0,9,'+9',0],['shield',1,20,'+20',1],['weaken',1,40,'−%40',0],['weaken',1,31.8,'−%31,8',0]])test(kind+' '+value+' marks only the committed target after the cast, even with duplicate IDs on both teams',()=>{
 const h=effectHarness();const commander={damage:'attack',heal:'support',shield:'defense',weaken:'magic'}[kind];
 const entry={action:'commander-'+commander+'-normal',side,sequence:1,impacts:[{target:'same',kind,value}]};
 h.emit(entry);h.emit(entry);assert.equal(h.targetFx().length,1);assert.equal(h.targetFx()[0].parentElement,h.portraits[targetSide][0]);assert.equal(h.targetFx()[0].getAttribute('data-effect'),kind);h.advance(1199);assert.equal(h.impacts().length,0);
 h.advance(1200);assert.equal(h.cues()[0].removed,true);assert.equal(h.impacts().length,1);
 const impact=h.impacts()[0];assert.equal(impact.style.left,targetSide*200+'px');assert.ok(textOf(impact).includes(expected));
 assert.match(impact['aria-label'],/same/);assert.equal(h.window.heroCommanderEffectUntil,0);
 h.advance(2400);assert.equal(impact.removed,true);
});
test('fully absorbed damage reports shield amount and zero health damage',()=>{
 const h=effectHarness();h.emit({action:'commander-attack-normal',side:0,sequence:1,impacts:[{target:'other',kind:'damage',value:0,absorbed:8}]});h.advance(1200);
 assert.match(textOf(h.impacts()[0]),/−0/);assert.match(textOf(h.impacts()[0]),/8 engellendi/);
});
test('zero healing creates no false healing and rematch clears all effects, timers and deduplication',()=>{
 const h=effectHarness();h.emit({action:'commander-support-normal',side:0,sequence:1,impacts:[{target:'same',kind:'heal',value:0}]});h.advance(1200);assert.equal(h.impacts().length,0);
 h.emit({action:'commander-defense-normal',side:0,sequence:2,impacts:[{target:'same',kind:'shield',value:8}]});h.advance(2400);assert.equal(h.impacts().length,1);
 h.reset();assert.equal(h.impacts()[0].removed,true);assert.equal(h.window.heroCommanderEffectUntil,0);assert.equal(h.timers.size,0);
 h.emit({action:'commander-defense-normal',side:0,sequence:2});assert.equal(h.cues().length,3);
 h.hide();assert.equal(h.cues()[2].removed,true);assert.equal(h.timers.size,0);
});
test('queued impacts appear together after the last cue without extending the ability lock',()=>{
 const h=effectHarness();h.emit({action:'commander-attack-normal',side:0,sequence:1,impacts:[{target:'same',kind:'damage',value:4}]});
 h.advance(400);h.emit({action:'commander-support-normal',side:1,sequence:2,impacts:[{target:'other',kind:'heal',value:7}]});
 assert.equal(h.window.heroCommanderEffectUntil,2400);h.advance(1200);assert.equal(h.cues().length,2);assert.equal(h.impacts().length,0);
 h.advance(2400);assert.equal(h.impacts().length,2);assert.equal(h.window.heroCommanderEffectUntil,0);
});
for(const event of ['heroarena:connection-lost','pagehide','popstate','heroarena:route-change'])test(event+' removes active effects, queued casts and timers',()=>{
 const h=effectHarness();h.emit({action:'commander-attack-normal',side:0,sequence:1,impacts:[{target:'same',kind:'damage',value:8}]});h.emit({action:'commander-magic-normal',side:1,sequence:2});
 h.dispatch(event);assert.equal(h.cues()[0].removed,true);assert.equal(h.timers.size,0);assert.equal(h.window.heroCommanderEffectUntil,0);assert.equal(h.window.heroCommanderImpactUntil,0);
 h.advance(10000);assert.equal(h.cues().length,1);assert.equal(h.impacts().length,0);
});

test('caster cues stay on their own team heading for both sides',()=>{
 for(const side of [0,1]){const h=effectHarness();h.emit({action:'commander-attack-normal',side,sequence:1});assert.equal(h.cues()[0].parentElement,h.headings[side]);}
});
test('missing, nonpositive and unknown impacts never fabricate target effects',()=>{
 const h=effectHarness();h.emit({action:'commander-support-normal',side:0,sequence:1,impacts:[{target:'same',kind:'heal',value:0},{target:'other',kind:'heal',value:-1},{target:'missing',kind:'heal',value:2},{target:'same',kind:'invented',value:2}]});
 assert.equal(h.targetFx().length,0);h.advance(1200);assert.equal(h.impacts().length,0);
});
test('shield and weakening effects do not falsely show healing',()=>{
 for(const [commander,kind] of [['defense','shield'],['magic','weaken']]){const h=effectHarness();h.emit({action:'commander-'+commander+'-ultimate',side:0,sequence:1,impacts:[{target:'same',kind,value:10}]});assert.equal(h.targetFx().length,1);assert.match(h.targetFx()[0].className,new RegExp(commander));assert.doesNotMatch(textOf(h.cues()[0]),/ŞİFA|Şifa|Healing|Heal/);}
});
test('English cue and committed impact numbers are localized without Turkish fallback',()=>{
 const h=effectHarness({english:true});h.emit({action:'commander-magic-ultimate',side:1,sequence:1,impacts:[{target:'same',kind:'weaken',value:31.8}]});
 assert.doesNotMatch(textOf(h.cues()[0]),/RAKİBİN|KOMUTANI|YETENEK|BÜYÜ/);assert.match(textOf(h.cues()[0]),/commander/i);
 h.advance(1200);assert.match(textOf(h.impacts()[0]),/31\.8/);assert.doesNotMatch(textOf(h.impacts()[0]),/SALDIRI/);
});
test('finale allows the last cast and impacts to finish, then removes their nodes and timers',()=>{
 const h=effectHarness();h.emit({action:'commander-attack-ultimate',side:0,sequence:1,impacts:[{target:'same',kind:'damage',value:50}]});
 h.dispatch('heroarena:battle-finished');assert.equal(h.window.heroCommanderEffectUntil,1200);assert.notEqual(h.cues()[0].removed,true);
 h.advance(1200);assert.equal(h.impacts().length,1);h.advance(2400);assert.equal(h.impacts()[0].removed,true);assert.equal(h.timers.size,0);
});

test('effects never intercept taps and reduced motion replaces animation with static cues',()=>{
 assert.match(css,/\.commander-cast-cue,\.commander-target-fx,\.commander-target-fx \*\{pointer-events:none!important\}/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.commander-cast-cue[^}]+animation:none!important/);
 assert.doesNotMatch(css,/\.commander-cinematic/);
 assert.doesNotMatch(html,/commander-ability-flash\{/);
});
test('support buff-only events show empower particles, never invented healing',()=>{
 for(const english of [false,true]){const h=effectHarness({english});h.emit({action:'commander-support-normal',side:1,sequence:1,impacts:[{target:'same',kind:'buff',value:10}]});assert.equal(h.targetFx().length,1);assert.equal(h.targetFx()[0].parentElement,h.portraits[1][0]);assert.match(textOf(h.cues()[0]),english?/Empower/:/Güçlendirme/);assert.doesNotMatch(textOf(h.cues()[0]),/Healing|Şifa/);h.advance(1200);assert.equal(h.impacts().length,0);}
});
test('reconnect replay suppresses already seen casts while new events can play',()=>{
 const h=effectHarness(),entry={action:'commander-attack-normal',side:0,sequence:1,impacts:[{target:'same',kind:'damage',value:10}]};
 h.emit(entry);h.dispatch('heroarena:connection-lost');assert.equal(h.targetFx()[0].removed,true);h.emit(entry);assert.equal(h.cues().length,1);
 h.emit({...entry,sequence:2});assert.equal(h.cues().length,2);h.advance(2400);assert.equal(h.targetFx()[1].removed,true);assert.equal(h.timers.size,0);
});
test('one target receives one decorative effect even when multiple impacts are committed',()=>{
 const h=effectHarness();h.emit({action:'commander-attack-normal',side:0,sequence:1,impacts:[{target:'same',kind:'damage',value:4},{target:'same',kind:'damage',value:6}]});
 assert.equal(h.targetFx().length,1);h.advance(1200);assert.equal(h.impacts().length,1);assert.match(textOf(h.impacts()[0]),/−10/);
});

for(const side of [0,1])test('fitted arena side '+side+' anchors its cue on the visible commander dock, not hidden heading',()=>{
 const h=effectHarness({dockWidth:120});h.headings[side].getBoundingClientRect=()=>({width:0,height:0});
 h.emit({action:'commander-magic-ultimate',side,sequence:1});assert.equal(h.cues()[0].parentElement,h.commanders[side]);assert.equal(h.headings[side].children.length,0);
 h.advance(1200);assert.equal(h.cues()[0].removed,true);assert.equal(h.commanders[side].children.length,0);
});
for(const side of [0,1])test('hidden commander dock on side '+side+' falls back to team heading',()=>{
 const h=effectHarness({dockWidth:0});h.emit({action:'commander-defense-normal',side,sequence:1});
 assert.equal(h.cues()[0].parentElement,h.headings[side]);assert.equal(h.commanders[side].children.length,0);
});
for(const [commander,kind,targetSide,expected]of [['magic','buff',0,'+1 HIT POWER · 3 ROUNDS'],['defense','guard',0,'SURVIVE AT 1 HP'],['attack','focus',1,'TARGET'],['support','revive',0,'+30 HP']])test(`new ${commander} ultimate ${kind} is a status on the authoritative side`,()=>{
 const h=effectHarness({english:true});h.emit({action:'commander-'+commander+'-ultimate',side:0,sequence:1,impacts:[{target:'same',kind,value:kind==='revive'?30:1}]});
 assert.equal(h.targetFx().length,1);assert.equal(h.targetFx()[0].parentElement,h.portraits[targetSide][0]);h.advance(1200);
 assert.equal(h.impacts().length,1);assert.equal(h.impacts()[0].style.left,targetSide*200+'px');assert.ok(textOf(h.impacts()[0]).includes(expected));assert.doesNotMatch(textOf(h.impacts()[0]),/HP DAMAGE|HEALING/);
});

for(const english of [false,true])test(`mage normal committed impact labels next attack, not rounds (${english?'EN':'TR'})`,()=>{
 const h=effectHarness({english});h.emit({action:'commander-magic-normal',side:0,sequence:1,impacts:[{target:'same',kind:'weaken',value:35}]});h.advance(1200);assert.equal(h.impacts().length,1);const text=textOf(h.impacts()[0]);assert.match(text,english?/NEXT ATTACK/:/SONRAKİ SALDIRI/);assert.match(text,/35/);assert.doesNotMatch(text,/3 TUR|3 ROUNDS/);
});

for(const english of [false,true])test(`Hunt Order committed until-death impact explains duration (${english?'EN':'TR'})`,()=>{
 const h=effectHarness({english});h.emit({action:'commander-attack-ultimate',side:0,sequence:1,focusUntilDeath:true,impacts:[{target:'same',kind:'focus',value:5,untilDeath:true}]});
 h.advance(1200);assert.equal(h.impacts().length,1);const description=textOf(h.impacts()[0]);
 assert.match(description,english?/UNTIL TARGET DIES/:/HEDEF ÖLÜNCEYE KADAR/);
 assert.equal(h.impacts()[0].querySelectorAll('.focus-until-death').length,1);
 assert.match(css,/strong\.focus-until-death\{[^}]*max-width:90px[^}]*font-size:11px[^}]*white-space:normal/);
 assert.doesNotMatch(description,/NEXT ATTACK|SONRAKİ SALDIRI|5.*(?:DAMAGE|HASAR)/);
});

for(const english of [false,true])test(`mage stun impact uses authoritative enemy side without fabricated percent or damage (${english?'EN':'TR'})`,()=>{
 const h=effectHarness({english});const event={action:'commander-magic-normal',side:1,sequence:1,impacts:[{target:'same',kind:'stun',value:1,nextAttack:true}]};
 h.emit(event);h.emit(event);assert.equal(h.targetFx().length,1);assert.equal(h.targetFx()[0].parentElement,h.portraits[0][0]);assert.equal(h.targetFx()[0].getAttribute('data-effect'),'stun');
 assert.match(textOf(h.cues()[0]),english?/Stun/:/Sersemletme/);h.advance(1200);assert.equal(h.impacts().length,1);
 const text=textOf(h.impacts()[0]);assert.match(text,english?/NEXT ATTACK SKIPPED/:/SONRAKİ SALDIRI ATLANIR/);assert.doesNotMatch(text,/%|DAMAGE|HASAR|HEALING|ŞİFA|3 TUR|3 ROUNDS/);
 assert.equal(h.impacts()[0].querySelectorAll('.stun-next-attack').length,1);assert.match(css,/strong\.stun-next-attack\{[^}]*white-space:normal/);
 h.advance(2400);assert.equal(h.impacts()[0].removed,true);assert.equal(h.timers.size,0);
});
