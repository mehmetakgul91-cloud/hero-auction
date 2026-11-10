import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {crazyGamesSource} from '../crazygames-build.js';
import {translate} from '../public/crazygames-en.js';
const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
function harness({loaded=true,reject=false}={}){
 const elements=new Map(),requests=[],routes=[];let release,now=100,tick;
 const context={Date:{now:()=>now},$:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id)},renderBoard(){},sessionStorage:{setItem(){}},encodeURIComponent,
  setInterval:fn=>{tick=fn;return 1},clearInterval(){},formationSnapshot:()=>({positions:[0,1,2,3,4],lanes:['front','back','back','front','back'],roles:['tank','energy','support','fighter','assassin']}),
  fetch:async(path,options)=>{requests.push({path,body:JSON.parse(options.body)});await new Promise(resolve=>release=resolve);return {ok:!reject,json:async()=>reject?{error:'offline'}:{ready:[true,false],started:false}}},enterArenaWithoutReload:url=>routes.push(url),showMatchCommanderPicker:()=>routes.push('room=commander')};
 const code=source.slice(source.indexOf('async function lockFormation('),source.indexOf('const roleIcons='));
 runInNewContext(`let prepDone=false,prepSubmitting=false,auctionMode=false,auctionLoaded=${loaded},arenaMode=false,arenaMusicEnabled=false,arenaAudioPrimed=false;
 let prepTimer=null,prepDeadline=0;const preparationDraft={flush:()=>Promise.resolve(),clear(){}},preparationMatchKey='match:1',auctionCode='ROOM',auctionToken='TOKEN',multiplayerCode='ROOM',multiplayerToken='TOKEN';
 ${code}
 this.actions={lockFormation,startPreparation,state:()=>({prepDone,prepSubmitting})}`,context);
 return {elements,requests,routes,actions:context.actions,advance(ms){now+=ms;tick?.()},release(){release()}};
}

test('standalone test-room placement waits for Ready or its 60-second timer and submits once',async()=>{
 const h=harness();h.actions.startPreparation();assert.equal(h.requests.length,0);
 h.advance(59000);await Promise.resolve();assert.equal(h.requests.length,0);
 h.advance(1000);await Promise.resolve();assert.equal(h.requests.length,1);
 h.advance(200);h.advance(200);await Promise.resolve();assert.equal(h.requests.length,1);
 h.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.actions.state().prepDone,true);
});

test('repeated Ready clicks create one match-bound confirmation and wait for the server',async()=>{
 const h=harness();const ready=h.actions.lockFormation();void h.actions.lockFormation();await Promise.resolve();
 assert.equal(h.requests.length,1);assert.equal(h.routes.length,0);assert.equal(h.actions.state().prepDone,false);
 assert.equal(h.requests[0].body.action,'ready');assert.deepEqual(h.requests[0].body.positions,[0,1,2,3,4]);
 h.release();await ready;assert.equal(h.routes.length,1);assert.match(h.routes[0],/room=arena/);assert.equal(h.actions.state().prepDone,true);
});

test('rejected standalone Ready leaves edits available without auto-confirm retry storm',async()=>{
 const h=harness({reject:true});h.actions.startPreparation();h.advance(60000);await Promise.resolve();h.release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.actions.state().prepDone,false);assert.equal(h.actions.state().prepSubmitting,false);assert.equal(h.elements.get('apply-roles').disabled,false);
 h.advance(5000);await Promise.resolve();assert.equal(h.requests.length,1);assert.equal(h.routes.length,0);
});

test('auction preparation never uses the standalone timeout or skips mandatory commander confirmation',async()=>{
 const code=source.slice(source.indexOf('async function lockFormation('),source.indexOf('const roleIcons='));
 let confirmations=0,timers=0;
 const context={matchCommanderPicker:{state:{confirm:async()=>confirmations++}},setInterval:()=>timers++};
 runInNewContext(`let auctionMode=true,auctionLoaded=false;${code};this.actions={lockFormation,startPreparation,load(){auctionLoaded=true}}`,context);
 context.actions.startPreparation();await context.actions.lockFormation();assert.equal(timers,0);assert.equal(confirmations,0);
 context.actions.load();await context.actions.lockFormation();assert.equal(confirmations,1);
});

test('confirmed CG preparation mounts the combined screen and signals loading complete there',()=>{
 assert.match(source,/if\(preparation.ready\)\{preparationDraft.clear\(\);prepDone=true;\}/);
 assert.match(source,/auctionLoaded=true;showMatchCommanderPicker\(\);return/);
 const mount=source.slice(source.indexOf('function showMatchCommanderPicker(){'),source.indexOf("window.addEventListener('pageshow',event=>"));
 assert.match(mount,/window.HeroPlatform\?\.loaded\(\)/);
 assert.match(mount,/mountCombinedPreparation/);
});

test('new preparation storage stays portal-isolated and server errors translate',()=>{
 for(const name of ['preparation-draft.js','battle-preview.js']){
  const text=readFileSync(new URL('../public/'+name,import.meta.url),'utf8'),portal=crazyGamesSource(text,'.js');
  for(const key of ['preparation-draft','preview-draft'])if(text.includes('hero-auction-'+key))assert.ok(portal.includes('hero-auction-cg-'+key));
 }
 assert.equal(translate('Diziliş başka bir maça ait.'),'This formation belongs to another match.');
 assert.equal(translate('Hazır diziliş değiştirilemez.'),'A confirmed formation cannot be changed.');
});
