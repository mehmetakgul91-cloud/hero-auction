import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAccountPopover} from '../public/account-popover.js';
import {crazyGamesSource} from '../crazygames-build.js';

function fixture(){
 const doc=new EventTarget(),win=new EventTarget();let allowed=true;
 class Node extends EventTarget{
  hidden=false;attrs={};
  setAttribute(k,v){this.attrs[k]=v;}
  focus(){doc.activeElement=this;}
 }
 const trigger=new Node(),panel=new Node(),root=new Node(),portrait=new Node(),outside=new Node();
 root.contains=target=>[root,trigger,panel,portrait].includes(target);
 doc.getElementById=id=>({'account-status':trigger,'google-logout':panel,'account-bar':root})[id];
 const ui=createAccountPopover({document:doc,window:win,canOpen:()=>allowed});
 function emit(type,target=outside,props={}){
  const event=new Event(type,{cancelable:true});Object.assign(event,props);
  Object.defineProperty(event,'target',{value:target});event.composedPath=()=>root.contains(target)?[target,root,doc]:[target,doc];
  doc.dispatchEvent(event);return event;
 }
 const click=()=>trigger.dispatchEvent(new Event('click'));
 return {doc,win,trigger,panel,root,portrait,outside,ui,emit,click,setAllowed:value=>allowed=value};
}
const closed=f=>{assert.equal(f.panel.hidden,true);assert.equal(f.trigger.attrs['aria-expanded'],'false');};
const open=f=>{assert.equal(f.panel.hidden,false);assert.equal(f.trigger.attrs['aria-expanded'],'true');};
test('initially closed and repeated native button activation always toggles once',()=>{
 const f=fixture();closed(f);
 for(let i=0;i<20;i++){f.click();open(f);f.emit('pointerdown',f.portrait);open(f);f.emit('click',f.trigger);f.click();closed(f);}
});
for(const pointerType of ['mouse','touch','pen'])test(pointerType+' outside press closes without cancelling another control or stealing focus',()=>{
 const f=fixture();f.click();f.outside.focus();
 const event=f.emit('pointerdown',f.outside,{pointerType});closed(f);assert.equal(event.defaultPrevented,false);assert.equal(f.doc.activeElement,f.outside);
 f.click();open(f);f.emit('pointerdown',f.panel,{pointerType});open(f);
});
test('inside logout pointer and click are not swallowed and preserve its action',()=>{
 const f=fixture();let logouts=0;f.panel.addEventListener('click',()=>logouts++);
 f.click();f.emit('pointerdown',f.panel);f.emit('click',f.panel);f.panel.dispatchEvent(new Event('click'));
 assert.equal(logouts,1);open(f);
});
test('Escape closes and returns focus; unrelated keys and closed Escape are untouched',()=>{
 const f=fixture();f.click();f.panel.focus();assert.equal(f.emit('keydown',f.panel,{key:'Enter'}).defaultPrevented,false);open(f);
 assert.equal(f.emit('keydown',f.panel,{key:'Escape'}).defaultPrevented,true);closed(f);assert.equal(f.doc.activeElement,f.trigger);
 assert.equal(f.emit('keydown',f.outside,{key:'Escape'}).defaultPrevented,false);
});
test('Tab focus can reach logout; moving to another control closes without focus trapping',()=>{
 const f=fixture();f.click();f.panel.focus();f.emit('focusin',f.panel);open(f);
 f.outside.focus();f.emit('focusin',f.outside);closed(f);assert.equal(f.doc.activeElement,f.outside);
});
test('keyboard/synthetic outside clicks close before other menu actions without preventing them',()=>{
 const f=fixture();f.click();const event=f.emit('click',f.outside,{detail:0});closed(f);assert.equal(event.defaultPrevented,false);
});
for(const type of ['pagehide','pageshow','popstate','hashchange','hero:login-changed'])test(type+' resets expanded state without logout',()=>{
 const f=fixture();f.click();f.win.dispatchEvent(new Event(type));closed(f);f.click();open(f);
});
test('background closes; visible document and valid inside focus do not',()=>{
 const f=fixture();f.click();f.doc.hidden=false;f.emit('visibilitychange');open(f);f.doc.hidden=true;f.emit('visibilitychange');closed(f);
});
test('signed-out/platform guard or hidden account cannot expose stale logout',()=>{
 const f=fixture();f.setAllowed(false);f.click();closed(f);f.setAllowed(true);f.trigger.hidden=true;f.click();closed(f);
 f.trigger.hidden=false;f.click();open(f);f.setAllowed(false);f.click();closed(f);
});
test('destroy removes all lifecycle handlers and leaves a closed disclosure',()=>{
 const f=fixture();f.click();f.ui.destroy();closed(f);f.click();closed(f);
 f.panel.hidden=false;f.emit('pointerdown');assert.equal(f.panel.hidden,false);f.win.dispatchEvent(new Event('pagehide'));assert.equal(f.panel.hidden,false);
});
test('actual app wires shared web and portal entrypoints without changing logout code',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/createAccountPopover\(\{document,window,canOpen:\(\)=>!window.HeroPlatform&&signedIn\(\)\}\)/);
 assert.match(crazyGamesSource(app,'.js'),/from '\/crazygames\/account-popover.js'/);
 assert.match(app,/\$\('google-logout'\)\.onclick=\(\)=>\{login=null;localStorage.removeItem\('hero-auction-login'\)/);
});
