import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const bridge=app.slice(app.indexOf('// CrazyGames session bridge:'),app.indexOf('// End CrazyGames session bridge.'));
const storage=entries=>{const data=new Map(entries);return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
function harness({saved={type:'crazygames',user:{sub:'crazygames:1:user'},authToken:'old'},identity={kind:'user',credential:'opaque'},sub='crazygames:1:user',invite=null,instant=false,joinError=null}={}){
 const calls=[],events={},elements=new Map();
 const localStorage=storage([['hero-auction-login',JSON.stringify(saved)],['hero-auction-session','saved-room']]);
 const sessionStorage=storage([['hero-auction-formation','old-formation'],['hero-auction-lanes','old-lanes']]);
 const platform={identity:async()=>identity,setRoom:r=>calls.push(['room',r]),watchAccount(){},takeInviteCode:()=>invite,instantMultiplayer:instant,onJoin:fn=>{events.join=fn},loaded(){}};
 const ctx=vm.createContext({window:{HeroPlatform:platform,addEventListener:(e,fn)=>{events[e]=fn}},platformStoredLogin:saved,login:null,session:{code:'999'},room:{code:'999'},stream:{close(){}},localStorage,sessionStorage,
  location:{search:'',replace:url=>calls.push(['navigate',url])},URLSearchParams,world:'mixed',Promise,console,
  $:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id)},showGold(){},applyLogin(){},loadCommander:async()=>{},commanderVisibility(){},homePlayPanel:{hidden:true},homePlayTab:{click(){}},notify:m=>calls.push(['notify',m]),restoreGame:async()=>{},
  post:async(url,body)=>{calls.push([url,body]);if(url==='/api/auth/crazygames')return {user:{sub,name:'Fresh.Name'},authToken:'new',gold:500};if(url==='/api/auth/guest')return {user:{name:'Guest'},authToken:'guest',gold:500};if(url==='/api/auth/check')return {user:{name:'Guest'},gold:500};if(url==='/api/join'){if(joinError)throw Error(joinError);return {token:'seat',room:{code:body.code}}}if(url==='/api/create')return {token:'seat',room:{code:'321'}};throw Error('unexpected '+url)},
 });
 vm.runInContext('function save(token,r){session={token,code:r.code};room=r;localStorage.setItem("hero-auction-session",JSON.stringify(session))}',ctx);
 vm.runInContext(bridge,ctx);return {ctx,calls,events,platform};
}
test('same verified account retains seat, updates username and renews login',async()=>{
 const h=harness();await h.ctx.authenticatePlatform();
 assert.equal(h.ctx.login.user.name,'Fresh.Name');assert.equal(h.ctx.login.authToken,'new');assert.equal(h.ctx.localStorage.getItem('hero-auction-session'),'saved-room');
 assert.equal(h.calls.find(c=>c[0]==='/api/auth/crazygames')[1].credential,'opaque');
});
test('account switch discards previous seat and formation; never copies its wallet',async()=>{
 const h=harness({sub:'crazygames:1:other'});await h.ctx.authenticatePlatform();
 assert.equal(h.ctx.localStorage.getItem('hero-auction-session'),null);assert.equal(h.ctx.sessionStorage.getItem('hero-auction-formation'),null);assert.equal(h.ctx.room,null);assert.equal(h.ctx.login.user.sub,'crazygames:1:other');
});
test('portal guest cannot reuse a signed-in CrazyGames identity on a shared device',async()=>{
 const h=harness({identity:{kind:'guest'}});await h.ctx.authenticatePlatform();
 assert.equal(h.ctx.login.type,'guest');assert.equal(h.ctx.room,null);assert.equal(h.calls.some(c=>c[0]==='/api/auth/check'),false);
});
test('a returning guest reuses a valid guest session without making another account',async()=>{
 const h=harness({saved:{type:'guest',user:{name:'Guest'},authToken:'guest'},identity:{kind:'guest'}});await h.ctx.authenticatePlatform();
 assert.equal(h.ctx.login.authToken,'guest');assert.equal(h.calls.some(c=>c[0]==='/api/auth/guest'),false);
});
test('SDK identity errors do not create a replacement guest or restore another identity',async()=>{
 const h=harness();h.platform.identity=async()=>{throw Error('offline')};await h.ctx.startPlatform();
 assert.equal(h.ctx.login,null);assert.equal(h.calls.some(c=>c[0].startsWith('/api/')),false);
});
test('full/missing room errors preserve the current seat and explain the failure',async()=>{
 const h=harness({joinError:'Oda dolu.'});await h.ctx.authenticatePlatform();await h.ctx.joinPlatformRoom('123');
 assert.equal(h.ctx.localStorage.getItem('hero-auction-session'),'saved-room');assert.equal(h.ctx.room.code,'999');assert.match(h.calls.find(c=>c[0]==='notify')[1],/Oda dolu/);
});
test('startup invite takes priority over instant room creation and listener joins later',async()=>{
 const h=harness({invite:'123',instant:true});await h.ctx.startPlatform();assert.equal(h.ctx.room.code,'123');assert.equal(h.calls.some(c=>c[0]==='/api/create'),false);
 await h.events.join('456');assert.equal(h.ctx.room.code,'456');
});
test('instant multiplayer creates a joinable private lobby for a fresh account',async()=>{
 const h=harness({sub:'crazygames:1:new',instant:true});await h.ctx.startPlatform();assert.equal(h.ctx.room.code,'321');assert.equal(h.calls.filter(c=>c[0]==='/api/create').length,1);
});
test('auth listener clears active seat and returns through verified login flow',async()=>{
 const h=harness();h.events['hero:platform-auth']();assert.equal(h.ctx.room,null);assert.equal(h.ctx.localStorage.getItem('hero-auction-session'),null);assert.equal(h.calls.at(-1)[1],'/crazygames/');
});
