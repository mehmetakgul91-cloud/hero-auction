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
  fetch:async(path,options)=>{requests.push({path,body:JSON.parse(options.body)});await new Promise(resolve=>release=resolve);return {ok:!reject,json:async()=>reject?{error:'offline'}:{ready:[true,false],started:false}}},enterArenaWithoutReload:url=>routes.push(url)};
 const code=source.slice(source.indexOf('async function lockFormation('),source.indexOf('const roleIcons='));
 runInNewContext(`let prepDone=false,prepSubmitting=false,auctionMode=true,auctionLoaded=${loaded},arenaMode=false,arenaMusicEnabled=false,arenaAudioPrimed=false;
 let prepTimer=null,prepDeadline=0;const preparationDraft={flush:()=>Promise.resolve(),clear(){}},preparationMatchKey='match:1',auctionCode='ROOM',auctionToken='TOKEN';
 ${code}
 this.actions={lockFormation,startPreparation,state:()=>({prepDone,prepSubmitting})}`,context);
 return {elements,requests,routes,actions:context.actions,advance(ms){now+=ms;tick?.()},release(){release()}};
}

test('automatic placement never confirms before Ready or timeout; 60-second timer submits exactly once',async()=>{
 const h=harness();h.actions.startPreparation();assert.equal(h.requests.length,0);
 h.advance(59000);await Promise.resolve();assert.equal(h.requests.length,0);
 h.advance(1000);await Promise.resolve();assert.equal(h.requests.length,1);
 h.advance(200);h.advance(200);await Promise.resolve();assert.equal(h.requests.length,1);
 h.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.actions.state().prepDone,true);
});

test('repeated Ready clicks create one match-bound confirmation and wait for the server',async()=>{
 const h=harness();const ready=h.actions.lockFormation();void h.actions.lockFormation();await Promise.resolve();
 assert.equal(h.requests.length,1);assert.equal(h.routes.length,0);assert.equal(h.actions.state().prepDone,false);
 assert.equal(h.requests[0].body.matchKey,'match:1');assert.deepEqual(h.requests[0].body.positions,[0,1,2,3,4]);
 h.release();await ready;assert.equal(h.routes.length,1);assert.match(h.routes[0],/room=arena/);assert.equal(h.actions.state().prepDone,true);
});

test('unloaded roster cannot Ready; rejected Ready leaves edits available without auto-confirm retry storm',async()=>{
 const unloaded=harness({loaded:false});await unloaded.actions.lockFormation();assert.equal(unloaded.requests.length,0);
 const h=harness({reject:true});h.actions.startPreparation();h.advance(60000);await Promise.resolve();h.release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.actions.state().prepDone,false);assert.equal(h.actions.state().prepSubmitting,false);assert.equal(h.elements.get('apply-roles').disabled,false);
 h.advance(5000);await Promise.resolve();assert.equal(h.requests.length,1);assert.equal(h.routes.length,0);
});

test('confirmed CG preparation signals loading complete before waiting for the opponent',()=>{
 const restoration=source.slice(source.indexOf(' if(preparation.ready){'),source.indexOf(" $('battle-lobby-status').textContent='Açık artırma kartların yüklendi"));
 const calls=[];runInNewContext(`function restore(){const preparation={ready:true};let prepDone=false,auctionLoaded=false,arenaMode=false;const auctionCode='ROOM',auctionToken='TOKEN';${restoration}}restore();`,{preparationDraft:{clear:()=>calls.push('clear')},window:{HeroPlatform:{loaded:()=>calls.push('loaded')}},enterArenaWithoutReload:()=>calls.push('arena'),encodeURIComponent});
 assert.deepEqual(calls,['clear','loaded','arena']);
});

test('new preparation storage stays portal-isolated and server errors translate',()=>{
 for(const name of ['preparation-draft.js','battle-preview.js']){
  const text=readFileSync(new URL('../public/'+name,import.meta.url),'utf8'),portal=crazyGamesSource(text,'.js');
  for(const key of ['preparation-draft','preview-draft'])if(text.includes('hero-auction-'+key))assert.ok(portal.includes('hero-auction-cg-'+key));
 }
 assert.equal(translate('Diziliş başka bir maça ait.'),'This formation belongs to another match.');
 assert.equal(translate('Hazır diziliş değiştirilemez.'),'A confirmed formation cannot be changed.');
});
