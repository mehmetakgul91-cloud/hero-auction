import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAdminAds} from '../public/admin-ads.js';
class Node{
 constructor(tag,doc){this.tag=tag;this.doc=doc;this.children=[];this.attrs={};this.textContent='';this.hidden=false;this.disabled=false;this.listeners={};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,v){this.listeners[k]=v;}removeEventListener(k){delete this.listeners[k];}remove(){this.removed=true;}
 set id(v){this._id=v;this.doc.ids[v]=this;}get id(){return this._id;}
}

const response=()=>({available:true,source:'google_ads_api',customerId:'8386605798',campaignId:'24441908595',currency:'TRY',timeZone:'Europe/Istanbul',days:7,period:{start:'2026-11-03',end:'2026-11-09'},impressions:100,clicks:4,costMicros:'12345678',fetchedAt:'2026-11-09T12:00:00Z',stale:false});
function fixture(request=async()=>response()){
 const doc={ids:{},createElement(tag){return new Node(tag,this)},getElementById(id){return this.ids[id]},querySelector(){return this.body}};doc.body=new Node('body',doc);let verified=true;const calls=[];
 const ui=mountAdminAds({document:doc,request:async(...args)=>{calls.push(args);return request(...args)},isVerified:()=>verified});return{doc,ui,calls,verify:v=>verified=v,node:id=>doc.ids['admin-ads-'+id]};
}
const content=n=>[n.textContent,...n.children.map(content)].join(' ');
test('read-only report labels media cost, provenance, currency and time',async()=>{const f=fixture();await f.ui.load();assert.deepEqual(f.calls,[['google-ads-report',{days:7}]]);assert.equal(f.node('results').children.length,4);assert.match(content(f.node('results')),/12,3457/);assert.match(content(f.node('panel')),/kalan bütçe değildir/);assert.match(f.node('status').textContent,/2026-11-03/);assert.match(f.node('status').textContent,/TRY/)});
test('not connected and errors never become fake zeros',async()=>{for(const data of [{available:false,reason:'not_connected'},{available:false,reason:'temporarily_unavailable'},null]){const f=fixture(async()=>data);await f.ui.load();assert.equal(f.node('results').children.length,0);assert.ok(f.node('status').textContent)}const f=fixture(async()=>{throw Error('secret')});await f.ui.load();assert.doesNotMatch(content(f.node('panel')),/secret/)});
test('logout and destroy discard in-flight results; unauthenticated requests never run',async()=>{let resolve;const f=fixture(()=>new Promise(r=>resolve=r));f.verify(false);await f.ui.load();assert.equal(f.calls.length,0);f.verify(true);const p=f.ui.load();f.ui.clear();f.verify(false);resolve(response());await p;assert.equal(f.node('panel').hidden,true);assert.equal(f.node('results').children.length,0);f.ui.destroy();assert.equal(f.node('panel').removed,true)});
test('repeat clicks are coalesced and unsupported day selection refused',async()=>{let resolve;const f=fixture(()=>new Promise(r=>resolve=r));const p=f.ui.load();await f.ui.load();assert.equal(f.calls.length,1);resolve(response());await p;f.node('days').value='2';await f.ui.load();assert.equal(f.calls.length,1)});
test('invalid report identifiers metrics and periods fail closed',async()=>{for(const patch of [{currency:'USD'},{customerId:'wrong'},{source:'demo'},{impressions:-1},{clicks:'4'},{costMicros:'-5'},{costMicros:'9007199254740992'},{period:{start:'2026-02-30',end:'2026-03-08'}},{period:{start:'2026-11-09',end:'2026-11-03'}},{period:{start:'2026-11-01',end:'2026-11-09'}},{fetchedAt:'bad'}]){const f=fixture(async()=>({...response(),...patch}));await f.ui.load();assert.equal(f.node('results').children.length,0)}});
test('true zero and stale source retain correct meaning',async()=>{const f=fixture(async()=>({...response(),impressions:0,clicks:0,costMicros:'0',stale:true}));await f.ui.load();assert.match(content(f.node('results')),/hesaplanamaz/);assert.match(f.node('status').textContent,/son alınan veri/);assert.equal(f.node('results').children.length,4)});
