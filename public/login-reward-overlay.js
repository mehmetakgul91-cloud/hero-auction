import {createWalletOperations} from './wallet-operations.js';

// The server owns eligibility, reward day and the durable claim. This dialog
// never awards currency on login, visibility, timers, dismissal or reload.
export function createLoginRewardOverlay({document:doc=globalThis.document,window:win=globalThis.window,walletOperations=createWalletOperations({storage:()=>win.sessionStorage}),canShow=()=>true,onBalance=()=>{},onNotice=()=>{}}={}){
 const node=(tag,text,cls)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el};
 const dialog=node('dialog',undefined,'login-reward-dialog');dialog.id='login-reward-dialog';dialog.setAttribute('aria-labelledby','login-reward-title');dialog.setAttribute('aria-describedby','login-reward-description');
 const content=node('div',undefined,'login-reward-content'),heading=node('h2'),description=node('p'),days=node('ol',undefined,'login-reward-days'),message=node('p',undefined,'login-reward-message'),actions=node('div',undefined,'login-reward-actions'),claim=node('button'),dismiss=node('button');
 heading.id='login-reward-title';description.id='login-reward-description';message.setAttribute('role','status');message.setAttribute('aria-live','polite');claim.type=dismiss.type='button';claim.className='primary';dismiss.className='outline';actions.append(claim,dismiss);content.append(heading,description,days,message,actions);dialog.append(content);doc.body.append(dialog);
 let login=null,data=null,generation=0,serial=0,loading=false,destroyed=false,suspended=false,timer=null,ownedKey=null,notice='',returnFocus=null;
 const dismissed=new Set(),claimed=new Set();
 const english=()=>doc.documentElement.lang==='en',copy=(tr,en)=>english()?en:tr;
 const keyFor=()=>walletOperations.keyFor(login),dayKey=()=>data?.serverDay&&keyFor()?`${keyFor()}:${data.serverDay}`:null;
 const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
 const eligibleLogin=()=>!!login?.authToken&&!!keyFor()&&(login.type==='google'||login.user?.provider==='google')&&!win.HeroPlatform;
 const safe=()=>!destroyed&&!suspended&&!doc.hidden&&eligibleLogin()&&canShow();
 const current=(version,auth,read)=>!destroyed&&version===generation&&login?.authToken===auth&&(read===undefined||read===serial);
 function close(){if(dialog.open){if(dialog.close)dialog.close();else dialog.removeAttribute('open');if(returnFocus?.isConnected!==false)returnFocus?.focus?.({preventScroll:true});}returnFocus=null;}
 function dismissedToday(){const key=dayKey();if(!key)return false;if(dismissed.has(key))return true;try{return win.sessionStorage.getItem('hero-login-reward-dismissed:'+key)==='1'}catch{return false}}
 function rememberDismissal(){const key=dayKey();if(!key)return;dismissed.add(key);try{win.sessionStorage.setItem('hero-login-reward-dismissed:'+key,'1')}catch{}}
 function render(){
  const pending=walletOperations.read(login),busy=walletOperations.busy(login);
  heading.textContent=copy('7 GÜNLÜK GİRİŞ ÖDÜLÜ','7-DAY LOGIN REWARDS');
  description.textContent=copy('Yeni gün Türkiye saatiyle 02.00’de başlar. Bir gün kaçırırsan seri 1. güne döner.','A new day starts at 02:00 Istanbul time. Missing a day restarts the streak at day 1.');
  days.replaceChildren();
  for(const reward of data?.rewards||[]){
   const completed=reward.day<=(data.claimedToday||data.nextDay!==1?data.completedDay:0),today=data.available&&!data.claimedToday&&reward.day===data.nextDay;
   const tile=node('li',undefined,'login-reward-day'+(today?' current':'')+(completed?' completed':'')+(reward.diamonds?' diamond-day':''));
   if(today)tile.setAttribute('aria-current','step');
   tile.append(node('span',copy(`${reward.day}. GÜN`,`DAY ${reward.day}`)),node('strong',String(reward.diamonds||reward.gold)),node('small',reward.diamonds?copy('elmas','diamonds'):copy('altın','gold')));
   if(completed)tile.append(node('span','✓','login-reward-check'));days.append(tile);
  }
  message.textContent=notice||copy(`${data?.nextDay||1}. gün ödülün hazır.`, `Your day ${data?.nextDay||1} reward is ready.`);
  claim.textContent=busy?copy('İŞLENİYOR…','PROCESSING…'):pending.claim?copy('ÖDÜLÜ KONTROL ET','CHECK REWARD'):copy('ÖDÜLÜ AL','CLAIM REWARD');
  claim.disabled=busy||loading||!safe()||!data?.eligible||!data?.available||data?.claimedToday||!pending.valid;
  dismiss.textContent=copy('DAHA SONRA','LATER');
 }
 function present(){
  if(!safe()||!data?.enabled||!data?.eligible||!data?.available||data.claimedToday||!validDay(data.serverDay)||claimed.has(dayKey())||dismissedToday()){close();return;}
  render();if(!dialog.open){returnFocus=doc.activeElement;try{dialog.showModal();}catch{dialog.setAttribute('open','');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');}claim.focus?.({preventScroll:true});}
 }
 async function post(path,body,auth){const response=await win.fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,authToken:auth})});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||copy('İşlem tamamlanamadı.','Request could not be completed.')),{status:response.status});return result}
 function schedule(){if(timer!==null)win.clearTimeout(timer);timer=null;if(!destroyed&&eligibleLogin()&&!suspended)timer=win.setTimeout(()=>{timer=null;void refresh()},60000);}
 async function refresh(){
  if(!safe()||walletOperations.busy(login)){if(!safe())close();schedule();return;}
  const version=generation,auth=login.authToken,read=++serial;loading=true;if(dialog.open)render();
  try{
   const result=await post('/api/store/status',{},auth);if(!current(version,auth,read))return;
   data=result.loginRewards;notice='';
   // A confirmed receipt can clear only the matching pending reward operation.
   const pending=walletOperations.read(login).claim;
   if(data?.claimedToday){claimed.add(dayKey());if(pending?.rewardDate===data.receipt?.rewardDate)walletOperations.write(keyFor(),'claim',null);}
   loading=false;present();
  }catch(error){if(current(version,auth,read)){loading=false;if(dialog.open){notice=error.message;render();}}}
  finally{if(current(version,auth,read)){loading=false;schedule();}}
 }
 async function claimReward(){
  if(!safe()||!dialog.open||loading||walletOperations.busy(login)||!data?.available||data.claimedToday)return;
  const pending=walletOperations.read(login),key=keyFor(),request=pending.claim||{rewardDate:data.serverDay};
  if(!pending.valid||!validDay(request.rewardDate)||!walletOperations.write(key,'claim',request)){notice=copy('Güvenli yeniden deneme için oturum depolaması gerekli. İşlem gönderilmedi.','Session storage is required for safe retries. No request was sent.');render();return;}
  const version=generation,auth=login.authToken;serial++;ownedKey=key;if(!walletOperations.begin(key)){ownedKey=null;return;}notice='';render();
  try{
   const result=await post('/api/login-rewards/claim',request,auth);
   walletOperations.write(key,'claim',null);if(!current(version,auth))return;
   data=result.loginRewards;
   if(data?.claimedToday)claimed.add(dayKey());
   onBalance({gold:result.gold,diamonds:result.diamonds});
   try{win.localStorage.setItem('hero-login-reward-updated',JSON.stringify({account:key,date:result.receipt?.rewardDate,at:Date.now()}));}catch{}
   const receipt=result.receipt;onNotice(copy(`✓ ${receipt?.diamonds||receipt?.gold} ${receipt?.diamonds?'elmas':'altın'} giriş ödülü alındı.`,`✓ Login reward claimed: ${receipt?.diamonds||receipt?.gold} ${receipt?.diamonds?'diamonds':'gold'}.`));
   if(data?.claimedToday)close();else{notice='';present();}
  }catch(error){
   if(error.status===400||error.status===409)walletOperations.write(key,'claim',null);
   if(current(version,auth)){notice=error.message;render();}
  }finally{walletOperations.finish(key);ownedKey=null;if(current(version,auth)){render();void refresh();}}
 }
 function dismissDialog(){rememberDismissal();close();}
 function sync(){if(!safe()){serial++;loading=false;close();schedule();return;}void refresh();}
 function setLogin(value){if(login?.authToken===value?.authToken&&walletOperations.keyFor(login)===walletOperations.keyFor(value))return;generation++;serial++;close();login=value;data=null;loading=false;notice='';sync();}
 const unsubscribe=walletOperations.subscribe(({key,busy})=>{if(key!==keyFor()||key===ownedKey||destroyed)return;serial++;loading=false;if(busy){if(dialog.open)render();}else void refresh();});
 const onStorage=event=>{if(event.key===null||event.key==='hero-auction-login'){setLogin(null);return;}if(event.key==='hero-login-reward-updated'){serial++;close();void refresh();}};
 const hide=()=>{suspended=true;serial++;loading=false;close();if(timer!==null)win.clearTimeout(timer);timer=null;},show=()=>{suspended=false;sync();},visibility=()=>{if(doc.hidden)hide();else show();};
 claim.onclick=()=>void claimReward();dismiss.onclick=dismissDialog;
 dialog.addEventListener('cancel',event=>{event.preventDefault();dismissDialog();});dialog.addEventListener('click',event=>{if(event.target===dialog)dismissDialog();});
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();dismissDialog();}else if(event.key==='Tab'){if(event.shiftKey&&doc.activeElement===claim||!event.shiftKey&&doc.activeElement===dismiss){event.preventDefault();(event.shiftKey?dismiss:claim).focus();}}});
 win.addEventListener('pagehide',hide);win.addEventListener('pageshow',show);win.addEventListener('online',show);win.addEventListener('focus',show);win.addEventListener('storage',onStorage);doc.addEventListener('visibilitychange',visibility);
 return {setLogin,sync,refresh,defer(){serial++;loading=false;close();},get open(){return !!dialog.open},destroy(){destroyed=true;generation++;unsubscribe();hide();login=null;dialog.remove();win.removeEventListener('pagehide',hide);win.removeEventListener('pageshow',show);win.removeEventListener('online',show);win.removeEventListener('focus',show);win.removeEventListener('storage',onStorage);doc.removeEventListener('visibilitychange',visibility);}};
}
