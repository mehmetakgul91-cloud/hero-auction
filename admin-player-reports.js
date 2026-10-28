const fail=message=>Object.assign(Error(message),{status:400});
export const REPORT_TIMEZONE='Europe/Istanbul';
export function reportOptions(request={},now=new Date()){
 const days=request.days??7,offset=request.offset??0,limit=request.limit??50;
 if(![1,7,30].includes(days)||!Number.isSafeInteger(offset)||offset<0||offset>100000||!Number.isSafeInteger(limit)||limit<1||limit>100)throw fail('Geçersiz rapor aralığı veya sayfa.');
 const search=request.search??'';
 if(typeof search!=='string'||search.length>100)throw fail('Arama en fazla 100 karakter olmalı.');
 const source=request.source??'',platform=request.platform??'',accountId=request.accountId??'';
 if(!['','direct_or_unknown','google_search','invite','crazygames','external'].includes(source)||!['','web','android','unknown'].includes(platform)||typeof accountId!=='string'||accountId.length>200)throw fail('Geçersiz rapor filtresi.');
 const until=request.until?new Date(request.until):now;
 if(!Number.isFinite(until.getTime())||until>now||now-until>3600000)throw fail('Rapor süresi doldu; yeniden yükleyin.');
 return {days,offset,limit,search:search.trim(),source,platform,accountId,until:until.toISOString()};
}
const where=`s.started_at >= ((date_trunc('day',$1::timestamptz AT TIME ZONE 'Europe/Istanbul') - ($2::int-1)*interval '1 day') AT TIME ZONE 'Europe/Istanbul')
 AND s.started_at >= clock_timestamp()-interval '30 days' AND s.started_at <= $1::timestamptz
 AND ($3='' OR strpos(lower(s.account_id),lower($3))>0 OR strpos(lower(COALESCE(p.display_name,'')),lower($3))>0)
 AND ($4='' OR s.source=$4) AND ($5='' OR s.platform=$5) AND ($6='' OR s.account_id=$6)`;
const from='FROM hero_auction_player_sessions s LEFT JOIN hero_auction_user_profiles p ON p.account_id=s.account_id';
const metrics=`COUNT(*)::int AS sessions,COUNT(DISTINCT s.account_id)::int AS unique_accounts,
 COUNT(*) FILTER(WHERE s.source='crazygames')::int AS crazygames_sessions,
 COUNT(*) FILTER(WHERE s.source='invite')::int AS reported_invite_sessions,
 COUNT(*) FILTER(WHERE s.source='google_search')::int AS google_search_sessions,
 COUNT(*) FILTER(WHERE s.source='external')::int AS external_sessions,
 COUNT(*) FILTER(WHERE s.source='direct_or_unknown')::int AS direct_sessions,
 COUNT(*) FILTER(WHERE s.platform='android')::int AS android_sessions,
 COUNT(*) FILTER(WHERE s.platform='web')::int AS web_sessions`;
function counts(r){
 const sessions=Number(r.sessions),uniqueAccounts=Number(r.unique_accounts);
 return {sessions,uniqueAccounts,additionalSessions:sessions-uniqueAccounts,crazygamesSessions:Number(r.crazygames_sessions),reportedInviteSessions:Number(r.reported_invite_sessions),googleSearchSessions:Number(r.google_search_sessions),externalSessions:Number(r.external_sessions),directSessions:Number(r.direct_sessions),androidSessions:Number(r.android_sessions),webSessions:Number(r.web_sessions)};
}
export async function readAdminSessionReport({database,policy,request={},locationsAvailable=false,now=new Date()}={}){
 const options=reportOptions(request,now),base={available:false,timezone:REPORT_TIMEZONE,options,days:[],entries:[],total:0,summary:null};
 if(!policy?.enabled||!database)return {...base,reason:!policy?.enabled?'disabled':'storage_unavailable'};
 const params=[options.until,options.days,options.search,options.source,options.platform,options.accountId];
 const client=await database.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const summaryRow=(await client.query(`SELECT ${metrics} ${from} WHERE ${where}`,params)).rows[0];
  const days=(await client.query(`SELECT to_char(s.started_at AT TIME ZONE 'Europe/Istanbul','YYYY-MM-DD') AS day,${metrics} ${from} WHERE ${where} GROUP BY 1 ORDER BY 1 DESC`,params)).rows;
  const count=request.export===true?10001:options.limit;
  const entries=(await client.query(`SELECT s.account_id,COALESCE(p.display_name,s.account_id) AS display_name,s.started_at,s.last_seen_at,s.source,s.source_provenance,s.platform,s.device,
   ${locationsAvailable?'g.country,g.city':'NULL::text AS country,NULL::text AS city'} ${from}
   ${locationsAvailable?'LEFT JOIN hero_auction_player_session_locations g ON g.account_id=s.account_id AND g.session_id=s.session_id':''}
   WHERE ${where} ORDER BY s.started_at DESC,s.account_id,s.session_id LIMIT $7 OFFSET $8`,[...params,count,request.export===true?0:options.offset])).rows;
  if(request.export===true&&entries.length>10000)throw fail('Rapor 10.000 kaydı aşıyor. Dönemi veya oyuncu/kaynak filtresini daraltın; eksik CSV üretilmedi.');
  await client.query('COMMIT');
  return {...base,available:true,locationsAvailable,summary:Number(summaryRow.sessions)?counts(summaryRow):null,total:Number(summaryRow.sessions),days:days.map(r=>({day:r.day,...counts(r)})),entries:entries.map(r=>({accountId:r.account_id,name:r.display_name,startedAt:new Date(r.started_at).toISOString(),lastSeen:new Date(r.last_seen_at).toISOString(),source:r.source,sourceProvenance:r.source_provenance,platform:r.platform,device:r.device,country:r.country||null,city:r.city||null}))};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});if(['42P01','42703'].includes(e.code))return {...base,reason:'storage_unavailable'};throw e;}finally{client.release();}
}
