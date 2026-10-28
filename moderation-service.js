import crypto from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const REASONS=new Set(['harassment','hate','sexual','threat','spam','other']);
const TERMINAL=new Set(['dismissed','actioned']);
export const MODERATION_RETENTION_MS=30*86400000;
// A deliberately small baseline filter, NOT a substitute for human moderation.
export function assertModeratedText(value,{kind='chat',blockedTerms=['fuck','shit','amk','orospu']}={}){
 const text=String(value||'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
 if(!text||text.length>(kind==='name'?24:240)||/[\u0000-\u001f\u007f]/.test(text))fail('Metin boş, çok uzun veya geçersiz karakter içeriyor.');
 const normalized=text.toLocaleLowerCase('tr-TR');
 if(blockedTerms.some(term=>new RegExp('(?:^|[^\\p{L}\\p{N}])'+String(term).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^\\p{L}\\p{N}])','u').test(normalized)))fail('Bu metin topluluk kurallarına uygun değil. Lütfen değiştir.');
 return text;
}
export function createModerationService({now=Date.now,persist=async()=>{},resolvePlayer=()=>null,publicPlayer=id=>({playerId:id}),evidence=()=>null,isAdmin=()=>false,maxReports=10000}={}){
 let blocks=new Map(),committedBlocks=new Map(),reports=new Map(),queue=Promise.resolve();
 const rates=new Map();
 const snapshot=()=>({version:1,blocks:[...blocks].map(([actor,targets])=>[actor,[...targets]]),reports:[...reports.values()].map(r=>structuredClone(r))});
 const restore=state=>{blocks=new Map((state?.blocks||[]).map(([a,targets])=>[a,new Set(targets)]));committedBlocks=new Map([...blocks].map(([a,targets])=>[a,new Set(targets)]));reports=new Map((state?.reports||[]).filter(r=>r&&now()-r.createdAt<MODERATION_RETENTION_MS).map(r=>[r.id,structuredClone(r)]))};
 const prune=()=>{for(const [id,r] of reports)if(now()-r.createdAt>=MODERATION_RETENTION_MS)reports.delete(id)};
 const mutate=fn=>{const run=queue.then(async()=>{const before=snapshot();try{prune();const result=await fn();await persist(snapshot());committedBlocks=new Map([...blocks].map(([a,targets])=>[a,new Set(targets)]));return result}catch(e){restore(before);throw e}});queue=run.catch(()=>{});return run};
 const rate=(actor,kind,limit)=>{const key=kind+':'+actor,time=now(),entries=(rates.get(key)||[]).filter(t=>time-t<3600000);if(entries.length>=limit)fail('Çok fazla işlem. Daha sonra tekrar dene.',429);entries.push(time);rates.set(key,entries);for(const [k,v] of rates)if(time-v.at(-1)>=3600000)rates.delete(k)};
 const target=(actor,playerId)=>{const id=resolvePlayer(String(playerId||'').trim().toUpperCase());if(!actor||!id||id===actor)fail('Oyuncu bulunamadı.',404);return id};
 const blocked=(a,b)=>Boolean(a&&b&&(committedBlocks.get(a)?.has(b)||committedBlocks.get(b)?.has(a)));
 const receipt=r=>({id:r.id,status:r.status,createdAt:r.createdAt,reason:r.reason});
 const admin=user=>{if(!isAdmin(user))fail('Yetkisiz.',403)};
 return {
  snapshot,restore,blocked,
  afterMutations:task=>{const run=queue.then(task);queue=run.catch(()=>{});return run},
  state(actor){return {blocked:[...(blocks.get(actor)||[])].map(id=>publicPlayer(id)).filter(Boolean),reports:[...reports.values()].filter(r=>r.reporter===actor&&now()-r.createdAt<MODERATION_RETENTION_MS).map(receipt)}} ,
  block(actor,playerId){rate(actor,'block',60);return mutate(()=>{const other=target(actor,playerId);const list=blocks.get(actor)||new Set();if(!list.has(other)&&list.size>=200)fail('Engel listesi sınırına ulaşıldı.',409);list.add(other);blocks.set(actor,list);return{ok:true}})},
  unblock(actor,playerId){rate(actor,'block',60);return mutate(()=>{const other=target(actor,playerId);blocks.get(actor)?.delete(other);if(!blocks.get(actor)?.size)blocks.delete(actor);return{ok:true}})},
  report(actor,input={}){rate(actor,'report',10);return mutate(async()=>{
   const other=target(actor,input.playerId);if(!REASONS.has(input.reason))fail('Geçerli bir şikâyet nedeni seç.');
   const details=String(input.details||'').trim();if(details.length>500)fail('Açıklama en fazla 500 karakter olabilir.');
   const verified=await evidence(actor,other,input.context||{});if(!verified)fail('Bu oyuncuyla doğrulanmış bir etkileşim bulunamadı.',403);
   const previous=[...reports.values()].find(r=>r.reporter===actor&&r.target===other&&r.status==='open'&&r.reason===input.reason&&now()-r.createdAt<3600000);if(previous)return receipt(previous);
   if(reports.size>=maxReports)fail('Şikâyet kuyruğu geçici olarak dolu. Destek ile iletişime geç.',503);
   const report={id:crypto.randomUUID(),reporter:actor,target:other,reason:input.reason,details,evidence:structuredClone(verified),createdAt:now(),status:'open',reviewedAt:null,reviewedBy:null,note:''};reports.set(report.id,report);return receipt(report);
  })},
  adminList(user){admin(user);return{reports:[...reports.values()].filter(r=>now()-r.createdAt<MODERATION_RETENTION_MS).sort((a,b)=>(a.status==='open'?0:1)-(b.status==='open'?0:1)||(a.status==='open'?a.createdAt-b.createdAt:b.createdAt-a.createdAt)).slice(0,200).map(r=>structuredClone(r)),retentionDays:30}},
  adminGet(user,id){admin(user);const report=reports.get(String(id));if(!report||now()-report.createdAt>=MODERATION_RETENTION_MS)fail('Şikâyet bulunamadı veya saklama süresi doldu.',404);return structuredClone(report)},
  review(user,{reportId,status,note}={}){admin(user);return mutate(()=>{const report=reports.get(String(reportId));if(!report)fail('Şikâyet bulunamadı.',404);if(!TERMINAL.has(status)||typeof note!=='string'||!note.trim()||note.length>500)fail('Karar ve 1–500 karakter açıklama gerekli.');if(report.status!=='open')fail('Şikâyet daha önce değerlendirildi.',409);report.status=status;report.note=note.trim();report.reviewedBy=user.sub;report.reviewedAt=now();return{ok:true}})},
  prune(){return mutate(()=>({ok:true}))}

 };
}
