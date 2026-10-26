// Server-only earned rewards. There is no purchase, client claim or reroll API.
import {randomInt as secureRandomInt} from 'node:crypto';
const MAX=2147483647;
export const APPROVED_VICTORY_CHEST_CONFIG=Object.freeze({version:'victory-100-120-dust40-diamond10-v1',gold:Object.freeze([100,105,110,115,120]),goldWeights:Object.freeze([1,1,1,1,1]),magicDustChance:4000,magicDust:Object.freeze([3,4,5]),diamondChance:1000});
const fail=(message,status=503)=>Object.assign(Error(message),{status});
const amount=value=>{if(!Number.isSafeInteger(value)||value<0||value>MAX)throw fail('Geçersiz ödül bakiyesi.');return value};
export function createVictoryChestPolicy(env={},config=APPROVED_VICTORY_CHEST_CONFIG){
 const requested=env.HERO_VICTORY_CHESTS_ENABLED==='1',dependencies=env.HERO_DIAMONDS_ENABLED==='1'&&env.HERO_MAGIC_DUST_ENABLED==='1';
 const valid=!!config&&typeof config.version==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(config.version)&&JSON.stringify(config.gold)==='[100,105,110,115,120]'&&Array.isArray(config.goldWeights)&&config.goldWeights.length===5&&config.goldWeights.every(x=>Number.isInteger(x)&&x>0&&x<=10000)&&JSON.stringify(config.magicDust)==='[3,4,5]'&&Number.isInteger(config.magicDustChance)&&config.magicDustChance>=0&&config.magicDustChance<=10000&&Number.isInteger(config.diamondChance)&&config.diamondChance>=0&&config.diamondChance<=10000;
 return Object.freeze({enabled:requested&&dependencies&&valid,requested,reason:!requested?'disabled':!dependencies?'currency_dependencies_disabled':!valid?'invalid_config':null,config:valid?Object.freeze({...config,gold:Object.freeze([...config.gold]),goldWeights:Object.freeze([...config.goldWeights]),magicDust:Object.freeze([...config.magicDust])}):null});
}
export function rollVictoryChest(config=APPROVED_VICTORY_CHEST_CONFIG,randomInt=secureRandomInt){
 if(!createVictoryChestPolicy({},config).config)throw fail('Sandık olasılıkları geçersiz.');
 const roll=max=>{const n=randomInt(max);if(!Number.isInteger(n)||n<0||n>=max)throw fail('Geçersiz ödül rastgeleliği.');return n};
 let n=roll(config.goldWeights.reduce((a,b)=>a+b,0)),index=0;while(n>=config.goldWeights[index])n-=config.goldWeights[index++];
 // Separate draws, not exclusive rarities. Always draw quantity separately so
 // changing one probability cannot consume the combat RNG or alter another roll.
 const dustRoll=roll(10000),dustQuantity=config.magicDust[roll(config.magicDust.length)],diamondRoll=roll(10000);
 return Object.freeze({gold:config.gold[index],magicDust:dustRoll<config.magicDustChance?dustQuantity:0,diamonds:diamondRoll<config.diamondChance?1:0});
}
export const victoryMatchId=room=>`${room.code}:${room.matchNumber||1}:${room.created||0}`;
export function eligibleVictory(room,winner){return !!room&&room.phase==='finished'&&room.mode!=='bot'&&room.entryPaid===true&&(winner===0||winner===1)&&typeof room.players?.[winner]?.accountId==='string'&&!!room.players[winner].accountId;}
function validateIntent(intent){
 if(!intent||typeof intent.matchId!=='string'||intent.matchId.length>200||!/^\d{3}:\d+:\d+$/.test(intent.matchId)||typeof intent.accountId!=='string'||!intent.accountId||intent.accountId.length>300||![0,1].includes(intent.winner))throw fail('Geçersiz sunucu maç kaydı.');
 if(!eligibleVictory(intent.roomState,intent.winner)||victoryMatchId(intent.roomState)!==intent.matchId||intent.roomState.players[intent.winner].accountId!==intent.accountId)throw fail('Maç sonucu ödül kaydıyla eşleşmiyor.');
 const result=intent.roomState.battleSync?.result;if(result&&(result.winner!==intent.winner||result.live&&!result.finished))throw fail('Savaşın nihai sonucu doğrulanmadı.');
 return intent;
}
const publicReceipt=row=>({matchId:row.match_id,receiptId:row.match_id,configVersion:row.config_version,rewards:{gold:amount(row.gold_amount),magicDust:amount(row.magic_dust_amount),diamonds:amount(row.diamond_amount)}});
export async function persistVictoryChestIntent({database,room,winner,policy,randomInt=secureRandomInt}){
 if(!policy?.enabled)throw fail('Zafer sandığı etkin değil.');
 const intent=validateIntent({matchId:victoryMatchId(room),accountId:room.players?.[winner]?.accountId,winner,roomState:structuredClone(room)});
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('victory-chest'),hashtext($1))",[intent.matchId]);
  const prior=await client.query('SELECT * FROM hero_auction_victory_chest_intents WHERE match_id=$1',[intent.matchId]);
  if(prior.rows.length){const row=prior.rows[0];if(row.account_id!==intent.accountId||row.winner_seat!==winner)throw fail('Kayıtlı maç kazananı farklı.');await client.query('COMMIT');return row;}
  // A match that already received legacy gold must never also receive a chest.
  const legacy=await client.query('SELECT award_id FROM hero_auction_gold_awards WHERE award_id=$1',[intent.matchId]);
  if(legacy.rows.length||room.goldAward)throw fail('Bu maçın galibiyet altını zaten kaydedilmiş.');
  const rewards=rollVictoryChest(policy.config,randomInt);
  const saved=await client.query('INSERT INTO hero_auction_victory_chest_intents(match_id,account_id,winner_seat,config_version,gold_amount,magic_dust_amount,diamond_amount,room_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *',[intent.matchId,intent.accountId,winner,policy.config.version,rewards.gold,rewards.magicDust,rewards.diamonds,JSON.stringify(intent.roomState)]);
  await client.query('COMMIT');return saved.rows[0];
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
}
export async function creditVictoryChest({database,matchId}){
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('victory-chest'),hashtext($1))",[matchId]);
  const found=await client.query('SELECT * FROM hero_auction_victory_chest_intents WHERE match_id=$1',[matchId]);
  if(!found.rows.length)throw fail('Sunucuda doğrulanmış sandık sonucu bulunamadı.');
  const row=found.rows[0],accountId=row.account_id,rewards=publicReceipt(row).rewards;
  const prior=await client.query('SELECT * FROM hero_auction_victory_chest_receipts WHERE match_id=$1',[matchId]);
  if(prior.rows.length){await client.query('COMMIT');return{receipt:publicReceipt(prior.rows[0]),accountId,replayed:true};}
  // Same order as upgrades/exchange/daily rewards. Never lock commander/profile
  // after wallets, which would invert their lock order.
  const goldRow=await client.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
  if(!goldRow.rows.length)throw fail('Altın cüzdanı bulunamadı.');
  await client.query('INSERT INTO hero_auction_diamond_wallets(account_id,diamonds) VALUES($1,0) ON CONFLICT DO NOTHING',[accountId]);
  const diamondRow=await client.query('SELECT diamonds FROM hero_auction_diamond_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
  await client.query('INSERT INTO hero_auction_magic_dust_wallets(account_id,magic_dust) VALUES($1,0) ON CONFLICT DO NOTHING',[accountId]);
  const dustRow=await client.query('SELECT magic_dust FROM hero_auction_magic_dust_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
  const before={gold:amount(Number(goldRow.rows[0].gold)),diamonds:amount(Number(diamondRow.rows[0].diamonds)),magicDust:amount(Number(dustRow.rows[0].magic_dust))};
  for(const name of Object.keys(before))if(before[name]>MAX-rewards[name])throw fail('Sandık ödülü cüzdan sınırını aşıyor.');
  await client.query('UPDATE hero_auction_wallets SET gold=gold+$2 WHERE account_id=$1',[accountId,rewards.gold]);
  await client.query('UPDATE hero_auction_diamond_wallets SET diamonds=diamonds+$2 WHERE account_id=$1',[accountId,rewards.diamonds]);
  await client.query('UPDATE hero_auction_magic_dust_wallets SET magic_dust=magic_dust+$2 WHERE account_id=$1',[accountId,rewards.magicDust]);
  const saved=await client.query('INSERT INTO hero_auction_victory_chest_receipts(match_id,account_id,config_version,gold_amount,magic_dust_amount,diamond_amount,gold_before,gold_after,magic_dust_before,magic_dust_after,diamonds_before,diamonds_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[matchId,accountId,row.config_version,rewards.gold,rewards.magicDust,rewards.diamonds,before.gold,before.gold+rewards.gold,before.magicDust,before.magicDust+rewards.magicDust,before.diamonds,before.diamonds+rewards.diamonds]);
  // Reservation in the legacy idempotency namespace prevents a later old-code
  // gold queue from crediting 120 again after a rollback/restart.
  const reserved=await client.query('INSERT INTO hero_auction_gold_awards(award_id,account_id,amount) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING award_id',[matchId,accountId,rewards.gold]);
  if(!reserved.rows.length)throw fail('Maçın altın ödülü başka işlemde kaydedilmiş.');
  await client.query('COMMIT');return{receipt:publicReceipt(saved.rows[0]),accountId,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
}
export async function readVictoryChestRecovery(database,matchIds=[]){
 return(await database.query(`SELECT i.*,r.match_id AS credited_match_id FROM hero_auction_victory_chest_intents i LEFT JOIN hero_auction_victory_chest_receipts r USING(match_id) WHERE r.match_id IS NULL OR (i.room_state->>'code')=ANY($1::text[]) ORDER BY i.created_at`,[matchIds.map(id=>id.split(':')[0])])).rows;
}
export function victoryChestView(room,seat){
 const matchId=victoryMatchId(room),winner=room.victoryChestWinner;
 if(seat!==winner||!room.players?.[seat]?.accountId)return{matchId,victoryChest:null,victoryChestPending:false};
 const receipt=room.victoryChestReceipt;
 return{matchId,victoryChest:receipt?.matchId===matchId?structuredClone(receipt):null,victoryChestPending:!receipt&&room.victoryChestPending===true};
}
