import {randomUUID} from 'node:crypto';

export const ARENA_EMOTE_IDS=Object.freeze(['laugh','slow_clap','fake_cry','yawn','sunglasses','nanik']);
export const ARENA_EMOTE_COOLDOWN_MS=5000;
export const ARENA_EMOTE_LIFETIME_MS=2800;
export const ARENA_EMOTE_MAX_REQUESTS_PER_SEAT=256;
const allowedIds=new Set(ARENA_EMOTE_IDS);
const inputKeys=new Set(['code','token','matchKey','emoteId','requestId']);
const fail=(message,status)=>{throw Object.assign(Error(message),{status})};

export function arenaEmoteMatchKey(room){
 return room?room.code+':'+String(room.matchNumber||1)+':'+String(room.created):null;
}

// The portal's basic launch disables communication, including fixed reactions.
// Account IDs are server-verified. Headers only restrict access; they never grant it.
export function arenaEmotePlatformAllowed(room,headers={}){
 if(room?.players?.some(player=>String(player?.accountId||'').startsWith('crazygames:')))return false;
 for(const source of [headers.origin,headers.referer]){
  if(!source)continue;
  try{
   const url=new URL(source),host=url.hostname.toLowerCase();
   if(host==='crazygames.com'||host.endsWith('.crazygames.com')||url.pathname==='/crazygames'||url.pathname.startsWith('/crazygames/'))return false;
  }catch{return false}
 }
 return true;
}

export function validateArenaEmoteInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!inputKeys.has(key)))fail('Geçersiz ifade isteği.',422);
 if(typeof input.code!=='string'||!input.code||input.code.length>16||typeof input.token!=='string'||!input.token||input.token.length>200)fail('Oyuncu oturumu geçersiz.',403);
 if(typeof input.matchKey!=='string'||!input.matchKey||input.matchKey.length>160)fail('Geçersiz maç kimliği.',422);
 if(typeof input.emoteId!=='string'||!allowedIds.has(input.emoteId))fail('Geçersiz arena ifadesi.',422);
 if(typeof input.requestId!=='string'||!/^[-a-zA-Z0-9_]{8,80}$/.test(input.requestId))fail('Geçersiz ifade istek kimliği.',422);
 return input;
}

// Presentation-only, process-local data. Never add events to room JSON or combat.
// Weak room ownership avoids retaining deleted rooms; each room keeps one match,
// at most two live events, and a fixed number of retry receipts. At the receipt
// limit, fail closed rather than forgetting IDs and replaying an old request.
export function createArenaEmotesService({now=Date.now,makeId=randomUUID,onEvent=()=>{},maxRequestsPerSeat=ARENA_EMOTE_MAX_REQUESTS_PER_SEAT}={}){
 if(!Number.isSafeInteger(maxRequestsPerSeat)||maxRequestsPerSeat<1||maxRequestsPerSeat>ARENA_EMOTE_MAX_REQUESTS_PER_SEAT)throw Error('Invalid arena emote request limit');
 const states=new WeakMap();
 function inspect(context){
  const {room,token}=context;
  const players=room?.players;
  if(!Array.isArray(players)||players.length!==2||typeof token!=='string'||!token||players.some(p=>p&&(typeof p.token!=='string'||!p.token))||players[0]?.token&&players[0].token===players[1]?.token)fail('Oda veya oyuncu oturumu geçersiz.',403);
  const seat=players.findIndex(player=>player?.token===token);
  if(seat<0)fail('Oda veya oyuncu oturumu geçersiz.',403);
  const matchKey=arenaEmoteMatchKey(room),time=now();
  if(!Number.isFinite(time))throw Error('Invalid arena emote clock');
  let state=states.get(room);
  if(state&&(state.matchKey!==matchKey||state.tokens.some((value,i)=>value!==players[i]?.token))){states.delete(room);state=null}
  if(state)state.events=state.events.filter(event=>event.expiresAt>time&&event.at<=time);
  let denied=null;
  const terminal=Boolean(room.battleSync?.result?.finished||room.matchSettled||room.idleClosed||room.cancelled||room.disconnectForfeit||room.rematchPending);
  const safetyDisabled=context.moderationReady!==true||context.blocked!==false||context.platformAllowed!==true;
  const auction=room.phase==='auction'&&players.every(Boolean);
  const arena=room.phase==='finished'&&room.battleSync?.result?.live===true&&room.battleSync?.commanderInput&&context.activeMatchKey===matchKey&&context.liveRunning===true;
  if(room.mode==='bot'||terminal||!auction&&!arena)denied={status:409,message:'İfadeler yalnızca açık artırmada veya devam eden arenada kullanılabilir.'};
  else if(context.moderationReady!==true)denied={status:503,message:'Oyuncu güvenlik kayıtları geçici olarak kullanılamıyor.'};
  else if(context.blocked!==false||context.platformAllowed!==true)denied={status:403,message:'Bu maçta oyuncu etkileşimi kullanılamıyor.'};
  // A newly blocked/disabled peer must not see a pending event after unblocking.
  // Formation preparation temporarily hides expressions but retains cooldown
  // and still-live events for the same match. Terminal/safety changes erase them.
  if(state&&(safetyDisabled||terminal||room.mode==='bot'||!['auction','finished'].includes(room.phase)))state.events=[];
  return {room,seat,matchKey,time,state,denied};
 }
 function view({seat,matchKey,time,state,denied}){
  return {matchKey,serverTime:time,enabled:!denied,cooldownMs:!denied&&state&&state.lastAt[seat]!==null?Math.max(0,state.lastAt[seat]+ARENA_EMOTE_COOLDOWN_MS-time):0,
   events:denied?[]:(state?.events||[]).map(event=>({...event,side:event.side===seat?0:1}))};
 }
 return {
  snapshot(context){return view(inspect(context))},
  send(context,input){
   validateArenaEmoteInput(input);
   const current=inspect(context);
   if(input.code.toUpperCase()!==current.room.code||input.token!==context.token)fail('Oyuncu oturumu geçersiz.',403);
   if(input.matchKey!==current.matchKey)fail('İfade başka bir maça ait.',409);
   if(current.denied)fail(current.denied.message,current.denied.status);
   let {state}=current;
   if(!state){
    state={matchKey:current.matchKey,tokens:current.room.players.map(p=>p.token),lastAt:[null,null],requests:[new Map(),new Map()],events:[]};
    states.set(current.room,state);current.state=state;
   }
   const requests=state.requests[current.seat],previous=requests.get(input.requestId);
   if(previous){
    if(previous!==input.emoteId)fail('İstek kimliği başka bir ifade için kullanılmış.',409);
    return view(current);
   }
   if(state.lastAt[current.seat]!==null&&current.time-state.lastAt[current.seat]<ARENA_EMOTE_COOLDOWN_MS)fail('Yeni ifade için beş saniye bekle.',429);
   if(requests.size>=maxRequestsPerSeat)fail('Bu maçın ifade sınırına ulaşıldı.',429);
   const event={id:makeId(),emoteId:input.emoteId,side:current.seat,at:current.time,expiresAt:current.time+ARENA_EMOTE_LIFETIME_MS};
   requests.set(input.requestId,input.emoteId);
   state.lastAt[current.seat]=current.time;
   state.events.push(event);state.events=state.events.slice(-2);
   onEvent(current.room);
   return view(current);
  }
 };
}
