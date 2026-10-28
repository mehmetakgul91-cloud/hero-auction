import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {crazyGamesSource} from '../crazygames-build.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('public/app.js'),html=read('public/index.html'),css=read('public/lobby-chrome.css');
const navigation=app.slice(app.indexOf("$('lobby-home').setAttribute"),app.indexOf("const homeGuidePlay="));
const leave=app.slice(app.indexOf("$('leave').onclick="),app.indexOf("\n",app.indexOf("$('leave').onclick=")));
function harness({active=false,confirmed=true,failure=false,language='tr'}={}){
 const nodes=new Map(),calls=[],removed=[],events=[];
 const $=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:false,attributes:{},setAttribute(k,v){this.attributes[k]=v},classList:{remove:v=>events.push(v)}});return nodes.get(id)};
 const ctx=vm.createContext({$,session:active?{token:'seat',code:'123'}:null,room:active?{phase:'auction'}:null,login:{authToken:'auth',user:{name:'Long Name'}},
  roomEntryPending:0,commanderBusy:false,commanderProfileOpen:true,
  homePlayPanel:$('home-play-panel'),homePlayTab:$('home-play-tab'),
  confirm:()=>{events.push('confirm');return confirmed},uiText:x=>x,
  post:async(url,body)=>{calls.push([url,body]);if(failure)throw Error('offline')},
  localStorage:{removeItem:key=>removed.push(key)},stream:{close:()=>events.push('stream-close')},
  applyLogin:()=>events.push('apply'),refreshOnline(){},roomInvitesUI:{refresh(){}},
  storefrontUI:{close(){}},friendsUI:{close:()=>events.push('friends-close')},webInvite:{cancel:()=>events.push('invite-cancel')},
  commanderVisibility:()=>events.push('visibility'),notify:e=>events.push(e),
  window:{scrollTo:()=>events.push('scroll'),HeroPlatform:language==='en'?{setRoom:r=>events.push(['platform',r])}:undefined}
 });
 vm.runInContext((language==='en'?crazyGamesSource(navigation+leave,'.js'):navigation+leave),ctx);
 return {ctx,$,calls,removed,events,click:()=>$('lobby-home').onclick()};
}
test('native keyboard-accessible brand preserves wallet live announcements and account identity',()=>{
 assert.match(html,/<button type="button" id="lobby-home" class="lobby-brand" aria-label="Hero Auction · Ana menü">/);
 assert.match(html,/id="gold-wallet"[^>]*hidden aria-live="polite"/);
 assert.match(html,/id="account-status"[^>]*aria-expanded="false" aria-controls="google-logout"/);
 assert.match(app,/setAttribute\('aria-label',name\+/);
 assert.match(css,/\.lobby-header \.lobby-brand\{[^}]*min-width:44px;min-height:44px/);
 assert.match(css,/\.lobby-header \.lobby-brand:focus-visible/);
 assert.match(css,/\.lobby-header \.account-bar\{grid-column:2;grid-row:1/);
 assert.match(css,/grid-template-columns:auto minmax\(0,1fr\) auto/);
 assert.match(css,/\.lobby-header \.gold-number\{[^}]*overflow-wrap:anywhere/);
 assert.match(css,/\.account-copy strong\{[^}]*text-overflow:ellipsis/);
});
for(const type of ['guest','google','crazygames'])test(type+' home closes panels without logout, wallet or room APIs',async()=>{
 const h=harness();h.ctx.login.type=type;await h.click();
 assert.equal(h.ctx.commanderProfileOpen,false);assert.equal(h.$('home-play-panel').hidden,true);
 assert.equal(h.$('account-status').attributes['aria-expanded'],'false');
 assert.equal(h.calls.length,0);assert.deepEqual(h.removed,[]);assert.equal(h.ctx.login.authToken,'auth');
});
for(const phase of ['waiting','matching','auction','preparation','battle','finished'])test(phase+' cancel preserves session, panels and pending formation',async()=>{
 const h=harness({active:true,confirmed:false});h.ctx.room.phase=phase;h.ctx.room.formation={pending:true};
 const old=h.ctx.session;await h.click();
 assert.equal(h.ctx.session,old);assert.equal(h.ctx.room.formation.pending,true);
 assert.equal(h.ctx.commanderProfileOpen,true);assert.equal(h.calls.length,0);assert.deepEqual(h.removed,[]);
 assert.equal(h.events.includes('invite-cancel'),false);assert.equal(h.$('lobby-home').disabled,false);
});
for(const language of ['tr','en'])test(language+' confirmed home uses only existing detach and keeps account',async()=>{
 const h=harness({active:true,language});await h.click();
 assert.equal(h.ctx.session,null);assert.equal(h.ctx.room,null);
 assert.deepEqual(h.calls.map(c=>c[0]),['/api/room/detach']);
 assert.deepEqual(h.removed,[language==='en'?'hero-auction-cg-session':'hero-auction-session']);
 assert.equal(h.ctx.login.authToken,'auth');assert.equal(h.ctx.commanderProfileOpen,false);
});
test('offline detach leaves match and account untouched and unlocks controls for retry',async()=>{
 const h=harness({active:true,failure:true}),old=h.ctx.session;await h.click();
 assert.equal(h.ctx.session,old);assert.equal(h.ctx.commanderProfileOpen,true);
 assert.deepEqual(h.removed,[]);assert.equal(h.$('leave').disabled,false);assert.equal(h.$('lobby-home').disabled,false);
});
test('repeat click and direct leave while detach pending issue only one request',async()=>{
 const h=harness({active:true});let resolve;
 h.ctx.post=async(url,body)=>{h.calls.push([url,body]);await new Promise(r=>resolve=r)};
 const first=h.click();await h.click();await h.$('leave').onclick();
 assert.equal(h.calls.length,1);resolve();await first;assert.equal(h.ctx.room,null);
});
test('a newer room/auth after detach cannot be cleared by old navigation',async()=>{
 const h=harness({active:true});let resolve;h.ctx.post=()=>new Promise(r=>resolve=r);
 const first=h.click();const newer={token:'new'};h.ctx.session=newer;h.ctx.login={authToken:'new-auth'};
 resolve();await first;assert.equal(h.ctx.session,newer);assert.deepEqual(h.removed,[]);assert.equal(h.ctx.commanderProfileOpen,true);
});
for(const flag of ['roomEntryPending','commanderBusy'])test(flag+' blocks home during an existing mutation',async()=>{
 const h=harness();h.ctx[flag]=1;await h.click();assert.equal(h.ctx.commanderProfileOpen,true);assert.equal(h.events.length,0);
});
test('signed-out/loading home does not synthesize login or wallet',async()=>{
 const h=harness();h.ctx.login=null;await h.click();assert.equal(h.ctx.login,null);assert.deepEqual(h.calls,[]);
});
test('shared CrazyGames page keeps native in-context action rather than a root navigation',()=>{
 const cg=crazyGamesSource(html,'.html');
 assert.match(cg,/id="lobby-home"/);assert.doesNotMatch(navigation,/location\.|history\.|wallet|auth\/|commander\//);
});

test('friend invitation room creation blocks home until complete',async()=>{
 const h=harness();h.ctx.roomInvitesUI.busy=true;await h.click();
 assert.equal(h.ctx.commanderProfileOpen,true);assert.equal(h.events.length,0);assert.equal(h.calls.length,0);
});
