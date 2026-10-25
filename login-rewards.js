// Server-owned recurring Google member rewards. This module never verifies a
// browser provider claim: identity must come from the server's signed session.
const MAX_CURRENCY=2147483647;
export const LOGIN_REWARD_TIMEZONE='Europe/Istanbul';
export const LOGIN_REWARDS=Object.freeze([100,150,200,250,300,400,0].map((gold,index)=>Object.freeze({day:index+1,gold,diamonds:index===6?5:0})));
export function createLoginRewardPolicy(env={}){
 return Object.freeze({enabled:env.HERO_DIAMONDS_ENABLED==='1'&&env.HERO_LOGIN_REWARDS_ENABLED==='1'});
}
function failure(message,status=503){return Object.assign(Error(message),{status});}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function dayNumber(value){if(!validDate(value))throw failure('Ödül günü doğrulanamadı.');return Date.parse(value+'T00:00:00Z')/86400000;}
function currency(value){const number=typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)?Number(value):value;if(!Number.isSafeInteger(number)||number<0||number>MAX_CURRENCY)throw failure('Ödül bakiyesi doğrulanamadı.');return number;}
export function isGoogleRewardMember(identity){
 const sub=identity?.sub;
 if(typeof sub!=='string'||!sub.length||sub.length>200||/[\u0000-\u0020\u007f]/.test(sub)||sub.includes(':'))return false;
 return identity.provider==='google';
}
function publicReceipt(row){
 if(!row)return null;
 const day=Number(row.day_index),reward=LOGIN_REWARDS[day-1];
 if(!reward||!validDate(row.reward_date)||currency(row.gold_amount)!==reward.gold||currency(row.diamond_amount)!==reward.diamonds)throw failure('Ödül makbuzu doğrulanamadı.');
 return{day,gold:reward.gold,diamonds:reward.diamonds,rewardDate:row.reward_date};
}
function validateState(state,receipt){
 if(!state){if(receipt)throw failure('Ödül serisi doğrulanamadı.');return;}
 if(state.provider!=='google'||!validDate(state.last_reward_date)||!Number.isInteger(state.day_index)||state.day_index<1||state.day_index>7||!receipt||receipt.rewardDate!==state.last_reward_date||receipt.day!==state.day_index)throw failure('Ödül serisi doğrulanamadı.');
}
export function loginRewardView({policy,identity,serverDay=null,state=null,receipt=null,ready=true}){
 const eligible=isGoogleRewardMember(identity),enabled=policy.enabled;
 const base={enabled,available:false,eligible,reason:!enabled?'disabled':!eligible?'google_required':!ready?'storage_unavailable':null,timezone:LOGIN_REWARD_TIMEZONE,serverDay:null,claimedToday:false,nextDay:1,completedDay:0,rewards:LOGIN_REWARDS,receipt:null};
 if(base.reason)return base;
 dayNumber(serverDay);validateState(state,receipt);
 const gap=state?dayNumber(serverDay)-dayNumber(state.last_reward_date):null;
 if(gap!==null&&gap<0)return{...base,reason:'clock_regression',serverDay};
 const claimedToday=gap===0;
 const nextDay=state&&(gap===0||gap===1)?state.day_index%7+1:1;
 return{...base,available:!claimedToday,reason:claimedToday?'already_claimed':null,serverDay,claimedToday,nextDay,completedDay:state&&(gap===0||gap===1)?state.day_index:0,receipt:claimedToday?receipt:null};
}
const STATUS_SQL=`SELECT (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text AS server_day,
 s.provider,s.last_reward_date::text,s.day_index,
 r.reward_date::text,r.day_index AS receipt_day,r.gold_amount,r.diamond_amount
 FROM (SELECT $1::text AS account_id) a
 LEFT JOIN hero_auction_login_reward_streaks s ON s.account_id=a.account_id
 LEFT JOIN LATERAL (SELECT reward_date,day_index,gold_amount,diamond_amount
 FROM hero_auction_login_reward_receipts WHERE account_id=a.account_id
 ORDER BY reward_date DESC LIMIT 1) r ON true`;
export async function readLoginRewardStatus({database,identity,policy}){
 if(!policy.enabled||!isGoogleRewardMember(identity)||!database)return loginRewardView({policy,identity,ready:!!database});
 try{
  const {rows}=await database.query(STATUS_SQL,[identity.sub]),row=rows[0];
  if(!row)throw failure('Ödül durumu doğrulanamadı.');
  const state=row.last_reward_date?{provider:row.provider,last_reward_date:row.last_reward_date,day_index:row.day_index}:null;
  const receipt=row.reward_date?publicReceipt({...row,day_index:row.receipt_day}):null;
  return loginRewardView({policy,identity,serverDay:row.server_day,state,receipt});
 }catch(e){if(e.code==='42P01')return loginRewardView({policy,identity,ready:false});throw e;}
}
const RECEIPT_SQL='SELECT reward_date::text,day_index,gold_amount,diamond_amount FROM hero_auction_login_reward_receipts WHERE account_id=$1 AND reward_date=$2::date';

// The account/date is the idempotency key, not a browser-generated grant token.
// Never accepts requested amounts, streak day, balance or client current time.
// Locks: member profile -> gold wallet -> diamond wallet. No commander lock is
// acquired, so upgrade (commander -> gold -> diamond) cannot form a lock cycle.
export async function claimLoginReward({database,identity,policy,request}){
 if(!policy.enabled)throw failure('Giriş ödülleri henüz etkin değil.');
 if(!isGoogleRewardMember(identity))throw failure('Giriş ödülleri için doğrulanmış Google üyeliği gerekli.',403);
 if(!database)throw failure('Giriş ödülleri geçici olarak kullanılamıyor.');
 const rewardDate=request?.rewardDate;
 if(!validDate(rewardDate))throw failure('Sunucudaki ödül gününü yenileyip tekrar dene.',400);
 const accountId=identity.sub,client=await database.connect();
 try{
  await client.query('BEGIN');
  const member=await client.query('SELECT account_id FROM hero_auction_user_profiles WHERE account_id=$1 FOR UPDATE',[accountId]);
  if(member.rows.length!==1)throw failure('Üye profili doğrulanamadı.');
  // Sample the DB wall clock AFTER waiting for the account lock. NOW() would be
  // the transaction start and could still be yesterday across a midnight wait.
  const clock=await client.query("SELECT (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text AS server_day");
  const serverDay=clock.rows[0]?.server_day;dayNumber(serverDay);
  const stored=await client.query('SELECT provider,last_reward_date::text,day_index FROM hero_auction_login_reward_streaks WHERE account_id=$1',[accountId]);
  const state=stored.rows[0]||null;
  const prior=publicReceipt((await client.query(RECEIPT_SQL,[accountId,rewardDate])).rows[0]);
  const latest=publicReceipt((await client.query('SELECT reward_date::text,day_index,gold_amount,diamond_amount FROM hero_auction_login_reward_receipts WHERE account_id=$1 ORDER BY reward_date DESC LIMIT 1',[accountId])).rows[0]);
  validateState(state,latest);
  if(!state&&prior)throw failure('Ödül serisi doğrulanamadı.');
  if(state&&dayNumber(serverDay)<dayNumber(state.last_reward_date))throw failure('Sunucu günü doğrulanamadı. Daha sonra tekrar dene.');
  if(!prior&&rewardDate!==serverDay)throw failure('Ödül günü değişti. Mağazayı yenileyip tekrar dene.',409);
  if(prior&&(!state||dayNumber(prior.rewardDate)>dayNumber(state.last_reward_date)))throw failure('Ödül makbuzu doğrulanamadı.');
  const goldRow=await client.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
  if(goldRow.rows.length!==1)throw failure('Altın cüzdanı doğrulanamadı.');
  let gold=currency(goldRow.rows[0].gold);
  const diamondRow=await client.query('SELECT diamonds FROM hero_auction_diamond_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
  let diamonds=diamondRow.rows.length?currency(diamondRow.rows[0].diamonds):0;
  let receipt=prior,nextState=state;
  if(!prior){
   const gap=state?dayNumber(serverDay)-dayNumber(state.last_reward_date):null;
   if(gap===0)throw failure('Bugünün ödül kaydı doğrulanamadı.');
   const day=gap===1?state.day_index%7+1:1,reward=LOGIN_REWARDS[day-1];
   if(gold>MAX_CURRENCY-reward.gold||diamonds>MAX_CURRENCY-reward.diamonds)throw failure('Ödül cüzdan sınırını aşıyor.',409);
   if(reward.gold){
    const credited=await client.query('UPDATE hero_auction_wallets SET gold=gold+$2 WHERE account_id=$1 AND gold<=$3 RETURNING gold',[accountId,reward.gold,MAX_CURRENCY-reward.gold]);
    if(credited.rows.length!==1||currency(credited.rows[0].gold)!==gold+reward.gold)throw failure('Altın ödülü uygulanamadı.');
   }
   if(reward.diamonds){
    if(!diamondRow.rows.length)await client.query('INSERT INTO hero_auction_diamond_wallets(account_id,diamonds) VALUES($1,0) ON CONFLICT DO NOTHING',[accountId]);
    const credited=await client.query('UPDATE hero_auction_diamond_wallets SET diamonds=diamonds+$2 WHERE account_id=$1 AND diamonds<=$3 RETURNING diamonds',[accountId,reward.diamonds,MAX_CURRENCY-reward.diamonds]);
    if(credited.rows.length!==1||currency(credited.rows[0].diamonds)!==diamonds+reward.diamonds)throw failure('Elmas ödülü uygulanamadı.');
   }
   await client.query('INSERT INTO hero_auction_login_reward_receipts(account_id,reward_date,day_index,gold_amount,diamond_amount,gold_before,gold_after,diamonds_before,diamonds_after) VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,$9)',[accountId,serverDay,day,reward.gold,reward.diamonds,gold,gold+reward.gold,diamonds,diamonds+reward.diamonds]);
   await client.query("INSERT INTO hero_auction_login_reward_streaks(account_id,provider,last_reward_date,day_index) VALUES($1,'google',$2::date,$3) ON CONFLICT(account_id) DO UPDATE SET last_reward_date=EXCLUDED.last_reward_date,day_index=EXCLUDED.day_index,updated_at=clock_timestamp()",[accountId,serverDay,day]);
   gold+=reward.gold;diamonds+=reward.diamonds;
   receipt={day,gold:reward.gold,diamonds:reward.diamonds,rewardDate:serverDay};
   nextState={provider:'google',last_reward_date:serverDay,day_index:day};
  }
  const result={gold,diamonds,receipt,replayed:!!prior,loginRewards:loginRewardView({policy,identity,serverDay,state:nextState,receipt:prior?latest:receipt})};
  await client.query('COMMIT');
  return result;
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  if(e.code==='42P01')throw failure('Giriş ödülü altyapısı henüz etkin değil.');
  // Commit outcome may be unknown. Recover only this same account/date receipt;
  // never automatically retry a different day after midnight.
  throw e;
 }finally{client.release();}
}
