// Server-only owner grants. No payment, exchange, signup or automatic reward is
// enabled here. The caller passes ONLY a verified signed-session identity.
const MAX_BALANCE=2147483647;
export const MAX_ADMIN_CREDIT=1000000;
const currencies=Object.freeze({
 gold:{table:'hero_auction_wallets',column:'gold'},
 diamonds:{table:'hero_auction_diamond_wallets',column:'diamonds'},
 magicDust:{table:'hero_auction_magic_dust_wallets',column:'magic_dust'}
});
const fail=(message,status=409,extra={})=>Object.assign(Error(message),{status,...extra});
const validRequestId=value=>typeof value==='string'&&value.length>=16&&value.length<=100&&!/[^a-zA-Z0-9_-]/.test(value);
export function isOwnerAdmin(user,ownerEmail){
 const owner=typeof ownerEmail==='string'?ownerEmail.trim().toLowerCase():'';
 return Boolean(owner&&user&&user.provider==='google'&&typeof user.sub==='string'&&user.sub.length>0&&user.sub.length<=200&&!/[\u0000-\u0020\u007f:]/.test(user.sub)&&typeof user.email==='string'&&user.email===owner);
}
function requireOwner(user,ownerEmail){if(!isOwnerAdmin(user,ownerEmail))throw fail('Yönetici yetkisi gerekli.',403);}
export function createAdminWalletCreditPolicy(env={}){
 const enabled=env.HERO_ADMIN_WALLET_CREDITS_ENABLED==='1';
 return Object.freeze({enabled,currencies:Object.freeze({gold:enabled,diamonds:enabled&&env.HERO_DIAMONDS_ENABLED==='1',magicDust:enabled&&env.HERO_DIAMONDS_ENABLED==='1'&&env.HERO_MAGIC_DUST_ENABLED==='1'}),balances:Object.freeze({diamonds:env.HERO_DIAMONDS_ENABLED==='1',magicDust:env.HERO_DIAMONDS_ENABLED==='1'&&env.HERO_MAGIC_DUST_ENABLED==='1'})});
}
export function adminWalletCreditView(policy=createAdminWalletCreditPolicy()){
 return {enabled:policy.enabled,maxAmount:MAX_ADMIN_CREDIT,currencies:Object.fromEntries(Object.keys(currencies).map(name=>[name,{available:policy.currencies[name]===true,reason:policy.currencies[name]===true?null:'disabled'}]))};
}
export function validateAdminWalletCreditRequest(request){
 const {requestId,accountId,currency,amount,reason}=request||{};
 if(!validRequestId(requestId)||typeof accountId!=='string'||!accountId.length||accountId.length>200||accountId.trim()!==accountId||/[\u0000-\u001f\u007f]/.test(accountId)||typeof currency!=='string'||!Object.hasOwn(currencies,currency)||!Number.isSafeInteger(amount)||amount<=0||amount>MAX_ADMIN_CREDIT||typeof reason!=='string')throw fail('Geçersiz bakiye ekleme isteği.',400);
 const normalizedReason=reason.trim();
 if(normalizedReason.length<3||normalizedReason.length>300||/[\u0000-\u001f\u007f]/.test(normalizedReason))throw fail('İşlem gerekçesi 3–300 karakter olmalıdır.',400);
 return {requestId,accountId,currency,amount,reason:normalizedReason};
}
function balance(value){
 const number=typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)?Number(value):value;
 if(!Number.isSafeInteger(number)||number<0||number>MAX_BALANCE)throw fail('Geçersiz para bakiyesi.',503);
 return number;
}
function publicReceipt(row){
 return {requestId:row.request_id,accountId:row.account_id,actorId:row.actor_id,currency:row.currency,amount:Number(row.amount),reason:row.reason,balanceBefore:Number(row.balance_before),balanceAfter:Number(row.balance_after),createdAt:row.created_at};
}
const receiptColumns='request_id,account_id,actor_id,currency,amount,reason,balance_before,balance_after,created_at';
function storageError(error){
 if(error.code==='42P01'||error.code==='42703')return fail('Yönetici bakiye altyapısı henüz etkin değil.',503);
 return error;
}

// The durable receipt is also the positive currency movement/audit record.
// Never prune/reuse receipt IDs: removing them would invalidate idempotency.
// Lock order is receipt namespace -> gold -> selected optional currency; all
// economy services lock gold before diamonds/dust. No commander row is touched.
export async function creditAdminWallet({database,user,ownerEmail,request,policy=createAdminWalletCreditPolicy()}){
 requireOwner(user,ownerEmail);
 const data=validateAdminWalletCreditRequest(request);
 if(!policy.enabled||policy.currencies[data.currency]!==true)throw fail('Bu yönetici bakiye işlemi etkin değil.',503);
 if(!database)throw fail('Veritabanı kullanılamıyor.',503);
 const client=await database.connect();
 let commitIssued=false;
 try{
  await client.query('BEGIN');
  // Two-key advisory namespace does not overlap the legacy one-bigint locks.
  // Hash collisions merely serialize unrelated grants, never identify receipts.
  await client.query('SELECT pg_advisory_xact_lock(1212236120,hashtext($1))',[data.requestId]);
  const existing=await client.query('SELECT '+receiptColumns+' FROM hero_auction_admin_wallet_credits WHERE request_id=$1',[data.requestId]);
  const prior=existing.rows[0];
  if(prior){
   if(prior.account_id!==data.accountId||prior.actor_id!==user.sub||prior.currency!==data.currency||Number(prior.amount)!==data.amount||prior.reason!==data.reason)throw fail('İşlem kimliği başka bir bakiye işlemi için kullanılmış.');
   await client.query('COMMIT');
   return {ok:true,replayed:true,receipt:publicReceipt(prior)};
  }
  const gold=await client.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1 FOR UPDATE',[data.accountId]);
  if(!gold.rows.length)throw fail('Hesap bulunamadı.',404);
  balance(gold.rows[0].gold);
  const {table,column}=currencies[data.currency];
  let before;
  if(data.currency==='gold')before=balance(gold.rows[0].gold);
  else{
   await client.query(`INSERT INTO ${table}(account_id,${column}) VALUES($1,0) ON CONFLICT DO NOTHING`,[data.accountId]);
   const selected=await client.query(`SELECT ${column} FROM ${table} WHERE account_id=$1 FOR UPDATE`,[data.accountId]);
   if(!selected.rows.length)throw fail('Para cüzdanı bulunamadı.',503);
   before=balance(selected.rows[0][column]);
  }
  if(before>MAX_BALANCE-data.amount)throw fail('Bakiye üst sınırı aşılıyor.');
  const updated=await client.query(`UPDATE ${table} SET ${column}=${column}+$2 WHERE account_id=$1 AND ${column}<=$3 RETURNING ${column}`,[data.accountId,data.amount,MAX_BALANCE-data.amount]);
  if(!updated.rows.length)throw fail('Bakiye üst sınırı aşılıyor.');
  const after=balance(updated.rows[0][column]);
  if(after!==before+data.amount)throw fail('Bakiye kaydı doğrulanamadı.',503);
  const saved=await client.query('INSERT INTO hero_auction_admin_wallet_credits(request_id,account_id,actor_id,currency,amount,reason,balance_before,balance_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING '+receiptColumns,[data.requestId,data.accountId,user.sub,data.currency,data.amount,data.reason,before,after]);
  if(saved.rows.length!==1)throw fail('İşlem kaydı doğrulanamadı.',503);
  commitIssued=true;
  await client.query('COMMIT');
  return {ok:true,replayed:false,receipt:publicReceipt(saved.rows[0])};
 }catch(error){
  await client.query('ROLLBACK').catch(()=>{});
  if(commitIssued)throw fail('İşlem sonucu doğrulanamadı. Yeni işlem oluşturmayın; aynı işlem kimliğiyle sonucu doğrulayın.',503,{uncertain:true,requestId:data.requestId});
  throw storageError(error);
 }finally{client.release();}
}

// Owner-only read paths stay usable when a feature flag is switched off. This
// makes an uncertain COMMIT reconcilable without re-enabling or re-crediting.
export async function readAdminWalletCreditReceipt({database,user,ownerEmail,requestId}){
 requireOwner(user,ownerEmail);
 if(!validRequestId(requestId))throw fail('Geçersiz işlem kimliği.',400);
 if(!database)throw fail('Veritabanı kullanılamıyor.',503);
 try{
  const result=await database.query('SELECT '+receiptColumns+' FROM hero_auction_admin_wallet_credits WHERE request_id=$1',[requestId]);
  return {receipt:result.rows[0]?publicReceipt(result.rows[0]):null};
 }catch(error){throw storageError(error);}
}
export async function readAdminWalletCredits({database,user,ownerEmail,limit=100}){
 requireOwner(user,ownerEmail);
 if(!Number.isInteger(limit)||limit<1||limit>100)throw fail('Geçersiz kayıt sınırı.',400);
 if(!database)throw fail('Veritabanı kullanılamıyor.',503);
 try{
  const result=await database.query('SELECT '+receiptColumns+' FROM hero_auction_admin_wallet_credits ORDER BY created_at DESC,request_id DESC LIMIT $1',[limit]);
  return {credits:result.rows.map(publicReceipt)};
 }catch(error){throw storageError(error);}
}

// Readiness is a preflight only; it never creates schema or changes flags.
export async function adminWalletCreditStorageReady(database){
 if(!database)return false;
 try{await database.query('SELECT '+receiptColumns+' FROM hero_auction_admin_wallet_credits LIMIT 0');return true;}catch{return false;}
}
// HTTP caller must owner-authorize this internal batch helper. Existing game
// currency flags, not the separate grant switch, govern balance visibility.
export async function readAdminWalletBalances(database,accountIds,policy=createAdminWalletCreditPolicy()){
 if(!Array.isArray(accountIds)||accountIds.length>200||accountIds.some(id=>typeof id!=='string'||!id.length||id.length>200))throw fail('Geçersiz hesap listesi.',400);
 const ids=[...new Set(accountIds)],byAccount=Object.fromEntries(ids.map(id=>[id,{diamonds:null,magicDust:null}])),availability={};
 for(const name of ['diamonds','magicDust']){
  availability[name]={available:false,reason:'disabled'};
  if(!policy.balances[name])continue;
  availability[name].reason='storage_unavailable';
  if(!database)continue;
  try{
   const {table,column}=currencies[name];
   const result=await database.query(`SELECT account_id,${column} FROM ${table} WHERE account_id=ANY($1::text[])`,[ids]);
   const values=new Map(result.rows.map(row=>[row.account_id,balance(row[column])]));
   for(const id of ids)byAccount[id][name]=values.get(id)??0;
   availability[name]={available:true,reason:null};
  }catch{/* A missing/unhealthy currency must not look like a verified zero. */}
 }
 return {byAccount,currencies:availability};
}
