import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignFromSearch,createCampaignMeasurement,CAMPAIGN_STORAGE_KEY,CAMPAIGN_TTL_MS} from '../public/campaign-measurement.js';
const config={enabled:true,campaigns:[{id:'launch_meta',source:'instagram',medium:'paid_social',campaign:'launch'}]};
const search='?utm_source=instagram&utm_medium=paid_social&utm_campaign=launch';
const login=(sub='one',token='auth-one')=>({type:'google',user:{sub},authToken:token});
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(options={}){
 const map=new Map(),requests=[];let time=1000;
 const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const client=createCampaignMeasurement({storage,search,now:()=>time,send:async(path,body,auth)=>{requests.push({path,body,auth});return {accepted:true};},...options});
 return {client,requests,map,storage,advance:ms=>time+=ms};
}
test('only exact unique allowlisted UTM tuples resolve; ad IDs are ignored, not copied',()=>{
 assert.equal(campaignFromSearch(search+'&gclid=secret&fbclid=secret',config),'launch_meta');
 for(const q of ['', '?gclid=x',search+'&utm_source=instagram',search.replace('launch','unknown'),search.replace('instagram','Instagram'),'?utm_source='+ 'x'.repeat(2100)])assert.equal(campaignFromSearch(q,config),null);
 assert.equal(campaignFromSearch(search,{...config,enabled:false}),null);
 assert.equal(campaignFromSearch(search,{...config,campaigns:[...config.campaigns,...config.campaigns]}),null);
});
test('organic, disabled and portal sessions never send',async()=>{
 for(const options of [{search:''},{enabled:false}]){const f=fixture(options);f.client.configure(config);f.client.setLogin(login());f.client.event('intro_viewed');await tick();assert.equal(f.requests.length,0);assert.equal(f.map.size,0);}
 const f=fixture();f.client.configure(config);f.client.setLogin({...login(),type:'crazygames'});await tick();assert.equal(f.requests.length,0);
});
test('preauth persists only canonical campaign and TTL, then attributes and sends each allowed event once',async()=>{
 const f=fixture({search:search+'&gclid=secret&fbclid=private&url=https://example.com'});f.client.configure(config);
 assert.deepEqual(JSON.parse(f.map.get(CAMPAIGN_STORAGE_KEY)),{campaignId:'launch_meta',expiresAt:1000+CAMPAIGN_TTL_MS,events:[]});
 assert.equal(f.requests.length,0);f.client.setLogin(login());f.client.event('intro_viewed');await tick();
 for(const event of ['intro_viewed','intro_completed','intro_skipped','bot_started','game_finished']){f.client.event(event);f.client.event(event);}await tick();
 assert.deepEqual(f.requests.map(r=>r.body),[{campaignId:'launch_meta'},{event:'intro_viewed'},{event:'intro_completed'},{event:'intro_skipped'}]);
 assert.ok(f.requests.every(r=>r.auth==='auth-one'));assert.doesNotMatch([...f.map.values()].join(''),/gclid|fbclid|secret|private|https|auth-one|utm_/);
});
test('events awaiting config and attribution are bounded and wait for explicit server acceptance',async()=>{
 const f=fixture({send:async()=>({accepted:false})});f.client.setLogin(login());f.client.event('intro_viewed');f.client.configure(config);await tick();
 assert.equal(JSON.parse(f.map.get(CAMPAIGN_STORAGE_KEY)).attributed,undefined);
 const g=fixture();g.client.setLogin(login());g.client.event('intro_viewed');g.client.configure(config);await tick();assert.equal(g.requests.length,2);
});
test('logout and account switch cannot transfer a campaign or use stale attribution completion',async()=>{
 let resolve;const f=fixture({send:()=>new Promise(r=>resolve=r)});f.client.configure(config);f.client.setLogin(login());f.client.event('intro_viewed');
 f.client.setLogin(null);f.client.setLogin(login('two','auth-two'));resolve({accepted:true});await tick();
 assert.equal(JSON.parse(f.map.get(CAMPAIGN_STORAGE_KEY)).account,'one');assert.equal(JSON.parse(f.map.get(CAMPAIGN_STORAGE_KEY)).attributed,undefined);
 f.client.event('intro_completed');await tick();assert.equal(JSON.parse(f.map.get(CAMPAIGN_STORAGE_KEY)).events.length,0);
});
test('reload retains attribution and event dedupe, but cannot assign it to another account',async()=>{
 const f=fixture();f.client.configure(config);f.client.setLogin(login());f.client.event('intro_viewed');await tick();
 const requests=[];const client=createCampaignMeasurement({storage:f.storage,now:()=>1000,send:async(...args)=>{requests.push(args);return {accepted:true};}});
 client.configure(config);client.setLogin(login());client.event('intro_viewed');client.event('intro_completed');await tick();assert.equal(requests.length,1);assert.deepEqual(requests[0][1],{event:'intro_completed'});
 client.setLogin(login('other','other-auth'));client.event('intro_skipped');await tick();assert.equal(requests.length,1);
});
test('expired and malformed campaign storage is discarded and contains no persistent identifier for organic visits',async()=>{
 for(const value of ['bad',JSON.stringify({campaignId:'launch_meta',expiresAt:1}),JSON.stringify({campaignId:'launch_meta',expiresAt:99999999}),JSON.stringify({campaignId:'other',expiresAt:2000})]){
 const f=fixture({search:''});f.map.set(CAMPAIGN_STORAGE_KEY,value);f.client.configure(config);f.client.setLogin(login());await tick();assert.equal(f.map.size,0);assert.equal(f.requests.length,0);
 }
 const f=fixture();f.client.configure(config);f.advance(CAMPAIGN_TTL_MS+1);f.client.setLogin(login());await tick();assert.equal(f.requests.length,0);assert.equal(f.map.size,0);
});
test('network/storage failures never throw or cause repeated automatic attribution writes',async()=>{
 let writes=0;const f=fixture({storage:{getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}},send:async()=>{writes++;throw Error('offline');}});
 f.client.configure(config);f.client.setLogin(login());await tick();for(let i=0;i<100;i++){f.client.setLogin(login());f.client.event('intro_viewed');}await tick();assert.equal(writes,1);
 f.client.destroy();f.client.event('intro_completed');await tick();assert.equal(writes,1);
});
