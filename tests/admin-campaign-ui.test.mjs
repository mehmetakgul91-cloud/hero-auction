import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountAdminCampaign} from '../public/admin-campaign.js';
class Node{
 constructor(tag,doc){this.tag=tag;this.doc=doc;this.children=[];this.attrs={};this.textContent='';this.hidden=false;this.disabled=false;this.listeners={};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,v){this.listeners[k]=v;}removeEventListener(k){delete this.listeners[k];}remove(){this.removed=true;}
 set id(v){this._id=v;this.doc.ids[v]=this;}get id(){return this._id;}
}
const row={campaignId:'launch_meta',authenticated:5,intro_viewed:4,intro_completed:3,intro_skipped:1,first_bot_started:3,first_bot_completed:2,forfeited:0,server_failures:0,idle_cancelled:0,pending:1,other_terminal:0};
const response=(days=7)=>({days,retentionDays:30,attributionProvenance:'client_reported',introProvenance:'client_reported',matchProvenance:'durable_server_records',campaigns:[row]});
function fixture(request=async()=>response()){
 const doc={ids:{},createElement(tag){return new Node(tag,this);},getElementById(id){return this.ids[id];},querySelector(){return this.body;}};doc.body=new Node('body',doc);let verified=true;const calls=[];
 const ui=mountAdminCampaign({document:doc,request:async(...args)=>{calls.push(args);return request(...args);},isVerified:()=>verified,now:()=>new Date('2026-11-08T12:00:00Z')});
 return {doc,ui,calls,verify:v=>verified=v,node:id=>doc.ids['admin-campaign-'+id]};
}
const content=n=>[n.textContent,...n.children.map(content)].join(' ');
test('aggregate report uses injected admin request only and labels provenance explicitly',async()=>{
 const f=fixture();assert.equal(f.node('panel').hidden,true);await f.ui.load();assert.deepEqual(f.calls,[['campaign-funnel',{days:7}]]);
 assert.match(content(f.node('results')),/launch_meta/);assert.match(content(f.node('results')),/kalıcı sunucu sonucu/);assert.match(f.node('status').textContent,/bu cihaz/);assert.equal(f.node('load').disabled,false);
 const src=readFileSync('public/admin-campaign.js','utf8');assert.doesNotMatch(src,/innerHTML|localStorage|authToken|fetch\(|wallet|refund|credit\(/);assert.match(src,/textContent/);
});
test('unverified viewers never fetch; stale response after logout cannot reveal aggregates',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));f.verify(false);await f.ui.load();assert.equal(f.calls.length,0);f.verify(true);const p=f.ui.load();f.ui.clear();f.verify(false);resolve(response());await p;assert.equal(f.node('panel').hidden,true);assert.equal(f.node('results').children.length,0);
});
test('only 1/7/30 days accepted, repeat clicks lock, latest period is validated',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));f.node('days').value='30';const p=f.ui.load();await f.ui.load();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0][1],{days:30});resolve(response(30));await p;
 f.node('days').value='2';await f.ui.load();assert.equal(f.calls.length,1);assert.match(f.node('status').textContent,/1, 7 veya 30/);
});
test('unavailable, malformed counts and noncanonical labels never render unsafe or fabricated rows',async()=>{
 for(const data of [{enabled:false},{...response(),campaigns:[{...row,campaignId:'<img onerror=alert(1)>'}]},{...response(),campaigns:[{...row,authenticated:-1}]},{...response(),campaigns:[{...row,first_bot_completed:'2'}]}]){
  const f=fixture(async()=>data);await f.ui.load();assert.equal(f.node('results').children.length,0);assert.doesNotMatch(content(f.node('panel')),/<img/);
 }
 const f=fixture(async()=>{throw Object.assign(Error('internal SQL private'),{status:503});});await f.ui.load();assert.match(f.node('status').textContent,/kullanılamıyor/);assert.doesNotMatch(content(f.node('panel')),/SQL/);
});
test('empty data means no observed cohort, not invented zero account records',async()=>{
 const f=fixture(async()=>({...response(),campaigns:[]}));await f.ui.load();assert.match(f.node('status').textContent,/kampanya kaydı yok/);assert.equal(f.node('results').children.length,0);f.ui.destroy();assert.equal(f.node('panel').removed,true);
});

test('campaign cards wrap long canonical labels without widening mobile viewport',()=>{
 const css=readFileSync('public/admin-responsive.css','utf8');
 assert.match(css,/#admin-campaign-panel h3\{overflow-wrap:anywhere\}/);
 assert.match(css,/#admin-campaign-results dl\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
 assert.match(css,/#admin-campaign-results article\{min-width:0/);
});
