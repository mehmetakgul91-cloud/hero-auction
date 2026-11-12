// The server uses this same limit for room inactivity and automatic seat recovery.
export const ROOM_RETURN_MS = 100_000;
const departureKey = 'hero-auction-room-departure';
const sessionKey = 'hero-auction-session';
const sameSeat = (a,b) => Boolean(a?.token && a.token===b?.token && a.code===b.code);

export function watchRoomDeparture({window,document,storage,getSeat,onExpire,now=()=>Date.now()}) {
 let paused=null;
 function read(key) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
 }
 function expired(seat) {
  const saved=sameSeat(paused,seat)?paused:read(departureKey);
  return sameSeat(saved,seat) && Number.isFinite(saved.at) && now()-saved.at>=ROOM_RETURN_MS;
 }
 function activate(seat) {
  if(document.hidden){pause();return;}
  paused=null;
  if(sameSeat(read(departureKey),seat))try { storage.removeItem(departureKey); } catch {}
 }
 function forget(seat) {
  if(sameSeat(read(sessionKey),seat))try { storage.removeItem(sessionKey); } catch {}
 }
 function pause() {
  const seat=getSeat();
  if(!seat?.token || sameSeat(paused,seat))return;
  paused={code:seat.code,token:seat.token,at:now()};
  const stored=read(sessionKey);
  if(!stored||sameSeat(stored,seat))try { storage.setItem(departureKey,JSON.stringify(paused)); } catch {}
 }
 function resume() {
  const seat=getSeat();
  if(!seat||!sameSeat(paused,seat))return;
  if(expired(seat)){forget(seat);onExpire(seat);}
  else activate(seat);
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else resume();},true);
 window.addEventListener('pagehide',pause,true);
 window.addEventListener('pageshow',()=>{if(!document.hidden)resume();},true);
 return {expired,activate,forget};
}
