// Server-only earned-currency policy. No purchase, claim or arbitrary grant API.
const MAX_CURRENCY=2147483647;
export const APPROVED_MAGIC_DUST_PRICING=Object.freeze({base:5,numerator:6,denominator:5,rounding:'ceil-from-base',version:'dust-upgrade-5-x1.2-ceil-v1'});
const failure=(message,status=409)=>Object.assign(Error(message),{status});
export function createMagicDustPolicy(env={},pricing=APPROVED_MAGIC_DUST_PRICING){
 const requested=env.HERO_MAGIC_DUST_ENABLED==='1',dependency=env.HERO_DIAMONDS_ENABLED==='1';
 return Object.freeze({enabled:requested&&dependency,reason:!requested?'disabled':!dependency?'diamonds_disabled':null,pricing:pricing?Object.freeze({...pricing}):null});
}
export function magicDustUpgradeCost(currentLevel,pricing=APPROVED_MAGIC_DUST_PRICING){
 if(!Number.isInteger(currentLevel)||currentLevel<0||currentLevel>=40)throw failure('Geliştirme sınırı.');
 if(currentLevel<15)return 0;
 // A missing or malformed price must never turn a dust upgrade into a free one.
 if(!pricing||!Number.isSafeInteger(pricing.base)||pricing.base<=0||pricing.base>MAX_CURRENCY||pricing.numerator!==6||pricing.denominator!==5||pricing.rounding!=='ceil-from-base'||typeof pricing.version!=='string'||!pricing.version.length||pricing.version.length>100)return null;
 const power=BigInt(currentLevel-15),denominator=5n**power;
 const amount=(BigInt(pricing.base)*6n**power+denominator-1n)/denominator;
 return amount>BigInt(MAX_CURRENCY)?null:Number(amount);
}
export async function readMagicDustBalance(database,accountId){
 try{
  const found=await database.query('SELECT magic_dust FROM hero_auction_magic_dust_wallets WHERE account_id=$1',[accountId]);
  const amount=found.rows.length?Number(found.rows[0].magic_dust):0;
  if(!Number.isSafeInteger(amount)||amount<0||amount>MAX_CURRENCY)throw failure('Geçersiz büyü tozu bakiyesi.',503);
  return amount;
 }catch(e){if(e.code==='42P01'||e.code==='42703')throw failure('Büyü tozu altyapısı henüz etkin değil.',503);throw e;}
}
