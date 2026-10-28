import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/admin-wallet-credits.js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
const key='hero-auction-admin-credit-pending:owner-account';
const intent={accountId:'player-one',currency:'diamonds',amount:7,reason:'Support correction'};
const payload={requestId:'request-id-00000000001',...intent};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}){
 const window={};vm.runInNewContext(source,{window});
 const memory=options.memory||new Map(),calls=[],changes=[],prompts=[],receipts=[];
 let identity={accountId:'owner-account',authToken:'never-save-this-token'},handler=options.handler,allow=true;
 const faults={read:false,write:false,remove:false,...options.storageFailure};
 const storage={getItem:name=>{if(faults.read)throw Error('read failed');return memory.get(name)||null},setItem:(name,value)=>{if(faults.write)throw Error('write failed');memory.set(name,value)},removeItem:name=>{if(faults.remove)throw Error('remove failed');memory.delete(name)}};
 const locks=options.noLocks?null:options.locks||{request:async(_name,_options,fn)=>fn()};
 const receipt=request=>({requestId:request.requestId,accountId:request.accountId,actorId:'owner-account',currency:request.currency,amount:request.amount,reason:request.reason,balanceBefore:10,balanceAfter:10+request.amount,createdAt:'2026-10-27T12:00:00Z'});
 const controller=window.HeroAdminWalletCredits.createController({getIdentity:()=>identity,storage,locks,randomUUID:()=>payload.requestId,confirm:copy=>{prompts.push(copy);options.onConfirm?.();return allow},onChange:state=>changes.push(state),onSuccess:r=>receipts.push(r),request:async(path,body)=>{
  calls.push({path,body:JSON.parse(JSON.stringify(body))});
  if(handler)return handler(path,body);
  return {ok:true,receipt:receipt(body)};
 }});
 controller.setIdentity(true);
 return {controller,memory,calls,changes,prompts,receipts,faults,tools:window.HeroAdminWalletCredits,receipt,setHandler:fn=>handler=fn,allow:value=>allow=value,switchIdentity:value=>{identity=value;controller.setIdentity(false)},restore:()=>controller.setIdentity(true)};
}
test('no automatic mutation or journal; owner, capability and cross-tab locks gate new requests',async()=>{
 const f=fixture();assert.equal(f.calls.length,0);assert.equal(f.memory.size,0);assert.equal(f.controller.snapshot().canStart,true);
 f.controller.setIdentity(false);await f.controller.submit(intent);assert.equal(f.calls.length,0);
 const unsupported=fixture({noLocks:true});assert.equal(unsupported.controller.snapshot().blocked,true);await unsupported.controller.submit(intent);assert.equal(unsupported.calls.length,0);
});
test('valid confirmed addition journals only immutable non-secret payload before network; double click sends once',async()=>{
 let resolve;const f=fixture({handler:async(path,body)=>{assert.deepEqual(JSON.parse(f.memory.get(key)),{version:1,request:payload});return new Promise(done=>resolve=()=>done({ok:true,receipt:f.receipt(body)}));}});
 const running=f.controller.submit({...intent,reason:'  Support correction  '});await tick();await f.controller.submit(intent);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'wallet/credit');assert.deepEqual(f.calls[0].body,payload);assert.doesNotMatch(f.memory.get(key),/authToken|never-save/);
 assert.match(f.prompts[0],/player-one.*7 Elmas EKLENSİN/);resolve();await running;assert.equal(f.memory.size,0);assert.equal(f.receipts.length,1);assert.match(f.controller.snapshot().message,/10 → 17/);
});
test('invalid quantities, reasons, account and currency never reach network or journal',async()=>{
 const invalid=[{amount:0},{amount:-1},{amount:1.5},{amount:'7'},{amount:1000001},{amount:Infinity},{currency:'gold; DROP TABLE'},{currency:['gold']},{reason:'  a '},{reason:'a'.repeat(301)},{accountId:''},{accountId:' player-one'},{accountId:'bad\u0000name'},{reason:'line one\nline two'}];
 for(const patch of invalid){const f=fixture();await f.controller.submit({...intent,...patch});assert.equal(f.calls.length,0);assert.equal(f.memory.size,0)}
 const f=fixture();f.allow(false);await f.controller.submit(intent);assert.equal(f.calls.length,0);assert.equal(f.memory.size,0);
 assert.equal(f.tools.validRequest({...payload,requestId:payload.requestId+'\n'}),false);
});
test('lost response retains same payload after reload and blocks every new currency/account',async()=>{
 const f=fixture({handler:async()=>{throw Error('Lost response')}});await f.controller.submit(intent);assert.equal(f.controller.snapshot().canStart,false);assert.ok(f.memory.has(key));
 await f.controller.submit({...intent,accountId:'other',currency:'gold'});assert.equal(f.calls.length,1);
 const reloaded=fixture({memory:f.memory});assert.equal(reloaded.calls.length,0);assert.equal(reloaded.controller.snapshot().pending.requestId,payload.requestId);
 reloaded.setHandler(async()=>({receipt:null}));await reloaded.controller.reconcile();assert.deepEqual(reloaded.calls[0],{path:'wallet/receipt',body:{requestId:payload.requestId}});assert.ok(f.memory.has(key));assert.match(reloaded.controller.snapshot().message,/kanıtlamaz/);
 reloaded.setHandler(async(_path,body)=>({ok:true,replayed:true,receipt:reloaded.receipt(body)}));await reloaded.controller.retry();assert.deepEqual(reloaded.calls[1],{path:'wallet/credit',body:payload});assert.equal(f.memory.size,0);assert.equal(reloaded.receipts.length,1);
});
test('read-only lookup confirms exact immutable receipt without resending any credit',async()=>{
 const memory=new Map([[key,JSON.stringify({version:1,request:payload})]]);const f=fixture({memory});f.setHandler(async()=>({receipt:f.receipt(payload)}));await f.controller.reconcile();assert.deepEqual(f.calls.map(v=>v.path),['wallet/receipt']);assert.equal(f.prompts.length,0);assert.equal(memory.size,0);
});
test('mismatched receipts do not clear pending or claim success',async()=>{
 for(const patch of [{requestId:'other-request-0000000'},{accountId:'other'},{actorId:'other-admin'},{currency:'gold'},{amount:9},{reason:'other reason'},{balanceBefore:-1},{balanceAfter:18},{balanceAfter:2147483648}]){
  const f=fixture();f.setHandler(async(_path,body)=>({ok:true,receipt:{...f.receipt(body),...patch}}));await f.controller.submit(intent);assert.ok(f.memory.has(key));assert.equal(f.receipts.length,0);assert.equal(f.controller.snapshot().canStart,false);
 }
});
test('400/403/409/503 or lookup errors preserve existing unknown outcomes and cannot create fresh key',async()=>{
 for(const status of [400,403,404,409,503]){const memory=new Map([[key,JSON.stringify({version:1,request:payload})]]);const f=fixture({memory,handler:async()=>{throw Object.assign(Error('Rejected'),{status})}});await f.controller.retry();assert.ok(memory.has(key));await f.controller.reconcile();assert.ok(memory.has(key));await f.controller.submit(intent);assert.equal(f.calls.length,2)}
});
test('corrupt/inaccessible journals and failed writes fail closed before sending',async()=>{
 for(const options of [{memory:new Map([[key,'broken json']])},{memory:new Map([[key,JSON.stringify({version:1,request:{...payload,authToken:'forbidden'}})]])},{storageFailure:{read:true}},{storageFailure:{write:true}}]){
  const f=fixture(options);await f.controller.submit(intent);assert.equal(f.calls.length,0);assert.equal(f.controller.snapshot().blocked,true);
 }
 const f=fixture({storageFailure:{remove:true}});await f.controller.submit(intent);assert.equal(f.calls.length,1);assert.ok(f.memory.has(key));assert.equal(f.controller.snapshot().blocked,true);assert.equal(f.receipts.length,0);
});
test('auth switch while request is in flight ignores response and preserves original owner journal',async()=>{
 let done;const f=fixture({handler:async()=>new Promise(resolve=>done=resolve)});const task=f.controller.submit(intent);await tick();f.switchIdentity({accountId:'other-owner',authToken:'different'});done({ok:true,receipt:f.receipt(payload)});await task;
 assert.ok(f.memory.has(key));assert.equal(f.receipts.length,0);assert.equal(f.controller.snapshot().verified,false);f.restore();assert.equal(f.controller.snapshot().pending,null);
});
test('another tab journal discovered under lock blocks new credit; storage refresh reflects it',async()=>{
 let run;const f=fixture({locks:{request:async(_key,_opts,fn)=>new Promise(resolve=>{run=()=>resolve(fn())})}});const task=f.controller.submit(intent);await tick();f.memory.set(key,JSON.stringify({version:1,request:payload}));run();await task;assert.equal(f.calls.length,0);assert.equal(f.controller.snapshot().pending.requestId,payload.requestId);
 f.memory.delete(key);f.controller.syncJournal();assert.equal(f.controller.snapshot().canStart,true);
});
test('duration and source copy do not confuse elapsed time, login provider or unknown history',()=>{
 const f=fixture();assert.equal(f.tools.duration(null),'—');assert.equal(f.tools.duration(65000),'1 dk 5 sn');assert.equal(f.tools.duration(3660000),'1 sa 1 dk');assert.equal(f.tools.sourceLabels.direct_or_unknown,'Doğrudan / bilinmiyor');
 assert.match(admin,/kesin insan oyun süresi değildir/);assert.match(admin,/eski ziyaretler bilinmiyor/);assert.match(admin,/Sayfa yenileme ve yeni sekme ayrı oturum sayılır/);assert.match(admin,/yerel uygulama kanıtı değildir/);assert.match(admin,/legacyGoldSetAvailable===true/);assert.match(admin,/d\.viewer\?\.accountId/);
});
test('page keeps accessible credit controls, text-only user content and existing maintenance scripts',()=>{
 assert.match(html,/id="wallet-credit-message" role="status" aria-live="polite"/);assert.match(html,/min="1" max="1000000" step="1" required/);assert.match(html,/minlength="3" maxlength="300" required/);assert.match(html,/admin-wallet-credits\.js.*admin\.js.*admin-maintenance\.js/);
 assert.doesNotMatch(source,/innerHTML|sendBeacon|authToken\s*:/);assert.match(admin,/node\.textContent=copy/);assert.match(admin,/Object\.assign\(Error\(j.error\|\|'İşlem başarısız'\),\{status:r.status\}\)/);
});
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.disabled=false;this.value='';this.attributes={};this.copy='';}
 set textContent(value){this.copy=String(value);this.children=[]}get textContent(){return this.copy+this.children.map(child=>typeof child==='string'?child:child.textContent).join(' ')}
 append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items;this.copy=''}setAttribute(name,value){this.attributes[name]=value}focus(){this.focused=true}scrollIntoView(){}
 addEventListener(type,handler){this['on'+type]=handler;}
 querySelectorAll(tag){return this.children.flatMap(child=>typeof child==='string'?[]:[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)])}
}
async function pageFixture(options={}){
 const nodes=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const storageMemory=new Map([['hero-auction-login',JSON.stringify({type:'google',user:{sub:'untrusted-client-owner'},authToken:'test-owner-token'})]]);
 const storage={getItem:key=>storageMemory.get(key)||null,setItem:(key,value)=>storageMemory.set(key,value),removeItem:key=>storageMemory.delete(key)};
 const events={},requests=[],prompts=[],confirmations=[];
 const account={display_name:'Safe <player>',account_id:'player-one',gold:500,diamonds:null,magicDust:3,banned:false,analytics:{sessionCount:2,repeatVisits:1,activeMs:65000,lastSeen:'2026-10-27T12:00:00Z',latest:{source:'google_search',platform:'web',device:'desktop'}}};
 const currencyAvailability=Object.fromEntries(['gold','diamonds','magicDust'].map(v=>[v,{available:options.disabled!==true,reason:options.disabled?'disabled':null}]));
 const list={viewer:{accountId:'owner-account'},accounts:[account],walletCredits:{enabled:!options.disabled,available:!options.disabled,currencies:currencyAvailability,maxAmount:1000000,legacyGoldSetAvailable:options.legacyGoldSetAvailable!==false},playerAnalytics:{enabled:!options.disabled,available:!options.disabled,retentionDays:30}};
 const window={localStorage:storage,navigator:{locks:{request:async(_name,_opts,fn)=>fn()}},crypto:{randomUUID:()=>payload.requestId},confirm:copy=>{confirmations.push(copy);return options.confirm!==false},prompt:(copy,initial)=>{prompts.push({copy,initial});return Object.hasOwn(options,'legacyGoldValue')?options.legacyGoldValue:'600'},addEventListener:(name,fn)=>(events[name]??=[]).push(fn),dispatchEvent:event=>(events[event.type]||[]).forEach(fn=>fn(event)),google:{accounts:{id:{initialize(){},renderButton(){}}}}};
 const context={window,localStorage:storage,document:{getElementById:id=>nodes[id],createElement:tag=>new Element(tag)},AbortController,Event:class{constructor(type){this.type=type}},setTimeout,clearTimeout,confirm:window.confirm,prompt:window.prompt,alert(){},fetch:async(url,options)=>{
  const body=JSON.parse(options.body);requests.push({url,body});let data;
  if(url.endsWith('/list')&&!url.includes('moderation'))data=list;
  else if(url.endsWith('/gold'))data={ok:true,gold:body.gold,action:'gold'};
  else if(url.endsWith('/session-report'))data={available:false,reason:'disabled'};
  else if(url.endsWith('/history'))data={history:[],credits:[],creditsAvailable:true};
  else if(url.endsWith('/moderation/list'))data={reports:[]};
  else if(url.endsWith('/wallet/credit')){if(options.failCredit)throw Error('offline');data={ok:true,receipt:{...body,actorId:'owner-account',balanceBefore:10,balanceAfter:10+body.amount,createdAt:'2026-10-27T12:00:00Z'}};delete data.receipt.authToken;}
  else throw Error('Unexpected request '+url);
  return {ok:true,status:200,json:async()=>data};
 }};
 vm.createContext(context);vm.runInContext(source,context);vm.runInContext(readFileSync(new URL('../public/admin-reports.js',import.meta.url),'utf8'),context);vm.runInContext(admin,context);await tick();await tick();
 return {nodes,requests,events,list,window,storageMemory,context,prompts,confirmations};
}
test('admin page integrates authoritative viewer, original gold editor, two additions and honest analytics without interpreting user HTML',async()=>{
 const f=await pageFixture();assert.equal(f.nodes.dashboard.hidden,false);
 const rows=f.nodes.accounts.children;assert.equal(rows.length,1);assert.match(rows[0].textContent,/Safe <player>/);assert.match(rows[0].textContent,/Altın: 500/);assert.match(rows[0].textContent,/Elmas: —/);assert.match(rows[0].textContent,/Büyü tozu: 3/);assert.match(rows[0].textContent,/Oturum: 2 · Ek oturum: 1/);assert.match(rows[0].textContent,/1 dk 5 sn/);assert.doesNotMatch(rows[0].textContent,/Ülke|Şehir|konum/);assert.doesNotMatch(admin,/last\.country|last\.city|geoProvenance/);assert.match(html,/Yaklaşık ülke/);
 const buttons=rows[0].querySelectorAll('button');assert.deepEqual(buttons.map(b=>b.textContent),['Altın düzenle','Altın ekle','Elmas ekle','Büyü tozu ekle','Askıya al','Girişleri gör']);assert.equal(buttons[1].disabled,false);
 buttons[2].onclick();assert.equal(f.nodes['wallet-credit-form'].hidden,false);assert.equal(f.nodes['wallet-credit-amount'].focused,true);f.nodes['wallet-credit-amount'].value='7';f.nodes['wallet-credit-reason'].value='Support correction';await f.nodes['wallet-credit-form'].onsubmit({preventDefault(){}});await tick();
 const credit=f.requests.find(r=>r.url.endsWith('/wallet/credit'));assert.equal(credit.body.accountId,'player-one');assert.equal(credit.body.currency,'diamonds');assert.equal(credit.body.authToken,'test-owner-token');assert.equal(f.storageMemory.has(key),false);assert.match(f.nodes['wallet-credit-message'].textContent,/Makbuz doğrulandı/);
});
test('disabled server capabilities keep new credit controls inert; no analytics claimed retroactively',async()=>{
 const f=await pageFixture({disabled:true});const buttons=f.nodes.accounts.children[0].querySelectorAll('button');assert.equal(buttons.filter(b=>b.textContent.endsWith(' ekle')).every(b=>b.disabled),true);buttons.find(b=>b.textContent==='Elmas ekle').onclick();assert.equal(f.nodes['wallet-credit-account'].value,'');assert.match(f.nodes['analytics-summary'].textContent,/ölçümü kapalı/);assert.match(f.nodes['wallet-credit-availability'].textContent,/sunucuda kapalı/);assert.equal(f.requests.some(r=>r.url.endsWith('/wallet/credit')),false);
});

test('default-off policy preserves the original gold SET control while new currency additions remain disabled',async()=>{
 const f=await pageFixture({disabled:true,legacyGoldSetAvailable:true,legacyGoldValue:'800'});
 const buttons=f.nodes.accounts.children[0].querySelectorAll('button'),gold=buttons.find(b=>b.textContent==='Altın düzenle');
 assert.ok(gold);assert.equal(gold.disabled,false);assert.equal(buttons.filter(b=>b.textContent.endsWith(' ekle')).every(b=>b.disabled),true);
 await gold.onclick();await tick();
 const set=f.requests.filter(r=>r.url.endsWith('/gold'));assert.equal(set.length,1);assert.deepEqual(set[0].body,{accountId:'player-one',gold:800,expectedGold:500,authToken:'test-owner-token'});
 assert.equal(f.prompts[0].copy,'Yeni altın miktarı (0–100000000)');assert.equal(f.prompts[0].initial,'500');assert.equal(f.confirmations[0],'Altın bakiyesi 800 olarak ayarlansın mı?');assert.equal(f.requests.some(r=>r.url.endsWith('/wallet/credit')),false);
});
test('legacy gold retains its original zero/maximum bounds and cancellation checks, with no silent ADD fallback',async()=>{
 for(const value of ['0','100000000']){const f=await pageFixture({disabled:true,legacyGoldSetAvailable:true,legacyGoldValue:value});await f.nodes.accounts.children[0].querySelectorAll('button').find(b=>b.textContent==='Altın düzenle').onclick();assert.equal(f.requests.find(r=>r.url.endsWith('/gold')).body.gold,Number(value));}
 for(const legacyGoldValue of [null,'','-1','1.5','100000001','1e3']){const f=await pageFixture({disabled:true,legacyGoldSetAvailable:true,legacyGoldValue});await f.nodes.accounts.children[0].querySelectorAll('button').find(b=>b.textContent==='Altın düzenle').onclick();assert.equal(f.requests.some(r=>r.url.endsWith('/gold')),false);assert.equal(f.requests.some(r=>r.url.endsWith('/wallet/credit')),false);}
 const cancelled=await pageFixture({disabled:true,legacyGoldSetAvailable:true,confirm:false});await cancelled.nodes.accounts.children[0].querySelectorAll('button').find(b=>b.textContent==='Altın düzenle').onclick();assert.equal(cancelled.requests.some(r=>r.url.endsWith('/gold')),false);
 const enabled=await pageFixture({legacyGoldValue:'700'});const enabledButtons=enabled.nodes.accounts.children[0].querySelectorAll('button');assert.equal(enabledButtons.some(b=>b.textContent==='Altın ekle'),true);assert.equal(enabledButtons.filter(b=>b.textContent.endsWith(' ekle')).every(b=>!b.disabled),true);await enabledButtons.find(b=>b.textContent==='Altın düzenle').onclick();assert.equal(enabled.requests.find(r=>r.url.endsWith('/gold')).body.gold,700);
});
