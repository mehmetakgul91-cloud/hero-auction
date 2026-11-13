// The same deadline applies when a mobile browser freezes or discards a page
// without delivering pagehide or visibilitychange.
export const ROOM_RETURN_MS = 100_000;
const departureKey = 'hero-auction-room-departure';
const sessionKey = 'hero-auction-session';
const sameSeat = (a,b) => Boolean(a?.token && a.token===b?.token && a.code===b.code);

export function watchRoomDeparture({window,document,storage,getSeat,onExpire,now=()=>Date.now()}) {
 let observed=null,paused=false;
 function read(key) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
 }
 function expired(seat) {
  const saved=sameSeat(observed,seat)?observed:read(departureKey);
  return sameSeat(saved,seat) && (saved.expired===true || Number.isFinite(saved.at) && now()-saved.at>=ROOM_RETURN_MS);
 }
 function remember(seat) {
  observed={code:seat.code,token:seat.token,at:now()};
  const current=read(sessionKey);
  if(!current||sameSeat(current,seat))try {storage.setItem(departureKey,JSON.stringify(observed));} catch {}
 }
 function forget(seat) {
  if(!seat?.token)return;
  const current=read(sessionKey);
  if(current&&!sameSeat(current,seat))return;
  if(!current&&!sameSeat(read(departureKey),seat))return;
  observed={code:seat.code,token:seat.token,expired:true};
  try {
   storage.setItem(departureKey,JSON.stringify(observed));
   if(sameSeat(current,seat))storage.removeItem(sessionKey);
  } catch {}
 }
 function activate(seat) {
  paused=Boolean(document.hidden);
  remember(seat);
 }
 function pause() {
  const seat=getSeat();
  if(!seat?.token||paused)return;
  paused=true;
  // A late close event must not give a discarded page another 100 seconds.
  if(!expired(seat))remember(seat);
 }
 function resume() {
  const seat=getSeat();
  if(!seat?.token||document.hidden)return;
  if(expired(seat)){paused=true;forget(seat);onExpire(seat);return;}
  paused=false;remember(seat);
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else resume();},true);
 window.addEventListener('pagehide',pause,true);
 window.addEventListener('pageshow',resume,true);
 window.addEventListener('focus',resume,true);
 window.setInterval?.(()=>{if(!paused&&!document.hidden)resume();},5000);
 return {expired,activate,forget};
}
