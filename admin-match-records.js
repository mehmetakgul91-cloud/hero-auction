// Read-only projections of existing records. Never return room state or tokens.
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const text=(value,max=200)=>typeof value==='string'?value.slice(0,max):'';
const time=value=>Number.isFinite(value)&&value>0?value:null;
const number=value=>Number.isFinite(value)?value:null;
export const matchIdentity=room=>room?`${room.code}:${room.matchNumber||1}:${room.created}`:'';
function summary(record){
 return {id:text(record.id),at:time(record.at),mode:text(record.mode,30),universe:text(record.universe,40),
  participants:(record.participants||[]).slice(0,2).map(p=>({id:text(p.id)||null,name:text(p.name,100),score:number(p.score)})),
  winner:[-1,0,1].includes(record.winner)?record.winner:null,rankChange:(record.rankChange||[]).slice(0,2).map(number)};
}
const chat=items=>(Array.isArray(items)?items:[]).slice(-60).map(item=>({seat:[0,1].includes(item.seat)?item.seat:null,name:text(item.name,100),message:text(item.message,500),time:time(item.time)}));
function evidenceView(report){
 if(!report)return null;
 const e=report.evidence||{};
 return {reportId:report.id,capturedAt:time(report.createdAt),kind:text(e.kind,20),code:text(e.code,3),created:time(e.created),
  names:(e.names||[]).slice(0,2).map(v=>text(v,100)),chat:chat(e.chat),name:text(e.name,100),playerId:text(e.playerId,100)};
}
function validateId(id){if(typeof id!=='string'||!/^\d{3}:[1-9]\d{0,8}:\d{10,16}$/.test(id))fail('Geçersiz maç kimliği.');return id;}
export function listAdminMatches({records,request={},now=Date.now()}){
 const search=text(request.search,100).trim().toLocaleLowerCase('tr-TR'),offset=request.offset??0,days=request.days??30;
 if(![0,1,7,30].includes(days)||!Number.isSafeInteger(offset)||offset<0||offset>2000)fail('Geçersiz maç filtresi.');
 // Calendar days in Turkey, as in player session reporting.
 const localDay=Math.floor((now+10800000)/86400000)*86400000-10800000;
 const start=days?localDay-(days-1)*86400000:0;
 const all=[...records.values()].filter(r=>r&&time(r.at)&&r.at>=start&&r.at<=now).map(summary)
  .filter(r=>!search||[r.id,...r.participants.flatMap(p=>[p.id,p.name])].some(v=>String(v||'').toLocaleLowerCase('tr-TR').includes(search)))
  .sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
 return {matches:all.slice(offset,offset+25),pagination:{offset,limit:25,total:all.length,hasMore:offset+25<all.length},recordLimit:2000};
}
export function readAdminMatch({records,rooms,request={},report=null}){
 let id=request.matchId;
 if(report){
  const e=report.evidence||{};
  // Report evidence is captured by the server. Never associate by room code alone.
  const belongs=r=>r?.participants?.some(p=>p.id===report.reporter)&&r.participants.some(p=>p.id===report.target);
  const candidate=[...records.values()].find(r=>r&&r.id?.split(':')[0]===e.code&&Number(r.id.split(':')[2])===e.created&&belongs(r));
  id=candidate?.id||e.matchId;
  if(!id)return {record:null,room:null,reportEvidence:evidenceView(report),detailAvailable:false};
 }
 validateId(id);
 const record=records.get(id),candidate=rooms.get(id.split(':')[0]);
 const room=candidate&&matchIdentity(candidate)===id?candidate:null;
 if(!record&&!room&&!report)fail('Maç kaydı artık saklanmıyor veya bulunamadı.',404);
 const safeRoom=room?{id,created:time(room.created),phase:text(room.phase,30),settled:room.matchSettled===true,
  players:(room.players||[]).slice(0,2).map(p=>({id:text(p?.accountId)||null,name:text(p?.name,100)})),
  chat:chat(room.chat).filter(item=>item.time>=room.created),events:(Array.isArray(room.history)?room.history:[]).slice(-30).map(v=>text(v,1000))}:null;
 return {record:record?summary(record):null,room:safeRoom,reportEvidence:evidenceView(report),detailAvailable:!!safeRoom};
}
