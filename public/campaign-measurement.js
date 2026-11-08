// Optional first-match funnel. No cookies, fingerprint, raw URL or advertising IDs.
export const CAMPAIGN_STORAGE_KEY='hero-campaign-funnel-v1';
export const CAMPAIGN_TTL_MS=30*60*1000;
const events=new Set(['intro_viewed','intro_completed','intro_skipped']);
const identifier=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9_-]{0,47}$/.test(value);
export function campaignFromSearch(search,config){
 if(config?.enabled!==true||!Array.isArray(config.campaigns)||config.campaigns.length>20||typeof search!=='string'||search.length>2048)return null;
 const query=new URLSearchParams(typeof search==='string'?search:'');
 const parts=['utm_source','utm_medium','utm_campaign'].map(key=>query.getAll(key));
 if(parts.some(values=>values.length!==1||!identifier(values[0])))return null;
 const matches=config.campaigns.filter(c=>c&&identifier(c.id)&&[c.source,c.medium,c.campaign].every(identifier)&&c.source===parts[0][0]&&c.medium===parts[1][0]&&c.campaign===parts[2][0]);
 return matches.length===1?matches[0].id:null;
}
export function createCampaignMeasurement({storage,search='',enabled=true,now=Date.now,send}={}){
 let config=null,login=null,generation=0,state=null,ready=false,attributing=false;
 const pending=new Set(),attempted=new Set();
 const validId=id=>config?.campaigns?.some(c=>identifier(c.id)&&c.id===id);
 const identity=()=>login?.user?.sub&&login?.authToken&&login.type!=='crazygames'?String(login.user.sub):null;
 const remove=()=>{try{storage?.removeItem(CAMPAIGN_STORAGE_KEY);}catch{}};
 const persist=()=>{try{storage?.setItem(CAMPAIGN_STORAGE_KEY,JSON.stringify(state));}catch{}};
 const validState=value=>value&&identifier(value.campaignId)&&validId(value.campaignId)&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>now()&&value.expiresAt<=now()+CAMPAIGN_TTL_MS&&(!value.account||typeof value.account==='string')&&(!value.events||Array.isArray(value.events)&&value.events.length<=3&&value.events.every(e=>events.has(e)));
 function read(){try{const stored=storage?.getItem(CAMPAIGN_STORAGE_KEY);if(!stored)return null;const value=JSON.parse(stored);if(validState(value))return {campaignId:value.campaignId,expiresAt:value.expiresAt,...(value.account?{account:value.account}:{}),attributed:value.attributed===true,events:value.events||[]};remove();}catch{remove();}return null;}
 function live(){if(state&&state.expiresAt<=now()){state=null;ready=false;pending.clear();remove();}return !!(enabled&&config?.enabled===true&&state&&identity()&&state.account===identity());}
 async function flush(){
  if(!live()||!ready)return;
  const account=identity(),token=login.authToken,run=generation;
  for(const event of [...pending]){
   if(run!==generation||!live()||identity()!==account)return;
   pending.delete(event);if(state.events.includes(event))continue;
   state.events.push(event);persist();
   try{await send('/api/campaign/event',{event},token);}catch{}
  }
 }
 async function attribute(){
  if(!enabled||config?.enabled!==true||!state||!identity())return;
  if(state.expiresAt<=now()){state=null;remove();return;}
  const account=identity();
  // A click is bound to the first authenticated account only, never the next login.
  if(state.account&&state.account!==account){ready=false;pending.clear();return;}
  if(!state.account){state.account=account;persist();}
  if(state.attributed){ready=true;void flush();return;}
  const attempt=account+':'+state.campaignId;
  if(attributing||attempted.has(attempt))return;
  attempted.add(attempt);attributing=true;
  const run=generation,token=login.authToken;
  try{
   const response=await send('/api/campaign/attribute',{campaignId:state.campaignId},token);
   if(run!==generation||!live()||login.authToken!==token)return;
   // The server explicitly accepts the eligible campaign. A generic success is insufficient.
   if(response?.accepted===true){state.attributed=true;ready=true;persist();void flush();}
  }catch{}finally{attributing=false;}
 }
 return {
  configure(value){
   config=value;
   if(!enabled||config?.enabled!==true){state=null;ready=false;pending.clear();search='';remove();return;}
   if(state)return;
   state=read();
   if(!state){const id=campaignFromSearch(search,config);if(id){state={campaignId:id,expiresAt:now()+CAMPAIGN_TTL_MS,events:[]};persist();}}
   // The original search string is never retained after matching.
   search='';
   if(!state){pending.clear();return;}
   void attribute();
  },
  setLogin(value){
   const before=identity(),token=login?.authToken;login=value;
   if(before!==identity()||token!==login?.authToken){generation++;ready=false;attributing=false;if(before&&before!==identity())pending.clear();}
   void attribute();
  },
  event(event){if(!events.has(event)||!enabled)return;if(config&&(!state||config.enabled!==true))return;pending.add(event);void flush();},
  destroy(){enabled=false;generation++;ready=false;pending.clear();search='';}
 };
}
