import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const shown=[],notices=[],listeners={},stored=new Map(),nodes={stage:{},game:{classList:{remove(){}}}};
 const current={code:'123',token:'seat'},previous={code:'123',matchKey:'123:1:100',phase:'finished',revision:10};
 let resolve,reject,closed=0,cancelled=0,home=0;
 stored.set('hero-auction-session',JSON.stringify(current));stored.set('hero-auction-login',JSON.stringify({authToken:'auth'}));
 const context={session:current,room:previous,login:{authToken:'auth'},stream:{close(){closed++;}},
  tailReveal:{cancel(){cancelled++;}},lastCardKey:'old',renderedAuction:{},
  post:()=>new Promise((yes,no)=>{resolve=yes;reject=no;}),show:r=>shown.push(r),notify:message=>notices.push(message),
  localStorage:{getItem:key=>stored.get(key),removeItem:key=>stored.delete(key)},
  cancelAwardFlights(){cancelled++;},cancelAuctionReveal(){cancelled++;},applyLogin(){home++;},
  window:{addEventListener:(event,callback)=>listeners[event]=callback,HeroPlatform:{setRoom(){},gameplay(){}}},
  document:{hidden:false,documentElement:{lang:'tr'},addEventListener:(event,callback)=>listeners[event]=callback},$:id=>nodes[id],refreshGold(){},
  auctionEmotes:{update(){}},showGold(){},commanderProfile:null,commanderLoaded:false,commanderProfileOpen:false
 };
 vm.createContext(context);
 vm.runInContext(app.slice(app.indexOf('function clearExpiredLogin('),app.indexOf('\nfunction renderLobbyIdentity()')),context);
 context.signedIn=()=>Boolean(context.login?.authToken);context.loadCommander=()=>{};
 vm.runInContext(app.slice(app.indexOf('async function syncRoomSnapshot('),app.indexOf('// Guard reconnects')),context);
 const visibility=app.indexOf("document.addEventListener('visibilitychange'");
 vm.runInContext(app.slice(visibility,app.indexOf('// PokeAPI species',visibility)),context);
 const pageshow=app.indexOf("window.addEventListener('pageshow',event=>");
 vm.runInContext(app.slice(pageshow,app.indexOf('\n',pageshow)),context);
 return{context,current,previous,shown,notices,stored,listeners,resolve:value=>resolve(value),reject:error=>reject(error),counts:()=>({closed,cancelled,home})};
}
for(const event of ['visibilitychange','pageshow'])test(`${event} verifies the server before replaying a cached final`,async()=>{
 const h=harness();h.listeners[event]({persisted:true});assert.deepEqual(h.shown,[]);
 const latest={...h.previous,revision:11,idleClosed:{}};h.resolve({room:latest});await flush();assert.deepEqual(h.shown,[latest]);
});
test('unchanged snapshot is still redrawn after background cancellation',async()=>{
 const h=harness();h.listeners.visibilitychange();h.resolve({room:h.previous});await flush();assert.deepEqual(h.shown,[h.previous]);
});
for(const message of ['Oda bulunamadı.','Oyuncu yetkisi geçersiz.'])test(`definitive missing room/seat clears only the expired presentation: ${message}`,async()=>{
 const h=harness();h.listeners.visibilitychange();h.reject(Error(message));await flush();
 for(const field of ['session','room','tailReveal','stream'])assert.equal(h.context[field],null);
 assert.equal(h.stored.has('hero-auction-session'),false);assert.equal(JSON.parse(h.stored.get('hero-auction-login')).authToken,'auth');
 assert.equal(h.counts().closed,1);assert.equal(h.counts().home,1);assert.match(h.notices[0],/artık mevcut değil/);
});
test('transient connection failure preserves the room, account and saved seat',async()=>{
 const h=harness();h.listeners.visibilitychange();h.reject(Error('Failed to fetch'));await flush();
 assert.equal(h.context.session,h.current);assert.equal(h.context.room,h.previous);assert.equal(h.stored.has('hero-auction-session'),true);
 assert.deepEqual(h.counts(),{closed:0,cancelled:0,home:0});assert.deepEqual(h.shown,[]);
});
test('verified expired login closes the obsolete overlay and requests sign-in',async()=>{
 const h=harness();h.listeners.visibilitychange();h.reject(Object.assign(Error('Unauthorized'),{status:401}));await flush();
 for(const field of ['login','session','room','tailReveal','stream'])assert.equal(h.context[field],null);
 assert.equal(h.stored.has('hero-auction-login'),false);assert.equal(h.stored.has('hero-auction-session'),false);assert.match(h.notices[0],/yeniden giriş yap/);
});
for(const status of [401,404])for(const change of ['account','session'])test(`old ${status} cannot clear a replacement ${change}`,async()=>{
 const h=harness();h.listeners.visibilitychange();
 if(change==='account')h.context.login={authToken:'replacement'};else h.context.session={code:'456',token:'new'};
 h.reject(Object.assign(Error(status===401?'Unauthorized':'Oda bulunamadı.'),{status}));await flush();
 assert.notEqual(h.context.login,null);assert.notEqual(h.context.session,null);assert.equal(h.counts().cancelled,0);assert.equal(h.notices.length,0);
});
for(const sameSeat of [false,true])test(`old-tab 401 preserves another tab's newer login and ${sameSeat?'same':'different'} saved seat`,async()=>{
 const h=harness();h.listeners.visibilitychange();const login=JSON.stringify({authToken:'new-auth'}),seat=JSON.stringify(sameSeat?h.current:{code:'456',token:'new'});
 h.stored.set('hero-auction-login',login);h.stored.set('hero-auction-session',seat);
 h.reject(Object.assign(Error('Unauthorized'),{status:401}));await flush();
 assert.equal(h.stored.get('hero-auction-login'),login);assert.equal(h.stored.get('hero-auction-session'),seat);
 assert.equal(h.context.login,null);assert.equal(h.context.tailReveal,null);assert.match(h.notices[0],/başka bir sekmede/);
});
for(const status of [401,404])test(`cleanup after ${status} preserves a newer same-account saved seat`,async()=>{
 const h=harness();h.listeners.visibilitychange();const seat=JSON.stringify({code:'456',token:'new'});h.stored.set('hero-auction-session',seat);
 h.reject(Object.assign(Error(status===401?'Unauthorized':'Oda bulunamadı.'),{status}));await flush();
 assert.equal(h.stored.get('hero-auction-session'),seat);assert.equal(h.context.session,null);
});
test('storage read failure cannot prevent local cleanup or erase unknown stored data',async()=>{
 const h=harness();h.context.localStorage.getItem=()=>{throw Error('Storage unavailable');};h.listeners.visibilitychange();
 h.reject(Object.assign(Error('Unauthorized'),{status:401}));await flush();
 assert.equal(h.context.login,null);assert.equal(h.context.tailReveal,null);assert.equal(h.stored.has('hero-auction-login'),true);assert.equal(h.stored.has('hero-auction-session'),true);
});
for(const change of ['account','session'])test(`delayed login validation cannot clear replacement ${change}`,async()=>{
 const h=harness(),pending=h.context.validateLogin();
 if(change==='account')h.context.login={authToken:'new'};else h.context.session={code:'456',token:'new'};
 h.reject(Object.assign(Error('Oturumun sona erdi. Yeniden giriş yap.'),{status:401}));assert.equal(await pending,false);
 assert.notEqual(h.context.login,null);assert.notEqual(h.context.session,null);assert.equal(h.counts().cancelled,0);
});
