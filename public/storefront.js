import {createWalletOperations} from './wallet-operations.js';
import {renderCommanderExchange,commanderExchangeQuote} from './commander-exchange-view.js';

// Presentation only. Currency, eligibility, day and receipts always come from the
// authenticated server. Opening or restoring this panel never claims a reward.
export function createStorefront({document:doc=globalThis.document,window:win=globalThis.window,onOpen=()=>{},onBalance=()=>{},canOpen=()=>true,walletOperations=createWalletOperations({storage:()=>win.sessionStorage})}={}){
 const $=id=>doc.getElementById(id),panel=$('store-panel'),nav=$('home-store-tab');
 let login=null,data=null,generation=0,readSerial=0,loading=false,suspended=false,destroyed=false,amount='1',message='',ownedOperation=null;
 const english=()=>doc.documentElement.lang==='en',copy=(tr,en)=>english()?en:tr;
 const keyFor=walletOperations.keyFor;
 const pending=()=>walletOperations.read(login);
 const updatePending=(key,kind,value)=>walletOperations.write(key,kind,value);
 const current=(version,auth)=>!destroyed&&!suspended&&version===generation&&login?.authToken===auth&&!panel?.hidden;
 const busy=()=>walletOperations.busy(login);
 const node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 const fmt=value=>Number.isSafeInteger(value)?value.toLocaleString(english()?'en-US':'tr-TR'):'—';
 async function post(path,body,auth){const response=await win.fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,authToken:auth})});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||copy('İşlem tamamlanamadı.','Request could not be completed.')),{status:response.status});return result}
 function render(){
  if(!panel)return;
  $('store-gold').textContent=fmt(data?.gold);$('store-diamonds').textContent=data?.diamondsEnabled?fmt(data.diamonds):'—';
  $('store-diamond-status').textContent=data?.diamondsEnabled?copy('ELMAS','DIAMONDS'):copy('ELMAS · KAPALI','DIAMONDS · OFF');
  $('store-message').textContent=message;$('store-refresh').disabled=loading||busy();
  $('store-purchase').disabled=true;$('store-ad').disabled=true;
  // No checkout or provider adapter exists. A stale or malformed capability
  // cannot turn a disabled placeholder into a fake working purchase or ad.
  $('store-purchase-note').textContent=copy('Paketler ve ödeme sağlayıcısı henüz hazır değil. Satış kapalı.','Packs and a payment provider are not ready. Purchases are off.');
  $('store-ad-note').textContent=copy('Güvenli reklam doğrulaması bekleniyor. Henüz altın kazanılamaz.','Secure ad verification is pending. Ad gold is not available yet.');
  const state=data?.loginRewards,p= pending(),version=generation;
  const list=$('store-reward-days');list.replaceChildren();
  for(const reward of state?.rewards||[]){
   const completed=reward.day<=(state.claimedToday||state.nextDay!==1?state.completedDay:0);
   const next=state.available&&!state.claimedToday&&reward.day===state.nextDay;
   const day=node('li',undefined,'store-day'+(completed?' completed':'')+(next?' current':'')+(reward.diamonds?' diamond-day':''));
   if(next)day.setAttribute('aria-current','step');
   day.append(node('span',copy(`${reward.day}. GÜN`,`DAY ${reward.day}`),'store-day-label'),node('span',reward.diamonds?'◆':'●','store-day-icon'),node('strong',fmt(reward.diamonds||reward.gold)),node('small',reward.diamonds?copy('elmas','diamonds'):copy('altın','gold')));
   if(completed)day.append(node('span','✓','store-day-check'));
   list.append(day);
  }
  list.hidden=!state?.rewards?.length;
  const claim=$('store-claim');
  const reason=!data?copy('Bilgiler yükleniyor…','Loading…'):!state?.enabled?copy('Giriş ödülleri henüz etkin değil.','Login rewards are not active yet.'):!state.eligible?copy('Yalnızca doğrulanmış Google üyelerine açık.','Available only to verified Google members.'):state.claimedToday?copy('Bugünkü ödül alındı. Yarın devam et.','Today’s reward is claimed. Continue tomorrow.'):state.available?copy(`${state.nextDay}. gün ödülün hazır.`, `Your day ${state.nextDay} reward is ready.`):copy('Ödüller geçici olarak kullanılamıyor.','Rewards are temporarily unavailable.');
  $('store-reward-status').textContent=p.claim?copy('Önceki ödülün sonucu doğrulanmalı. Aynı günü kontrol et.','Verify the previous reward result. Check the same day.'):reason;
  claim.textContent=busy()?copy('İŞLENİYOR…','PROCESSING…'):p.claim?copy('ÖDÜLÜ KONTROL ET','CHECK REWARD'):state?.claimedToday?copy('BUGÜN ALINDI','CLAIMED TODAY'):state?.available&&state.eligible?copy('BUGÜNKÜ ÖDÜLÜ AL','CLAIM TODAY’S REWARD'):copy('HENÜZ AÇIK DEĞİL','NOT AVAILABLE YET');
  claim.disabled=busy()||loading||!keyFor(login)||(!p.claim&&(!state?.available||!state.eligible||state.claimedToday));
  claim.onclick=()=>{if(version===generation&&!claim.disabled)void claimReward()};
  $('store-exchange-availability').textContent=data?.exchange?.available?copy(`1 elmas = ${fmt(data.exchange.rate)} altın`,`1 diamond = ${fmt(data.exchange.rate)} gold`):copy('Henüz açık değil','Not available yet');
  renderCommanderExchange($('store-exchange-controls'),{policy:data?.exchange,diamonds:data?.diamonds,gold:data?.gold,amount,pending:p.exchange,busy:busy()||loading,english:english(),document:doc,idPrefix:'store-exchange',onAmount:value=>{amount=value},onExchange:value=>{if(version===generation&&!panel.hidden)void exchange(value)}});
 }
 async function refresh(){
  if(!login?.authToken||panel?.hidden||suspended||destroyed||busy())return;
  const version=generation,auth=login.authToken,serial=++readSerial;loading=true;render();
  try{const result=await post('/api/store/status',{},auth);if(!current(version,auth)||serial!==readSerial)return;data=result;message='';onBalance({gold:result.gold,diamonds:result.diamonds});}
  catch(error){if(current(version,auth)&&serial===readSerial){data=null;message=error.message}}
  finally{if(current(version,auth)&&serial===readSerial){loading=false;render()}}
 }
 async function mutate(kind,request,path){
  const key=keyFor(login);if(!key||busy()||suspended||panel?.hidden)return;
  const version=generation,auth=login.authToken;
  // Do not send a mutation if browser storage is unavailable: a crash/reload
  // must retain the same accepted exchange key or server-issued reward date.
  if(!updatePending(key,kind,request)){message=copy('Güvenli yeniden deneme için tarayıcı oturum depolaması gerekli. İşlem gönderilmedi.','Session storage is required for safe retries. No request was sent.');render();return;}
  ownedOperation=key;if(!walletOperations.begin(key)){ownedOperation=null;return}readSerial++;loading=false;message='';render();
  try{
   const result=await post(path,request,auth);updatePending(key,kind,null);
   if(!current(version,auth))return;
   if(data)data={...data,...result,loginRewards:result.loginRewards||data.loginRewards};
   onBalance({gold:result.gold,diamonds:result.diamonds});
   const receipt=result.receipt;
   message=kind==='claim'?copy(`✓ ${fmt(receipt?.diamonds||receipt?.gold)} ${receipt?.diamonds?'elmas':'altın'} ödülü doğrulandı.`,`✓ Reward confirmed: ${fmt(receipt?.diamonds||receipt?.gold)} ${receipt?.diamonds?'diamonds':'gold'}.`):copy(`✓ ${fmt(result.diamondsSpent)} elmas → ${fmt(result.goldGranted)} altın.`,`✓ ${fmt(result.diamondsSpent)} diamonds → ${fmt(result.goldGranted)} gold.`);
  }catch(error){
   // An explicit validation/conflict rejection is terminal. Auth loss, unknown
   // response and 5xx retain the same accepted operation across reauthentication.
   // An unknown response keeps the same
   // operation. Recovery may cross midnight but must never choose a new day.
   if(error.status===400||error.status===409)updatePending(key,kind,null);
   if(current(version,auth))message=error.message;
  }finally{walletOperations.finish(key);ownedOperation=null;if(current(version,auth))render();else if(key===keyFor(login)&&!panel?.hidden&&!suspended)void refresh()}
 }
 async function claimReward(){
  if(busy()||loading||panel?.hidden)return;
  const saved=pending().claim,state=data?.loginRewards;
  if(!saved&&(!state?.available||!state.eligible||state.claimedToday||!/^\d{4}-\d{2}-\d{2}$/.test(state.serverDay||'')))return;
  return mutate('claim',saved||{rewardDate:state.serverDay},'/api/login-rewards/claim');
 }
 async function exchange(value){
  if(busy()||loading||panel?.hidden)return;
  let request=pending().exchange;
  if(!request){
   const quote=commanderExchangeQuote(data?.exchange,data?.diamonds,data?.gold,value);if(!quote.canExchange)return;
   if(!win.confirm(copy(`${fmt(value)} elmas harcayıp ${fmt(quote.goldGranted)} altın almak istiyor musun? Bu işlem geri alınamaz.`,`Spend ${fmt(value)} diamonds to receive ${fmt(quote.goldGranted)} gold? This cannot be undone.`)))return;
   request={requestId:win.crypto.randomUUID(),diamondsToSpend:quote.diamondsToSpend,expectedRate:quote.expectedRate,pricingVersion:quote.pricingVersion};
  }
  return mutate('exchange',request,'/api/diamonds/exchange');
 }
 function close(){generation++;readSerial++;loading=false;message='';if(panel)panel.hidden=true;nav?.setAttribute('aria-expanded','false');nav?.classList.remove('selected');if($('store-exchange'))$('store-exchange').open=false;render()}
 function setLogin(value){if(login?.authToken===value?.authToken&&keyFor(login)===keyFor(value))return;close();login=value;data=null;amount='1';render()}
 function open(){if(!panel||!login?.authToken||win.HeroPlatform||!canOpen())return;generation++;onOpen();panel.hidden=false;nav?.setAttribute('aria-expanded','true');nav?.classList.add('selected');render();void refresh();panel.scrollIntoView?.({behavior:'smooth',block:'start'})}
 const unsubscribe=walletOperations.subscribe(({key,busy:active})=>{if(key!==keyFor(login)||key===ownedOperation||panel?.hidden||suspended||destroyed)return;if(active)render();else void refresh()});
 const hide=()=>{suspended=true;generation++;readSerial++;loading=false;render()},show=()=>{suspended=false;void refresh()},visibility=()=>{if(!doc.hidden)void refresh()};
 const storageChanged=event=>{if(event.key===null||event.key==='hero-auction-login')setLogin(null)};
 win.addEventListener('pagehide',hide);win.addEventListener('pageshow',show);win.addEventListener('online',show);win.addEventListener('storage',storageChanged);doc.addEventListener?.('visibilitychange',visibility);
 if(nav)nav.onclick=open;if($('store-close'))$('store-close').onclick=()=>{close();nav?.focus()};if($('store-refresh'))$('store-refresh').onclick=()=>void refresh();
 render();
 return {setLogin,open,close,refresh,get busy(){return busy()},destroy(){unsubscribe();close();destroyed=true;login=null;data=null;win.removeEventListener('pagehide',hide);win.removeEventListener('pageshow',show);win.removeEventListener('online',show);win.removeEventListener('storage',storageChanged);doc.removeEventListener?.('visibilitychange',visibility);render()}};
}
