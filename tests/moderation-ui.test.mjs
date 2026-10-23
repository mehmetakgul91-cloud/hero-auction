import test from 'node:test';
import assert from 'node:assert/strict';
import {mountModerationUI} from '../public/moderation.js';
class Element extends EventTarget{
 constructor(tag){super();this.tag=tag;this.children=[];this.value='';this.textContent='';this.disabled=false;this.open=false}
 append(...nodes){this.children.push(...nodes)}replaceChildren(...nodes){this.children=[...nodes]}setAttribute(){}remove(){}
 querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)])}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const body=new Element('body'),document={body,getElementById:()=>null,createElement:tag=>new Element(tag)};let token='first',resolve;
 const window=new EventTarget();Object.assign(window,{localStorage:{getItem:()=>JSON.stringify({authToken:token})},fetch:()=>new Promise(r=>resolve=r),confirm:()=>true,setInterval:()=>1,clearInterval(){}});
 const ui=mountModerationUI({document,window});const panel=body.children[0],buttons=panel.querySelectorAll('button');return {ui,panel,window,buttons,setToken:value=>token=value,resolve:body=>resolve({ok:true,json:async()=>body})};
}
test('late moderation response after identity switch never renders prior account metadata',async()=>{
 const f=fixture();f.buttons[2].onclick();await tick();f.setToken('second');f.resolve({blocked:[{playerId:'HA-SECRET',name:'Private previous identity'}],reports:[]});await tick();
 const list=f.panel.children.at(-1);assert.equal(list.children.length,0);assert.equal(f.panel.children.at(-2).textContent,'');f.ui.destroy();
});
test('same-tab identity notification immediately clears existing moderation state',async()=>{
 const f=fixture();f.buttons[2].onclick();await tick();f.resolve({blocked:[{playerId:'HA-FIRST',name:'Old identity block'}],reports:[]});await tick();const list=f.panel.children.at(-1);assert.ok(list.children.length);
 f.setToken(null);f.window.dispatchEvent(new Event('hero:login-changed'));assert.equal(list.children.length,0);assert.equal(f.panel.open,false);f.ui.destroy();
});
