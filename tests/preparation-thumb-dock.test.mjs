import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createPreparationThumbDock,preparationThumbModel,preparationDockLayout} from '../public/preparation-thumb-dock.js';
import {crazyGamesSource} from '../crazygames-build.js';

const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const source=read('battle-preview.js'),css=read('battle-preview.css');
const heroes=Array.from({length:5},(_,i)=>({name:'Hero '+i,role:'fighter'}));
const fresh=()=>({heroes:heroes.map(hero=>({...hero})),positions:[null,null,null,null,null],lanes:['front','front','back','back','back'],selectedHero:null,locked:false,loading:false});

class Events{
 listeners=new Map();
 addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 fire(name,value={}){for(const fn of this.listeners.get(name)||[])fn(value);}
}
class Element extends Events{
 children=[];parentNode=null;attributes={};hidden=false;disabled=false;open=false;_text='';className='';
 constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.doc=doc;this.style={values:{},setProperty:(k,v)=>this.style.values[k]=v,removeProperty:k=>delete this.style.values[k]};this.classList={contains:n=>this.className.split(' ').includes(n),toggle:(n,on)=>{const values=new Set(this.className.split(' ').filter(Boolean));if(on)values.add(n);else values.delete(n);this.className=[...values].join(' ');}};}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 set textContent(value){this.children.forEach(child=>child.parentNode=null);this.children=[];this._text=String(value);}
 get isConnected(){return this===this.doc.documentElement||!!this.parentNode?.isConnected;}
 append(...nodes){for(const child of nodes){child.remove();this.children.push(child);child.parentNode=this;}}
 before(...nodes){const parent=this.parentNode;if(!parent)return;for(const child of nodes){child.remove();parent.children.splice(parent.children.indexOf(this),0,child);child.parentNode=parent;}}
 after(...nodes){const parent=this.parentNode;if(!parent)return;let anchor=this;for(const child of nodes){child.remove();parent.children.splice(parent.children.indexOf(anchor)+1,0,child);child.parentNode=parent;anchor=child;}}
 remove(){if(this.parentNode){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}}
 replaceWith(node){this.before(node);this.remove();}
 replaceChildren(...nodes){this.children.forEach(child=>child.parentNode=null);this.children=[];this._text='';this.append(...nodes);}
 contains(el){return !!el&&(this===el||this.children.some(child=>child.contains(el)));}
 setAttribute(k,v){this.attributes[k]=String(v);}
 matches(selector){if(selector.includes('input,textarea'))return ['INPUT','TEXTAREA','SELECT'].includes(this.tagName)||this.attributes.contenteditable==='true';return selector.startsWith('.')?this.classList.contains(selector.slice(1)):this.tagName===selector.toUpperCase();}
 closest(selector){return this.matches(selector)?this:this.parentNode?.closest(selector)||null;}
 querySelector(selector){return this.children.find(child=>child.matches(selector))||this.children.map(child=>child.querySelector(selector)).find(Boolean)||null;}
 getBoundingClientRect(){return {height:this.doc.dockHeight||270};}
 getClientRects(){return this.hidden?[]:[{}];}
 scrollIntoView(options){this.scrollOptions=options;}
 focus(){this.doc.activeElement=this;}
 click(){if(!this.disabled)this.onclick?.();}
}
function harness({compact=true}={}){
 const doc=new Events();doc.createElement=tag=>new Element(tag,doc);doc.createComment=()=>new Element('#comment',doc);
 doc.documentElement=doc.createElement('html');doc.body=doc.createElement('body');doc.documentElement.append(doc.body);doc.activeElement=doc.body;doc.dockHeight=270;doc.overlays=[];
 const ids={};function add(tag,id,parent=doc.body,className=''){const el=doc.createElement(tag);if(id){el.id=id;ids[id]=el;}el.className=className;parent.append(el);return el;}
 const formation=add('section',null,doc.body,'formation'),roster=add('div','role-pickers',formation),board=add('div',null,formation,'battle-board');
 const ready=add('button','apply-roles',formation),note=add('p','prep-note',formation),clock=add('strong','prep-clock',formation),details=add('details','commander-bonus-detail',formation);
 note.textContent='Warnings stay here';note.setAttribute('role','status');clock.textContent='00:59';
 doc.getElementById=id=>ids[id]||null;doc.querySelector=selector=>selector==='.formation'?formation:null;doc.querySelectorAll=()=>doc.overlays;
 const win=new Events(),media=new Events();media.matches=compact;win.matchMedia=()=>media;win.innerHeight=800;win.innerWidth=390;win.visualViewport=new Events();win.visualViewport.height=800;win.visualViewport.width=390;
 let pending=[];win.requestAnimationFrame=fn=>pending.push(fn);const observers=[];
 win.MutationObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(target){this.target=target;}disconnect(){this.disconnected=true;}};
 win.ResizeObserver=class extends win.MutationObserver{};
 const state=fresh(),calls=[],portraits=[];let controller;
 // Exercise the actual placement/swap and lane callbacks rather than a second game model.
 const context={positions:state.positions,lanes:state.lanes,prepDone:false,selectedHero:null,clearHover(){},document:{querySelector:()=>({})},renderBoard(){state.selectedHero=context.selectedHero;controller?.update();},renderRolePickers(){}};
 runInNewContext(source.slice(source.indexOf('function placeHero('),source.indexOf('function displayedLanePower('))+source.slice(source.indexOf('function setLane('),source.indexOf('const heroArtCache=')),context);
 controller=createPreparationThumbDock({document:doc,window:win,getState:()=>state,
  onSelect:index=>{calls.push(['select',index]);state.selectedHero=state.selectedHero===index?null:index;context.selectedHero=state.selectedHero;controller.update();},
  renderPortrait:(index,container)=>portraits.push({index,container})});
 function flush(){let count=0;while(pending.length){assert.ok(count++<10,'layout must settle');const batch=pending;pending=[];batch.forEach(fn=>fn());}}
 flush();const dock=formation.querySelector('.prep-thumb-dock'),heroButtons=dock.querySelector('.prep-thumb-heroes').children;
 const boardPlace=slot=>context.placeHero(state.selectedHero,slot),boardLane=(slot,lane)=>context.setLane(slot,lane);
 return {doc,win,media,state,controller,formation,board,ready,note,clock,details,roster,dock,heroButtons,boardPlace,boardLane,calls,portraits,observers,flush};
}

test('model is an exact five-slot projection and never mutates or auto-fills formation',()=>{
 const state=fresh();state.positions=[4,0,null,2,1];state.selectedHero=0;const before=JSON.stringify(state),model=preparationThumbModel(state);
 assert.equal(model.selectedSlot,1);assert.deepEqual(model.slots.map(slot=>slot.hero),[4,0,null,2,1]);assert.equal(model.heroes[3].slot,-1);assert.equal(model.slots[2].lane,'back');assert.equal(JSON.stringify(state),before);
 for(const selectedHero of [-1,5,undefined])assert.equal(preparationThumbModel({...state,selectedHero}).selected,null);
 assert.equal(preparationThumbModel({...state,loading:true}).disabled,true);assert.equal(preparationThumbModel({...state,locked:true}).disabled,true);
});
test('small height, large dock, overlays, editable focus and narrow width fall back without scroll locking',()=>{
 const base={compact:true,active:true,overlay:false,editing:false,height:270,viewportHeight:800,viewportWidth:390};
 assert.equal(preparationDockLayout(base),'fixed');
 for(const patch of [{viewportHeight:559},{height:321},{viewportWidth:299},{overlay:true},{editing:true,viewportHeight:650}])assert.equal(preparationDockLayout({...base,...patch}),'inline');
 for(const patch of [{compact:false},{active:false}])assert.equal(preparationDockLayout({...base,...patch}),'off');
});
test('minimal dock contains only five hero controls and the original Ready button',()=>{
 const h=harness();assert.equal(h.dock.children.length,2);
 assert.equal(h.heroButtons.length,5);assert.deepEqual(h.dock.querySelector('.prep-thumb-actions').children,[h.ready]);
 for(const selector of ['.prep-thumb-slots','.prep-thumb-status','.prep-thumb-clock','.prep-thumb-instruction'])assert.equal(h.dock.querySelector(selector),null);
 assert.equal(h.note.parentNode,h.formation);assert.equal(h.note.attributes.role,'status');
 assert.ok(h.heroButtons.every(button=>button.tagName==='BUTTON'&&button.type==='button'&&button.children.length===2));
 assert.doesNotMatch(h.dock.textContent,/Konum|Ön|Arka|Yerleşmedi|Kahraman seç/);
});
test('hero selection never auto-places; original board callbacks keep exact move, swap and lane strategy',()=>{
 const h=harness();h.heroButtons[0].click();assert.deepEqual(h.state.positions,[null,null,null,null,null]);
 assert.equal(h.heroButtons[0].attributes['aria-pressed'],'true');h.boardPlace(3);h.flush();
 assert.deepEqual(h.state.positions,[null,null,null,0,null]);assert.equal(h.heroButtons[0].attributes['aria-pressed'],'false');
 assert.match(h.heroButtons[0].attributes['aria-label'],/Konum 4 · Arka/);
 h.heroButtons[1].click();h.boardPlace(1);h.heroButtons[0].click();h.boardPlace(1);
 assert.deepEqual(h.state.positions,[null,0,null,1,null]);h.boardLane(1,'back');
 assert.equal(h.state.lanes[1],'back');assert.deepEqual(h.state.positions,[null,0,null,1,null]);
 assert.match(h.heroButtons[0].title,/Konum 2 · Arka/);
});
test('board placement restores only lost focus to the selected dock hero, including pending teardown',()=>{
 for(const outcome of ['lost','moved','destroyed']){
  const h=harness(),target=h.doc.createElement('button');target.className='board-slot';h.board.append(target);
  h.heroButtons[0].click();target.focus();h.board.fire('click',{target});h.boardPlace(3);target.remove();h.doc.activeElement=h.doc.body;
  if(outcome==='moved')h.ready.focus();if(outcome==='destroyed')h.controller.destroy();h.flush();
  assert.equal(h.doc.activeElement,outcome==='lost'?h.heroButtons[0]:outcome==='moved'?h.ready:h.doc.body);
 }
});
test('Ready, warnings, disclosure state and control identity survive repeated renders and timer ticks',()=>{
 const h=harness(),hero=h.heroButtons[2];let readyCalls=0;h.ready.onclick=()=>readyCalls++;
 assert.equal(h.ready.parentNode,h.dock.querySelector('.prep-thumb-actions'));assert.equal(h.note.parentNode,h.formation);
 h.details.open=true;const rosterDetails=h.formation.querySelector('.prep-thumb-roster');rosterDetails.open=true;
 hero.focus();for(let i=0;i<20;i++){h.controller.update();h.flush();}
 assert.equal(h.doc.activeElement,hero);assert.equal(h.heroButtons[2],hero);assert.equal(h.details.open,true);assert.equal(rosterDetails.open,true);
 assert.equal(h.roster.parentNode,rosterDetails);assert.equal(h.note.textContent,'Warnings stay here');
 h.clock.textContent='00:01';h.controller.update();h.flush();assert.equal(h.clock.textContent,'00:01');assert.equal(h.dock.querySelector('.prep-thumb-clock'),null);
 h.ready.click();assert.equal(readyCalls,1);h.note.textContent='⚠ Request failed';h.controller.update();assert.equal(h.note.textContent,'⚠ Request failed');
 assert.equal(h.portraits.length,5,'timer updates must not re-request portraits');
});
test('Ready errors reveal the original board note without adding dock text or stealing focus',()=>{
 const h=harness(),feedback=h.observers.find(observer=>observer.target===h.note);h.ready.focus();
 feedback.fn();assert.equal(h.note.scrollOptions,undefined);
 h.note.textContent='⚠ Diziliş gönderilemedi';feedback.fn();
 assert.deepEqual(h.note.scrollOptions,{block:'nearest',behavior:'auto'});assert.equal(h.doc.activeElement,h.ready);
 assert.equal(h.note.parentNode,h.formation);assert.equal(h.dock.children.length,2);
 h.note.scrollOptions=undefined;h.controller.destroy();feedback.fn();assert.equal(h.note.scrollOptions,undefined);
});
test('loading and locked guards prevent additional actions and unlock without rebuilding controls',()=>{
 const h=harness();h.state.loading=true;h.controller.update();h.heroButtons[0].onclick();assert.equal(h.calls.length,0);
 h.state.loading=false;h.controller.update();h.heroButtons[0].click();assert.equal(h.calls.length,1);
 h.state.locked=true;h.controller.update();h.flush();assert.equal(h.dock.hidden,true);assert.equal(h.ready.parentNode,h.formation);assert.equal(h.note.parentNode,h.formation);
 assert.equal(h.doc.documentElement.classList.contains('prep-thumb-fixed'),false);
});
test('last hero, rapid taps and all-front manual formation retain five unique positions',()=>{
 const h=harness();h.heroButtons[4].click();h.heroButtons[4].click();assert.equal(h.state.selectedHero,null);assert.deepEqual(h.state.positions,[null,null,null,null,null]);
 for(let i=0;i<5;i++){h.heroButtons[i].click();h.boardPlace(i);}
 assert.deepEqual(h.state.positions,[0,1,2,3,4]);
 for(let i=2;i<5;i++)h.boardLane(i,'front');
 assert.deepEqual(h.state.lanes,['front','front','front','front','front']);assert.equal(new Set(h.state.positions).size,5);
});
test('Ready focus and authoritative node survive repeated compact/desktop crossings',()=>{
 const h=harness();h.ready.focus();
 for(let i=0;i<8;i++){h.media.matches=!h.media.matches;h.media.fire('change');h.flush();assert.equal(h.doc.activeElement,h.ready);assert.equal(h.doc.getElementById('apply-roles'),h.ready);}
 assert.equal(h.ready.parentNode,h.dock.querySelector('.prep-thumb-actions'));
});
test('overlay, keyboard and large-text fallbacks reserve no fixed clearance and preserve original roster on desktop',()=>{
 const h=harness();assert.equal(h.doc.documentElement.style.values['--prep-thumb-clearance'],'282px');
 h.doc.overlays=[h.doc.createElement('dialog')];h.doc.fire('toggle');h.flush();assert.equal(h.dock.classList.contains('is-fixed'),false);
 h.doc.overlays=[];h.doc.activeElement=h.doc.createElement('textarea');h.win.visualViewport.height=650;h.doc.fire('focusin');h.flush();assert.equal(h.dock.classList.contains('is-fixed'),false);
 h.doc.activeElement=h.doc.body;h.win.visualViewport.height=800;h.doc.dockHeight=400;h.win.fire('resize');h.flush();assert.equal(h.dock.classList.contains('is-fixed'),false);
 h.doc.dockHeight=270;h.win.fire('resize');h.flush();assert.equal(h.dock.classList.contains('is-fixed'),true);
 h.heroButtons[0].focus();h.media.matches=false;h.media.fire('change');h.flush();assert.equal(h.doc.activeElement,h.ready);assert.equal(h.roster.parentNode,h.formation);assert.equal(h.ready.parentNode,h.formation);assert.equal(h.doc.documentElement.style.values['--prep-thumb-clearance'],'0px');
});
test('replacing verified hero identity detaches stale async portrait targets',()=>{
 const h=harness(),old=h.portraits[0].container;h.state.heroes[0]={name:'Verified hero',artKey:'verified'};h.controller.update();
 assert.equal(old.isConnected,false);const next=h.portraits.at(-1).container;assert.equal(next.isConnected,true);assert.notEqual(old,next);
 if(old.isConnected)old.append(h.doc.createElement('img'));assert.equal(old.children.length,0);
});
test('destroy restores authoritative nodes and disconnects every observer/listener even with queued layout',()=>{
 const h=harness();h.controller.update();h.controller.destroy();h.flush();
 assert.equal(h.formation.querySelector('.prep-thumb-dock'),null);assert.equal(h.roster.parentNode,h.formation);assert.equal(h.ready.parentNode,h.formation);assert.equal(h.note.parentNode,h.formation);
 assert.ok(h.observers.every(observer=>observer.disconnected));assert.ok([...h.board.listeners.values(),...h.doc.listeners.values(),...h.win.listeners.values(),...h.media.listeners.values(),...h.win.visualViewport.listeners.values()].every(set=>set.size===0));
 assert.equal(h.doc.documentElement.style.values['--prep-thumb-clearance'],undefined);h.controller.update();h.flush();
});
test('integration is prep-only, keeps combat cleanup, and portal imports stay platform-relative',()=>{
 assert.match(source,/if\(!arenaMode\)preparationDock=createPreparationThumbDock/);
 assert.match(source,/arenaMode=true;\s*preparationDock\?\.destroy\(\);preparationDock=null;/);
 assert.match(crazyGamesSource(source,'.js'),/from '\/crazygames\/preparation-thumb-dock.js'/);
 assert.match(source,/aria-label','Konum '\+\(slot\+1\)/);
 const block=css.slice(css.indexOf('/* One-hand preparation'));
 assert.match(block,/min-width:44px;min-height:44px/);assert.match(block,/\.prep-thumb-fixed #prep-note\{scroll-margin-bottom:/);assert.match(block,/button.selected::after\{content:"✓"/);assert.match(block,/\.prep-thumb-actions\{display:grid;grid-template-columns:1fr\}/);assert.match(block,/\.prep-thumb-fixed body\{padding-bottom:var\(--prep-thumb-clearance/);
 assert.match(block,/\.prep-thumb-dock\{[^}]*padding-bottom:max\(8px,env\(safe-area-inset-bottom\)\)/);
 assert.doesNotMatch(block,/\.is-fixed\{[^}]*padding-bottom/,'safe-area padding must not change between fixed/inline and trigger resize oscillation');
 assert.doesNotMatch(block,/overflow\s*:\s*(?:hidden|clip).*body|height\s*:\s*100(?:d?vh|%)/);
});
