import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountSupportMenu} from '../public/support-menu.js';
import {mountModerationUI} from '../public/moderation.js';
import {crazyGamesSource} from '../crazygames-build.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function fixture(){
 const doc=new EventTarget(),win=new EventTarget(),menu=new EventTarget();
 const trigger={focus(){doc.activeElement=trigger;focusCalls++;}},input={},link={},outside={};let focusCalls=0;
 const moderation={open:false};Object.assign(menu,{open:false,contains:target=>[menu,trigger,input,link,moderation].includes(target)});
 doc.getElementById=id=>({'support-menu':menu,'support-menu-trigger':trigger,'moderation-panel':moderation}[id]);
 doc.activeElement=outside;
 const ui=mountSupportMenu({document:doc,window:win});
 function event(type,target=outside,extra={}){const e=new Event(type,{cancelable:true});for(const [key,value]of Object.entries({target,...extra}))Object.defineProperty(e,key,{value});doc.dispatchEvent(e);return e;}
 return {doc,win,menu,trigger,input,link,outside,moderation,ui,event,focusCalls:()=>focusCalls};
}
test('support is closed initially; repeated mouse, touch/pen and keyboard outside interactions dismiss without stealing focus',()=>{
 const f=fixture();assert.equal(f.menu.open,false);
 for(let repeat=0;repeat<3;repeat++)for(const [type,extra]of [['pointerdown',{pointerType:'mouse'}],['pointerdown',{pointerType:'touch'}],['pointerdown',{pointerType:'pen'}],['click',{}],['focusin',{}]]){
  f.menu.open=true;f.moderation.open=true;f.event(type,f.outside,extra);
  assert.equal(f.menu.open,false);assert.equal(f.moderation.open,false);assert.equal(f.focusCalls(),0);
 }
 f.ui.destroy();
});
test('report inputs, select/dialog controls, credits and native summary remain usable inside support',()=>{
 const f=fixture();f.menu.open=true;
 for(const target of [f.menu,f.trigger,f.input,f.link,f.moderation])for(const type of ['pointerdown','click','focusin']){
  f.event(type,target);assert.equal(f.menu.open,true);
 }
 f.ui.destroy();
});
test('Escape restores summary focus only from within support and ignores unrelated keys',()=>{
 const f=fixture();f.menu.open=true;f.doc.activeElement=f.input;
 assert.equal(f.event('keydown',f.input,{key:'Enter'}).defaultPrevented,false);assert.equal(f.menu.open,true);
 assert.equal(f.event('keydown',f.input,{key:'Escape'}).defaultPrevented,true);assert.equal(f.menu.open,false);assert.equal(f.doc.activeElement,f.trigger);assert.equal(f.focusCalls(),1);
 f.menu.open=true;f.doc.activeElement=f.outside;assert.equal(f.event('keydown',f.outside,{key:'Escape'}).defaultPrevented,false);assert.equal(f.focusCalls(),1);assert.equal(f.menu.open,false);
 f.ui.destroy();
});
test('closing summary, identity change, navigation and back-forward restore clear expanded state without changing drafts',()=>{
 const f=fixture();f.input.value='unfinished report';
 f.menu.open=false;f.moderation.open=true;f.menu.dispatchEvent(new Event('toggle'));assert.equal(f.moderation.open,false);
 for(const type of ['pagehide','pageshow','popstate','hashchange','hero:login-changed']){
  f.menu.open=true;f.moderation.open=true;f.win.dispatchEvent(new Event(type));assert.equal(f.menu.open,false);assert.equal(f.moderation.open,false);
 }
 assert.equal(f.input.value,'unfinished report');f.ui.destroy();
});
test('destroy removes listeners and missing support elements safely do nothing',()=>{
 const f=fixture();f.ui.destroy();f.menu.open=true;f.event('click');assert.equal(f.menu.open,true);f.win.dispatchEvent(new Event('pagehide'));assert.equal(f.menu.open,true);
 assert.equal(mountSupportMenu({document:{getElementById:()=>null},window:{}}),undefined);
});
test('web and portal documents have one closed support entry with static reachable attribution, without permanent credits or report footer',()=>{
 for(const page of ['index','battle-preview']){
  const original=read(`public/${page}.html`);
  for(const html of [original,crazyGamesSource(original,'.html')]){
   assert.equal((html.match(/id="support-menu"/g)||[]).length,1);assert.match(html,/<details id="support-menu" class="support-menu">/);
   assert.match(html,/<summary id="support-menu-trigger">Yardım \/ (?:Bildir|Bilgi)<\/summary>/);
   assert.match(html,/<div class="support-menu-content"><a href="\/(?:crazygames\/)?music-credits.html" target="_blank" rel="noopener">♫ Müzik kredileri<\/a>/);
   assert.match(html,/src="\/(?:crazygames\/)?support-menu.js"/);assert.match(html,/href="\/support-menu.css"/);
   assert.doesNotMatch(html,/arena-audio-credits|Güvenlik · Engelle \/ Şikâyet et/);
  }
  assert.match(original,/<\/main><footer class="(?:site|arena)-support"><details id="support-menu"/);
  const portal=crazyGamesSource(original,'.html');assert.match(portal,/>Yardım \/ Bilgi</);assert.doesNotMatch(portal,/src="[^\"]*moderation.js"/);
 }
 const source=read('public/moderation.js');assert.match(source,/host.append\(panel\)/);assert.doesNotMatch(source,/doc.body.append/);
 assert.match(read('public/support-menu.css'),/min-height:44px/);assert.doesNotMatch(read('public/support-menu.css'),/position:\s*fixed/);
});
test('moderation cannot recreate the repeated body footer when there is no support host',()=>{
 let appended=false;const result=mountModerationUI({document:{getElementById:()=>null,body:{append(){appended=true}}},window:{}});
 assert.equal(result,undefined);assert.equal(appended,false);
});
