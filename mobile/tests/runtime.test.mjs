import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {apiUrl,linkAction,readConfig} from '../src/policy.js';
const runtime=(await readFile(new URL('../src/runtime.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export function handleBack','function handleBack');
function harness(config={apiOrigin:'https://test.example',publicOrigin:'https://test.example'}){
 const nodes=new Map(),listeners=new Map(),requests=[],opened=[],events=[];
 let minimized=0;
 const window=new EventTarget();window.__HERO_NATIVE_CONFIG__=config;
 window.fetch=async(...args)=>{requests.push(args);return {ok:true}};
 window.EventSource=class {constructor(...args){this.args=args}};
 window.prompt=(...args)=>opened.push(args);
 const document=new EventTarget();document.readyState='loading';document.activeElement=null;
 document.getElementById=id=>nodes.get(id);
 document.querySelectorAll=selector=>selector==='dialog[open]'?[...nodes.values()].filter(x=>x.open&&x.kind==='dialog'):selector==='details[open]'?[...nodes.values()].filter(x=>x.open&&x.kind==='details'):[];
 document.createElement=()=>({setAttribute(){}});document.body={prepend(node){nodes.set(node.id,node)}};
 const location={origin:'https://localhost',pathname:'/',search:'',assign:url=>opened.push(url),replace:url=>opened.push(url)};
 const context=vm.createContext({window,document,location,Event,Request,URLSearchParams,apiUrl,linkAction,readConfig,Capacitor:{isNativePlatform:()=>true},App:{addListener:async(name,fn)=>listeners.set(name,fn),minimizeApp:async()=>{minimized++}},Browser:{open:async value=>opened.push(value)}});
 vm.runInContext(runtime,context);
 for(const name of ['hero:native-pause','hero:native-resume','pagehide','pageshow'])window.addEventListener(name,()=>events.push(name));
 const node=(id,props={})=>{const n={hidden:false,clicked:0,getClientRects(){return this.hidden?[]:[{}]},click(){this.clicked++},...props};nodes.set(id,n);return n};
 return {context,window,document,location,nodes,node,listeners,requests,opened,events,get minimized(){return minimized}};
}
test('fetch adapter rewrites POST/Request URL without changing auth body, denies redirects and cookies',async()=>{
 const h=harness();const body=JSON.stringify({authToken:'secret',name:'Tester'});
 await h.window.fetch('/api/auth/check',{method:'POST',body});
 assert.equal(h.requests[0][0],'https://test.example/api/auth/check');assert.equal(h.requests[0][1].body,body);assert.equal(h.requests[0][1].credentials,'omit');assert.equal(h.requests[0][1].redirect,'error');
 await h.window.fetch(new Request('https://localhost/api/state',{method:'POST',body}));
 assert.equal(h.requests[1][0].url,'https://test.example/api/state');assert.equal(await h.requests[1][0].text(),body);
 await h.window.fetch('/images/a.png');assert.equal(h.requests[2][0],'/images/a.png');
 const stream=new h.window.EventSource('/api/events?code=123&authToken=s');assert.equal(stream.args[0],'https://test.example/api/events?code=123&authToken=s');assert.equal(stream.args[1].withCredentials,false);
});
test('unconfigured preview never sends API fetch or SSE to placeholder/live server',async()=>{
 const h=harness({apiOrigin:'https://example.invalid',publicOrigin:'https://example.invalid'});
 await assert.rejects(h.window.fetch('/api/auth/guest'),/yapılandırılmadı/);
 assert.throws(()=>new h.window.EventSource('/api/events'),/yapılandırılmadı/);assert.equal(h.requests.length,0);
 const guest=h.node('guest-login');h.document.dispatchEvent(new Event('DOMContentLoaded'));
 assert.equal(guest.disabled,true);assert.match(h.nodes.get('native-status').textContent,/Henüz oynanabilir sürüm değil/);
});
test('Back dismisses keyboard, tutorial cancel, panels; repeated Back never detaches active game',()=>{
 const h=harness();const back=h.listeners.get('backButton');let blur=0;
 h.document.activeElement={matches:()=>true,blur:()=>blur++};back();assert.equal(blur,1);h.document.activeElement=null;
 let cancelled=0,closed=0;const dialog=h.node('guide',{kind:'dialog',open:true,dispatchEvent(){cancelled++;this.open=false;return false},close(){closed++}});back();assert.equal(cancelled,1);assert.equal(closed,0);
 const panel=h.node('friends-panel'),close=h.node('friends-close',{click(){this.clicked++;panel.hidden=true}});back();assert.equal(close.clicked,1);
 const game=h.node('game');h.node('native-status');back();back();assert.equal(h.minimized,0);assert.equal(h.requests.length,0);assert.match(h.nodes.get('native-status').textContent,/Maç korunuyor/);
 game.hidden=true;h.location.pathname='/battle-preview.html';h.location.search='?auctionCode=123';back();assert.equal(h.opened.length,0);
 h.location.search='';back();assert.equal(h.opened[0],'/');h.location.pathname='/';back();assert.equal(h.minimized,1);
});
test('native lifecycle bridges only real transitions without duplicated pause/resume',()=>{
 const h=harness(),change=h.listeners.get('appStateChange');assert.equal(h.window.HeroNative.active,true);change({isActive:false});assert.equal(h.window.HeroNative.active,false);change({isActive:false});change({isActive:true});change({isActive:true});
 assert.equal(h.window.HeroNative.active,true);assert.deepEqual(h.events,['hero:native-pause','pagehide','hero:native-resume','pageshow']);assert.equal(h.requests.length,0);
});
