// Optional first-party operational measurements, not a third-party tracker.
// Only coarse enums leave this module; URL queries, referrer URLs, UA strings,
// client clocks, location, account names and identifiers are never transmitted.
// The existing signed auth token is sent only in the same-origin POST body.
const GOOGLE_SEARCH_HOSTS=new Set([
 'google.com','www.google.com','google.com.tr','www.google.com.tr',
 'google.co.uk','www.google.co.uk','google.de','www.google.de',
 'google.fr','www.google.fr','google.es','www.google.es',
 'google.it','www.google.it','google.ca','www.google.ca',
 'google.com.au','www.google.com.au','google.co.in','www.google.co.in',
 'google.co.jp','www.google.co.jp','google.com.br','www.google.com.br',
]);
const HEARTBEAT_MS=15000,MAX_SESSION_MS=24*60*60*1000;

export function classifyCoarseDevice(userAgent=''){
 const ua=typeof userAgent==='string'?userAgent:'';
 const platform=/Android/i.test(ua)?'android':ua?'web':'unknown';
 const device=/iPad|Tablet/i.test(ua)||/Android/i.test(ua)&&!/Mobile/i.test(ua)?'tablet':/Mobi|iPhone|iPod/i.test(ua)?'mobile':/Windows|Macintosh|X11|Linux|CrOS/i.test(ua)?'desktop':'unknown';
 return {platform,device};
}

export function classifySessionAttribution({referrer='',url='',provider=null,userAgent=''}={}){
 let source='direct_or_unknown',page;
 try{page=new URL(url);}catch{}
 // Match the actual normal-web invite route. Invalid/unrelated query strings
 // are not evidence of a referral, and the code itself is never retained.
 if(page&&/^\d{3}$/.test(page.searchParams.get('join')||''))source='invite';
 else if(referrer){
  try{
   const from=new URL(referrer);
   if(/^https?:$/.test(from.protocol)&&(!page||from.origin!==page.origin)){
    source=GOOGLE_SEARCH_HOSTS.has(from.hostname)&&from.pathname==='/search'?'google_search':'external';
   }
  }catch{}
 }
 // This is a display hint only. The server independently verifies the provider.
 if(provider==='crazygames')source='crazygames';
 return {source,...classifyCoarseDevice(userAgent)};
}

export function createPlayerSessionTracker({
 document=globalThis.document,window=globalThis.window,navigator=globalThis.navigator,
 location=globalThis.location,fetch=globalThis.fetch,crypto=globalThis.crypto,
 setInterval=globalThis.setInterval,clearInterval=globalThis.clearInterval,now=Date.now,
}={}){
 // Capture sanitized arrival evidence before the game clears an accepted invite.
 const arrival=classifySessionAttribution({referrer:document?.referrer,url:location?.href,userAgent:navigator?.userAgent});
 let enabled=false,identity=null,session=null,timer=null,disposed=false,suspended=false;
 const foreground=()=>document?.visibilityState==='visible'&&document?.hasFocus?.()===true&&navigator?.onLine!==false;
 const identityKey=login=>typeof login?.user?.sub==='string'&&login.user.sub?login.user.sub:login?.authToken;
 const validIdentity=login=>typeof login?.authToken==='string'&&login.authToken.length>0;
 const clearTimer=()=>{if(timer!==null){clearInterval(timer);timer=null;}};

 async function pump(active){
  if(active.busy||active.finished)return;
  let event,body,recovery=false;
  if(!active.started){
   event='start';body={sessionId:active.id,sequence:0,foreground:false,...active.attribution};
  }else if(active.closing){
   event='end';body={sessionId:active.id,sequence:++active.sequence,foreground:false};
  }else if(active.pending){
   recovery=active.needsBaseline;
   event='heartbeat';body={sessionId:active.id,sequence:++active.sequence,foreground:recovery?false:active.desired,...(recovery?{reset:true}:{})};
   active.pending=false;
  }else return;
  active.busy=true;active.sendingForeground=body.foreground;
  let succeeded=false,restart=false,throttled=false;
  try{
   const response=await fetch('/api/player-sessions/'+event,{
    method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
    // A best-effort unload/pause is not a correctness dependency: the server
    // stops credit at its heartbeat/staleness cap if this request never arrives.
    keepalive:true,body:JSON.stringify({...body,authToken:active.authToken}),
   });
   if(!response?.ok){
    if(response?.status===401||response?.status===403)active.finished=true;
    throw Error('Session measurement unavailable');
   }
   const result=await response.json();
   succeeded=true;throttled=result?.throttled===true;
   // A throttled write has not advanced server sequence. Reuse that next slot;
   // a long outage must not grow a sequence gap beyond the server's bound.
   active.acknowledged=Number.isSafeInteger(result?.sequence)?result.sequence:body.sequence;
   active.sequence=active.acknowledged;
   if(result?.closed===true){
    active.finished=true;restart=event!=='start'&&!active.closing&&active===session;
   }else if(event==='start'){
    active.started=true;
    // Starting paused avoids crediting a slow initial request as playtime.
    active.pending=active.desired;
   }else if(event==='end'){
    // A same-sequence replay may belong to the preceding unknown heartbeat,
    // not this end request. Advance once more instead of treating it as closed.
    active.finished=result?.replayed!==true&&result?.throttled!==true;
   }
   else if(recovery){
    // A lost response may mean our earlier foreground request committed. Its
    // replay does not itself apply this pause/reset; send one fresh baseline.
    active.needsBaseline=result?.replayed===true||result?.throttled===true;
    active.pending=active.needsBaseline||active.desired;
   }
  }catch{
   // Never block gameplay or retry in a tight loop. Start retains exactly the
   // same ID/sequence; subsequent recovery establishes a paused baseline first.
   active.needsBaseline=true;
   active.sequence=active.acknowledged;
   if(event!=='end')active.pending=true;
   else active.finished=true;
  }finally{
   active.busy=false;
   if(active===session&&active.finished){session=null;clearTimer();}
   if(restart)start();
   // Wait for the next tick/lifecycle event if a same-state baseline was rate
   // limited. Immediate recursion would busy-loop against the server throttle.
   if(succeeded&&!throttled&&!active.finished)void pump(active);
  }
 }

 function retire(){
  const old=session;session=null;clearTimer();
  if(!old)return;
  old.closing=true;old.desired=false;
  // Logout/account changes never send a later heartbeat with a new account's
  // credentials. The retired session retains its own token just until closure.
  void pump(old);
 }
 function start(){
  if(disposed||!enabled||suspended||session||!validIdentity(identity)||typeof fetch!=='function'||typeof crypto?.randomUUID!=='function')return;
  const provider=identity.user?.provider||identity.type;
  session={id:crypto.randomUUID(),key:identityKey(identity),authToken:identity.authToken,
   attribution:{...arrival,source:provider==='crazygames'?'crazygames':arrival.source},
   sequence:0,acknowledged:0,created:now(),started:false,busy:false,finished:false,closing:false,
   desired:foreground(),pending:true,needsBaseline:false};
  timer=setInterval(tick,HEARTBEAT_MS);
  void pump(session);
 }
 function update({baseline=false}={}){
  if(!session)return;
  const next=foreground();
  // Coalescing must not erase a hide→show edge while a foreground request is
  // in flight. A conservative reset then resume drops the uncertain interval.
  if(!next&&session.started&&session.busy&&session.sendingForeground)session.needsBaseline=true;
  session.desired=next;session.pending=true;
  if(baseline)session.needsBaseline=true;
  void pump(session);
 }
 function tick(){
  if(!session)return;
  if(foreground()&&now()-session.created>=MAX_SESSION_MS){retire();start();return;}
  // Hidden/unfocused pages send one pause edge, not endless presence updates.
  if(!session.started||foreground()||session.desired!==foreground())update();
 }
 const onVisibility=()=>update();
 const onFocus=()=>update();
 const onBlur=()=>update();
 const onOffline=()=>update();
 const onOnline=()=>update({baseline:true});
 const onPageHide=()=>{suspended=true;retire();};
 const onPageShow=()=>{suspended=false;start();};
 const listeners=[[document,'visibilitychange',onVisibility],[window,'focus',onFocus],
  [window,'blur',onBlur],[window,'offline',onOffline],[window,'online',onOnline],
  [window,'pagehide',onPageHide],[window,'pageshow',onPageShow]];
 for(const [target,type,handler] of listeners)target?.addEventListener?.(type,handler);
 return {
  setEnabled(value){
   const next=value===true;if(disposed||enabled===next)return;
   enabled=next;if(!enabled)retire();else start();
  },
  setIdentity(login){
   if(disposed)return;
   const next=validIdentity(login)?{authToken:login.authToken,type:login.type,user:login.user?{sub:login.user.sub,provider:login.user.provider}:undefined}:null;
   if(next?.authToken===identity?.authToken&&next?.type===identity?.type&&next?.user?.sub===identity?.user?.sub&&next?.user?.provider===identity?.user?.provider)return;
   if(session&&identityKey(next)===session.key){identity=next;session.authToken=next.authToken;return;}
   retire();identity=next;start();
  },
  dispose(){
   if(disposed)return;disposed=true;enabled=false;retire();identity=null;
   for(const [target,type,handler] of listeners)target?.removeEventListener?.(type,handler);
  },
 };
}
