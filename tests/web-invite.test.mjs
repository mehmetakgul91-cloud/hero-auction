import {COMMANDER_CHANGE_COST} from '../public/commander-economy.js';
import {auctionMatchKey,isStaleAuctionSnapshot,createTailReceipts} from '../public/auction-delivery-state.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {createWebInvite,renderWebInvite} from '../public/web-invite.js';
import {createInviteSharer} from '../public/invite-share.js';
import {commanderAbilityStats,COMMANDER_START_ENERGY} from '../public/commander-ability-rules.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function controller(overrides={}){
 const calls={join:[],save:[],clear:0,restore:0,states:[]};
 let identity={ready:true,authToken:'a'};
 const c=createWebInvite({url:'https://game.test/?join=123',view:s=>calls.states.push(s),identity:()=>identity,
 validate:async()=>true,savedRoom:async()=>null,join:async code=>{calls.join.push(code);return {token:'seat',room:{code}}},
 save:(...a)=>calls.save.push(a),clearUrl:()=>calls.clear++,restore:()=>calls.restore++,...overrides});
 return {c,calls,setIdentity:v=>identity=v};
}
test('valid URL is pending, never autojoins; invalid/CG URLs ignored',()=>{
 for(const url of ['https://game.test/','https://game.test/?join=12','https://game.test/?join=1234','https://game.test/?join=abc'])assert.equal(controller({url}).c.pending,false);
 assert.equal(controller({platform:true}).c.pending,false);
 const {c,calls}=controller();c.sync();assert.equal(c.pending,true);assert.deepEqual(calls.join,[]);
});
test('explicit acceptance deduplicates through validation and request',async()=>{
 const gate=deferred(),{c,calls}=controller({validate:()=>gate.promise});
 const first=c.accept(),second=c.accept();assert.equal(calls.join.length,0);gate.resolve(true);await Promise.all([first,second]);
 assert.deepEqual(calls.join,['123']);assert.equal(calls.save.length,1);assert.equal(calls.clear,1);assert.equal(c.pending,false);
});
test('cancel during validation invalidates stale continuation and keeps cancelled',async()=>{
 const gate=deferred(),{c,calls}=controller({validate:()=>gate.promise});
 const first=c.accept();c.cancel();assert.equal(calls.states.at(-1).busy,false);gate.resolve(true);await first;c.sync();
 assert.equal(c.pending,false);assert.equal(calls.restore,1);assert.deepEqual(calls.join,[]);assert.equal(calls.states.at(-1).code,null);
});
test('cancel during saved-room lookup never joins after response',async()=>{
 const gate=deferred(),{c,calls}=controller({savedRoom:()=>gate.promise});const first=c.accept();await flush();c.cancel();gate.resolve(null);await first;assert.deepEqual(calls.join,[]);
});
test('a sent paid request cannot be cancelled or duplicated',async()=>{
 const gate=deferred(),{c,calls}=controller({join:()=>gate.promise});const first=c.accept();await flush();c.cancel();assert.equal(c.pending,true);assert.equal(calls.restore,0);await c.accept();gate.resolve({token:'x',room:{code:'123'}});await first;assert.equal(calls.save.length,1);
});
test('different existing room is not abandoned or charged; cancel resumes it',async()=>{
 const {c,calls}=controller({savedRoom:async()=>({token:'old',room:{code:'456',phase:'auction'}})});await c.accept();
 assert.deepEqual(calls.join,[]);assert.equal(calls.clear,0);assert.match(calls.states.at(-1).error,/Başka bir odan var \(456\)/);c.cancel();assert.equal(calls.restore,1);
});
test('existing target room resumes without new paid request',async()=>{
 const {c,calls}=controller({savedRoom:async()=>({token:'old',room:{code:'123'}})});await c.accept();assert.deepEqual(calls.join,[]);assert.equal(calls.save[0][0],'old');assert.equal(c.pending,false);
});
for(const message of ['Oda dolu.','Oda bulunamadı.','Oturumun sona erdi.','Altın yetersiz.'])test('error preserves invite and actionable message: '+message,async()=>{
 const {c,calls}=controller({join:async()=>{throw Error(message)}});await c.accept();assert.equal(c.pending,true);assert.equal(calls.clear,0);assert.ok(calls.states.at(-1).error.includes(message));assert.equal(calls.states.at(-1).busy,false);
});
test('account switch invalidates validation callback',async()=>{
 const gate=deferred(),f=controller({validate:()=>gate.promise});const p=f.c.accept();f.setIdentity({ready:true,authToken:'b'});gate.resolve(true);await p;assert.deepEqual(f.calls.join,[]);
});

// Execute the actual app entrypoint and auth/onboarding callbacks against a small
// DOM model. This tests lifecycle wiring, not browser layout or Google OAuth.
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function app({storedLogin=false,profile=null,saved=null,commanderGate=null,stateError=null,stateGate=null}={}){
 const elements=new Map();
 function element(id=''){
  const e={id,hidden:false,disabled:false,value:'',dataset:{},style:{},children:[],attrs:{},textContent:'',
   classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},
   after(...a){this.children.push(...a)},append(...a){this.children.push(...a)},replaceChildren(...a){this.children=a},addEventListener(){},scrollIntoView(){},querySelector(){return null},querySelectorAll(){return []},
   click(){if(!this.disabled)return this.onclick?.()}};return e;
 }
 for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){
  const e=element(tag[1]);e.hidden=/\bhidden\b/.test(tag[0]);e.disabled=/\bdisabled\b/.test(tag[0]);elements.set(e.id,e);
 }
 const $=id=>elements.get(id);
 const storage=new Map();if(storedLogin)storage.set('hero-auction-login',JSON.stringify({type:'guest',authToken:'auth',user:{name:'Tester'}}));
 if(saved)storage.set('hero-auction-session',JSON.stringify(saved));
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const location=new URL('https://game.test/?join=123&lang=tr#arena'),calls=[];
 const response=data=>({ok:true,json:async()=>data});
 const fetch=async(path,opts)=>{
  calls.push({path,body:opts?JSON.parse(opts.body):null});
  if(path==='/api/auth/guest'||path==='/api/auth/google')return response({user:{name:'Tester'},authToken:'auth',gold:100});
  if(path==='/api/auth/check')return response({gold:100});
  if(path==='/api/commander/get'){if(commanderGate)await commanderGate.promise;return response({profile,gold:100});}
  if(path==='/api/commander/select')return response({profile:{commanderId:'attack',levels:{attack:1}},gold:100});
  if(path==='/api/state'){if(stateGate)await stateGate.promise;if(stateError)return {ok:false,json:async()=>({error:stateError})};return response({room:{code:saved.code}});}
  if(path==='/api/join')return response({token:'seat',room:{code:'123'}});
  if(path==='/api/info')return response({catalogueCount:10});
  if(String(path).startsWith('https:'))return response({results:[]});
  return response({players:0,matches:0,waiting:0});
 };
 const document={addEventListener(){},getElementById:$,createElement:()=>element(),documentElement:{lang:'tr'},querySelector:()=>null};
 const context=createContext({COMMANDER_CHANGE_COST,auctionMatchKey,isStaleAuctionSnapshot,createTailReceipts,document,localStorage,sessionStorage:localStorage,location,history:{state:null,replaceState(_,__,url){location.href=new URL(url,location).href}},
  window:{location,addEventListener(){},scrollTo(){},matchMedia:()=>({matches:true})},URL,URLSearchParams,console,fetch,crypto:{randomUUID:()=> 'visitor'},
  setTimeout(){},setInterval(){},clearInterval(){},cancelAuctionReveal(){},commanderAbilityStats,COMMANDER_START_ENERGY,createWebInvite,renderWebInvite,createInviteSharer,createRoomInvitesUI:()=>({setLogin(){},setRoom(){},refresh(){},cancelRoomInvites:async()=>{}}),createFriendsUI:()=>({setLogin(){},setRoom(){},open(){},close(){}}),navigator:{},
  EventSource:class{close(){}},collectTailAwards:()=>[],collectOfferedAwards:()=>[],confirm:()=>true});
 runInContext(source,context);
 // Rendering a battle is outside this fixture; retain actual save/connect/storage.
 runInContext('show=r=>{room=r;applyLogin()}',context);
 return {$,context,calls,storage,location,run:code=>runInContext(code,context)};
}
for(const provider of ['guest','google'])test(provider+' login retains intent through commander selection, exposes parent panel, joins only on Accept',async()=>{
 const f=app();await flush();assert.equal(f.$('join-invite-notice').hidden,false);assert.equal(f.$('home').hidden,true);
 if(provider==='guest')await f.$('guest-login').click();else await f.context.window.heroGoogleCallback({credential:'fake'});
 await flush();assert.equal(f.$('commander-onboarding').hidden,false);assert.equal(f.calls.filter(c=>c.path==='/api/join').length,0);
 f.$('commander-onboarding-options').children[0].click();await f.$('commander-select-confirm').click();await flush();
 for(const id of ['home','home-play-panel','join-invite'])assert.equal(f.$(id).hidden,false,id+' visible');
 assert.equal(f.$('join').disabled,true);assert.equal(f.$('roomcode').disabled,true);assert.equal(f.$('match').disabled,true);
 assert.equal(f.calls.filter(c=>c.path==='/api/join').length,0);
 f.$('join-invite-button').click();f.$('join-invite-button').click();await flush();
 assert.equal(f.calls.filter(c=>c.path==='/api/join').length,1);assert.equal(f.location.search,'?lang=tr');assert.equal(f.location.hash,'#arena');
 assert.equal(JSON.parse(f.storage.get('hero-auction-session')).code,'123');
});
test('already signed-in startup loads commander without restoring old room over invite',async()=>{
 const f=app({storedLogin:true,profile:{commanderId:'attack',levels:{attack:1}},saved:{code:'456',token:'old'}});await flush();
 assert.equal(f.$('home-play-panel').hidden,false);assert.equal(f.calls.filter(c=>c.path==='/api/state').length,0);
 f.$('join-invite-button').click();await flush();assert.equal(f.calls.filter(c=>c.path==='/api/join').length,0);assert.match(f.$('join-invite-message').textContent,/Başka bir odan var/);
 f.$('join-invite-cancel').click();await flush();assert.equal(f.run('room.code'),'456');assert.equal(f.location.search,'?lang=tr');
});
test('cancel before delayed commander response does not reopen invite',async()=>{
 const gate=deferred(),f=app({storedLogin:true,profile:{commanderId:'attack',levels:{attack:1}},commanderGate:gate});await flush();
 f.$('join-invite-notice-cancel').click();gate.resolve();await flush();
 assert.equal(f.$('join-invite').hidden,true);assert.equal(f.$('join-invite-notice').hidden,true);assert.equal(f.calls.filter(c=>c.path==='/api/join').length,0);
});

for(const stateError of ['Oda bulunamadı.','Oyuncu yetkisi geçersiz.'])test('stale saved seat does not block explicit invite: '+stateError,async()=>{
 const f=app({storedLogin:true,profile:{commanderId:'attack',levels:{attack:1}},saved:{code:'456',token:'stale'},stateError});await flush();
 f.$('join-invite-button').click();await flush();assert.equal(f.calls.filter(c=>c.path==='/api/join').length,1);assert.equal(f.run('room.code'),'123');
});
test('logout and guest re-login preserve pending invite without automatic join',async()=>{
 const f=app({storedLogin:true,profile:{commanderId:'attack',levels:{attack:1}}});await flush();f.$('google-logout').click();
 assert.equal(f.$('join-invite-notice').hidden,false);assert.equal(f.location.search,'?join=123&lang=tr');
 await f.$('guest-login').click();await flush();assert.equal(f.$('join-invite').hidden,false);assert.equal(f.calls.filter(c=>c.path==='/api/join').length,0);
});

test('cancelled invite restore cannot overwrite a newer explicit game',async()=>{
 const gate=deferred(),f=app({storedLogin:true,profile:{commanderId:'attack',levels:{attack:1}},saved:{code:'456',token:'old'},stateGate:gate});await flush();
 f.$('join-invite-cancel').click();await flush();f.run("save('new-seat',{code:'789'})");gate.resolve();await flush();
 assert.equal(f.run('room.code'),'789');assert.equal(JSON.parse(f.storage.get('hero-auction-session')).token,'new-seat');
});
