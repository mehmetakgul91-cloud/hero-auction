import crypto from 'node:crypto';

export const FRIEND_PRESENCE_TTL=45000;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const normalize=value=>String(value||'').trim().toUpperCase();
const validId=value=>/^HA-[A-F0-9]{16}$/.test(value);

// One serialized durable social store, matching the game's single-server room model.
// Presence is deliberately ephemeral and is never included in a saved snapshot.
export function createFriendsService({now=Date.now,persist=async()=>{},profile=()=>({})}={}){
 let players=new Map(),ids=new Map(),links=new Map(),requests=new Map();
 const presence=new Map(),attempts=new Map();
 let queue=Promise.resolve();
 const snapshot=()=>({version:1,players:[...players].map(([id,p])=>[id,{...p}]),links:[...links].map(([k,v])=>[k,[...v]]),requests:[...requests].map(([k,v])=>[k,[...v]])});
 const restore=state=>{
  players=new Map(state?.players||[]);ids=new Map([...players].map(([id,p])=>[p.playerId,id]));
  links=new Map((state?.links||[]).map(([k,v])=>[k,new Set(v)]));
  requests=new Map((state?.requests||[]).map(([k,v])=>[k,new Set(v)]));
 };
 const mutate=fn=>{
  const run=queue.then(async()=>{const before=snapshot();try{const result=fn();if(JSON.stringify(before)!==JSON.stringify(snapshot()))await persist();return result}catch(e){restore(before);throw e}});
  queue=run.catch(()=>{});return run;
 };
 const ensure=(accountId,name)=>{
  let p=players.get(accountId);
  if(!p){let playerId;do{playerId='HA-'+crypto.randomBytes(8).toString('hex').toUpperCase()}while(ids.has(playerId));p={playerId,name:String(name||'Oyuncu').slice(0,24)};players.set(accountId,p);ids.set(playerId,accountId)}
  else if(name)p.name=String(name).slice(0,24);
  return p;
 };
 const add=(map,a,b)=>{if(!map.has(a))map.set(a,new Set());map.get(a).add(b)};
 const remove=(map,a,b)=>{map.get(a)?.delete(b);if(!map.get(a)?.size)map.delete(a)};
 const accepted=(a,b)=>links.get(a)?.has(b)&&links.get(b)?.has(a);
 const target=(actor,value)=>{const id=normalize(value),other=validId(id)?ids.get(id):null;if(!other||other===actor)fail('Oyuncu bulunamadı.',404);return other};
 const online=account=>{
  const sessions=presence.get(account);if(!sessions)return false;
  for(const [id,seen] of sessions)if(now()-seen>=FRIEND_PRESENCE_TTL)sessions.delete(id);
  if(!sessions.size)presence.delete(account);return sessions.size>0;
 };
 const row=(id,withPresence=false)=>{const p=players.get(id);if(!p)return null;return{playerId:p.playerId,name:p.name,tier:profile(id).tier||'Bronz',...(withPresence?{online:online(id)}:{})}};
 const state=account=>({playerId:players.get(account)?.playerId||null,
  friends:[...(links.get(account)||[])].filter(id=>accepted(account,id)).map(id=>row(id,true)).filter(Boolean),
  incoming:[...requests].filter(([,targets])=>targets.has(account)).map(([id])=>row(id)).filter(Boolean),
  outgoing:[...(requests.get(account)||[])].map(id=>row(id)).filter(Boolean)});
 const rate=actor=>{const time=now(),recent=(attempts.get(actor)||[]).filter(t=>time-t<60000);if(recent.length>=20)fail('Çok fazla arkadaş isteği. Bir dakika bekle.',429);recent.push(time);attempts.set(actor,recent);for(const [id,times] of attempts)if(time-times.at(-1)>=60000)attempts.delete(id)};
 return {
  snapshot,restore,state,accepted,accountFor:playerId=>ids.get(normalize(playerId))||null,publicPlayer:account=>row(account),afterMutations:task=>{const run=queue.then(task);queue=run.catch(()=>{});return run},seed:entries=>{for(const [account,name] of entries)ensure(account,name)},playerId:account=>players.get(account)?.playerId||null,
  register:(account,name)=>mutate(()=>({...ensure(account,name)})),
  migrate(legacy,ratings){
   for(const [account,targets] of legacy||[]){ensure(account,ratings.get(account)?.name);for(const other of targets)ensure(other,ratings.get(other)?.name)}
   const old=new Map((legacy||[]).map(([a,targets])=>[a,new Set(targets)]));
   for(const [a,targets] of old)for(const b of targets)if(a!==b){if(old.get(b)?.has(a))add(links,a,b);else add(requests,a,b)}
  },
  action(actor,action,value){
   if(action==='add')rate(actor);
   return mutate(()=>{
    if(!players.has(actor))fail('Oturumun sona erdi. Yeniden giriş yap.',401);
    const other=target(actor,value);
    if(action==='add'){
     if(accepted(actor,other)||requests.get(actor)?.has(other))return{ok:true};
     if((requests.get(actor)?.size||0)>=50||[...requests.values()].filter(s=>s.has(other)).length>=50)fail('Arkadaş isteği sınırına ulaşıldı.',409);
     add(requests,actor,other);
    }else if(action==='accept'){
     if(accepted(actor,other))return{ok:true};
     if(!requests.get(other)?.has(actor))fail('Arkadaş isteği bulunamadı.',404);
     if((links.get(actor)?.size||0)>=100||(links.get(other)?.size||0)>=100)fail('Arkadaş listesi dolu.',409);
     add(links,actor,other);add(links,other,actor);remove(requests,actor,other);remove(requests,other,actor);
    }else if(action==='decline')remove(requests,other,actor);
    else if(action==='remove'){remove(links,actor,other);remove(links,other,actor);remove(requests,actor,other);remove(requests,other,actor)}
    else fail('Geçersiz işlem.');
    return{ok:true};
   });
  },
  heartbeat(actor,sessionId,isOnline){
   if(!/^[a-zA-Z0-9_-]{8,80}$/.test(String(sessionId||''))||typeof isOnline!=='boolean')fail('Geçersiz çevrimiçi oturumu.');
   // Prune all expired sessions, not just accounts whose friends happen to poll.
   for(const account of presence.keys())online(account);
   if(!isOnline){presence.get(actor)?.delete(sessionId);online(actor);return{ok:true}}
   let sessions=presence.get(actor);if(!sessions){sessions=new Map();presence.set(actor,sessions)}
   if(!sessions.has(sessionId)&&sessions.size>=8)sessions.delete(sessions.keys().next().value);
   sessions.set(sessionId,now());return{ok:true};
  }
 };
}
