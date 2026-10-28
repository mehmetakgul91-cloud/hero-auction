// Shared store/commander recovery state. Only account-scoped dates and accepted
// quotes are persisted; auth tokens and wallet balances are never stored here.
export function createWalletOperations({storage=()=>globalThis.sessionStorage}={}){
 const active=new Set(),listeners=new Set();
 const changed=(key,busy)=>{for(const fn of listeners)fn({key,busy})};
 const keyFor=login=>login?.authToken&&typeof login.user?.sub==='string'&&login.user.sub?`hero-auction-store-pending:${login.user.sub}`:null;
 const validClaim=value=>value&&typeof value.rewardDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.rewardDate);
 const validExchange=value=>value&&typeof value.requestId==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(value.requestId)&&Number.isSafeInteger(value.diamondsToSpend)&&value.diamondsToSpend>0&&value.diamondsToSpend<=2147483647&&Number.isSafeInteger(value.expectedRate)&&value.expectedRate>0&&value.expectedRate<=2147483647&&typeof value.pricingVersion==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(value.pricingVersion);
 function readKey(key){
  const invalid={claim:null,exchange:null,valid:false};
  if(!key)return invalid;
  try{
   const target=storage();if(!target)return invalid;
   const raw=target.getItem(key);
   const saved=raw===null||raw===undefined?{}:JSON.parse(raw);
   // A corrupt or unreadable journal is NOT proof that a prior exchange never
   // committed. Keep it untouched and refuse new keys until safely recovered.
   if(!saved||typeof saved!=='object'||Array.isArray(saved)||Object.keys(saved).some(name=>!['claim','exchange'].includes(name)))return invalid;
   if(saved.claim!==undefined&&saved.claim!==null&&!validClaim(saved.claim))return invalid;
   if(saved.exchange!==undefined&&saved.exchange!==null&&!validExchange(saved.exchange))return invalid;
   return {claim:saved.claim?{rewardDate:saved.claim.rewardDate}:null,exchange:saved.exchange?{requestId:saved.exchange.requestId,diamondsToSpend:saved.exchange.diamondsToSpend,expectedRate:saved.exchange.expectedRate,pricingVersion:saved.exchange.pricingVersion}:null,valid:true};
  }catch{return invalid}
 }
 function write(key,kind,value){
  if(!key||!['claim','exchange'].includes(kind)||value&&(kind==='claim'?!validClaim(value):!validExchange(value)))return false;
  try{
   const target=storage();if(!target)return false;
   const previous=readKey(key);if(!previous.valid)return false;
   delete previous.valid;
   if(value)previous[kind]=value;else delete previous[kind];
   target.setItem(key,JSON.stringify(previous));return true;
  }catch{return false}
 }
 return {keyFor,read:login=>readKey(keyFor(login)),write,busy:login=>active.has(keyFor(login)),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},begin(key){if(!key||active.has(key))return false;active.add(key);changed(key,true);return true},finish(key){active.delete(key);changed(key,false)}};
}
