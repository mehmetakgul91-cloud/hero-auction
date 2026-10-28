// Internal account-creation hook, never a browser claim or general mint API.
// Only call after provider verification, BEFORE the first account/profile upsert.
export const DIAMOND_SIGNUP_BONUS=10;
export function createDiamondSignupPolicy(env={}){
 return Object.freeze({enabled:env.HERO_DIAMONDS_ENABLED==='1'&&env.HERO_DIAMOND_SIGNUP_BONUS_ENABLED==='1'});
}
function failure(message,status=503){return Object.assign(Error(message),{status});}
function balance(value){
 const amount=typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)?Number(value):value;
 if(!Number.isSafeInteger(amount)||amount<0||amount>2147483647)throw failure('Geçersiz elmas bakiyesi.');
 return amount;
}
function validMember(accountId,provider){
 if(typeof accountId!=='string'||!accountId.length||accountId.length>200||/[\u0000-\u0020\u007f]/.test(accountId)||accountId.startsWith('guest:'))return false;
 return provider==='google'&&!accountId.startsWith('crazygames:');
}
const EXISTING_ACCOUNT_SQL=`SELECT EXISTS (
 SELECT 1 FROM hero_auction_wallets WHERE account_id=$1
 UNION ALL SELECT 1 FROM hero_auction_user_profiles WHERE account_id=$1
 UNION ALL SELECT 1 FROM hero_auction_commanders WHERE account_id=$1
 UNION ALL SELECT 1 FROM hero_auction_admin_accounts WHERE account_id=$1
) AS existing`;

export async function registerDiamondMember({database,accountId,provider,policy}){
 if(!policy.enabled)return{enabled:false,eligible:false,awarded:0,replayed:false,reason:'disabled'};
 // Provider is selected by the verified server auth route, not request data.
 if(!validMember(accountId,provider))throw failure('Kayıt hediyesi için doğrulanmış üye hesabı gerekli.',401);
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  // Serializes first logins across app processes without relying on a row that
  // does not yet exist. Hash collisions only serialize unrelated registrations.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[accountId]);
  const registration=await client.query('SELECT provider,eligible FROM hero_auction_diamond_registrations WHERE account_id=$1',[accountId]);
  const receipt=await client.query('SELECT amount FROM hero_auction_diamond_signup_receipts WHERE account_id=$1',[accountId]);
  // Preflight all new schema before any gold, diamond or profile mutation.
  const initialDiamond=await client.query('SELECT diamonds FROM hero_auction_diamond_wallets WHERE account_id=$1',[accountId]);
  let diamonds=initialDiamond.rows.length?balance(initialDiamond.rows[0].diamonds):0;
  let result;
  if(registration.rows.length){
   const record=registration.rows[0];
   if(record.provider!==provider)throw failure('Üye kayıt sağlayıcısı eşleşmiyor.');
   if(record.eligible){
    // An inconsistent/incomplete record is not permission to mint a new gift.
    if(receipt.rows.length!==1||Number(receipt.rows[0].amount)!==DIAMOND_SIGNUP_BONUS)throw failure('Kayıt hediyesi kaydı doğrulanamadı.');
    const gold=await client.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
    const current=await client.query('SELECT diamonds FROM hero_auction_diamond_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
    if(!gold.rows.length||!current.rows.length)throw failure('Üye cüzdanı doğrulanamadı.');
    diamonds=balance(current.rows[0].diamonds);
   }else if(receipt.rows.length)throw failure('Kayıt hediyesi kaydı doğrulanamadı.');
   result={enabled:true,eligible:record.eligible,awarded:0,replayed:true,diamonds,reason:record.eligible?null:'existing_account'};
  }else{
   if(receipt.rows.length)throw failure('Kayıt hediyesi kaydı doğrulanamadı.');
   const found=await client.query(EXISTING_ACCOUNT_SQL,[accountId]);
   let eligible=!found.rows[0].existing&&!initialDiamond.rows.length;
   if(eligible){
    // Claim the durable member marker as well: legacy auth/check upserts do not
    // take our advisory lock. A conflicting first-profile insert is ineligible.
    // The authenticated route replaces this harmless name after registration.
    const created=await client.query("INSERT INTO hero_auction_user_profiles(account_id,display_name) VALUES($1,'Oyuncu') ON CONFLICT DO NOTHING RETURNING account_id",[accountId]);
    eligible=created.rows.length===1;
   }
   if(eligible){
    // ON CONFLICT also excludes an account concurrently initialized by another
    // non-registration path. Never overwrite an existing wallet or its gold.
    const created=await client.query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,500) ON CONFLICT DO NOTHING RETURNING gold',[accountId]);
    eligible=created.rows.length===1;
   }
   await client.query('INSERT INTO hero_auction_diamond_registrations(account_id,provider,eligible) VALUES($1,$2,$3)',[accountId,provider,eligible]);
   if(eligible){
    const created=await client.query('INSERT INTO hero_auction_diamond_wallets(account_id,diamonds) VALUES($1,0) ON CONFLICT DO NOTHING RETURNING diamonds',[accountId]);
    if(created.rows.length!==1)throw failure('Yeni üye cüzdanı doğrulanamadı.');
    // Fixed approved exception only: there is no caller-supplied grant amount.
    const credited=await client.query('UPDATE hero_auction_diamond_wallets SET diamonds=diamonds+10 WHERE account_id=$1 AND diamonds=0 RETURNING diamonds',[accountId]);
    if(credited.rows.length!==1||Number(credited.rows[0].diamonds)!==DIAMOND_SIGNUP_BONUS)throw failure('Kayıt hediyesi uygulanamadı.');
    await client.query("INSERT INTO hero_auction_diamond_signup_receipts(account_id,kind,amount,balance_before,balance_after) VALUES($1,'signup_bonus',10,0,10)",[accountId]);
    diamonds=DIAMOND_SIGNUP_BONUS;
   }
   result={enabled:true,eligible,awarded:eligible?DIAMOND_SIGNUP_BONUS:0,replayed:false,diamonds,reason:eligible?null:'existing_account'};
  }
  await client.query('COMMIT');
  return result;
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  if(e.code==='42P01')throw failure('Kayıt hediyesi altyapısı henüz etkin değil.');
  // A lost commit is safe to retry by the same verified provider account: its
  // durable one-time receipt, not a client request ID, decides eligibility.
  throw e;
 }finally{client.release();}
}
