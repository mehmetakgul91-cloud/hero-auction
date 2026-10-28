// Server-only economy foundation. There is deliberately no credit/purchase API.
import {createMagicDustPolicy,magicDustUpgradeCost} from './magic-dust.js';
import {COMMANDER_STATS,validateCommanderProfile,commanderLevelCap,commanderUpgradeCost,previewCommanderUpgrade} from './arena-commanders.js';

const MAX_CURRENCY=2147483647; // PostgreSQL INTEGER, also exactly representable in JS.
export const APPROVED_DIAMOND_PRICING=Object.freeze({base:10,numerator:6,denominator:5,rounding:'ceil-from-base',version:'upgrade-10-x1.2-ceil-v1'});
export function createDiamondPolicy(env={},pricing=APPROVED_DIAMOND_PRICING){
 return Object.freeze({enabled:env.HERO_DIAMONDS_ENABLED==='1',pricing:pricing?Object.freeze({...pricing}):null});
}
function failure(message,status=409){return Object.assign(Error(message),{status});}
function currency(value){
 if(!Number.isSafeInteger(value)||value<0||value>MAX_CURRENCY)throw failure('Geçersiz para bakiyesi.',503);
 return value;
}
export function diamondUpgradeCost(currentLevel,pricing=APPROVED_DIAMOND_PRICING){
 if(!Number.isInteger(currentLevel)||currentLevel<0||currentLevel>=40)throw failure('Geliştirme sınırı.');
 if(currentLevel<20)return 0;
 // Missing/malformed pricing must never turn a paid upgrade into a free one.
 if(!pricing||!Number.isSafeInteger(pricing.base)||pricing.base<=0||pricing.base>MAX_CURRENCY||pricing.numerator!==6||pricing.denominator!==5||pricing.rounding!=='ceil-from-base'||typeof pricing.version!=='string'||!pricing.version.length||pricing.version.length>100)return null;
 const power=BigInt(currentLevel-20),denominator=5n**power;
 const cost=(BigInt(pricing.base)*6n**power+denominator-1n)/denominator;
 return cost>BigInt(MAX_CURRENCY)?null:Number(cost);
}
export function commanderProgression(profile,{gold,diamonds=null,magicDust=null},policy,magicDustPolicy=createMagicDustPolicy()){
 currency(gold);
 if(policy.enabled)currency(diamonds);
 if(magicDustPolicy.enabled)currency(magicDust);
 const branches={};
 if(profile){
  validateCommanderProfile(profile);
  for(const stat of COMMANDER_STATS){
   const currentLevel=profile.levels[stat],cap=commanderLevelCap(profile.commanderId,stat),maximum=currentLevel>=cap;
   const requiresDiamonds=policy.enabled&&currentLevel>=20&&!maximum;
   const diamondCost=maximum?0:requiresDiamonds?diamondUpgradeCost(currentLevel,policy.pricing):0;
   const requiresMagicDust=magicDustPolicy.enabled&&currentLevel>=15&&!maximum;
   const magicDustCost=maximum?0:requiresMagicDust?magicDustUpgradeCost(currentLevel,magicDustPolicy.pricing):0;
   const goldCost=maximum?0:commanderUpgradeCost(currentLevel);
   const reason=maximum?'maximum_level':diamondCost===null||magicDustCost===null?'pricing_unavailable':gold<goldCost?'insufficient_gold':requiresDiamonds&&diamonds<diamondCost?'insufficient_diamonds':requiresMagicDust&&magicDust<magicDustCost?'insufficient_magic_dust':null;
   branches[stat]={currentLevel,nextLevel:maximum?null:currentLevel+1,cap,gold:goldCost,diamonds:diamondCost,requiresDiamonds,...(magicDustPolicy.enabled?{magicDust:magicDustCost,requiresMagicDust}:{}),canUpgrade:reason===null,reason};
  }
 }
 return{diamondsEnabled:policy.enabled,magicDustEnabled:magicDustPolicy.enabled,purchaseAvailable:false,purchaseReason:'provider_not_configured',requestIdRequired:policy.enabled,branches};
}
export async function readDiamondBalance(database,accountId){
 try{
  const found=await database.query('SELECT diamonds FROM hero_auction_diamond_wallets WHERE account_id=$1',[accountId]);
  return currency(found.rows.length?Number(found.rows[0].diamonds):0);
 }catch(e){if(e.code==='42P01')throw failure('Elmas altyapısı henüz etkin değil.',503);throw e;}
}

// The caller authenticates/bans the account. No amount, wallet or profile from the
// request is trusted. Lock order is commander -> gold wallet -> diamond wallet -> magic dust wallet.
export async function upgradeCommanderWithDiamonds({database,accountId,request,policy,magicDustPolicy=createMagicDustPolicy()}){
 if(!policy.enabled)throw failure('Elmas sistemi etkin değil.',503);
 const {stat,commanderId,expectedCurrentLevel,requestId}=request;
 if(!COMMANDER_STATS.includes(stat)||!COMMANDER_STATS.includes(commanderId)||!Number.isInteger(expectedCurrentLevel)||expectedCurrentLevel<0||expectedCurrentLevel>=40||typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))throw failure('Geçersiz geliştirme isteği.',400);
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  const existing=await client.query('SELECT profile FROM hero_auction_commanders WHERE account_id=$1 FOR UPDATE',[accountId]);
  if(!existing.rows.length)throw failure('Önce komutan seçmelisin.');
  const profile=validateCommanderProfile(existing.rows[0].profile);
  const prior=await client.query('SELECT commander_id,stat,from_level,gold_cost,diamond_cost,pricing_version'+(magicDustPolicy.enabled?',magic_dust_cost':'')+' FROM hero_auction_upgrade_receipts WHERE account_id=$1 AND request_id=$2',[accountId,requestId]);
  const receipt=prior.rows[0];
  if(receipt&&(receipt.commander_id!==commanderId||receipt.stat!==stat||receipt.from_level!==expectedCurrentLevel))throw failure('Geliştirme istek kimliği başka bir işlem için kullanılmış.');
  if(!receipt&&(profile.commanderId!==commanderId||profile.levels[stat]!==expectedCurrentLevel))throw failure('Komutan seviyesi değişti. Profili yenileyip tekrar dene.');
  if(!receipt&&profile.levels[stat]>=commanderLevelCap(profile.commanderId,stat))throw failure('Bu dal maksimum seviyede.');
  const goldCost=receipt?Number(receipt.gold_cost):commanderUpgradeCost(profile.levels[stat]);
  const diamondCost=receipt?Number(receipt.diamond_cost):diamondUpgradeCost(profile.levels[stat],policy.pricing);
  const magicDustCost=magicDustPolicy.enabled?(receipt?Number(receipt.magic_dust_cost):magicDustUpgradeCost(profile.levels[stat],magicDustPolicy.pricing)):0;
  if(diamondCost===null)throw failure('Elmas geliştirme fiyatı henüz yapılandırılmadı.',503);
  if(magicDustCost===null)throw failure('Büyü tozu geliştirme fiyatı henüz yapılandırılmadı.',503);
  currency(goldCost);currency(diamondCost);currency(magicDustCost);
  const goldRow=await client.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
  if(!goldRow.rows.length)throw failure('Altın cüzdanı bulunamadı.',503);
  let gold=currency(Number(goldRow.rows[0].gold));
  await client.query('INSERT INTO hero_auction_diamond_wallets(account_id,diamonds) VALUES($1,0) ON CONFLICT DO NOTHING',[accountId]);
  const diamondRow=await client.query('SELECT diamonds FROM hero_auction_diamond_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
  let diamonds=currency(Number(diamondRow.rows[0].diamonds));
  let magicDust=null;
  if(magicDustPolicy.enabled){
   await client.query('INSERT INTO hero_auction_magic_dust_wallets(account_id,magic_dust) VALUES($1,0) ON CONFLICT DO NOTHING',[accountId]);
   const dustRow=await client.query('SELECT magic_dust FROM hero_auction_magic_dust_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
   if(!dustRow.rows.length)throw failure('Büyü tozu cüzdanı bulunamadı.',503);
   magicDust=currency(Number(dustRow.rows[0].magic_dust));
  }
  let upgraded=profile;
  if(!receipt){
   if(gold<goldCost)throw failure('Yetersiz altın.');
   if(diamonds<diamondCost)throw failure('Yetersiz elmas.');
   if(magicDustPolicy.enabled&&magicDust<magicDustCost)throw failure('Yetersiz büyü tozu.');
   const paidGold=await client.query('UPDATE hero_auction_wallets SET gold=gold-$2 WHERE account_id=$1 AND gold>=$2 RETURNING gold',[accountId,goldCost]);
   if(!paidGold.rows.length)throw failure('Yetersiz altın.');
   if(diamondCost){
    const paidDiamonds=await client.query('UPDATE hero_auction_diamond_wallets SET diamonds=diamonds-$2 WHERE account_id=$1 AND diamonds>=$2 RETURNING diamonds',[accountId,diamondCost]);
    if(!paidDiamonds.rows.length)throw failure('Yetersiz elmas.');
   }
   if(magicDustCost){
    const paidDust=await client.query('UPDATE hero_auction_magic_dust_wallets SET magic_dust=magic_dust-$2 WHERE account_id=$1 AND magic_dust>=$2 RETURNING magic_dust',[accountId,magicDustCost]);
    if(!paidDust.rows.length)throw failure('Yetersiz büyü tozu.');
   }
   upgraded=previewCommanderUpgrade(profile,stat,goldCost).profile;
   const pricingVersion=(diamondCost?policy.pricing.version:'gold-only')+(magicDustCost?'|'+magicDustPolicy.pricing.version:'');
   if(magicDustPolicy.enabled)await client.query('INSERT INTO hero_auction_upgrade_receipts(account_id,request_id,commander_id,stat,from_level,to_level,gold_cost,diamond_cost,pricing_version,magic_dust_cost) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[accountId,requestId,commanderId,stat,expectedCurrentLevel,expectedCurrentLevel+1,goldCost,diamondCost,pricingVersion,magicDustCost]);
   else await client.query('INSERT INTO hero_auction_upgrade_receipts(account_id,request_id,commander_id,stat,from_level,to_level,gold_cost,diamond_cost,pricing_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[accountId,requestId,commanderId,stat,expectedCurrentLevel,expectedCurrentLevel+1,goldCost,diamondCost,pricingVersion]);
   if(diamondCost)await client.query('INSERT INTO hero_auction_diamond_ledger(account_id,request_id,delta,balance_before,balance_after) VALUES($1,$2,$3,$4,$5)',[accountId,requestId,-diamondCost,diamonds,diamonds-diamondCost]);
   if(magicDustCost)await client.query('INSERT INTO hero_auction_magic_dust_upgrade_ledger(account_id,request_id,delta,balance_before,balance_after) VALUES($1,$2,$3,$4,$5)',[accountId,requestId,-magicDustCost,magicDust,magicDust-magicDustCost]);
   await client.query('UPDATE hero_auction_commanders SET profile=$2::jsonb,updated_at=NOW() WHERE account_id=$1',[accountId,JSON.stringify(upgraded)]);
   gold-=goldCost;diamonds-=diamondCost;if(magicDustPolicy.enabled)magicDust-=magicDustCost;
  }
  // A replay returns today's locked state, never an old profile/balance snapshot.
  const result={profile:upgraded,gold,diamonds,magicDust,cost:goldCost,diamondCost,magicDustCost,requestId,replayed:Boolean(receipt)};
  result.progression=commanderProgression(upgraded,result,policy,magicDustPolicy);
  await client.query('COMMIT');
  return result;
 }catch(e){
  // A lost COMMIT response is intentionally not retried with a new key. The
  // caller may repeat this same request ID; the durable receipt decides it.
  await client.query('ROLLBACK').catch(()=>{});
  if(e.code==='42P01'||e.code==='42703')throw failure(magicDustPolicy.enabled?'Geliştirme para altyapısı henüz etkin değil.':'Elmas altyapısı henüz etkin değil.',503);
  throw e;
 }finally{client.release();}
}
