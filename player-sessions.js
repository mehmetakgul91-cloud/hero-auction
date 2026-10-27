// First-party, account-linked foreground-time estimates. Identity comes only from
// the signed server session. Browser source/device signals are deliberately coarse
// and explicitly self-reported; they are not proof of human play or acquisition.
export const PLAYER_ANALYTICS_RETENTION_DAYS=30;
export const PLAYER_ANALYTICS_HEARTBEAT_MS=15000;
export const PLAYER_ANALYTICS_STALE_MS=45000;
export const PLAYER_ANALYTICS_MAX_CREDIT_MS=30000;
export const PLAYER_ANALYTICS_MAX_SESSION_MS=86400000;
export const PLAYER_ANALYTICS_MAX_SESSIONS=1000;
const DAY_MS=86400000,MAX_SEQUENCE=100000;
const failure=(message,status=503)=>Object.assign(Error(message),{status});
const sources=new Set(['direct_or_unknown','google_search','invite','external']);
const platforms=new Set(['web','android','unknown']);
const devices=new Set(['desktop','mobile','tablet','unknown']);
export function createPlayerAnalyticsPolicy(env={}){
 return Object.freeze({enabled:env.HERO_PLAYER_ANALYTICS_ENABLED==='1',retentionDays:PLAYER_ANALYTICS_RETENTION_DAYS,heartbeatMs:PLAYER_ANALYTICS_HEARTBEAT_MS,staleMs:PLAYER_ANALYTICS_STALE_MS,maxCreditMs:PLAYER_ANALYTICS_MAX_CREDIT_MS});
}
function accountIdOf(identity){
 const id=identity?.sub;
 if(typeof id!=='string'||!id.length||id.length>200||/[\u0000-\u0020\u007f]/.test(id)||!['google','guest','crazygames'].includes(identity?.provider))throw failure('Geçerli oyuncu oturumu gerekli.',401);
 return id;
}
export function normalizePlayerAttribution(identity,request={}){
 // Google authentication is NOT a Google-search referral. A client cannot claim
 // verified CrazyGames placement. No location is collected; request headers/location fields are ignored.
 const verifiedCrazyGames=identity?.provider==='crazygames';
 return {source:verifiedCrazyGames?'crazygames':sources.has(request.source)?request.source:'direct_or_unknown',sourceProvenance:verifiedCrazyGames?'verified_platform':'client_reported',platform:platforms.has(request.platform)?request.platform:'unknown',device:devices.has(request.device)?request.device:'unknown'};
}
function normalizeRequest(request){
 if(!request||!['start','heartbeat','end'].includes(request.event)||typeof request.sessionId!=='string'||request.sessionId.length<16||request.sessionId.length>100||/[^a-zA-Z0-9_-]/.test(request.sessionId)||!Number.isSafeInteger(request.sequence)||request.sequence<0||request.sequence>MAX_SEQUENCE||typeof request.foreground!=='boolean'||request.event==='start'&&request.sequence!==0||request.event!=='start'&&request.sequence===0)throw failure('Geçersiz oyuncu oturumu olayı.',400);
 return {...request,foreground:request.event==='end'?false:request.foreground};
}
function milliseconds(value){const result=value instanceof Date?value.getTime():typeof value==='number'?value:Date.parse(value);if(!Number.isFinite(result))throw failure('Oyuncu oturumu saati doğrulanamadı.');return result;}
function stamp(value){return new Date(milliseconds(value)).toISOString();}
function activeMilliseconds(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>PLAYER_ANALYTICS_MAX_SESSION_MS)throw failure('Oyuncu oturumu süresi doğrulanamadı.');return n;}
function publicSession(row,{replayed=false,throttled=false}={}){
 return {sessionId:row.session_id,sequence:Number(row.sequence),foregroundActiveMs:activeMilliseconds(row.active_ms),closed:!!row.ended_at,replayed,throttled};
}
export async function preflightPlayerAnalytics(database){
 if(!database)return false;
 await database.query('SELECT account_id,last_seen_at,last_credit_at FROM hero_auction_player_activity LIMIT 0');
 await database.query('SELECT account_id,session_id,sequence,started_at,last_seen_at,ended_at,foreground,active_ms,source,source_provenance,platform,device FROM hero_auction_player_sessions LIMIT 0');
 return true;
}
// Pure interval calculation is independently regression-tested. Because every
// accepted interval ends at the serialized DB clock, a shared account checkpoint
// de-duplicates overlapping tabs without keeping an unbounded heartbeat log.
export function playerActivityDelta({previousSeen,now,previousForeground,lastCredit}){
 const before=milliseconds(previousSeen),current=milliseconds(now),gap=current-before;
 if(gap<0)throw failure('Sunucu saati geriye gitti.');
 if(!previousForeground||gap>PLAYER_ANALYTICS_STALE_MS)return 0;
 const credited=lastCredit===null||lastCredit===undefined?before:milliseconds(lastCredit);
 return Math.max(0,current-Math.max(before,current-PLAYER_ANALYTICS_MAX_CREDIT_MS,credited));
}
export async function recordPlayerSession({database,identity,policy,request}){
 if(!policy?.enabled)throw failure('Oyuncu oturum ölçümü etkin değil.');
 const accountId=accountIdOf(identity),event=normalizeRequest(request);
 if(!database)throw failure('Oyuncu oturum ölçümü geçici olarak kullanılamıyor.');
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  // Never creates a money wallet or account. Existing authenticated account only.
  await client.query('INSERT INTO hero_auction_player_activity(account_id) SELECT account_id FROM hero_auction_wallets WHERE account_id=$1 ON CONFLICT DO NOTHING',[accountId]);
  const account=(await client.query('SELECT last_seen_at,last_credit_at FROM hero_auction_player_activity WHERE account_id=$1 FOR UPDATE',[accountId])).rows[0];
  if(!account)throw failure('Oyuncu hesabı bulunamadı.',404);
  // Read after serialization; transaction-start NOW() could predate a lock wait.
  const now=milliseconds((await client.query('SELECT clock_timestamp() AS server_now')).rows[0]?.server_now);
  if(now<milliseconds(account.last_seen_at))throw failure('Sunucu saati geriye gitti.');
  const stored=(await client.query('SELECT session_id,sequence,started_at,last_seen_at,ended_at,foreground,active_ms,source,source_provenance,platform,device FROM hero_auction_player_sessions WHERE account_id=$1 AND session_id=$2',[accountId,event.sessionId])).rows[0];
  let row=stored,result;
  if(!row){
   if(event.event!=='start')throw failure('Oyuncu oturumu bulunamadı; yeni oturum başlatın.',409);
   const count=Number((await client.query("SELECT COUNT(*)::int AS count FROM hero_auction_player_sessions WHERE account_id=$1 AND started_at>=$2::timestamptz",[accountId,stamp(now-PLAYER_ANALYTICS_RETENTION_DAYS*DAY_MS)])).rows[0]?.count);
   if(!Number.isSafeInteger(count)||count<0)throw failure('Oyuncu oturumu sayısı doğrulanamadı.');
   if(count>=PLAYER_ANALYTICS_MAX_SESSIONS)throw failure('Oyuncu oturumu kayıt sınırına ulaşıldı.',429);
   const attribution=normalizePlayerAttribution(identity,event),at=stamp(now);
   row={session_id:event.sessionId,sequence:0,started_at:at,last_seen_at:at,ended_at:null,foreground:event.foreground,active_ms:0,source:attribution.source,source_provenance:attribution.sourceProvenance,platform:attribution.platform,device:attribution.device};
   await client.query('INSERT INTO hero_auction_player_sessions(account_id,session_id,sequence,started_at,last_seen_at,foreground,active_ms,source,source_provenance,platform,device) VALUES($1,$2,0,$3::timestamptz,$3::timestamptz,$4,0,$5,$6,$7,$8)',[accountId,event.sessionId,at,event.foreground,row.source,row.source_provenance,row.platform,row.device]);
   await client.query('UPDATE hero_auction_player_activity SET last_seen_at=$2::timestamptz WHERE account_id=$1',[accountId,at]);
   result=publicSession(row);
  }else if(event.sequence<=Number(row.sequence)||row.ended_at){
   // Retries and reordered messages never refresh last seen or revive a session.
   result=publicSession(row,{replayed:true});
  }else{
   if(event.sequence>Number(row.sequence)+32)throw failure('Oyuncu oturumu sıra numarası aralığı geçersiz.',409);
   const last=milliseconds(row.last_seen_at),started=milliseconds(row.started_at);
   if(now<last)throw failure('Sunucu saati geriye gitti.');
   const expired=now-started>=PLAYER_ANALYTICS_MAX_SESSION_MS;
   // At most one same-state heartbeat write/sec/session. Transitions/end are never dropped:
   // otherwise a hidden interval could accidentally be counted after a resume.
   if(!expired&&event.event==='heartbeat'&&event.foreground===row.foreground&&now-last<1000){result=publicSession(row,{throttled:true});}
   else{
    const delta=expired||event.reset===true?0:playerActivityDelta({previousSeen:last,now,previousForeground:row.foreground,lastCredit:account.last_credit_at});
    const activeMs=activeMilliseconds(row.active_ms)+delta;
    if(activeMs>PLAYER_ANALYTICS_MAX_SESSION_MS)throw failure('Oyuncu oturumu süresi sınırı aşıldı.');
    const at=stamp(now),ended=expired||event.event==='end'?at:null;
    row={...row,sequence:event.sequence,last_seen_at:at,ended_at:ended,foreground:ended?false:event.foreground,active_ms:activeMs};
    await client.query('UPDATE hero_auction_player_sessions SET sequence=$3,last_seen_at=$4::timestamptz,ended_at=$5::timestamptz,foreground=$6,active_ms=$7 WHERE account_id=$1 AND session_id=$2',[accountId,event.sessionId,row.sequence,at,ended,row.foreground,activeMs]);
    await client.query('UPDATE hero_auction_player_activity SET last_seen_at=$2::timestamptz,last_credit_at=CASE WHEN $3::boolean THEN $2::timestamptz ELSE last_credit_at END WHERE account_id=$1',[accountId,at,delta>0]);
    result=publicSession(row);
   }
  }
  await client.query('COMMIT');
  return result;
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  if(e.code==='42P01'||e.code==='42703')throw failure('Oyuncu oturum ölçümü altyapısı henüz hazır değil.');
  throw e;
 }finally{client.release();}
}
const emptySummary=()=>({observed:false,sessionCount:null,repeatVisits:null,activeMs:null,lastSeen:null,latest:null});
export async function readPlayerAnalytics({database,policy,accountIds=[]}){
 const ids=[...new Set(accountIds)];
 if(ids.length>200||ids.some(id=>typeof id!=='string'||!id.length||id.length>200))throw failure('Geçersiz oyuncu listesi.',400);
 const base={enabled:!!policy?.enabled,available:false,reason:!policy?.enabled?'disabled':!database?'storage_unavailable':null,retentionDays:PLAYER_ANALYTICS_RETENTION_DAYS,accounts:Object.fromEntries(ids.map(id=>[id,emptySummary()]))};
 if(!policy?.enabled||!database)return base;
 try{
  const rows=await database.query(`SELECT s.account_id,COUNT(*)::int AS session_count,SUM(s.active_ms)::bigint AS active_ms,MAX(s.last_seen_at) AS last_seen,
   (array_agg(s.source ORDER BY s.last_seen_at DESC,s.session_id))[1] AS source,
   (array_agg(s.source_provenance ORDER BY s.last_seen_at DESC,s.session_id))[1] AS source_provenance,
   (array_agg(s.platform ORDER BY s.last_seen_at DESC,s.session_id))[1] AS platform,
   (array_agg(s.device ORDER BY s.last_seen_at DESC,s.session_id))[1] AS device
   FROM hero_auction_player_sessions s WHERE s.account_id=ANY($1::text[]) AND s.started_at>=clock_timestamp()-interval '30 days' GROUP BY s.account_id`,[ids]);
  for(const row of rows.rows){
   if(!ids.includes(row.account_id))throw failure('Oyuncu ölçüm kapsamı doğrulanamadı.');
   const count=Number(row.session_count),activeMs=Number(row.active_ms);
   if(!Number.isSafeInteger(count)||count<1||count>PLAYER_ANALYTICS_MAX_SESSIONS||!Number.isSafeInteger(activeMs)||activeMs<0||activeMs>PLAYER_ANALYTICS_RETENTION_DAYS*DAY_MS+PLAYER_ANALYTICS_MAX_SESSION_MS)throw failure('Oyuncu ölçümü doğrulanamadı.');
   base.accounts[row.account_id]={observed:true,sessionCount:count,repeatVisits:Math.max(0,count-1),activeMs,lastSeen:stamp(row.last_seen),latest:{source:row.source,sourceProvenance:row.source_provenance,platform:row.platform,device:row.device}};
  }
  return {...base,available:true,reason:null};
 }catch(e){if(e.code==='42P01'||e.code==='42703')return{...base,reason:'storage_unavailable'};throw e;}
}
// Called hourly AND at startup, even while collection is disabled. Reads always
// enforce the window too, so delayed cleanup cannot expose expired records.
export async function cleanupPlayerAnalytics({database}={}){
 if(!database)return {sessionsDeleted:0,accountsDeleted:0};
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  // Same account -> session lock order as event recording. Skip an account whose
  // live event owns its lock; reads still hide expiry and the next hourly pass
  // retries deletion. Constrain both deletes to these same acquired locks.
  const expired=await client.query("SELECT a.account_id FROM hero_auction_player_activity a WHERE a.last_seen_at<clock_timestamp()-interval '30 days' OR EXISTS(SELECT 1 FROM hero_auction_player_sessions s WHERE s.account_id=a.account_id AND s.started_at<clock_timestamp()-interval '30 days') ORDER BY a.account_id FOR UPDATE OF a SKIP LOCKED");
  const ids=expired.rows.map(row=>row.account_id);
  const sessions=await client.query("DELETE FROM hero_auction_player_sessions WHERE account_id=ANY($1::text[]) AND started_at<clock_timestamp()-interval '30 days'",[ids]);
  const accounts=await client.query("DELETE FROM hero_auction_player_activity a WHERE a.account_id=ANY($1::text[]) AND a.last_seen_at<clock_timestamp()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM hero_auction_player_sessions s WHERE s.account_id=a.account_id)",[ids]);
  await client.query('COMMIT');return{sessionsDeleted:sessions.rowCount||0,accountsDeleted:accounts.rowCount||0};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='42P01'||e.code==='42703')return{sessionsDeleted:0,accountsDeleted:0,unavailable:true};throw e;}finally{client.release();}
}
