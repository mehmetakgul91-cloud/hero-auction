// Presentation-only reactions. The server owns identity, match, rate and lifetime.
export const ARENA_EMOTES=Object.freeze([
 {id:'laugh',label:'Kahkaha',en:'Laugh'},
 {id:'slow_clap',label:'Yavaş alkış',en:'Slow clap'},
 {id:'fake_cry',label:'Sahte ağlama',en:'Fake cry'},
 {id:'yawn',label:'Esneme',en:'Yawn'},
 {id:'sunglasses',label:'Çok kolay',en:'Too easy'},
 {id:'nanik',label:'Nanik',en:'Tongue out'}
]);
const definitions=new Map(ARENA_EMOTES.map(item=>[item.id,item]));
const assets='/images/arena-emotes/';

export function createArenaEmotes({window,document,nav,readContext,listenLive=true,now=Date.now,request=window.fetch.bind(window)}){
 let context=null,matchKey=null,lastServerTime=-1,enabled=false,stopped=false,pending=null,cooldownUntil=0,disposed=false;
 const seen=new Set(),bubbles=[null,null],timers=[null,null],media=window.matchMedia('(prefers-reduced-motion: reduce)');
 const english=()=>document.documentElement.lang==='en';
 const t=(tr,en)=>english()?en:tr;
 const readIdentity=()=>{try{return window.localStorage.getItem('hero-auction-login')||'';}catch{return null;}};
 const ownerIdentity=readIdentity();
 let muted=false;try{muted=window.localStorage.getItem('hero:arena-emotes-muted')==='1';}catch{}
 const element=(tag,className)=>{const node=document.createElement(tag);if(className)node.className=className;return node;};
 const root=element('div','arena-emotes');root.hidden=true;
 const slots=[0,1].map(side=>{const node=element('span','arena-emote-slot arena-emote-slot-'+side);node.setAttribute('aria-live','polite');node.setAttribute('aria-atomic','true');return node;});
 const toggle=element('button','arena-emote-toggle');toggle.type='button';toggle.setAttribute('aria-label',t('İfadeler','Reactions'));toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','arena-emote-picker');
 const icon=element('img');icon.src=assets+'laugh.png';icon.alt='';icon.width=36;icon.height=36;toggle.append(icon);
 const panel=element('section','arena-emote-picker');panel.id='arena-emote-picker';panel.hidden=true;panel.setAttribute('aria-label',t('Arena ifadeleri','Arena reactions'));
 const title=element('strong');title.textContent=t('İfadeler','Reactions');
 const close=element('button','arena-emote-close');close.type='button';close.textContent='×';close.setAttribute('aria-label',t('İfadeleri kapat','Close reactions'));
 const heading=element('div','arena-emote-heading');heading.append(title,close);
 const choices=element('div','arena-emote-choices');
 const buttons=ARENA_EMOTES.map(item=>{
  const button=element('button','arena-emote-choice');button.type='button';button.dataset.emoteId=item.id;
  const img=element('img');img.src=assets+item.id+'.png';img.alt='';img.width=48;img.height=48;img.loading='lazy';
  const label=element('span');label.textContent=english()?item.en:item.label;button.append(img,label);button.addEventListener('click',()=>void send(item.id));choices.append(button);return button;
 });
 const mute=element('button','arena-emote-mute');mute.type='button';
 const status=element('span','arena-emote-status');status.setAttribute('role','status');
 panel.append(heading,choices,mute,status);root.append(slots[0],toggle,slots[1]);nav.append(root);document.body.append(panel);

 function route(){if(readContext)return readContext();const params=new URLSearchParams(window.location.search);return params.get('auctionCode')&&params.get('auctionToken')?{code:params.get('auctionCode'),token:params.get('auctionToken'),matchKey:params.get('auctionMatchKey')||undefined,identity:readIdentity()}:null;}
 function sameRoute(){const next=route();return !!context&&next?.code===context.code&&next?.token===context.token&&next?.identity===context.identity&&next?.matchKey===context.matchKey;}
 function allowed(){return !disposed&&!stopped&&enabled&&sameRoute()&&(readContext||readIdentity()===ownerIdentity)&&!window.HeroPlatform?.disableChat;}
 function clearBubble(side){if(timers[side]!==null)window.clearTimeout(timers[side]);timers[side]=null;bubbles[side]=null;slots[side].replaceChildren();slots[side].removeAttribute('title');}
 function clearBubbles(){clearBubble(0);clearBubble(1);}
 function closePicker(focus=false){panel.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus&&!root.hidden)toggle.focus({preventScroll:true});}
 function abort(){if(pending){pending.controller.abort();window.clearTimeout(pending.timeout);pending=null;}}
 function reset(){abort();clearBubbles();closePicker();context=route();matchKey=null;lastServerTime=-1;enabled=false;stopped=false;cooldownUntil=0;seen.clear();render();}
 function finish(){stopped=true;enabled=false;abort();clearBubbles();closePicker();render();}
 function render(){
  const available=allowed(),remaining=Math.max(0,cooldownUntil-now());root.hidden=!available;slots[1].hidden=!available;nav.classList.toggle('has-arena-emotes',available);
  for(const button of buttons)button.disabled=!available||!!pending||remaining>0;
  mute.textContent=muted?t('Rakibin ifadelerini göster','Show opponent reactions'):t('Rakibin ifadelerini gizle','Hide opponent reactions');mute.setAttribute('aria-pressed',String(muted));
  if(!available)closePicker();
  if(pending)status.textContent=t('Gönderiliyor…','Sending…');
  else if(remaining>0)status.textContent=t('Yeni ifade: ','Next reaction: ')+Math.ceil(remaining/1000)+t(' sn','s');
  else if(!status.dataset.error)status.textContent=t('İfadeler arasında 5 saniye','5 seconds between reactions');
 }
 function remember(id){seen.add(id);if(seen.size>64)seen.delete(seen.values().next().value);}
 function show(event,remaining){
  const item=definitions.get(event.emoteId);if(!item||![0,1].includes(event.side))return;
  clearBubble(event.side);
  const img=element('img','arena-emote-image');img.width=132;img.height=132;img.alt=t(event.side===0?'Sen: ':'Rakip: ',event.side===0?'You: ':'Opponent: ')+(english()?item.en:item.label);
  // One-shot WebP resources may otherwise retain their completed animation
  // timeline when the same reaction is sent again in the same document.
  img.src=assets+item.id+(media.matches?'.png':'.webp?event='+encodeURIComponent(event.id));
  slots[event.side].title=img.alt;slots[event.side].append(img);bubbles[event.side]={event,img};
  timers[event.side]=window.setTimeout(()=>clearBubble(event.side),remaining);
 }
 function apply(data,{initial=false}={}){
  if(disposed||stopped||!sameRoute()||!data||typeof data.matchKey!=='string'||!Number.isFinite(data.serverTime))return;
  // Never let an old response select a different match after a route/rematch.
  if(context.matchKey&&context.matchKey!==data.matchKey||matchKey&&matchKey!==data.matchKey)return;
  if(!data.matchKey.startsWith(context.code+':'))return;
  if(data.serverTime<lastServerTime)return;
  const first=matchKey===null;matchKey=data.matchKey;lastServerTime=data.serverTime;enabled=data.enabled===true;
  const delay=Math.max(0,Math.min(5000,Number(data.cooldownMs)||0));cooldownUntil=now()+delay;
  if(!allowed()){clearBubbles();closePicker();}
  for(const event of Array.isArray(data.events)?data.events:[]){
   if(typeof event?.id!=='string'||!event.id||event.id.length>100||seen.has(event.id))continue;
   remember(event.id);
   const remaining=Math.min(5000,event.expiresAt-data.serverTime);
   if(first||initial||!allowed()||document.hidden||event.side===1&&muted||!Number.isFinite(remaining)||remaining<=0)continue;
   show(event,remaining);
  }
  render();
 }
 async function send(emoteId){
  if(!allowed()||!matchKey||pending||now()<cooldownUntil||!definitions.has(emoteId))return;
  const controller=new AbortController(),operation={controller,context,matchKey};pending=operation;
  operation.timeout=window.setTimeout(()=>controller.abort(),8000);status.dataset.error='';closePicker(true);render();
  try{
   const response=await request('/api/arena-emotes',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({code:context.code,token:context.token,matchKey,emoteId,requestId:window.crypto.randomUUID()})});
   const data=await response.json();
   if(disposed||pending!==operation||context!==operation.context||matchKey!==operation.matchKey||!sameRoute()||stopped)return;
   if(!response.ok)throw Error(data.error||t('İfade gönderilemedi','Could not send reaction'));
   apply(data.arenaEmotes);
  }catch(error){if(pending===operation&&!disposed&&!stopped&&sameRoute()){status.dataset.error='1';status.textContent=error.name==='AbortError'?t('Bağlantı zaman aşımına uğradı','Connection timed out'):t('İfade gönderilemedi. Tekrar dene.','Could not send reaction. Try again.');}}
  finally{window.clearTimeout(operation.timeout);if(pending===operation){pending=null;render();}}
 }
 function snapshot(event){
  const data=event.detail?.arenaEmotes;
  if(!sameRoute()||data&&(context?.matchKey&&data.matchKey!==context.matchKey||matchKey&&data.matchKey!==matchKey||data.serverTime<lastServerTime))return;
  if(event.detail?.finished){finish();return;}apply(data);
 }
 function onToggle(){if(!allowed())return;panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){status.dataset.error='';render();(buttons.find(button=>!button.disabled)||mute).focus({preventScroll:true});}}
 function onMute(){muted=!muted;if(muted)clearBubble(1);try{window.localStorage.setItem('hero:arena-emotes-muted',muted?'1':'0');}catch{}render();}
 function onOutside(event){if(!root.contains(event.target)&&!panel.contains(event.target))closePicker();}
 function onKey(event){if(event.key==='Escape'&&!panel.hidden){event.preventDefault();closePicker(true);}}
 function onVisibility(){if(document.hidden){clearBubbles();closePicker();}}
 function onMotion(){if(media.matches)for(const bubble of bubbles)if(bubble)bubble.img.src=assets+bubble.event.emoteId+'.png';}
 function onSettings(){if(window.HeroPlatform?.disableChat){clearBubbles();closePicker();}render();}
 function onPageShow(event){if(event.persisted)reset();}
 function onIdentity(){if(!sameRoute()||!readContext&&readIdentity()!==ownerIdentity)finish();}
 const closeClick=()=>closePicker(true);
 toggle.addEventListener('click',onToggle);close.addEventListener('click',closeClick);mute.addEventListener('click',onMute);
 document.addEventListener('pointerdown',onOutside);document.addEventListener('keydown',onKey);document.addEventListener('visibilitychange',onVisibility);media.addEventListener('change',onMotion);
 if(listenLive)window.addEventListener('heroarena:commander-state',snapshot);window.addEventListener('heroarena:route-change',reset);window.addEventListener('popstate',reset);window.addEventListener('heroarena:battle-finished',finish);window.addEventListener('heroarena:connection-lost',finish);window.addEventListener('pagehide',finish);window.addEventListener('pageshow',onPageShow);window.addEventListener('hero:platform-settings',onSettings);
 window.addEventListener('storage',onIdentity);window.addEventListener('hero:login-changed',onIdentity);
 const ticker=window.setInterval(()=>{if(!root.hidden&&!document.hidden)render();},250);
 reset();
 return {apply,reset,syncContext(){if(!sameRoute())reset();},mount(host,opponentHost){
  if(!host)return;nav.classList.remove('has-arena-emotes');nav=host;host.append(root);if(opponentHost)opponentHost.append(slots[1]);else root.append(slots[1]);render();
 },destroy(){
  if(disposed)return;finish();disposed=true;window.clearInterval(ticker);media.removeEventListener('change',onMotion);
  document.removeEventListener('pointerdown',onOutside);document.removeEventListener('keydown',onKey);document.removeEventListener('visibilitychange',onVisibility);
  window.removeEventListener('heroarena:commander-state',snapshot);window.removeEventListener('heroarena:route-change',reset);window.removeEventListener('popstate',reset);window.removeEventListener('heroarena:battle-finished',finish);window.removeEventListener('heroarena:connection-lost',finish);window.removeEventListener('pagehide',finish);window.removeEventListener('pageshow',onPageShow);window.removeEventListener('hero:platform-settings',onSettings);
  window.removeEventListener('storage',onIdentity);window.removeEventListener('hero:login-changed',onIdentity);
  root.remove();slots[1].remove();panel.remove();nav.classList.remove('has-arena-emotes');
 }};
}
