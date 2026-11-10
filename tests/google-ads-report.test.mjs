import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createGoogleAdsReporter} from '../google-ads-report.js';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const email='hero-ads-reader@hero-action.iam.gserviceaccount.com';
const key={type:'service_account',project_id:'hero-action',client_email:email,token_uri:'https://oauth2.googleapis.com/token',private_key:pair.privateKey.export({type:'pkcs8',format:'pem'})};
const env={HERO_GOOGLE_ADS_REPORT_ENABLED:'1',HERO_GOOGLE_ADS_SERVICE_EMAIL:email};
const row={customer:{id:'8386605798',currencyCode:'TRY',timeZone:'Europe/Istanbul'},campaign:{id:'24441908595'},metrics:{impressions:'100',clicks:'4',costMicros:'2000000'}};
function fixture({data=[{results:[row]}],keyData=key,config=env,tokenData={access_token:'synthetic-token',token_type:'Bearer',expires_in:3600},reportResponse}={}){let time=Date.parse('2026-11-09T21:30:00Z'),fail=false;const calls=[];
 const client=createGoogleAdsReporter({env:config,readKey:async()=>JSON.stringify(keyData),now:()=>time,fetchImpl:async(url,options)=>{calls.push({url,options});if(fail)return new Response('private upstream details',{status:503});if(url.includes('oauth2'))return Response.json(tokenData);return reportResponse?reportResponse():Response.json(data);}});
 return {client,calls,advance:ms=>time+=ms,fail:()=>fail=true};}
test('disabled or invalid principal makes no network calls',async()=>{
 for(const config of [{},{...env,HERO_GOOGLE_ADS_SERVICE_EMAIL:'different-reader@hero-action.iam.gserviceaccount.com'},{...env,HERO_GOOGLE_ADS_REPORT_ENABLED:'0'},{...env,HERO_GOOGLE_ADS_SERVICE_EMAIL:'other@example.com'},{...env,HERO_GOOGLE_ADS_SERVICE_EMAIL:email+'\n'}]){const f=fixture({config});assert.equal((await f.client.read()).reason,'not_connected');assert.equal(f.calls.length,0);}
});
test('strict days, pinned read-only endpoints, signed JWT and Turkey dates',async()=>{
 const f=fixture();for(const request of [7,'7',null,[]])await assert.rejects(f.client.read(request),{status:400});for(const days of ['7',0,2,31,null])await assert.rejects(f.client.read({days}),{status:400});const result=await f.client.read({days:7});assert.equal(result.available,true);assert.deepEqual(result.period,{start:'2026-11-04',end:'2026-11-10'});assert.equal(result.costMicros,'2000000');assert.equal(result.averageCpcMicros,500000);
 assert.deepEqual(f.calls.map(c=>c.url),['https://oauth2.googleapis.com/token','https://googleads.googleapis.com/v26/customers/8386605798/googleAds:searchStream']);
 for(const c of f.calls){assert.equal(c.options.redirect,'error');assert.equal(c.options.method,'POST');assert.ok(c.options.signal instanceof AbortSignal);}
 const jwt=new URLSearchParams(f.calls[0].options.body).get('assertion').split('.');assert.ok(verify('RSA-SHA256',Buffer.from(jwt.slice(0,2).join('.')),pair.publicKey,Buffer.from(jwt[2],'base64url')));
 const claims=JSON.parse(Buffer.from(jwt[1],'base64url'));assert.equal(claims.iss,email);assert.equal(claims.exp-claims.iat,3600);assert.equal(claims.sub,undefined);assert.equal(claims.scope,'https://www.googleapis.com/auth/adwords');assert.equal(claims.aud,'https://oauth2.googleapis.com/token');
 assert.match(JSON.parse(f.calls[1].options.body).query,/WHERE campaign.id = 24441908595/);assert.doesNotMatch(JSON.stringify(result),/synthetic-token|private_key/);
});
test('all supported windows are inclusive and correct over month/year boundaries',async()=>{
 for(const days of [1,7,30]){const f=fixture();const r=await f.client.read({days});assert.equal((Date.parse(r.period.end)-Date.parse(r.period.start))/86400000+1,days);}
 const f=fixture();f.advance(Date.parse('2027-01-01T00:00:00Z')-Date.parse('2026-11-09T21:30:00Z'));assert.deepEqual((await f.client.read({days:7})).period,{start:'2026-12-26',end:'2027-01-01'});
});
test('coalesces requests, caches 15 minutes, marks stale on failure, isolates periods',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.client.read(),f.client.read()]);assert.deepEqual(a,b);assert.equal(f.calls.length,2);await f.client.read();assert.equal(f.calls.length,2);
 f.advance(16*60000);f.fail();const stale=await f.client.read();assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,a.fetchedAt);const n=f.calls.length;await f.client.read();assert.equal(f.calls.length,n);
 f.advance(86400000);const next=await f.client.read();assert.equal(next.available,false);assert.equal(next.costMicros,undefined);assert.doesNotMatch(JSON.stringify(next),/private/);
});
test('empty, wrong identity/currency/timezone and malformed metrics cannot become zeros',async()=>{
 const invalid=[[],[{results:[]}],[{results:[row,row]}],[{results:[{...row,customer:{...row.customer,id:'1'}}]}],[{results:[{...row,customer:{...row.customer,currencyCode:'USD'}}]}],[{results:[{...row,customer:{...row.customer,timeZone:'UTC'}}]}],[{results:[{...row,campaign:{id:'1'}}]}]];
 for(const metrics of [undefined,null,false,'broken',[],{}, {clicks:'0',costMicros:'0'}, {...row.metrics,costMicros:'-1'},{...row.metrics,clicks:'9007199254740992'},{...row.metrics,clicks:4}])invalid.push([{results:[{...row,metrics}]}]);
 for(const data of invalid){const f=fixture({data});const r=await f.client.read();assert.equal(r.available,false);assert.equal(r.costMicros,undefined);}
});
test('verified explicit zero metrics distinct from disconnected; zero clicks has null CPC',async()=>{
 const f=fixture({data:[{results:[{...row,metrics:{impressions:'0',clicks:'0',costMicros:'0'}}]}]});const r=await f.client.read();assert.equal(r.available,true);assert.equal(r.costMicros,'0');assert.equal(r.averageCpcMicros,null);
});
test('key identity and destination pinned; invalid key never transmitted',async()=>{
 for(const keyData of [null,{...key,project_id:'elsewhere'},{...key,client_email:'admin@example.com'},{...key,token_uri:'https://evil.test'},{...key,private_key:'bad'},{...key,extra:'x'.repeat(32769)}]){const f=fixture({keyData});assert.equal((await f.client.read()).available,false);assert.equal(f.calls.length,0);}
});
test('invalid token, oversized/malformed upstream body, failure are generic unknown',async()=>{
 for(const tokenData of [null,{access_token:'secret',token_type:'Other',expires_in:3600},{access_token:'secret',token_type:'Bearer',expires_in:1}]){const f=fixture({tokenData});assert.equal((await f.client.read()).available,false);assert.equal(f.calls.length,1);}
 for(const reportResponse of [()=>new Response('x'.repeat(1048577)),()=>new Response('{bad'),()=>new Response('secret',{status:403})]){const f=fixture({reportResponse});const result=await f.client.read();assert.equal(result.available,false);assert.doesNotMatch(JSON.stringify(result),/secret|bad/);}
});
test('source has no mutating Ads API, logging, developer token or manager impersonation',()=>{
 const src=readFileSync(new URL('../google-ads-report.js',import.meta.url),'utf8');assert.doesNotMatch(src,/googleAds:mutate|uploadClickConversions|console\.|developer-token|login-customer-id/);
});
