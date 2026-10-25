import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('invitation is a safe-area-aware glass viewport card, not an in-flow banner or fullscreen blocking layer',()=>{
 const css=read('room-invites.css');assert.match(css,/\.room-invites\{position:fixed;/);assert.match(css,/env\(safe-area-inset-top/);assert.match(css,/right:max\(12px,env\(safe-area-inset-right/);assert.match(css,/z-index:12000/);assert.match(css,/backdrop-filter:blur\(18px\)/);assert.match(css,/pointer-events:none/);assert.match(css,/\.room-invite-surface\{[^}]*pointer-events:auto\}/);assert.match(css,/max-height:min\(320px,50dvh\)/);assert.match(css,/min-height:44px/);assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(css,/position:sticky|--room-invite-height|overflow-y:hidden|scroll-padding/);
});
test('both real documents mount the same overlay outside tab content; controller never scroll-locks or steals focus',()=>{
 const html=read('index.html'),arena=read('battle-preview.js'),ui=read('room-invites.js');
 assert.ok(html.indexOf('id="room-invites"')<html.indexOf('<main'));assert.match(arena,/document\.body\.prepend\(inviteBox\)/);assert.match(html,/room-invites\.css/);assert.match(read('battle-preview.html'),/room-invites\.css/);
 assert.doesNotMatch(ui,/scrollIntoView|scrollTo|\.focus\(|requestPermission|document\.body\.style|--room-invite-height/);assert.match(ui,/Onayla/);assert.match(ui,/Reddet/);assert.match(ui,/expectedCost:50/);
});

import {portalRoomInvites} from '../public/room-invites.js';
function portalFixture(){
 class Element{
  constructor(tag='div'){this.tag=tag;this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.open=false;this.modal=false;this.moves=0}
  append(item){if(item.parentNode)item.parentNode.children=item.parentNode.children.filter(child=>child!==item);this.children.push(item);item.parentNode=this;item.moves++}
  matches(selector){assert.equal(selector,':modal');return this.modal}
 }
 const body=new Element('body'),root=new Element(),announcement=new Element(),first=new Element('dialog'),second=new Element('dialog');for(const item of [root,announcement,first,second])body.append(item);
 let mutation,disconnected=false;const events={};const focus={id:'currently-focused-control'};
 const doc={body,activeElement:focus,querySelectorAll:()=>[first,second].filter(item=>item.open&&item.parentNode),addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name]};
 const win={MutationObserver:class{constructor(fn){mutation=fn}observe(target,options){assert.equal(target,body);assert.deepEqual(options.attributeFilter,['open'])}disconnect(){disconnected=true}}};
 const portal=portalRoomInvites({document:doc,window:win,root,announcement});
 return {body,root,announcement,first,second,doc,focus,events,portal,mutation:records=>mutation(records),get disconnected(){return disconnected}};
}
test('same invitation controls and announcer enter native modal top layer without focus or duplicate actions',()=>{
 const f=portalFixture(),action={onclick:()=>42};f.root.append(action);const initialMoves=f.root.moves;
 f.first.open=true;f.first.modal=true;f.mutation([{type:'attributes',target:f.first}]);
 assert.equal(f.root.parentNode,f.first);assert.equal(f.announcement.parentNode,f.first);assert.equal(f.root.children[0],action);assert.equal(action.onclick(),42);assert.equal(f.doc.activeElement,f.focus);
 f.mutation([{type:'childList',target:f.first}]);f.portal.sync();assert.equal(f.root.moves,initialMoves+1);
 f.first.open=false;f.first.modal=false;f.events.close({target:f.first});assert.equal(f.root.parentNode,f.body);assert.equal(f.announcement.parentNode,f.body);assert.equal(f.doc.activeElement,f.focus);
});
test('latest modal wins even if document order differs; nonmodal open dialogs never capture overlay',()=>{
 const f=portalFixture();f.second.open=true;f.portal.sync();assert.equal(f.root.parentNode,f.body);
 f.second.modal=true;f.mutation([{type:'attributes',target:f.second}]);assert.equal(f.root.parentNode,f.second);
 f.first.open=true;f.first.modal=true;f.mutation([{type:'attributes',target:f.first}]);assert.equal(f.root.parentNode,f.first);
 f.first.open=false;f.first.modal=false;f.portal.sync();assert.equal(f.root.parentNode,f.second);
 f.second.parentNode=null;f.portal.sync();assert.equal(f.root.parentNode,f.body);
});
test('destroy disconnects the portal and restores body mounting without changing dialog state',()=>{
 const f=portalFixture();f.first.open=true;f.first.modal=true;f.portal.sync();f.portal.destroy();assert.equal(f.disconnected,true);assert.equal(f.root.parentNode,f.body);assert.equal(f.announcement.parentNode,f.body);assert.equal(f.first.open,true);assert.deepEqual(f.events,{});
});
test('existing native modal ancestors do not establish a transformed fixed-position containing block',()=>{
 for(const [file,selector] of [['kahramanlar.css','.hero-story-dialog'],['first-match-guide.css','.first-match-guide']]){
  const rule=read(file).split(selector+'{')[1].split('}')[0];assert.doesNotMatch(rule,/transform:|contain:|filter:|perspective:/);
 }
});
