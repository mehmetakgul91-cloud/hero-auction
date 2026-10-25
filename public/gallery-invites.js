import {createFriendsUI} from './friends.js';
import {createRoomInvitesUI} from './room-invites.js';
import {translate} from './crazygames-en.js';

// Separate information screens only resume an existing verified account. It never signs up a
// guest, creates a room, or joins from a URL/storage event. Admission stays with
// the shared invitation controller and the server's match-settlement checks.
export function createGalleryInvites({document:doc=globalThis.document,window:win=globalThis.window,createFriends=createFriendsUI,createInvites=createRoomInvitesUI}={}){
 const loginKey='hero-auction-login',sessionKey='hero-auction-session';
 const t=text=>doc.documentElement.lang==='en'?translate(text):text;
 let generation=0,suspended=false,destroyed=false,pending=false,active=null,friends=null,invites=null;
 const read=key=>{try{return win.localStorage.getItem(key)}catch{return null}};
 const parse=value=>{try{return JSON.parse(value||'null')}catch{return null}};
 const current=()=>!!active&&!suspended&&!destroyed&&read(loginKey)===active.loginRaw&&read(sessionKey)===active.sessionRaw;
 function disable(){active=null;friends?.setLogin(null);invites?.setLogin(null);friends?.setRoom(null);invites?.setRoom(null,null)}
 async function post(path,body){
  const response=await win.fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok){const error=Error('Session verification failed');error.status=response.status;throw error}return result;
 }
 async function refresh(){
  const version=++generation;pending=false;disable();if(suspended||destroyed)return;
  const loginRaw=read(loginKey),sessionRaw=read(sessionKey),saved=parse(loginRaw),seat=parse(sessionRaw),platform=win.HeroPlatform;
  if(!saved||typeof saved.authToken!=='string'||!saved.authToken||!['guest','google','crazygames'].includes(saved.type))return;
  const valid=()=>version===generation&&!suspended&&!destroyed&&read(loginKey)===loginRaw&&read(sessionKey)===sessionRaw;
  pending=true;
  try{
   let verified;
   if(platform){
    // The opaque SDK credential must be verified server-side and matched to the
    // stored identity before any saved token/seat reaches the shared controllers.
    const identity=await platform.identity();if(!valid())return;
    if(identity.kind==='user'){
     if(saved.type!=='crazygames'||!saved.user?.sub)return;
     verified=await post('/api/auth/crazygames',{credential:identity.credential});
     if(!valid()||verified.user?.sub!==saved.user.sub||!verified.authToken)return;
    }else{
     if(identity.kind!=='guest'||saved.type!=='guest')return;
     verified=await post('/api/auth/check',{authToken:saved.authToken});
    }
   }else{
    if(saved.type==='crazygames')return;
    verified=await post('/api/auth/check',{authToken:saved.authToken});
   }
   if(!valid()||!verified.user)return;
   if(saved.user?.sub&&saved.user.sub!==verified.user.sub)return;
   if(platform&&saved.type==='guest'&&!String(verified.user.sub||'').startsWith('guest:'))return;
   const login={...saved,user:verified.user,authToken:verified.authToken||saved.authToken};
   let room=null,token=null;
   if(typeof seat?.code==='string'&&/^\d{3}$/.test(seat.code)&&typeof seat.token==='string'&&seat.token){
    try{
     const result=await post('/api/state',{code:seat.code,token:seat.token,authToken:login.authToken});
     if(!valid())return;
     if(result.room?.code!==seat.code||![0,1].includes(result.room.me))return;
     room=result.room;token=seat.token;
    }catch(error){
     if(!valid())return;
     // A gone/invalid seat supplies no proof. Never erase or detach it here;
     // the server still owns the account's active-match pointer on acceptance.
     if(![403,404].includes(error.status))throw error;
    }
   }
   if(!valid())return;
   active={loginRaw,sessionRaw};friends.setRoom(room);invites.setRoom(room,token);
   friends.setLogin(login);invites.setLogin(login);platform?.setRoom?.(room);
  }catch{/* A gallery visit must not replace login or interrupt browsing on failure. */}
  finally{if(version===generation)pending=false}
 }
 const storage=event=>{if(event.key===null||event.key===loginKey||event.key===sessionKey)void refresh()};
 const changed=()=>void refresh(),hide=()=>{suspended=true;generation++;pending=false;disable()},show=()=>{suspended=false;void refresh()};
 // Register before shared lifecycle listeners so BFCache resumes are reverified
 // before those listeners can heartbeat or poll with an old account.
 win.addEventListener('storage',storage);win.addEventListener('hero:login-changed',changed);win.addEventListener('hero:platform-auth',changed);
 win.addEventListener('online',changed);win.addEventListener('pagehide',hide);win.addEventListener('pageshow',show);
 friends=createFriends({document:doc,window:win,translate:t});
 invites=createInvites({document:doc,window:win,translate:t,canStart:current,
  onJoined:({token,room})=>{
   if(!current())throw Error(t('Aktif odan değişti. Daveti yeniden aç.'));
   const version=generation,loginRaw=active.loginRaw,sessionRaw=JSON.stringify({token,code:room.code});
   // A failed save throws before the shared controller marks/ACKs the receipt.
   win.localStorage.setItem(sessionKey,sessionRaw);active.sessionRaw=sessionRaw;
   return ()=>{
    if(version!==generation||!current()||read(loginKey)!==loginRaw||read(sessionKey)!==sessionRaw)return;
    const home=win.HeroPlatform?'/crazygames/':'/';win.HeroPlatform?.beforeNavigate?.(home);win.location.replace(home);
   };
  }
 });
 win.HeroPlatform?.watchAccount?.();
 const retry=win.setInterval(()=>{if(!active&&!pending&&!suspended&&!destroyed)void refresh()},20000);
 const ready=refresh();
 return {ready,refresh,destroy(){destroyed=true;generation++;disable();win.clearInterval(retry);friends.destroy();invites.destroy();win.removeEventListener('storage',storage);win.removeEventListener('hero:login-changed',changed);win.removeEventListener('hero:platform-auth',changed);win.removeEventListener('online',changed);win.removeEventListener('pagehide',hide);win.removeEventListener('pageshow',show)}};
}
if(typeof window!=='undefined'&&typeof document!=='undefined'&&document.getElementById('room-invites'))createGalleryInvites();
