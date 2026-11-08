// Account-linked, first-party campaign funnel. Browser attribution/intro claims
// are untrusted. Match counts come only from existing durable economy records.
export const CAMPAIGN_RETENTION_DAYS=30;
const slug=/^[a-z0-9][a-z0-9_-]{0,47}$/;
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const introColumns=Object.freeze({intro_viewed:'intro_viewed_at',intro_completed:'intro_completed_at',intro_skipped:'intro_skipped_at'});
export function createCampaignPolicy(env={}){
 let campaigns=[];
 try{
  const input=JSON.parse(env.HERO_CAMPAIGNS||'[]');
  if(!Array.isArray(input)||input.length>20)throw Error();
  const ids=new Set(),tuples=new Set();
  for(const c of input){
   if(!c||Object.keys(c).sort().join(',')!=='campaign,id,medium,source'||!['id','source','medium','campaign'].every(k=>typeof c[k]==='string'&&slug.test(c[k])))throw Error();
   const tuple=[c.source,c.medium,c.campaign].join(':');if(ids.has(c.id)||tuples.has(tuple))throw Error();ids.add(c.id);tuples.add(tuple);campaigns.push(Object.freeze({...c}));
  }
 }catch{campaigns=[];}
 return Object.freeze({enabled:env.HERO_PLAYER_ANALYTICS_ENABLED==='1'&&env.HERO_CAMPAIGN_MEASUREMENT_ENABLED==='1'&&campaigns.length>0,retentionDays:CAMPAIGN_RETENTION_DAYS,campaigns:Object.freeze(campaigns)});
}
function identityAccount(identity){
 if(!identity||!['guest','google'].includes(identity.provider)||typeof identity.sub!=='string'||identity.sub.length<1||identity.sub.length>200||/[\u0000-\u0020\u007f]/.test(identity.sub))throw fail('Geçerli web oyuncu oturumu gerekli.',401);
 return identity.sub;
}
function available(database,policy){if(!policy?.enabled||!database)throw fail('Kampanya ölçümü etkin değil.',503);}
function exact(request,key){if(!request||Object.keys(request).length!==1||!Object.hasOwn(request,key))throw fail('Geçersiz kampanya olayı.');}
export async function preflightCampaignMeasurement(database){
 if(!database)return false;
 await database.query('SELECT account_id,campaign_id,attributed_at,intro_viewed_at,intro_completed_at,intro_skipped_at FROM hero_auction_campaign_funnel LIMIT 0');
 // The report relies on durable bot admission/settlement, never client claims.
 await database.query('SELECT match_id,account_id,difficulty,config_version,entry_gold,created_at FROM hero_auction_bot_entries LIMIT 0');
 await database.query('SELECT match_id,account_id,outcome,room_state,created_at FROM hero_auction_bot_settlements LIMIT 0');
 await database.query('SELECT w.account_id,c.account_id,c.profile,g.account_id,v.account_id,r.state,s.state FROM hero_auction_wallets w CROSS JOIN hero_auction_commanders c CROSS JOIN hero_auction_gold_awards g CROSS JOIN hero_auction_victory_chest_receipts v CROSS JOIN hero_auction_rooms r CROSS JOIN hero_auction_social s LIMIT 0');
 return true;
}
export const CAMPAIGN_ATTRIBUTE_SQL=`INSERT INTO hero_auction_campaign_funnel(account_id,campaign_id)
 SELECT w.account_id,$2 FROM hero_auction_wallets w WHERE w.account_id=$1
 AND NOT EXISTS(SELECT 1 FROM hero_auction_commanders c WHERE c.account_id=w.account_id)
 AND NOT EXISTS(SELECT 1 FROM hero_auction_bot_entries b WHERE b.account_id=w.account_id)
 AND NOT EXISTS(SELECT 1 FROM hero_auction_gold_awards g WHERE g.account_id=w.account_id)
 AND NOT EXISTS(SELECT 1 FROM hero_auction_victory_chest_receipts v WHERE v.account_id=w.account_id)
 AND NOT EXISTS(SELECT 1 FROM hero_auction_rooms r, jsonb_array_elements(COALESCE(r.state->'players','[]'::jsonb)) p WHERE p->>'accountId'=w.account_id)
 AND NOT EXISTS(SELECT 1 FROM hero_auction_social s, jsonb_array_elements(COALESCE(s.state->'ratings','[]'::jsonb)) rating WHERE s.id='global' AND rating->>0=w.account_id)
 AND NOT EXISTS(SELECT 1 FROM hero_auction_social s, jsonb_array_elements(COALESCE(s.state->'matches','[]'::jsonb)) match, jsonb_array_elements(COALESCE(match->1->'participants','[]'::jsonb)) participant WHERE s.id='global' AND participant->>'id'=w.account_id)
 ON CONFLICT(account_id) DO NOTHING RETURNING campaign_id`;
export async function attributeCampaign({database,policy,identity,request}){
 available(database,policy);const accountId=identityAccount(identity);exact(request,'campaignId');
 if(typeof request.campaignId!=='string'||!policy.campaigns.some(c=>c.id===request.campaignId))throw fail('Bilinmeyen kampanya.');
 const result=await database.query({text:CAMPAIGN_ATTRIBUTE_SQL,values:[accountId,request.campaignId],query_timeout:1500});
 if(result.rows.length)return {accepted:true};
 // Retry does not change first-touch campaign or extend retention. Existing
 // accounts are rejected without creating a tracking or wallet record.
 const prior=await database.query({text:"SELECT campaign_id FROM hero_auction_campaign_funnel WHERE account_id=$1 AND campaign_id=$2 AND attributed_at>clock_timestamp()-interval '30 days'",values:[accountId,request.campaignId],query_timeout:1500});
 return {accepted:prior.rows.length===1};
}
export async function recordCampaignIntro({database,policy,identity,request}){
 available(database,policy);const accountId=identityAccount(identity);exact(request,'event');
 const column=Object.hasOwn(introColumns,request.event)?introColumns[request.event]:null;if(!column)throw fail('Geçersiz öğretici olayı.');
 // Only an allowlisted column can enter SQL. First occurrence wins, at most
 // three updates per eligible attributed account; no event log or raw payload.
 await database.query({text:`UPDATE hero_auction_campaign_funnel SET ${column}=clock_timestamp() WHERE account_id=$1 AND ${column} IS NULL AND attributed_at>clock_timestamp()-interval '30 days' AND campaign_id=ANY($2::text[])`,values:[accountId,policy.campaigns.map(c=>c.id)],query_timeout:1500});
 return {ok:true};
}
export const CAMPAIGN_FUNNEL_SQL=`WITH cohort AS (
 SELECT * FROM hero_auction_campaign_funnel WHERE attributed_at>=clock_timestamp()-($1::int*interval '1 day') AND campaign_id=ANY($2::text[])
), first_bot AS (
 SELECT c.*, e.match_id,e.difficulty,e.entry_gold,e.config_version,e.created_at AS entered_at,
 s.outcome,s.room_state,s.created_at AS settled_at
 FROM cohort c LEFT JOIN LATERAL (
  SELECT * FROM hero_auction_bot_entries b WHERE b.account_id=c.account_id ORDER BY b.created_at,b.match_id LIMIT 1
 ) e ON e.created_at>=c.attributed_at AND NOT EXISTS (SELECT 1 FROM hero_auction_bot_entries ambiguous WHERE ambiguous.account_id=c.account_id AND ambiguous.created_at=e.created_at AND ambiguous.match_id<>e.match_id) AND e.difficulty='easy' AND e.entry_gold=0 AND e.config_version='bot-free-v2'
 LEFT JOIN hero_auction_bot_settlements s ON s.match_id=e.match_id AND s.account_id=c.account_id
), classified AS (
 SELECT *, CASE WHEN match_id IS NULL THEN 'not_started'
 WHEN outcome IS NULL THEN 'pending'
 WHEN outcome='server_failure' THEN 'server_failure'
 WHEN outcome='idle_cancelled' THEN 'idle_cancelled'
 WHEN room_state->'disconnectForfeit' IS NOT NULL AND room_state->'disconnectForfeit'<>'null'::jsonb OR room_state->>'botForfeit'='true' THEN 'forfeit'
 WHEN outcome IN ('win','loss','tie') AND room_state#>>'{battleSync,result,finished}'='true' THEN 'completed'
 ELSE 'other_terminal' END AS stage FROM first_bot
)
SELECT campaign_id,COUNT(*)::int AS authenticated,
 COUNT(intro_viewed_at)::int AS intro_viewed,COUNT(intro_completed_at)::int AS intro_completed,COUNT(intro_skipped_at)::int AS intro_skipped,
 COUNT(match_id)::int AS first_bot_started,
 COUNT(*) FILTER(WHERE stage='completed')::int AS first_bot_completed,
 COUNT(*) FILTER(WHERE stage='forfeit')::int AS forfeited,
 COUNT(*) FILTER(WHERE stage='server_failure')::int AS server_failures,
 COUNT(*) FILTER(WHERE stage='idle_cancelled')::int AS idle_cancelled,
 COUNT(*) FILTER(WHERE stage='pending')::int AS pending,
 COUNT(*) FILTER(WHERE stage='other_terminal')::int AS other_terminal
 FROM classified GROUP BY campaign_id ORDER BY campaign_id`;
const counts=['authenticated','intro_viewed','intro_completed','intro_skipped','first_bot_started','first_bot_completed','forfeited','server_failures','idle_cancelled','pending','other_terminal'];
export async function readCampaignFunnel({database,policy,days=7}){
 available(database,policy);if(!Number.isInteger(days)||days<1||days>30)throw fail('Rapor aralığı 1–30 gün olmalı.');
 const result=await database.query({text:CAMPAIGN_FUNNEL_SQL,values:[days,policy.campaigns.map(c=>c.id)],query_timeout:5000});
 const campaigns=result.rows.map(row=>{if(!policy.campaigns.some(c=>c.id===row.campaign_id))throw fail('Kampanya raporu doğrulanamadı.',503);const out={campaignId:row.campaign_id};for(const key of counts){const n=Number(row[key]);if(!Number.isSafeInteger(n)||n<0)throw fail('Kampanya sayısı doğrulanamadı.',503);out[key]=n;}return out;});
 return {days,retentionDays:30,attributionProvenance:'client_reported',introProvenance:'client_reported',matchProvenance:'durable_server_records',campaigns};
}
export async function cleanupCampaignMeasurement({database}){
 if(!database)return {deleted:0};
 const result=await database.query("DELETE FROM hero_auction_campaign_funnel WHERE account_id IN (SELECT account_id FROM hero_auction_campaign_funnel WHERE attributed_at<clock_timestamp()-interval '30 days' ORDER BY attributed_at LIMIT 1000)");
 return {deleted:result.rowCount};
}
export async function deleteCampaignMeasurement({database,accountIds}){
 if(!Array.isArray(accountIds)||accountIds.length>100||accountIds.some(id=>typeof id!=='string'||!id.length||id.length>200))throw fail('Geçersiz hesap silme listesi.');
 if(!database)throw fail('Kampanya kaydı kullanılamıyor.',503);
 const result=await database.query('DELETE FROM hero_auction_campaign_funnel WHERE account_id=ANY($1::text[])',[accountIds]);return {deleted:result.rowCount};
}
