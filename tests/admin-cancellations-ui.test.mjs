import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/admin-maintenance.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Node{
 constructor(tag='div'){this.tag=tag;this.hidden=false;this.disabled=false;this.checked=false;this.children=[];this.attributes={};this.copy='';}
 set textContent(value){this.copy=String(value);this.children=[]}get textContent(){return this.copy+this.children.map(child=>child.textContent).join(' ')}
 replaceChildren(...items){this.copy='';this.children=items}append(...items){this.children.push(...items)}setAttribute(key,value){this.attributes[key]=String(value)}
 querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)])}
}
const candidates=Array.from({length:4},(_,index)=>({id:'a'.repeat(63)+index,digest:'f'.repeat(63)+index,lastActivity:1700000000000+index,refundGoldPerSeat:50,paidSeats:2}));
const paused={bootId:'first-boot',revision:7,paused:true,persistenceConfirmed:true,databaseHealthy:true,ready:false,uncertainLegacyEntries:0,uncertainInvitations:0};
const journalKey='hero-auction-admin-cancellation-pending:admin-1';
const body=(items=candidates.slice(0,3),status=paused)=>({expectedBootId:status.bootId,expectedRevision:status.revision,candidates:items.map(({id,digest})=>({id,digest}))});
function fixture(options={}){
 const ids=[...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);const nodes=Object.fromEntries(ids.map(id=>[id,new Node()]));
 const events={},calls=[],prompts=[],memory=options.memory||new Map();let status={...paused,...options.status},allowed=true,preview=options.preview,handler=options.handler;
 const failures={read:false,write:false,remove:false,...options.storageFailure};
 const window={confirm:message=>{prompts.push(message);options.onConfirm?.();return allowed},addEventListener:(name,fn)=>events[name]=fn,sessionStorage:{getItem:key=>{if(failures.read)throw Error('read blocked');return memory.get(key)},setItem:(key,value)=>{if(failures.write)throw Error('write blocked');memory.set(key,value)},removeItem:key=>{if(failures.remove)throw Error('remove blocked');memory.delete(key)}}};
 const context={document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},window,login:{user:{sub:options.owner||'admin-1'},authToken:'never-journal-this-token'},api:async(path,payload)=>{
  calls.push({path,body:payload===undefined?undefined:JSON.parse(JSON.stringify(payload))});
  if(handler){const result=await handler(path,payload);if(result!==undefined)return result;}
  if(path==='economy/status')return structuredClone(status);
  if(path==='economy/pause'){status={...status,paused:payload.paused,revision:status.revision+1};return structuredClone(status)}
  if(path==='economy/cancellations/preview')return structuredClone(preview||{...status,requiredSelectionCount:3,candidates});
  if(path==='economy/cancellations/execute')return{ok:true,replayed:false,cancelled:payload.candidates.map(({id})=>({id,refundGold:100})),refundGold:300};
  throw Error('Unexpected API path '+path);
 }};
 vm.createContext(context);vm.runInContext(source,context);
 return {nodes,events,calls,prompts,memory,context,failures,allow:value=>allowed=value,setStatus:patch=>status={...status,...patch},setPreview:value=>preview=value,setHandler:value=>handler=value};
}
const button=(f,id)=>f.nodes['economy-cancellation-'+id];
const inputs=f=>button(f,'candidates').querySelectorAll('input');
async function verified(options){const f=fixture(options);f.events['hero:admin-verified']();await tick();return f}
async function previewed(options){const f=await verified(options);button(f,'preview').onclick();await tick();return f}
const select=(f,count=3)=>inputs(f).slice(0,count).forEach(input=>{input.checked=true;input.onchange()});
const mutations=f=>f.calls.filter(call=>call.path.endsWith('/execute'));

test('verification reads status only; preview requires durable healthy pause and never auto cancels',async()=>{
 const cold=fixture();assert.equal(cold.calls.length,0);assert.equal(button(cold,'preview').disabled,true);assert.equal(button(cold,'execute').disabled,true);
 for(const status of [{paused:false},{persistenceConfirmed:false},{databaseHealthy:false}]){const f=await verified({status});button(f,'preview').onclick();await tick();assert.deepEqual(f.calls.map(call=>call.path),['economy/status']);assert.equal(button(f,'preview').disabled,true)}
 const f=await verified();assert.equal(button(f,'preview').disabled,false);assert.equal(mutations(f).length,0);assert.equal(f.memory.size,0);
});
test('read-only preview shows full immutable IDs, recent activity and50 per paid seat; starts unchecked',async()=>{
 const f=await previewed();assert.equal(inputs(f).length,4);assert.equal(inputs(f).every(input=>!input.checked),true);assert.match(button(f,'candidates').textContent,new RegExp(candidates[0].id));assert.match(button(f,'candidates').textContent,/2 ücretli koltuk.*50 altın/);assert.match(button(f,'message').textContent,/iptal veya iade yapılmadı/);assert.equal(mutations(f).length,0);assert.equal(button(f,'execute').disabled,true);
});
test('exactly three explicit selections and confirmation are required; fourth selection cannot expand scope',async()=>{
 const f=await previewed();select(f,2);button(f,'execute').onclick();await tick();assert.equal(f.prompts.length,0);assert.equal(mutations(f).length,0);
 const third=inputs(f)[2];third.checked=true;third.onchange();assert.equal(button(f,'execute').disabled,false);assert.equal(inputs(f)[3].disabled,true);
 inputs(f)[3].checked=true;inputs(f)[3].onchange();assert.equal(inputs(f)[3].checked,false);
 f.allow(false);button(f,'execute').onclick();await tick();assert.equal(mutations(f).length,0);assert.equal(f.memory.size,0);assert.match(f.prompts[0],/TAM ÜÇ/);for(const item of candidates.slice(0,3))assert.ok(f.prompts[0].includes(item.id));assert.ok(!f.prompts[0].includes(candidates[3].id));assert.match(f.prompts[0],/Sunucu: first-boot · Sürüm: 7/);
});
test('one confirmed action sends exact captured identifiers and boot proof, with no tokens or amounts from the UI',async()=>{
 const f=await previewed();select(f);button(f,'execute').onclick();button(f,'execute').onclick();await tick();
 assert.equal(mutations(f).length,1);assert.deepEqual(mutations(f)[0].body,body());assert.equal(f.memory.size,0);assert.match(button(f,'message').textContent,/Üç iptal makbuzu doğrulandı.*300 altın/);assert.equal(inputs(f).length,0);assert.equal(button(f,'execute').disabled,true);assert.equal(f.calls.at(-1).path,'economy/status');
});
test('preview rejects stale boot/revision, unpaused responses, malformed or duplicate identities',async()=>{
 const base={...paused,requiredSelectionCount:3,candidates};
 for(const preview of [{...base,bootId:'old'},{...base,revision:6},{...base,paused:false},{...base,persistenceConfirmed:false},{...base,requiredSelectionCount:2},{...base,candidates:[candidates[0],candidates[0]]},{...base,candidates:[{...candidates[0],digest:'bad'}]},{...base,candidates:[{...candidates[0],refundGoldPerSeat:100}]},{...base,candidates:[{...candidates[0],lastActivity:null}]}]){
  const f=await previewed({preview});assert.equal(inputs(f).length,0);assert.equal(button(f,'execute').disabled,true);assert.equal(mutations(f).length,0);assert.match(button(f,'message').textContent,/eşleşmiyor/);
 }
});
test('status refresh or pause transition invalidates preview and all prior selections',async()=>{
 for(const action of ['refresh','resume']){const f=await previewed();select(f);f.nodes['economy-maintenance-'+action].onclick();await tick();assert.equal(inputs(f).length,0);assert.equal(button(f,'execute').disabled,true);assert.equal(mutations(f).length,0);}
});
test('unknown result keeps account-scoped ID-only journal and blocks new choices and reopening',async()=>{
 const f=await previewed({handler:async path=>{if(path.endsWith('/execute'))throw Error('Lost response')}});select(f);button(f,'execute').onclick();await tick();
 assert.equal(mutations(f).length,1);assert.deepEqual(JSON.parse(f.memory.get(journalKey)),{version:1,request:body()});assert.doesNotMatch(f.memory.get(journalKey),/authToken|never-journal|gold|accountId/);
 assert.match(button(f,'message').textContent,/Sonuç varsayılmıyor/);assert.equal(button(f,'preview').disabled,true);assert.equal(button(f,'execute').disabled,true);assert.equal(button(f,'reconcile').hidden,false);assert.equal(f.nodes['economy-maintenance-resume'].disabled,true);
 button(f,'preview').onclick();await tick();assert.equal(f.calls.filter(call=>call.path.endsWith('/preview')).length,1);
});
test('reload/restart recovery reads fresh paused boot and requires consent, retaining exact original IDs/digests',async()=>{
 const memory=new Map([[journalKey,JSON.stringify({version:1,request:body()})]]);const f=await verified({memory,status:{bootId:'new-boot',revision:11}});
 assert.equal(mutations(f).length,0);assert.equal(button(f,'reconcile').hidden,false);
 f.allow(false);button(f,'reconcile').onclick();await tick();assert.equal(f.calls.at(-1).path,'economy/status');assert.equal(mutations(f).length,0);assert.match(f.prompts[0],/Sunucu: new-boot · Sürüm: 11/);assert.ok(memory.has(journalKey));
 f.allow(true);f.setHandler(async(path,payload)=>path.endsWith('/execute')?{ok:true,replayed:true,cancelled:payload.candidates.map(({id})=>({id,refundGold:100})),refundGold:300}:undefined);
 button(f,'reconcile').onclick();button(f,'reconcile').onclick();await tick();assert.equal(mutations(f).length,1);assert.deepEqual(mutations(f)[0].body,body(undefined,{bootId:'new-boot',revision:11}));assert.equal(memory.size,0);assert.match(button(f,'message').textContent,/Önceki makbuzlar yeniden okundu; ikinci ödeme yapılmadı/);
});
test('unknown prior outcome is never cleared by a later409 and cannot silently reselect fresh rooms',async()=>{
 const memory=new Map([[journalKey,JSON.stringify({version:1,request:body()})]]);const f=await verified({memory,handler:async path=>{if(path.endsWith('/execute'))throw Object.assign(Error('stale'),{status:409})}});
 button(f,'reconcile').onclick();await tick();assert.ok(memory.has(journalKey));assert.equal(button(f,'preview').disabled,true);assert.match(button(f,'message').textContent,/Sonuç varsayılmıyor/);
});
test('definite first-attempt400/409 rejection invalidates stale preview, requiring a new status read',async()=>{
 for(const status of [400,409]){const f=await previewed({handler:async path=>{if(path.endsWith('/execute'))throw Object.assign(Error('rejected'),{status})}});select(f);button(f,'execute').onclick();await tick();assert.equal(f.memory.size,0);assert.equal(inputs(f).length,0);assert.equal(button(f,'execute').disabled,true);assert.equal(button(f,'preview').disabled,true);assert.match(button(f,'message').textContent,/İstek reddedildi/);}
});
test('unpaused or unavailable fresh reconciliation status cannot send an old-boot mutation',async()=>{
 for(const status of [{paused:false},{databaseHealthy:false},{persistenceConfirmed:false}]){const memory=new Map([[journalKey,JSON.stringify({version:1,request:body()})]]);const f=await verified({memory,status});button(f,'reconcile').onclick();await tick();assert.equal(mutations(f).length,0);assert.equal(f.prompts.length,0);assert.ok(memory.has(journalKey));assert.match(button(f,'message').textContent,/hâlâ belirsiz/);}
});
test('corrupt or inaccessible journal blocks execution; a failed journal write sends nothing',async()=>{
 for(const options of [{memory:new Map([[journalKey,'bad json']])},{storageFailure:{read:true}},{memory:new Map([[journalKey,JSON.stringify({version:1,request:{...body(),authToken:'bad'}})]])}]){const f=await previewed(options);select(f);button(f,'execute').onclick();await tick();assert.equal(mutations(f).length,0);assert.equal(button(f,'execute').disabled,true);assert.match(button(f,'pending').textContent,/işlem kaydı/);}
 const f=await previewed();select(f);f.failures.write=true;button(f,'execute').onclick();await tick();assert.equal(mutations(f).length,0);assert.match(button(f,'message').textContent,/gönderilmedi/);
});
test('receipt IDs, unique count and refund totals must match before successful completion is shown',async()=>{
 for(const result of [{ok:true,replayed:false,cancelled:[],refundGold:0},{ok:true,replayed:false,cancelled:candidates.slice(1).map(({id})=>({id,refundGold:100})),refundGold:300},{ok:true,replayed:false,cancelled:candidates.slice(0,3).map(({id})=>({id,refundGold:100})),refundGold:200}]){
  const f=await previewed({handler:async path=>path.endsWith('/execute')?result:undefined});select(f);button(f,'execute').onclick();await tick();assert.ok(f.memory.has(journalKey));assert.doesNotMatch(button(f,'message').textContent,/Üç iptal makbuzu doğrulandı/);assert.match(button(f,'message').textContent,/doğrulanamadı/);
 }
});
test('auth switch during preview/execute discards stale UI while preserving unknown exact request for original admin',async()=>{
 for(const path of ['economy/cancellations/preview','economy/cancellations/execute']){
  let resolve;const f=await verified({handler:async name=>name===path?new Promise(done=>resolve=done):undefined});button(f,'preview').onclick();await tick();
  if(path.endsWith('/execute')){select(f);button(f,'execute').onclick();await tick();}
  f.events.storage({key:'hero-auction-login'});f.context.login={user:{sub:'other-admin'}};
  resolve(path.endsWith('/preview')?{...paused,requiredSelectionCount:3,candidates}:{ok:true,replayed:false,cancelled:candidates.slice(0,3).map(({id})=>({id,refundGold:100})),refundGold:300});await tick();
  assert.equal(f.nodes['economy-maintenance-panel'].hidden,true);assert.equal(inputs(f).length,0);assert.equal(button(f,'execute').disabled,true);
  if(path.endsWith('/execute'))assert.ok(f.memory.has(journalKey));
  f.events['hero:admin-verified']();await tick();assert.equal(button(f,'reconcile').hidden,true);
 }
});
test('backend HTTP status is preserved by existing admin helper; page keeps normal auth and accessible controls',()=>{
 const admin=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');assert.match(admin,/Object\.assign\(Error\(j.error\|\|'İşlem başarısız'\),\{status:r.status\}\)/);
 assert.match(html,/id="economy-cancellation-panel" aria-labelledby="economy-cancellation-title"/);assert.match(html,/id="economy-cancellation-message" role="status" aria-live="polite"/);
 assert.doesNotMatch(source,/fetch\(|\.authToken|prompt\(/);assert.match(source,/api\('economy\/cancellations\/preview'\)/);assert.match(source,/api\('economy\/cancellations\/execute',payload\)/);
});
