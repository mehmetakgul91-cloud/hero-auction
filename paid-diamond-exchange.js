// Server-only, one-way conversion of EXISTING diamonds. This is not a purchase
// adapter, cash-out, diamond grant or reverse gold-to-diamond conversion API.
const MAX_CURRENCY=2147483647;
export const APPROVED_DIAMOND_EXCHANGE_CONFIG=Object.freeze({rate:500,version:'diamonds-to-gold-500-v1'});

export function createDiamondExchangePolicy(env={},config=APPROVED_DIAMOND_EXCHANGE_CONFIG){
 return Object.freeze({
  enabled:env.HERO_DIAMONDS_ENABLED==='1'&&env.HERO_DIAMOND_EXCHANGE_ENABLED==='1',
  config:config?Object.freeze({...config}):null
 });
}
function validConfig(config){
 return Boolean(config&&Number.isSafeInteger(config.rate)&&config.rate>0&&config.rate<=MAX_CURRENCY&&typeof config.version==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(config.version));
}
export function diamondExchangeView(policy){
 const configured=validConfig(policy.config);
 return{enabled:policy.enabled,available:policy.enabled&&configured,rate:configured?policy.config.rate:null,pricingVersion:configured?policy.config.version:null,reason:!policy.enabled?'disabled':!configured?'rate_unconfigured':null};
}
function failure(message,status=409){return Object.assign(Error(message),{status});}
function currency(value){
 const amount=typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)?Number(value):value;
 if(!Number.isSafeInteger(amount)||amount<0||amount>MAX_CURRENCY)throw failure('Geçersiz para bakiyesi.',503);
 return amount;
}

// The HTTP caller must authenticate and check account suspension before passing
// accountId. Request-supplied account IDs/balances/credit amounts are never read.
// Lock gold before diamonds, matching the upgrade service's wallet lock order.
export async function exchangeDiamondsForGold({database,accountId,request,policy}){
 if(!policy.enabled)throw failure('Elmas-altın dönüşümü etkin değil.',503);
 if(typeof accountId!=='string'||!accountId.length)throw failure('Geçersiz hesap.',401);
 const {requestId,diamondsToSpend,expectedRate,pricingVersion}=request||{};
 if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)||!Number.isSafeInteger(diamondsToSpend)||diamondsToSpend<=0||diamondsToSpend>MAX_CURRENCY||!Number.isSafeInteger(expectedRate)||expectedRate<=0||expectedRate>MAX_CURRENCY||typeof pricingVersion!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(pricingVersion))throw failure('Geçersiz dönüşüm isteği.',400);
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  const goldRow=await client.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
  if(!goldRow.rows.length)throw failure('Altın cüzdanı bulunamadı.',503);
  let gold=currency(goldRow.rows[0].gold);
  // This lookup follows the per-account wallet lock, serializing duplicate keys
  // and distinct concurrent requests even across multiple application servers.
  const prior=await client.query('SELECT diamonds_spent,gold_granted,exchange_rate,pricing_version FROM hero_auction_diamond_exchanges WHERE account_id=$1 AND request_id=$2',[accountId,requestId]);
  const receipt=prior.rows[0];
  if(receipt&&(currency(receipt.diamonds_spent)!==diamondsToSpend||currency(receipt.exchange_rate)!==expectedRate||receipt.pricing_version!==pricingVersion))throw failure('Dönüşüm istek kimliği başka bir işlem için kullanılmış.');
  if(!receipt&&!validConfig(policy.config))throw failure('Elmas-altın dönüşüm oranı henüz yapılandırılmadı.',503);
  if(!receipt&&(expectedRate!==policy.config.rate||pricingVersion!==policy.config.version))throw failure('Dönüşüm oranı değişti. Bilgileri yenileyip tekrar dene.');
  const granted=receipt?BigInt(currency(receipt.gold_granted)):BigInt(diamondsToSpend)*BigInt(policy.config.rate);
  if(granted<=0n||granted>BigInt(MAX_CURRENCY))throw failure('Dönüşüm altın sınırını aşıyor.');
  const goldGranted=Number(granted);
  const diamondRow=await client.query('SELECT diamonds FROM hero_auction_diamond_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
  let diamonds=diamondRow.rows.length?currency(diamondRow.rows[0].diamonds):0;
  if(!receipt){
   if(diamonds<diamondsToSpend)throw failure('Yetersiz elmas.');
   if(BigInt(gold)+granted>BigInt(MAX_CURRENCY))throw failure('Dönüşüm altın sınırını aşıyor.');
   const paid=await client.query('UPDATE hero_auction_diamond_wallets SET diamonds=diamonds-$2 WHERE account_id=$1 AND diamonds>=$2 RETURNING diamonds',[accountId,diamondsToSpend]);
   if(!paid.rows.length)throw failure('Yetersiz elmas.');
   const credited=await client.query('UPDATE hero_auction_wallets SET gold=gold+$2 WHERE account_id=$1 AND gold<=$3 RETURNING gold',[accountId,goldGranted,MAX_CURRENCY-goldGranted]);
   if(!credited.rows.length)throw failure('Dönüşüm altın sınırını aşıyor.');
   await client.query('INSERT INTO hero_auction_diamond_exchanges(account_id,request_id,diamonds_spent,gold_granted,exchange_rate,pricing_version,diamond_balance_before,diamond_balance_after,gold_balance_before,gold_balance_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[accountId,requestId,diamondsToSpend,goldGranted,policy.config.rate,policy.config.version,diamonds,diamonds-diamondsToSpend,gold,gold+goldGranted]);
   gold+=goldGranted;diamonds-=diamondsToSpend;
  }
  // Retry returns current locked balances, not a historical snapshot. Receipt
  // recovery is valid even after pricing changes; it never performs a new grant.
  const result={gold,diamonds,diamondsSpent:diamondsToSpend,goldGranted,requestId,replayed:Boolean(receipt),exchange:diamondExchangeView(policy)};
  await client.query('COMMIT');
  return result;
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  if(e.code==='42P01')throw failure('Elmas-altın dönüşüm altyapısı henüz etkin değil.',503);
  // A lost COMMIT response stays uncertain; retry the SAME request ID only.
  throw e;
 }finally{client.release();}
}
