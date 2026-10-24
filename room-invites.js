import crypto from 'node:crypto';
export const ROOM_INVITE_TTL=30*60*1000;
export function createRoomInvites({now=Date.now}={}){
 const items=new Map(),attempts=new Map();
 const pending=i=>['pending','queued'].includes(i.status);
 const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status})};
 return{
  items,pending,
  snapshot:()=>[...items].map(([id,item])=>[id,{...item}]),
  restore:state=>{items.clear();for(const [id,item] of state||[])items.set(id,{...item})},
  create(from,to,room){
   const old=[...items.values()].find(i=>i.from===from&&i.to===to&&i.code===room.code&&i.created===room.created&&pending(i));if(old)return old;
   const time=now(),recent=(attempts.get(from)||[]).filter(t=>time-t<60000);if(recent.length>=20)fail('Çok fazla davet. Bir dakika bekle.',429);recent.push(time);attempts.set(from,recent);for(const [id,times] of attempts)if(time-times.at(-1)>=60000)attempts.delete(id);
   if([...items.values()].filter(i=>i.to===to&&pending(i)).length>=50)fail('Oyuncunun bekleyen davet listesi dolu.');
   if([...items.values()].filter(i=>i.from===from&&pending(i)).length>=20)fail('Çok fazla bekleyen davet var.');
   const item={id:crypto.randomUUID(),from,to,code:room.code,created:room.created,status:'pending',expiresAt:now()+ROOM_INVITE_TTL};items.set(item.id,item);return item;
  },
  respond(actor,id,response,consent){const i=items.get(String(id));if(!i||i.to!==actor)fail('Davet bulunamadı.',404);
   if(!pending(i))return i;
   if(i.expiresAt<=now()){i.status='expired';return i}
   if(response==='decline'){i.status='declined';return i}
   if(response!=='accept'||consent!==true)fail('Davet için 50 altın giriş ücretini onayla.',400);
   if([...items.values()].some(other=>other.id!==i.id&&other.to===actor&&other.status==='queued'))fail('Önce kabul ettiğin daveti tamamla veya iptal et.');
   i.status='queued';return i;
  },
  cancel(actor,id){const i=items.get(String(id));if(!i||![i.from,i.to].includes(actor))fail('Davet bulunamadı.',404);if(pending(i))i.status='cancelled';return i},
  prune(protect=()=>false){for(const [id,i] of items){if(protect(i))continue;if(pending(i)&&i.expiresAt<=now())i.status='expired';if(!pending(i)&&now()-i.expiresAt>24*3600000)items.delete(id)}}
 };
}
