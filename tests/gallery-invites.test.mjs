import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGalleryInvites} from '../public/gallery-invites.js';
import {crazyGamesSource} from '../crazygames-build.js';

const guest={type:'guest',user:{name:'Fixture guest'},authToken:'fixture-login'};
const portalLogin={type:'crazygames',user:{sub:'crazygames:fixture:one',name:'Fixture portal'},authToken:'stored-portal'};
const seat={code:'456',token:'fixture-seat'},room={code:'456',me:0,phase:'auction',players:[{},{}]};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
function fixture({saved=guest,savedSeat=seat,platform=null,fetcher,real=false}={}){
 const storage=new Map(),events=new Map(),timers=new Map(),calls=[],order=[],controls={};let id=0;
 if(saved!==null)storage.set('hero-auction-login',typeof saved==='string'?saved:JSON.stringify(saved));
 if(savedSeat!==null)storage.set('hero-auction-session',typeof savedSeat==='string'?savedSeat:JSON.stringify(savedSeat));
 const nodes=Object.fromEntries(['room-invites','room-invites-list','room-invites-summary','room-invites-message','room-invites-next','room-invites-history','room-invites-announcement'].map(id=>[id,new Element()]));
 const doc={getElementById:id=>nodes[id],createElement:()=>new Element(),documentElement:{lang:'tr'},activeElement:null};
 const win={HeroPlatform:platform,crypto:{randomUUID:()=> 'fixture-tab'},localStorage:{getItem:key=>storage.get(key)??null,setItem(key,value){order.push('save');storage.set(key,value)}},
  fetch:async(path,options)=>{const body=JSON.parse(options.body);calls.push([path,body,options]);order.push(path);return fetcher?await fetcher(path,body):response(path==='/api/auth/check'?{user:{sub:'guest:fixture',name:'Fixture guest'}}:path==='/api/auth/crazygames'?{user:portalLogin.user,authToken:'verified-portal'}:path==='/api/state'?{room}:path==='/api/friends'?{friends:[],incoming:[],outgoing:[]}:path==='/api/friend/invitations'?{incoming:[],outgoing:[]}:{})},
  addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn)},removeEventListener:(name,fn)=>events.get(name)?.delete(fn),setInterval(fn){timers.set(++id,fn);return id},clearInterval:id=>timers.delete(id),location:{replace:url=>order.push('navigate:'+url)}};
 const factory=kind=>options=>{const control=controls[kind]={options,login:null,room:null,token:null,destroyed:false,setLogin(value){this.login=value},setRoom(value,token){this.room=value;this.token=token},destroy(){this.destroyed=true}};return control};
 const ui=createGalleryInvites({document:doc,window:win,...(real?{}:{createFriends:factory('friends'),createInvites:factory('invites')})});
 const emit=(name,event={})=>{for(const fn of [...events.get(name)||[]])fn(event)};
 return {ui,doc,win,nodes,storage,events,timers,calls,order,controls,emit};
}
class Element{
 constructor(){this.children=[];this.hidden=false;this.textContent='';this.attrs={}}
 append(...children){this.children.push(...children)}replaceChildren(...children){this.children=children}setAttribute(key,value){this.attrs[key]=value}contains(element){return this===element||this.children.some(child=>child.contains?.(element))}
}
const buttons=f=>f.nodes['room-invites-list'].children.flatMap(row=>row.children.filter(node=>typeof node.onclick==='function'));

test('gallery does nothing for absent, malformed, unknown or portal-only web login; never establishes accounts',async()=>{
 for(const saved of [null,'{bad',{}, {authToken:'x'}, {...guest,authToken:''},{...guest,type:'unknown'},portalLogin]){
  const f=fixture({saved});await f.ui.ready;assert.equal(f.calls.length,0);assert.equal(f.controls.invites.login,null);f.ui.destroy();
 }
});
test('stored identity is server-checked and source room verified before either controller starts',async()=>{
 let finish;const f=fixture({fetcher:(path,body)=>path==='/api/auth/check'?new Promise(resolve=>finish=()=>resolve(response({user:{sub:'guest:fixture',name:'Verified'}}))):response({room})});
 assert.equal(f.controls.friends.login,null);assert.equal(f.controls.invites.login,null);assert.deepEqual(f.calls.map(([path])=>path),['/api/auth/check']);finish();await f.ui.ready;
 assert.deepEqual(f.calls.map(([path])=>path),['/api/auth/check','/api/state']);assert.deepEqual(f.calls[1][1],{...seat,authToken:'fixture-login'});
 assert.equal(f.controls.friends.login.user.name,'Verified');assert.deepEqual(f.controls.invites.room,room);assert.equal(f.controls.invites.token,seat.token);assert.equal(f.controls.invites.options.canStart(),true);f.ui.destroy();
});
test('invalid and gone source seats are never erased, detached or used as unverified proof',async()=>{
 for(const savedSeat of [null,'{bad',{code:'456'},{code:'evil',token:'x'},seat]){
  const f=fixture({savedSeat,fetcher:path=>path==='/api/auth/check'?response({user:{sub:'guest:fixture'}}):response({},404)});await f.ui.ready;
  assert.equal(f.controls.invites.room,null);assert.equal(f.controls.invites.token,null);assert.ok(f.controls.invites.login);assert.deepEqual(f.order.filter(x=>x==='save'),[]);
  assert.ok(f.calls.every(([path])=>['/api/auth/check','/api/state'].includes(path)));f.ui.destroy();
 }
});
test('transient auth/room errors fail closed and online retries, without changing stored data',async()=>{
 for(const failure of ['/api/auth/check','/api/state']){
  let fail=true;const f=fixture({fetcher:path=>path===failure&&fail?response({},503):response(path==='/api/auth/check'?{user:{sub:'guest:fixture'}}:{room})});const original=[...f.storage];await f.ui.ready;
  assert.equal(f.controls.invites.login,null);assert.deepEqual([...f.storage],original);fail=false;f.emit('online');await tick();assert.ok(f.controls.invites.login);f.ui.destroy();
 }
});
test('SDK identity is awaited before any saved portal token or seat is used',async()=>{
 let identify;let watched=0;const platform={watchAccount(){watched++},identity:()=>new Promise(resolve=>identify=resolve)};
 const f=fixture({saved:portalLogin,platform});assert.equal(watched,1);assert.equal(f.calls.length,0);assert.equal(f.controls.invites.login,null);
 identify({kind:'user',credential:'opaque-fixture'});await f.ui.ready;
 assert.deepEqual(f.calls.map(([path])=>path),['/api/auth/crazygames','/api/state']);assert.deepEqual(f.calls[0][1],{credential:'opaque-fixture'});assert.equal(f.calls[1][1].authToken,'verified-portal');assert.equal(f.controls.invites.login.authToken,'verified-portal');
 assert.equal(f.storage.get('hero-auction-login'),JSON.stringify(portalLogin),'gallery never persists a newly verified login');f.ui.destroy();
});
test('portal mismatch/verification failure never activates controllers or replaces stored login/session',async()=>{
 for(const {saved,identity,result,status} of [
  {saved:portalLogin,identity:{kind:'user',credential:'opaque'},result:{user:{sub:'crazygames:fixture:other'},authToken:'other'}},
  {saved:portalLogin,identity:{kind:'guest'}},
  {saved:guest,identity:{kind:'user',credential:'opaque'}},
  {saved:null,identity:{kind:'user',credential:'opaque'}},
  {saved:portalLogin,identity:{kind:'user',credential:'opaque'},result:{},status:401}
 ]){
  const f=fixture({saved,platform:{identity:async()=>identity},fetcher:()=>response(result,status)}),original=[...f.storage];await f.ui.ready;
  assert.equal(f.controls.invites.login,null);assert.deepEqual([...f.storage],original);assert.equal(f.calls.some(([path])=>path==='/api/state'),false);f.ui.destroy();
 }
});
test('existing portal guest is checked without creating a guest or requesting user login',async()=>{
 const f=fixture({platform:{identity:async()=>({kind:'guest'})}});await f.ui.ready;
 assert.deepEqual(f.calls.map(([path])=>path),['/api/auth/check','/api/state']);assert.equal(f.controls.invites.login.type,'guest');f.ui.destroy();
});
test('account change during SDK identity or state verification cannot activate old results',async()=>{
 for(const stage of ['identity','state']){
  let release;const platform=stage==='identity'?{identity:()=>new Promise(resolve=>release=()=>resolve({kind:'user',credential:'old'}))}:null;
  const f=fixture({saved:platform?portalLogin:guest,platform,fetcher:path=>path==='/api/state'?new Promise(resolve=>release=()=>resolve(response({room}))):response({user:{sub:'guest:fixture'}})});
  await tick();f.storage.delete('hero-auction-login');f.emit('storage',{key:'hero-auction-login'});release();await f.ui.ready;
  assert.equal(f.controls.invites.login,null);assert.equal(f.controls.friends.login,null);assert.equal(f.order.includes('save'),false);f.ui.destroy();
 }
});
test('source-session races disable actions immediately even before a storage event, and invalidate stale restore',async()=>{
 let release;const f=fixture({fetcher:path=>path==='/api/state'?new Promise(resolve=>release=()=>resolve(response({room}))):response({user:{sub:'guest:fixture'}})});await tick();f.storage.set('hero-auction-session',JSON.stringify({code:'789',token:'newer'}));release();await f.ui.ready;assert.equal(f.controls.invites.login,null);f.ui.destroy();
 const ready=fixture();await ready.ui.ready;ready.storage.set('hero-auction-session','changed');assert.equal(ready.controls.invites.options.canStart(),false);assert.throws(()=>ready.controls.invites.options.onJoined({token:'new',room:{code:'123'}}),/Aktif odan/);assert.equal(ready.storage.get('hero-auction-session'),'changed');ready.ui.destroy();
});
test('BFCache hides stop controllers, delayed responses cannot resume, and pageshow rechecks before use',async()=>{
 const f=fixture();await f.ui.ready;f.emit('pagehide');assert.equal(f.controls.invites.login,null);assert.equal(f.controls.friends.login,null);
 const count=f.calls.length;for(const timer of f.timers.values())timer();assert.equal(f.calls.length,count);
 f.emit('pageshow');assert.equal(f.controls.invites.login,null);await tick();assert.equal(f.calls.length,count+2);assert.ok(f.controls.invites.login);
 f.ui.destroy();assert.equal(f.controls.invites.destroyed,true);assert.equal(f.controls.friends.destroyed,true);assert.equal(f.timers.size,0);assert.ok([...f.events.values()].every(set=>set.size===0));
});
test('server-joined receipt saves then returns deferred home navigation; account changes cancel that callback',async()=>{
 for(const platform of [null,{identity:async()=>({kind:'guest'}),beforeNavigate:()=>{}}]){
  const f=fixture({platform});await f.ui.ready;const navigate=f.controls.invites.options.onJoined({token:'joined-seat',room:{code:'123'}});
  assert.equal(typeof navigate,'function');assert.deepEqual(JSON.parse(f.storage.get('hero-auction-session')),{token:'joined-seat',code:'123'});assert.equal(f.order.some(x=>x.startsWith('navigate:')),false);navigate();assert.equal(f.order.at(-1),'navigate:'+(platform?'/crazygames/':'/'));
  f.storage.delete('hero-auction-login');navigate();assert.equal(f.order.filter(x=>x.startsWith('navigate:')).length,1);f.ui.destroy();
 }
});
test('real shared controllers heartbeat only after verification and accept with restored proof/explicit fee consent',async()=>{
 let accepted=false;const invitation={id:'fixture-invite',code:'123',from:{name:'Fixture host',playerId:'HA-HOST'},status:'pending'};
 const f=fixture({real:true,fetcher:(path)=>response(path==='/api/auth/check'?{user:{sub:'guest:fixture'}}:path==='/api/state'?{room}:path==='/api/friends'?{friends:[],incoming:[],outgoing:[]}:path==='/api/friend/invitations'?{incoming:[{...invitation,status:accepted?'queued':'pending'}],outgoing:[]}:path==='/api/friend/invite/respond'?(accepted=true,{incoming:[{...invitation,status:'queued'}],outgoing:[]}):{})});
 await f.ui.ready;await tick();assert.equal(f.calls[0][0],'/api/auth/check');assert.equal(f.calls[1][0],'/api/state');assert.ok(f.calls.some(([path,body])=>path==='/api/friends/presence'&&body.online===true));assert.equal(f.nodes['room-invites'].hidden,false);
 assert.equal(f.calls.some(([path])=>path==='/api/friend/invite/respond'),false);buttons(f).find(button=>button.textContent==='Onayla').onclick();await tick();
 assert.deepEqual(f.calls.find(([path])=>path==='/api/friend/invite/respond')[1],{inviteId:'fixture-invite',response:'accept',consent:true,expectedCost:50,sourceCode:'456',sourceToken:'fixture-seat',authToken:'fixture-login'});assert.equal(f.order.some(x=>x.startsWith('navigate:')),false);assert.ok(buttons(f).some(button=>button.textContent==='VAZGEÇ'));f.ui.destroy();
});
test('real shared receipt handoff orders persisted server seat, ACK and navigation and rejects save failures',async()=>{
 const fetcher=path=>response(path==='/api/auth/check'?{user:{sub:'guest:fixture'}}:path==='/api/state'?{room}:path==='/api/friends'?{friends:[],incoming:[],outgoing:[]}:path==='/api/friend/invitations'?{incoming:[{id:'fixture-receipt',code:'123',status:'joined',token:'joined-seat',room:{code:'123'},from:{name:'Fixture host'}}],outgoing:[]}:{});
 const f=fixture({real:true,fetcher});await f.ui.ready;await tick();const save=f.order.indexOf('save'),ack=f.order.indexOf('/api/friend/invite/ack'),navigate=f.order.indexOf('navigate:/');assert.ok(save>=0&&ack>save&&navigate>ack);f.ui.destroy();
 const denied=fixture({real:true,fetcher});denied.win.localStorage.setItem=()=>{throw Error('Storage blocked')};await denied.ui.ready;await tick();assert.equal(denied.order.includes('/api/friend/invite/ack'),false);assert.equal(denied.order.includes('navigate:/'),false);denied.ui.destroy();
});
test('gallery markup includes same viewport card, announcer and bootstrap without replacing hero detail',()=>{
 const html=readFileSync(new URL('../public/kahramanlar.html',import.meta.url),'utf8');
 assert.match(html,/<body>\s*<p id="room-invites-announcement"[^>]+aria-live="polite"/);assert.ok(html.indexOf('id="room-invites"')<html.indexOf('<main'));
 assert.match(html,/room-invites\.css\?v=global-invites/);assert.match(html,/<script type="module" src="\/gallery-invites\.js/);assert.match(html,/<dialog id="hero-story-dialog"/);
 const transformed=crazyGamesSource(html,'.html');assert.match(transformed,/src="\/crazygames\/gallery-invites\.js/);
 const script=crazyGamesSource(readFileSync(new URL('../public/gallery-invites.js',import.meta.url),'utf8'),'.js');assert.match(script,/loginKey='hero-auction-cg-login',sessionKey='hero-auction-cg-session'/);
 assert.doesNotMatch(script,/\/api\/(?:auth\/guest|auth\/google|create|join|room\/detach)['"]/);assert.doesNotMatch(script,/requestPermission|Notification|\.focus\(/);
});

test('Leagues uses the same authenticated bridge, body-level overlay and CrazyGames entry',()=>{
 const html=readFileSync(new URL('../public/ligler.html',import.meta.url),'utf8');
 assert.match(html,/<body>\s*<p id="room-invites-announcement"[^>]+aria-live="polite"/);assert.ok(html.indexOf('id="room-invites"')<html.indexOf('<main'));
 assert.match(html,/room-invites\.css\?v=global-invites/);assert.match(html,/<script type="module" src="\/gallery-invites\.js/);assert.match(html,/class="league-shell"/);
 assert.match(crazyGamesSource(html,'.html'),/src="\/crazygames\/gallery-invites\.js/);
 const script=readFileSync(new URL('../public/gallery-invites.js',import.meta.url),'utf8');assert.match(script,/document.getElementById\('room-invites'\)\)createGalleryInvites\(\)/);
});
test('portal guest label cannot disguise another account type and server-checked sub must match stored identity',async()=>{
 for(const saved of [guest,{...guest,user:{sub:'guest:other'}}]){
  const f=fixture({saved,platform:{identity:async()=>({kind:'guest'})},fetcher:()=>response({user:{sub:'google:fixture'}})});await f.ui.ready;assert.equal(f.controls.invites.login,null);assert.equal(f.calls.some(([path])=>path==='/api/state'),false);f.ui.destroy();
 }
});
test('retry timer only rechecks an inactive session and pagehide blocks late authentication',async()=>{
 let resolve;const f=fixture({fetcher:path=>path==='/api/auth/check'?new Promise(r=>resolve=()=>r(response({user:{sub:'guest:fixture'}}))):response({room})});
 const count=f.calls.length;for(const timer of f.timers.values())timer();assert.equal(f.calls.length,count,'pending verification does not duplicate');f.emit('pagehide');resolve();await f.ui.ready;assert.equal(f.controls.invites.login,null);assert.equal(f.calls.some(([path])=>path==='/api/state'),false);f.ui.destroy();
 const ready=fixture();await ready.ui.ready;const settled=ready.calls.length;for(const timer of ready.timers.values())timer();assert.equal(ready.calls.length,settled,'shared controllers own active polling');ready.ui.destroy();
});
test('same-document account change and storage clear events revoke controllers before stale callback can navigate',async()=>{
 for(const event of ['hero:login-changed','hero:platform-auth','storage']){
  const f=fixture();await f.ui.ready;const navigate=f.controls.invites.options.onJoined({token:'joined',room:{code:'123'}});
  f.storage.delete('hero-auction-login');f.emit(event,{key:null});assert.equal(f.controls.invites.login,null);assert.equal(f.controls.friends.login,null);navigate();assert.equal(f.order.some(x=>x.startsWith('navigate:')),false);f.ui.destroy();
 }
});
