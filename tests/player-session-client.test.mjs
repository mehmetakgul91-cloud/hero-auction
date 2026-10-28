import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyCoarseDevice,classifySessionAttribution,createPlayerSessionTracker} from '../public/player-session-client.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const ok=(data={})=>({ok:true,status:200,json:async()=>data});
function fixture({referrer='',url='https://game.example/',userAgent='Windows NT 10.0',visible=true,focused=true}={}){
 const document=new EventTarget(),window=new EventTarget();
 Object.assign(document,{referrer,visibilityState:visible?'visible':'hidden',focused,hasFocus(){return this.focused;}});
 const navigator={userAgent,onLine:true},location={href:url};
 const requests=[],timers=new Map();let clock=0,nextTimer=0,nextId=0,behavior=null;
 const tracker=createPlayerSessionTracker({document,window,navigator,location,
  crypto:{randomUUID:()=>`00000000-0000-4000-a000-${String(++nextId).padStart(12,'0')}`},
  now:()=>clock,setInterval:(callback,ms)=>{assert.equal(ms,15000);timers.set(++nextTimer,callback);return nextTimer;},clearInterval:id=>timers.delete(id),
  fetch:async(path,options)=>{const request={path,options,body:JSON.parse(options.body)};requests.push(request);return behavior?behavior(request):ok();},
 });
 const emit=(target,type)=>target.dispatchEvent(new Event(type));
 return {tracker,document,window,navigator,location,requests,timers,
  setFetch:fn=>{behavior=fn;},emit,
  async tick(ms=15000){clock+=ms;for(const callback of [...timers.values()])callback();await flush();},
  async login(authToken='signed-a',sub='account-a',provider='google'){
   tracker.setIdentity({authToken,user:{sub,provider}});tracker.setEnabled(true);await flush();
  },
  async focus(value){document.focused=value;emit(window,value?'focus':'blur');await flush();},
  async visible(value){document.visibilityState=value?'visible':'hidden';emit(document,'visibilitychange');await flush();},
 };
}

test('attribution is a small coarse whitelist, never Google authentication or a guessed search',()=>{
 const from=referrer=>classifySessionAttribution({referrer,url:'https://game.example/',userAgent:''}).source;
 assert.equal(from('https://www.google.com/search?q=private+query'),'google_search');
 assert.equal(from('https://www.google.com.tr/search?q=oyun'),'google_search');
 for(const referrer of ['https://accounts.google.com/o/oauth2/auth?token=secret','https://www.google.com/','https://www.google.com.evil.example/search?q=secret','https://evilgoogle.com/search?q=secret','https://www.google.com/url?q=secret'])assert.equal(from(referrer),'external');
 for(const referrer of ['', 'not a URL','javascript:alert(1)','https://game.example/private?token=secret'])assert.equal(from(referrer),'direct_or_unknown');
});
test('only actual three-digit join route attributes invite; signed provider is only a server-checked hint',()=>{
 for(const query of ['join=123','join=000'])assert.equal(classifySessionAttribution({url:'https://game.example/?'+query}).source,'invite');
 for(const query of ['invite=secret','join=1234','join=x','join=12'])assert.equal(classifySessionAttribution({url:'https://game.example/?'+query}).source,'direct_or_unknown');
 assert.equal(classifySessionAttribution({url:'https://game.example/?join=123',provider:'crazygames'}).source,'crazygames');
 assert.equal(classifySessionAttribution({provider:'google'}).source,'direct_or_unknown');
});
test('platform and device classification has no identifying detail or native-app assertion',()=>{
 for(const [ua,expected] of [
  ['Mozilla/5.0 (Linux; Android 15) Mobile',{platform:'android',device:'mobile'}],
  ['Mozilla/5.0 (Linux; Android 15)',{platform:'android',device:'tablet'}],
  ['Mozilla/5.0 (iPad; CPU OS 18)',{platform:'web',device:'tablet'}],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18) Mobile',{platform:'web',device:'mobile'}],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)',{platform:'web',device:'desktop'}],
  ['',{platform:'unknown',device:'unknown'}],
  ['unrecognized',{platform:'web',device:'unknown'}],
 ])assert.deepEqual(classifyCoarseDevice(ua),expected);
});
test('no request, UUID or timer before both explicit true flag and authenticated identity',async()=>{
 const f=fixture();f.tracker.setIdentity({authToken:'signed-a'});await f.tick();
 assert.equal(f.requests.length,0);assert.equal(f.timers.size,0);
 f.tracker.setEnabled('1');await f.tick();assert.equal(f.requests.length,0);
 f.tracker.setIdentity(null);f.tracker.setEnabled(true);await f.tick();assert.equal(f.requests.length,0);
 f.tracker.setIdentity({authToken:'signed-a'});await flush();assert.equal(f.requests.length,2);assert.equal(f.timers.size,1);
 f.tracker.dispose();await flush();assert.equal(f.timers.size,0);
});
test('start is paused then foreground resumes; each heartbeat has increasing sequence and no client duration',async()=>{
 const f=fixture();await f.login();await f.tick();
 assert.deepEqual(f.requests.map(r=>[r.path.split('/').at(-1),r.body.sequence,r.body.foreground]),[['start',0,false],['heartbeat',1,true],['heartbeat',2,true]]);
 const id=f.requests[0].body.sessionId;assert.ok(f.requests.every(r=>r.body.sessionId===id));
 assert.ok(f.requests.every(r=>r.body.authToken==='signed-a'&&r.options.keepalive&&r.options.method==='POST'&&r.options.credentials==='same-origin'));
 for(const r of f.requests)assert.deepEqual(Object.keys(r.body).sort(),(r.path.endsWith('/start')?['authToken','device','foreground','platform','sequence','sessionId','source']:['authToken','foreground','sequence','sessionId']).sort());
 f.tracker.dispose();
});
test('visibility and focus both gate foreground; hidden tabs stop periodic presence updates',async()=>{
 const f=fixture();await f.login();await f.visible(false);
 assert.equal(f.requests.at(-1).body.foreground,false);const afterPause=f.requests.length;
 await f.tick(90000);assert.equal(f.requests.length,afterPause);
 f.document.focused=false;await f.visible(true);assert.equal(f.requests.at(-1).body.foreground,false);
 const beforeFocus=f.requests.length;await f.focus(true);assert.equal(f.requests.length,beforeFocus+1);assert.equal(f.requests.at(-1).body.foreground,true);
 await f.focus(false);assert.equal(f.requests.at(-1).body.foreground,false);
 f.tracker.dispose();
});
test('initially hidden or unfocused page does not emit active heartbeat',async()=>{
 for(const options of [{visible:false},{focused:false}]){
  const f=fixture(options);await f.login();assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.foreground,false);
  await f.tick();assert.equal(f.requests.length,1);f.tracker.dispose();
 }
});
test('logout, account switch and disabled flag close old session and clean intervals',async()=>{
 const f=fixture();await f.login();const oldId=f.requests[0].body.sessionId;
 f.tracker.setIdentity({authToken:'signed-b',user:{sub:'account-b',provider:'google'}});await flush();
 assert.ok(f.requests.some(r=>r.path.endsWith('/end')&&r.body.sessionId===oldId&&r.body.authToken==='signed-a'));
 const starts=f.requests.filter(r=>r.path.endsWith('/start'));assert.equal(starts.length,2);assert.notEqual(starts[1].body.sessionId,oldId);assert.equal(starts[1].body.authToken,'signed-b');assert.equal(f.timers.size,1);
 f.tracker.setEnabled(false);await flush();assert.equal(f.requests.at(-1).path,'/api/player-sessions/end');assert.equal(f.timers.size,0);
 const count=f.requests.length;await f.tick();f.emit(f.window,'focus');await flush();assert.equal(f.requests.length,count);
 f.tracker.dispose();
});
test('same account token renewal keeps the visit; later requests use renewed token',async()=>{
 const f=fixture();await f.login();f.tracker.setIdentity({authToken:'renewed-a',user:{sub:'account-a',provider:'google'}});await f.tick();
 assert.equal(f.requests.filter(r=>r.path.endsWith('/start')).length,1);assert.equal(f.requests.at(-1).body.authToken,'renewed-a');assert.equal(f.timers.size,1);f.tracker.dispose();
});
test('failed start retries the exact ID and metadata instead of inventing a new visit',async()=>{
 const f=fixture();let fail=true;f.setFetch(()=>{if(fail)throw Error('offline');return ok();});await f.login();
 assert.equal(f.requests.length,1);const first=f.requests[0].body;fail=false;await f.tick();
 assert.deepEqual(f.requests[1].body,first);assert.equal(f.requests[2].body.foreground,false);assert.equal(f.requests[2].body.reset,true);assert.equal(f.requests[3].body.foreground,true);f.tracker.dispose();
});
test('uncertain heartbeat and reconnect establish reset baseline; no time delta is replayed',async()=>{
 const f=fixture();await f.login();let fail=true;f.setFetch(()=>{if(fail)throw Error('lost response');return ok();});await f.tick();
 const failed=f.requests.at(-1).body;assert.equal(failed.foreground,true);fail=false;await f.tick(60000);
 const recovery=f.requests.at(-2).body,resume=f.requests.at(-1).body;
 assert.equal(recovery.foreground,false);assert.equal(recovery.reset,true);assert.equal(recovery.sequence,failed.sequence);assert.equal(resume.foreground,true);assert.ok(resume.sequence>recovery.sequence);
 f.navigator.onLine=false;f.emit(f.window,'offline');await flush();assert.equal(f.requests.at(-1).body.foreground,false);
 f.navigator.onLine=true;f.emit(f.window,'online');await flush();assert.equal(f.requests.at(-2).body.reset,true);assert.equal(f.requests.at(-1).body.foreground,true);f.tracker.dispose();
});
test('prolonged network outage keeps next sequence bounded; unknown commit replay still gets a fresh reset baseline',async()=>{
 const f=fixture();await f.login();let failing=true,replay=true;
 f.setFetch(request=>{
  if(failing)throw Error('offline');
  if(replay){replay=false;return ok({sequence:request.body.sequence,replayed:true});}
  return ok({sequence:request.body.sequence});
 });
 for(let i=0;i<100;i++)await f.tick();
 const failed=f.requests.slice(2);assert.ok(failed.every(r=>r.body.sequence===2));
 failing=false;await f.tick();
 const recovery=f.requests.slice(-3).map(r=>r.body);
 assert.deepEqual(recovery.map(r=>[r.sequence,r.foreground,r.reset]),[[2,false,true],[3,false,true],[4,true,undefined]]);
 f.tracker.dispose();
});
test('throttled successful writes follow acknowledged sequence rather than drifting beyond the allowed gap',async()=>{
 const f=fixture();await f.login();f.setFetch(()=>ok({sequence:1,throttled:true}));
 for(let i=0;i<40;i++)await f.tick();
 assert.ok(f.requests.slice(2).every(r=>r.body.sequence===2));
 f.setFetch(request=>ok({sequence:request.body.sequence}));await f.tick();assert.equal(f.requests.at(-1).body.sequence,2);f.tracker.dispose();
});
test('logout after unknown heartbeat outcome advances beyond replay before declaring session closed',async()=>{
 const f=fixture();await f.login();f.setFetch(()=>{throw Error('lost heartbeat response');});await f.tick();
 let replay=true;f.setFetch(request=>replay?(replay=false,ok({sequence:request.body.sequence,replayed:true,closed:false})):ok({sequence:request.body.sequence,closed:true}));
 f.tracker.setIdentity(null);await flush();
 assert.deepEqual(f.requests.slice(-2).map(r=>[r.path.split('/').at(-1),r.body.sequence]),[['end',2],['end',3]]);assert.equal(f.timers.size,0);f.tracker.dispose();
});
test('repeated focus changes coalesce while a request is pending, avoiding unordered parallel updates',async()=>{
 const f=fixture();await f.login();let resolve;f.setFetch(()=>new Promise(r=>{resolve=r;}));await f.tick();const count=f.requests.length;
 await f.focus(false);await f.focus(true);await f.visible(false);assert.equal(f.requests.length,count);
 f.setFetch(()=>ok());resolve(ok());await flush();assert.equal(f.requests.length,count+1);assert.equal(f.requests.at(-1).body.foreground,false);f.tracker.dispose();
});
test('rapid hide then show during a foreground request preserves a zero-credit pause baseline',async()=>{
 const f=fixture();await f.login();let resolve;f.setFetch(()=>new Promise(r=>{resolve=r;}));await f.tick();const count=f.requests.length;
 await f.visible(false);await f.visible(true);assert.equal(f.requests.length,count);
 f.setFetch(()=>ok());resolve(ok());await flush();
 assert.deepEqual(f.requests.slice(-2).map(r=>[r.body.foreground,r.body.reset]),[[false,true],[true,undefined]]);f.tracker.dispose();
});
test('throttled recovery baseline waits instead of spinning then resumes on next heartbeat',async()=>{
 const f=fixture();await f.login();f.setFetch(()=>{throw Error('lost response');});await f.tick();
 f.setFetch(()=>ok({sequence:1,foregroundActiveMs:0,throttled:true}));await f.tick();const count=f.requests.length;
 await flush();assert.equal(f.requests.length,count);assert.equal(f.requests.at(-1).body.reset,true);
 f.setFetch(request=>ok({sequence:request.body.sequence}));await f.tick();
 assert.deepEqual(f.requests.slice(-2).map(r=>[r.body.foreground,r.body.reset]),[[false,true],[true,undefined]]);f.tracker.dispose();
});
test('late old-account response cannot resume tracking or borrow new credentials',async()=>{
 const f=fixture();await f.login();let resolve;f.setFetch(()=>new Promise(r=>{resolve=r;}));await f.tick();const oldId=f.requests[0].body.sessionId;
 f.setFetch(()=>ok());f.tracker.setIdentity({authToken:'signed-b',user:{sub:'account-b'}});await flush();resolve(ok());await flush();
 const old=f.requests.filter(r=>r.body.sessionId===oldId);assert.equal(old.at(-1).path,'/api/player-sessions/end');assert.ok(old.every(r=>r.body.authToken==='signed-a'));assert.equal(f.timers.size,1);f.tracker.dispose();
});
test('pagehide sends one end; bfcache pageshow starts a new visit and dispose removes lifecycle listeners',async()=>{
 const f=fixture();await f.login();f.emit(f.window,'pagehide');f.emit(f.window,'pagehide');await flush();
 assert.equal(f.requests.filter(r=>r.path.endsWith('/end')).length,1);assert.equal(f.timers.size,0);
 f.emit(f.window,'pageshow');await flush();assert.equal(f.requests.filter(r=>r.path.endsWith('/start')).length,2);
 f.tracker.dispose();await flush();const count=f.requests.length;for(const event of ['pageshow','pagehide','focus','online'])f.emit(f.window,event);await flush();assert.equal(f.requests.length,count);assert.equal(f.timers.size,0);
});
test('denied auth stops retries until identity changes without affecting gameplay',async()=>{
 const f=fixture();f.setFetch(()=>({ok:false,status:401,json:async()=>({})}));await f.login();assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);
 await f.tick();await f.focus(true);f.tracker.setIdentity({authToken:'signed-a',user:{sub:'account-a',provider:'google'}});await flush();assert.equal(f.requests.length,1);
 f.setFetch(()=>ok());f.tracker.setIdentity({authToken:'new-session'});await flush();assert.equal(f.requests.filter(r=>r.path.endsWith('/start')).length,2);f.tracker.dispose();
});
test('closed server session or active 24-hour cap rotates; hidden tab does not create daily visits',async()=>{
 const f=fixture();await f.login();let once=true;f.setFetch(()=>once?(once=false,ok({closed:true})):ok());await f.tick();assert.equal(f.requests.filter(r=>r.path.endsWith('/start')).length,2);
 await f.visible(false);await f.tick(25*60*60*1000);assert.equal(f.requests.filter(r=>r.path.endsWith('/start')).length,2);
 await f.visible(true);await f.tick();assert.equal(f.requests.filter(r=>r.path.endsWith('/start')).length,3);f.tracker.dispose();
});
test('arrival evidence stays coarse after game clears URL; no referrer, token query, raw UA, geo or storage is sent',async()=>{
 const f=fixture({url:'https://game.example/?join=123&authToken=do-not-send',referrer:'https://www.google.com/search?q=private-search',userAgent:'Android PrivateDevice123 Mobile'});
 f.location.href='https://game.example/';await f.login();const start=f.requests[0];assert.equal(start.body.source,'invite');assert.equal(start.body.platform,'android');assert.equal(start.body.device,'mobile');
 assert.doesNotMatch(JSON.stringify(f.requests),/do-not-send|private-search|PrivateDevice123|google\.com|join=123/);
 const source=readFileSync(new URL('../public/player-session-client.js',import.meta.url),'utf8');assert.doesNotMatch(source,/localStorage|sessionStorage|sendBeacon|geolocation|screen\.|canvas|indexedDB/);f.tracker.dispose();
});
test('missing secure UUID or fetch capability safely disables collection',async()=>{
 const requests=[];const tracker=createPlayerSessionTracker({crypto:{},fetch:async(...args)=>{requests.push(args);return ok();}});
 tracker.setIdentity({authToken:'signed'});tracker.setEnabled(true);await flush();assert.equal(requests.length,0);tracker.dispose();
});
