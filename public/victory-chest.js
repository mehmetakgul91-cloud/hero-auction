// Presentation only. Rewards are read from an already committed, authenticated
// server receipt; this module never rolls, claims, spends or credits currency.
const GOLD_VALUES=new Set([100,105,110,115,120]);
const DUST_VALUES=new Set([0,3,4,5]);
const RECEIPT_KEY='hero-auction-victory-chest-seen:';

export function victoryChestReceipt(value,matchId){
 if(!value||typeof value!=='object'||typeof matchId!=='string'||!matchId||value.matchId!==matchId)return null;
 if(typeof value.receiptId!=='string'||!value.receiptId||value.receiptId.length>240||typeof value.configVersion!=='string'||!value.configVersion||value.configVersion.length>100)return null;
 const rewards=value.rewards;
 if(!rewards)return null;
 const bot=value.configVersion==='bot-fixed-v1';
 if(bot){if(rewards.diamonds!==0||![[100,0],[125,2],[175,5]].some(([gold,dust])=>rewards.gold===gold&&rewards.magicDust===dust))return null;}
 else if(!GOLD_VALUES.has(rewards.gold)||!DUST_VALUES.has(rewards.magicDust)||![0,1].includes(rewards.diamonds))return null;
 return Object.freeze({matchId,receiptId:value.receiptId,configVersion:value.configVersion,rewards:Object.freeze({gold:rewards.gold,magicDust:rewards.magicDust,diamonds:rewards.diamonds})});
}

function rememberPresentation(storage,scope,receiptId){
 // A blocked/corrupt UI journal suppresses animation, never receipt contents.
 // Store IDs only: no balances, credentials, roll results or grant authority.
 try{
  if(!storage||typeof scope!=='string'||!scope)return false;
  const key=RECEIPT_KEY+encodeURIComponent(scope),raw=storage.getItem(key);
  const seen=raw?JSON.parse(raw):[];
  if(!Array.isArray(seen)||seen.some(id=>typeof id!=='string'))return false;
  if(seen.includes(receiptId))return false;
  storage.setItem(key,JSON.stringify([...seen.slice(-127),receiptId]));
  return true;
 }catch{return false}
}

export function createVictoryChestPresentation({root,matchId,accountScope,winner,english=false,
 document=globalThis.document,window=globalThis.window,storage,
 load,isCurrent=()=>true,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let disposed=false,receipt=null,pollTimer=null,pollInFlight=false,requestController=null,requestTimeout=null,failures=0,pending=false;
 const animationTimers=new Set();
 let scene=null,rewardList=null,status=null,heading=null;
 const eligible=winner===0&&typeof matchId==='string'&&Boolean(matchId)&&Boolean(root);
 const active=()=>!disposed&&eligible&&root.isConnected!==false&&isCurrent();
 const paused=()=>document?.hidden===true||window?.navigator?.onLine===false;
 const text=(tr,en)=>english?en:tr;
 const stopAnimation=()=>{for(const id of animationTimers)clearTimer(id);animationTimers.clear()};
 function stopPoll(){if(pollTimer!==null){clearTimer(pollTimer);pollTimer=null}}
 function element(tag,className,copy){const node=document.createElement(tag);if(className)node.className=className;if(copy!==undefined)node.textContent=copy;return node}
 function mount(){
  if(status)return;
  root.className='victory-chest';root.setAttribute('aria-label',text('Zafer sandığı','Victory chest'));
  const copy=element('div','victory-chest-copy');
  const eyebrow=element('small','victory-chest-eyebrow',text('ARENA ÖDÜLÜ','ARENA REWARD'));
  heading=element('h3','victory-chest-title',text('Zafer sandığı','Victory chest'));
  status=element('p','victory-chest-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  copy.append(eyebrow,heading,status);
  scene=element('div','victory-chest-scene');scene.setAttribute('aria-hidden','true');
  const glow=element('span','victory-chest-glow'),art=element('div','victory-chest-art');
  for(const name of ['base','lid','lock'])art.append(element('span','victory-chest-'+name));
  for(let index=0;index<3;index++){const spark=element('span','victory-chest-spark','✦');spark.style.setProperty('--spark-index',String(index));scene.append(spark)}
  scene.append(glow,art);
  rewardList=element('ul','victory-chest-rewards');rewardList.setAttribute('aria-label',text('Kazanılan ödüller','Earned rewards'));
  root.replaceChildren(copy,scene,rewardList);
 }
 function showPending(error=false){
  mount();root.hidden=false;root.dataset.state='pending';root.setAttribute('aria-busy','true');
  rewardList.replaceChildren();scene.hidden=true;
  status.textContent=error?text('Ödül kaydı doğrulanıyor. Bağlantı geldiğinde burada gösterilecek.','Verifying your reward receipt. It will appear here when the connection returns.'):
   text('Sandığın sunucuda doğrulanıyor…','Your chest is being confirmed by the server…');
 }
 function reveal(value){
  mount();stopPoll();pending=false;receipt=value;root.hidden=false;
  // Payload-free invalidation only; any mounted wallet re-reads its own API.
  try{window?.dispatchEvent?.(new Event('hero:wallet-refresh'))}catch{}
  root.setAttribute('aria-busy','false');scene.hidden=false;
  const reduced=window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const fresh=rememberPresentation(storage,accountScope,value.receiptId);
  const animate=fresh&&!reduced&&!paused();
  root.dataset.state=animate?'opening':'complete';rewardList.replaceChildren();
  const rewards=[['gold',value.rewards.gold,'Altın','Gold','●'],['magicDust',value.rewards.magicDust,'Büyü tozu','Magic dust','✦'],['diamonds',value.rewards.diamonds,'Elmas','Diamond','◆']].filter(([,amount])=>amount>0);
  const summary=rewards.map(([,amount,tr,en])=>amount+' '+text(tr,en)).join(' · ');
  status.textContent=animate?text('Sandığın açılıyor…','Your chest is opening…'):text('Hesabına eklendi: ','Added to your account: ')+summary;
  const later=(fn,delay)=>{const id=setTimer(()=>{animationTimers.delete(id);if(active())fn()},delay);animationTimers.add(id)};
  rewards.forEach(([kind,amount,tr,en,symbol],index)=>{
   const row=element('li','victory-chest-reward');row.dataset.currency=kind;row.dataset.visible=String(!animate);
   const icon=element('span','victory-chest-reward-icon',symbol);icon.setAttribute('aria-hidden','true');
   const count=element('strong','victory-chest-amount','+'+amount.toLocaleString(english?'en-US':'tr-TR'));
   const label=element('span','victory-chest-reward-label',text(tr,en));
   row.append(icon,count,label);rewardList.append(row);
   if(animate)later(()=>{row.dataset.visible='true'},650+index*320);
  });
  if(animate)later(()=>{root.dataset.state='complete';status.textContent=text('Hesabına eklendi: ','Added to your account: ')+summary},720+rewards.length*320);
 }
 function schedule(){
  if(!active()||!pending||receipt||typeof load!=='function'||pollTimer!==null||pollInFlight||paused())return;
  pollTimer=setTimer(()=>{pollTimer=null;void poll()},Math.min(15000,1800*2**Math.min(failures,3)));
 }
 async function poll(){
  if(!active()||!pending||receipt||pollInFlight||paused())return;
  pollInFlight=true;requestController=typeof AbortController==='function'?new AbortController():null;
  if(requestController)requestTimeout=setTimer(()=>requestController?.abort(),8000);
  try{
   const result=await load({signal:requestController?.signal});
   if(!active())return;
   failures=0;update(result);
  }catch(error){
   if(!active())return;
   // Auth loss or a rematch means this receipt context is no longer readable.
   if([401,403,409,410].includes(error?.status)){pending=false;showPending(true);return;}
   failures++;showPending(true);
  }finally{if(requestTimeout!==null){clearTimer(requestTimeout);requestTimeout=null}pollInFlight=false;requestController=null;schedule()}
 }
 function update(result){
  if(!active())return;
  // Once credited, subsequent polls cannot swap the receipt or replay the reveal.
  if(receipt)return;
  const verified=victoryChestReceipt(result?.victoryChest,matchId);
  if(verified){stopAnimation();reveal(verified);return;}
  pending=result?.victoryChestPending===true;
  if(pending){showPending(Boolean(result?.victoryChest));schedule()}
  else{stopPoll();root.hidden=true;}
 }
 const resume=()=>{if(!active()||paused())return;stopPoll();if(pending)void poll()};
 document?.addEventListener?.('visibilitychange',resume);window?.addEventListener?.('online',resume);
 if(root)root.hidden=true;
 function destroy(){if(disposed)return;disposed=true;pending=false;stopPoll();stopAnimation();if(requestTimeout!==null){clearTimer(requestTimeout);requestTimeout=null}requestController?.abort();document?.removeEventListener?.('visibilitychange',resume);window?.removeEventListener?.('online',resume);if(root){root.hidden=true;root.replaceChildren()}}
 return {update,destroy};
}
