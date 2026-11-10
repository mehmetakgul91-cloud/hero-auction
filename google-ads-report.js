// Server-only reporting adapter. The only Ads operation is a fixed SearchStream.
import {readFile} from 'node:fs/promises';
import {createPrivateKey,sign} from 'node:crypto';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const CUSTOMER='8386605798',CAMPAIGN='24441908595',PROJECT='hero-action';
const KEY_PATH='/etc/secrets/hero-ads-reader.json';
const REPORT_URL=`https://googleads.googleapis.com/v26/customers/${CUSTOMER}/googleAds:searchStream`;
const TTL=15*60*1000,RETRY=60*1000;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const integer=value=>typeof value==='string'&&/^\d{1,16}$/.test(value)&&Number.isSafeInteger(Number(value));
function dateRange(days,now){
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
 const value=type=>parts.find(p=>p.type===type).value;
 const end=`${value('year')}-${value('month')}-${value('day')}`;
 const start=new Date(end+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-days+1);
 return {start:start.toISOString().slice(0,10),end};
}
async function boundedJSON(response){
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw Error('upstream');}
 if(!response.body)throw Error('body');
 const reader=response.body.getReader();let total=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>1048576)throw Error('size');chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createGoogleAdsReporter({env=process.env,readKey=()=>readFile(KEY_PATH,'utf8'),fetchImpl=globalThis.fetch,now=Date.now}={}){
 const enabled=env.HERO_GOOGLE_ADS_REPORT_ENABLED==='1';
 const email=env.HERO_GOOGLE_ADS_SERVICE_EMAIL;
 const configured=email==='hero-ads-reader@hero-action.iam.gserviceaccount.com';
 const cache=new Map(),inflight=new Map(),retryAt=new Map();let token=null,tokenPromise=null;
 async function accessToken(){
  if(token&&token.expires>now()+60000)return token.value;
  if(tokenPromise)return tokenPromise;
  tokenPromise=(async()=>{
   const raw=await readKey();if(typeof raw!=='string'||Buffer.byteLength(raw)>32768)throw Error('key');const key=JSON.parse(raw);
   if(!plain(key)||key.type!=='service_account'||key.project_id!==PROJECT||key.client_email!==email||key.token_uri!==TOKEN_URL)throw Error('key');
   const privateKey=createPrivateKey(key.private_key);
   if(privateKey.asymmetricKeyType!=='rsa'||privateKey.asymmetricKeyDetails?.modulusLength<2048)throw Error('key');
   const ts=Math.floor(now()/1000),encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
   const input=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:email,scope:'https://www.googleapis.com/auth/adwords',aud:TOKEN_URL,iat:ts,exp:ts+3600});
   const assertion=input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
   const data=await boundedJSON(await fetchImpl(TOKEN_URL,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}).toString()}));
   if(!plain(data)||typeof data.access_token!=='string'||!data.access_token||data.access_token.length>8192||/[\r\n]/.test(data.access_token)||data.token_type!=='Bearer'||!Number.isInteger(data.expires_in)||data.expires_in<120||data.expires_in>3600)throw Error('token');
   token={value:data.access_token,expires:now()+data.expires_in*1000};return token.value;
  })();
  try{return await tokenPromise;}finally{tokenPromise=null;}
 }
 async function fetchReport(days,range){
  const access=await accessToken();
  const query=`SELECT customer.id, customer.currency_code, customer.time_zone, campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE campaign.id = ${CAMPAIGN} AND segments.date BETWEEN '${range.start}' AND '${range.end}'`;
  const data=await boundedJSON(await fetchImpl(REPORT_URL,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},body:JSON.stringify({query})}));
  if(!Array.isArray(data)||data.length>100)throw Error('report');
  const rows=data.flatMap(part=>{if(!plain(part)||!Array.isArray(part.results))throw Error('report');return part.results;});
  // Empty data or missing metric fields are unknown, never synthesized zeros.
  if(rows.length!==1)throw Error('report');
  const row=rows[0];if(!plain(row)||row.customer?.id!==CUSTOMER||row.campaign?.id!==CAMPAIGN||row.customer?.currencyCode!=='TRY'||row.customer?.timeZone!=='Europe/Istanbul'||!plain(row.metrics))throw Error('identity');
  const {impressions,clicks,costMicros}=row.metrics;
  if(![impressions,clicks,costMicros].every(integer))throw Error('metrics');
  return {available:true,source:'google_ads_api',customerId:CUSTOMER,campaignId:CAMPAIGN,currency:'TRY',timeZone:'Europe/Istanbul',days,period:range,impressions:Number(impressions),clicks:Number(clicks),costMicros,averageCpcMicros:Number(clicks)>0?Number(costMicros)/Number(clicks):null,fetchedAt:new Date(now()).toISOString(),stale:false};
 }
 return {async read(request={}){
  if(!plain(request))throw Object.assign(Error('Geçersiz rapor isteği.'),{status:400});
  const days=request.days===undefined?7:request.days;
  if(![1,7,30].includes(days))throw Object.assign(Error('1, 7 veya 30 günlük dönem seçin.'),{status:400});
  if(!enabled||!configured)return {available:false,reason:'not_connected',days};
  const range=dateRange(days,now()),key=days+':'+range.end,previous=cache.get(days);
  if(previous?.key===key&&now()-previous.time>=0&&now()-previous.time<TTL)return previous.report;
  if(inflight.has(key))return inflight.get(key);
  const unavailable=()=>previous?.key===key?{...previous.report,stale:true}:{available:false,reason:'temporarily_unavailable',days};
  if((retryAt.get(key)||0)>now())return unavailable();
  for(const k of retryAt.keys())if(!k.endsWith(':'+range.end))retryAt.delete(k);
  const promise=(async()=>{try{
   const report=await fetchReport(days,range);
   // An old request finishing after midnight cannot overwrite a newer cohort.
   if(dateRange(days,now()).end===range.end)cache.set(days,{key,time:now(),report});
   retryAt.delete(key);return report;
  }catch{token=null;retryAt.set(key,now()+RETRY);return unavailable();}finally{inflight.delete(key);}})();
  inflight.set(key,promise);return promise;
 }};
}
