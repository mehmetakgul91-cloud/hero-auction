import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {crazyGamesSource} from '../crazygames-build.js';
const source=fs.readFileSync(new URL('../public/platform.js',import.meta.url),'utf8');
const key='hero-auction-cg-loading-navigation-v1';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
function page({store=storage(),url='https://game.test/crazygames/',referrer='https://developer.crazygames.com/',type='navigate',sdkFailure=false,storageBlocked=false}={}){
 const calls=[],events={},domEvents={};let script,timer;const location=new URL(url);
 const sdk={environment:'crazygames',init:async()=>{if(sdkFailure)throw Error('unavailable')},game:{loadingStart:()=>calls.push('loadingStart'),loadingStop:()=>calls.push('loadingStop'),gameplayStart:()=>calls.push('gameplayStart'),gameplayStop:()=>calls.push('gameplayStop'),settings:{},updateRoom:r=>calls.push(['room',r]),leftRoom:()=>{},addSettingsChangeListener(){}}};
 const window={location,sessionStorage:storageBlocked?{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}}:store,performance:{getEntriesByType:()=>[{type}]},CrazyGames:{SDK:sdk},dispatchEvent(){},addEventListener:(name,fn)=>events[name]=fn};
 const document={referrer,readyState:'loading',addEventListener:(name,fn)=>domEvents[name]=fn,documentElement:{classList:{toggle(){}}},createElement:()=>({}),head:{append:x=>script=x}};
 const context=vm.createContext({window,document,URL,Date,console,CustomEvent:class{},setTimeout:fn=>(timer=fn,1),clearTimeout(){}});
 vm.runInContext(source,context);
 return {platform:window.HeroPlatform,window,document,events,domEvents,calls,store,sdk,context,init:()=>script.onload(),fail:()=>script.onerror(),timeout:()=>timer()};
}
const loading=p=>p.calls.filter(x=>typeof x==='string'&&x.startsWith('loading'));
test('true initial boot has one paired load report even with repeated ready callbacks',async()=>{
 const p=page();p.platform.loaded();p.platform.loaded();assert.deepEqual(p.calls,[]);await p.init();
 assert.deepEqual(loading(p),['loadingStart','loadingStop']);p.platform.loaded();p.platform.loaded();assert.deepEqual(loading(p),['loadingStart','loadingStop']);
 vm.runInContext(source,p.context);assert.equal(p.window.HeroPlatform,p.platform);
});
test('explicit auction -> formation -> menu -> gallery navigation keeps one game boot',async()=>{
 const store=storage();let p=page({store});await p.init();assert.deepEqual(loading(p),['loadingStart']);p.platform.loaded();p.platform.gameplay(true);
 let all=[...loading(p)];
 for(const path of ['battle-preview.html?auctionCode=123&auctionToken=seat','index.html','kahramanlar.html','ligler.html']){
  const from=p.window.location.href,to='https://game.test/crazygames/'+path;
  assert.equal(p.platform.beforeNavigate(to),true);assert.ok(store.getItem(key));
  p=page({store,url:to,referrer:from});assert.equal(store.getItem(key),null);await p.init();p.platform.loaded();p.platform.loaded();
  all.push(...loading(p));assert.deepEqual(loading(p),[]);
 }
 assert.deepEqual(all,['loadingStart','loadingStop']);
});
test('reloads, external entry, wrong destinations, stale/corrupt tickets never skip a real boot',async()=>{
 for(const variation of ['reload','back_forward','external','wrong','stale','corrupt']){
  const store=storage(),p=page({store});await p.init();p.platform.loaded();p.platform.beforeNavigate('/crazygames/kahramanlar.html');
  if(variation==='stale'){const t=JSON.parse(store.getItem(key));t.at-=60001;store.setItem(key,JSON.stringify(t))}
  if(variation==='corrupt')store.setItem(key,'bad json');
  const next=page({store,url:'https://game.test/crazygames/'+(variation==='wrong'?'ligler.html':'kahramanlar.html'),referrer:variation==='external'?'https://developer.crazygames.com/':p.window.location.href,type:['reload','back_forward'].includes(variation)?variation:'navigate'});
  assert.equal(store.getItem(key),null);await next.init();next.platform.loaded();assert.deepEqual(loading(next),['loadingStart','loadingStop'],variation);
 }
});
test('failed SDK, blocked storage, and incomplete boot cannot manufacture a continuation',async()=>{
 for(const options of [{sdkFailure:true},{storageBlocked:true},{}]){
  const p=page(options);await p.init();if(options.sdkFailure||options.storageBlocked)p.platform.loaded();
  p.platform.beforeNavigate('/crazygames/kahramanlar.html');assert.equal(p.store.getItem(key),null);
 }
 const blocked=page({storageBlocked:true});await blocked.init();blocked.platform.loaded();blocked.platform.gameplay(true);assert.equal(blocked.platform.beforeNavigate('/crazygames/'),false);blocked.platform.beforeNavigate('/crazygames/kahramanlar.html');assert.equal(blocked.calls.at(-1),'gameplayStop');
 const p=page();p.sdk.game.loadingStop=()=>{throw Error('event failed')};await p.init();p.platform.loaded();p.platform.beforeNavigate('/crazygames/kahramanlar.html');assert.equal(p.store.getItem(key),null);
});
test('SDK timeout followed by late initialization still reports the real initial pair once',async()=>{
 const p=page();p.timeout();await p.platform.ready;p.platform.loaded();assert.deepEqual(loading(p),[]);await p.init();p.platform.loaded();assert.deepEqual(loading(p),['loadingStart','loadingStop']);
});
test('internal link handler respects cancelled, modified, new-tab, download and hash navigation',async()=>{
 const p=page();await p.init();p.platform.loaded();p.platform.gameplay(true);
 const link={href:'https://game.test/crazygames/kahramanlar.html',target:'',hasAttribute:()=>false};
 for(const change of [{defaultPrevented:true},{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1}]){
  p.domEvents.click({button:0,target:{closest:()=>link},...change});assert.equal(p.store.getItem(key),null);
 }
 for(const changedLink of [{...link,target:'_blank'},{...link,hasAttribute:()=>true},{...link,href:p.window.location.href+'#help'}]){p.domEvents.click({button:0,target:{closest:()=>changedLink}});assert.equal(p.store.getItem(key),null)}
 p.domEvents.click({button:0,target:{closest:()=>link}});assert.ok(p.store.getItem(key));assert.equal(p.calls.at(-1),'gameplayStop');
});
test('BFCache return resumes prior actual play without another loading report or focus handlers',async()=>{
 const p=page();await p.init();p.platform.loaded();p.platform.gameplay(true);p.platform.beforeNavigate('/crazygames/kahramanlar.html');
 p.platform.beforeNavigate('/crazygames/kahramanlar.html'); // repeated intent must retain the original playing state
 p.events.pageshow({persisted:true});assert.equal(p.calls.at(-1),'gameplayStart');assert.deepEqual(loading(p),['loadingStart','loadingStop']);
 assert.equal(p.events.pagehide,undefined);assert.equal(p.events.blur,undefined);
});
test('gallery/static readiness does not claim gameplay and internal routes prepare handoff',async()=>{
 const p=page({url:'https://game.test/crazygames/ligler.html'});p.domEvents.DOMContentLoaded();await p.init();assert.deepEqual(p.calls,['loadingStart','loadingStop']);
 const gallery=fs.readFileSync(new URL('../public/kahramanlar.js',import.meta.url),'utf8');assert.match(gallery,/aria-busy','false'\);window.HeroPlatform\?\.loaded\(\)/);
 const app=crazyGamesSource(fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),'.js');assert.match(app,/beforeNavigate\('\/crazygames\/battle-preview.html\?/);
 const battle=crazyGamesSource(fs.readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8'),'.js');assert.doesNotMatch(battle,/HeroPlatform.ready.then\(\(\)=>\{window.HeroPlatform.loaded/);
 assert.match(battle,/beforeNavigate\('\/crazygames\/'\);location.replace\('\/crazygames\/'\)/);
 assert.match(battle,/render\(\);window.HeroPlatform\?\.loaded\(\);window.HeroPlatform\?\.gameplay\(true\)/);
});
