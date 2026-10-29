// Server-owned fixed bot economy. Never call with browser-supplied room/results.
export const BOT_ECONOMY_VERSION='bot-fixed-v1';
export const BOT_ECONOMY=Object.freeze({version:BOT_ECONOMY_VERSION,entryGold:50,difficulties:Object.freeze({easy:Object.freeze({level:15,gold:100,magicDust:0}),medium:Object.freeze({level:25,gold:125,magicDust:2}),hard:Object.freeze({level:40,gold:175,magicDust:5})})});
const MAX=2147483647;
const fail=(message,status=409)=>Object.assign(Error(message),{status});
export const botMatchId=r=>`${r.code}:${r.matchNumber||1}:${r.created}`;
export function botDifficulty(value){if(!Object.hasOwn(BOT_ECONOMY.difficulties,value))throw fail('Geçersiz bot zorluğu.',400);return BOT_ECONOMY.difficulties[value]}
function validateRoom(room,accountId){
 if(!room||room.mode!=='bot'||!/^\d{3}$/.test(room.code)||!Number.isSafeInteger(room.created)||room.created<=0||!Number.isSafeInteger(room.matchNumber||1)||(room.matchNumber||1)<1||room.players?.length!==2||room.players[0]?.accountId!==accountId||room.players[1]?.accountId||typeof accountId!=='string'||!accountId||accountId.length>300)throw fail('Geçersiz sunucu bot maçı.',400);
 botDifficulty(room.difficulty);
}
const balance=n=>{if(!Number.isSafeInteger(n)||n<0||n>MAX)throw fail('Geçersiz cüzdan bakiyesi.',503);return n};
const validRequestId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const receipt=row=>({matchId:row.match_id,receiptId:row.match_id,configVersion:row.config_version,outcome:row.outcome,rewards:{gold:row.gold_amount,magicDust:row.magic_dust_amount,diamonds:0}});
async function transaction(database,run){
 if(!database?.connect)throw fail('Kalıcı bot ekonomisi şu anda kullanılamıyor.',503);
 const client=await database.connect();let commitIssued=false;
 try{await client.query('BEGIN');const result=await run(client);commitIssued=true;await client.query('COMMIT');return result}
 catch(error){await client.query('ROLLBACK').catch(()=>{});if(commitIssued){error.uncertain=true;error.status=503}throw error}finally{client.release()}
}
async function currentRoom(client,row){
 const terminal=(await client.query('SELECT * FROM hero_auction_bot_settlements WHERE match_id=$1',[row.match_id])).rows[0];
 if(terminal)return terminal.room_state;
 const saved=(await client.query('SELECT state FROM hero_auction_rooms WHERE code=$1',[row.room_state.code])).rows[0]?.state;
 return saved&&botMatchId(saved)===row.match_id&&saved.botEntry?.matchId===row.match_id&&saved.botEconomyVersion===row.config_version?saved:row.room_state;
}
export async function admitBotMatch({database,accountId,requestId,room}){
 validateRoom(room,accountId);
 if(!validRequestId(requestId)||room.phase!=='auction')throw fail('Geçersiz bot giriş isteği.',400);
 requestId=requestId.toLowerCase();
 return transaction(database,async client=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtext('bot-entry-account'),hashtext($1))",[accountId]);
  const prior=(await client.query('SELECT * FROM hero_auction_bot_entries WHERE account_id=$1 AND request_id=$2',[accountId,requestId])).rows[0];
  if(prior){if(prior.difficulty!==room.difficulty)throw fail('Bu giriş isteği başka zorluk için kullanılmış.');return{room:structuredClone(await currentRoom(client,prior)),entryReceipt:prior.room_state.botEntry,replayed:true}}
  const unresolved=(await client.query('SELECT e.match_id FROM hero_auction_bot_entries e LEFT JOIN hero_auction_bot_settlements s USING(match_id) WHERE e.account_id=$1 AND s.match_id IS NULL',[accountId])).rows;
  if(unresolved.length)throw fail('Önceki bot maçını tamamlamadan yeni ücretli maça giremezsin.');
  const matchId=botMatchId(room);
  await client.query("SELECT pg_advisory_xact_lock(hashtext('bot-match'),hashtext($1))",[matchId]);
  const duplicate=(await client.query('SELECT * FROM hero_auction_bot_entries WHERE match_id=$1',[matchId])).rows[0];
  if(duplicate)throw fail('Bu bot maçı için giriş zaten kaydedildi.');
  await client.query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,500) ON CONFLICT DO NOTHING',[accountId]);
  const before=balance(Number((await client.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1 FOR UPDATE',[accountId])).rows[0]?.gold));
  if(before<50)throw fail('Bot maçına katılmak için en az 50 altın gerekli.',400);
  const entryReceipt={matchId,requestId,version:BOT_ECONOMY_VERSION,difficulty:room.difficulty,entryGold:50};
  const saved={...structuredClone(room),entryPaid:true,botEconomyVersion:BOT_ECONOMY_VERSION,botEntry:entryReceipt};
  await client.query('UPDATE hero_auction_wallets SET gold=gold-50 WHERE account_id=$1',[accountId]);
  await client.query('INSERT INTO hero_auction_bot_entries(match_id,account_id,request_id,difficulty,config_version,entry_gold,gold_before,gold_after,room_state) VALUES($1,$2,$3,$4,$5,50,$6,$7,$8::jsonb)',[matchId,accountId,requestId,room.difficulty,BOT_ECONOMY_VERSION,before,before-50,JSON.stringify(saved)]);
  const roomWrite=await client.query(`INSERT INTO hero_auction_rooms(code,state) VALUES($1,$2::jsonb)
   ON CONFLICT(code) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()
   WHERE hero_auction_rooms.state->>'created'=EXCLUDED.state->>'created'
    AND hero_auction_rooms.state->'players'->0->>'accountId'=EXCLUDED.state->'players'->0->>'accountId'
    AND ((hero_auction_rooms.state->>'phase' IN ('matching','bot_offer') AND COALESCE(hero_auction_rooms.state->>'matchNumber','1')=COALESCE(EXCLUDED.state->>'matchNumber','1'))
     OR (hero_auction_rooms.state->>'phase'='finished' AND (COALESCE(hero_auction_rooms.state->>'matchNumber','1'))::integer+1=(COALESCE(EXCLUDED.state->>'matchNumber','1'))::integer
      AND (hero_auction_rooms.state->>'matchSettled'='true' OR EXISTS(SELECT 1 FROM hero_auction_bot_settlements s WHERE s.match_id=hero_auction_rooms.code||':'||COALESCE(hero_auction_rooms.state->>'matchNumber','1')||':'||(hero_auction_rooms.state->>'created')))))
   RETURNING code`,[saved.code,JSON.stringify(saved)]);
  if(!roomWrite.rows.length)throw fail('Oda kimliği değişti; bot giriş ücreti alınmadı.');
  return{room:saved,entryReceipt,replayed:false};
 });
}
export async function settleBotMatch({database,room,winner,serverFailure=false,forfeit=false}){
 const accountId=room?.players?.[0]?.accountId;validateRoom(room,accountId);
 if(room.botEntry?.matchId!==botMatchId(room)||room.botEconomyVersion!==BOT_ECONOMY_VERSION||room.entryPaid!==true||room.phase!=='finished'||![null,0,1].includes(winner))throw fail('Ücretli bot maçının sonucu doğrulanamadı.');
 // A trusted caller may certify an unrecoverable server failure, never a quit,
 // timeout or disconnect. There is deliberately no public refund endpoint.
 if(serverFailure!==false&&!['server_failure','server_restart'].includes(serverFailure))throw fail('Geçersiz sunucu hata kanıtı.');
 if(forfeit!==false&&!(forfeit===true&&winner===1&&!serverFailure))throw fail('Geçersiz sunucu hükmen kayıp kararı.');
 const result=room.battleSync?.result;
 if(!serverFailure&&!forfeit&&result&&(result.winner!==winner||result.live&&!result.finished))throw fail('Savaşın nihai sonucu doğrulanmadı.');
 return transaction(database,async client=>{
  const matchId=botMatchId(room);
  await client.query("SELECT pg_advisory_xact_lock(hashtext('bot-match'),hashtext($1))",[matchId]);
  const entry=(await client.query('SELECT * FROM hero_auction_bot_entries WHERE match_id=$1',[matchId])).rows[0];
  if(!entry||entry.account_id!==accountId||entry.difficulty!==room.difficulty||entry.config_version!==BOT_ECONOMY_VERSION)throw fail('Kalıcı bot giriş kaydı eşleşmiyor.');
  const outcome=serverFailure?'server_failure':winner===null?'tie':winner===0?'win':'loss';
  const prior=(await client.query('SELECT * FROM hero_auction_bot_settlements WHERE match_id=$1',[matchId])).rows[0];
  if(prior){if(prior.outcome!==outcome)throw fail('Bot maçının sonucu zaten kesinleşti.');return{room:structuredClone(prior.room_state),receipt:receipt(prior),replayed:true}}
  const policy=botDifficulty(entry.difficulty),gold=outcome==='win'?policy.gold:['tie','server_failure'].includes(outcome)?50:0,dust=outcome==='win'?policy.magicDust:0;
  const before=balance(Number((await client.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1 FOR UPDATE',[accountId])).rows[0]?.gold));
  await client.query('INSERT INTO hero_auction_magic_dust_wallets(account_id,magic_dust) VALUES($1,0) ON CONFLICT DO NOTHING',[accountId]);
  const dustBefore=balance(Number((await client.query('SELECT magic_dust FROM hero_auction_magic_dust_wallets WHERE account_id=$1 FOR UPDATE',[accountId])).rows[0]?.magic_dust));
  if(before>MAX-gold||dustBefore>MAX-dust)throw fail('Bot ödülü cüzdan sınırını aşıyor.',503);
  const publicReceipt=receipt({match_id:matchId,config_version:BOT_ECONOMY_VERSION,outcome,gold_amount:gold,magic_dust_amount:dust});
  const saved={...structuredClone(room),botSettlementReceipt:publicReceipt,botSettlementPending:false,battleSettlementPending:false,botForfeit:false,matchSettled:true,series:[...(room.series||[0,0])]};
  if(!serverFailure&&winner!==null)saved.series[winner]++;
  if(outcome==='win'){saved.victoryChestReceipt=publicReceipt;saved.victoryChestWinner=0;saved.victoryChestPending=false}
  await client.query('UPDATE hero_auction_wallets SET gold=gold+$2 WHERE account_id=$1',[accountId,gold]);
  await client.query('UPDATE hero_auction_magic_dust_wallets SET magic_dust=magic_dust+$2 WHERE account_id=$1',[accountId,dust]);
  await client.query('INSERT INTO hero_auction_bot_settlements(match_id,account_id,config_version,outcome,gold_amount,magic_dust_amount,gold_before,gold_after,magic_dust_before,magic_dust_after,room_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)',[matchId,accountId,BOT_ECONOMY_VERSION,outcome,gold,dust,before,before+gold,dustBefore,dustBefore+dust,JSON.stringify(saved)]);
  // Avoid replacing a newer rematch that reused the room code.
  await client.query("UPDATE hero_auction_rooms SET state=$2::jsonb,updated_at=NOW() WHERE code=$1 AND state->>'created'=$3 AND COALESCE(state->>'matchNumber','1')=$4",[saved.code,JSON.stringify(saved),String(saved.created),String(saved.matchNumber||1)]);
  return{room:saved,receipt:publicReceipt,replayed:false};
 });
}
export async function recoverBotMatches(database){
 return(await database.query(`SELECT e.*,s.room_state AS settled_room_state,s.outcome FROM hero_auction_bot_entries e LEFT JOIN hero_auction_bot_settlements s USING(match_id) WHERE s.match_id IS NULL OR EXISTS(SELECT 1 FROM hero_auction_rooms r WHERE r.code=e.room_state->>'code' AND r.state->>'created'=e.room_state->>'created' AND COALESCE(r.state->>'matchNumber','1')=COALESCE(e.room_state->>'matchNumber','1')) ORDER BY e.created_at`)).rows.map(row=>({...row,room:row.settled_room_state||row.room_state,settled:!!row.settled_room_state}));
}

export async function findBotAdmission({database,accountId,requestId}){
 if(!validRequestId(requestId))throw fail('Geçersiz bot giriş isteği.',400);
 // Wait behind a possibly still-committing admission before interpreting a
 // missing receipt as safe to retry. A plain MVCC read is not that proof.
 return transaction(database,async client=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtext('bot-entry-account'),hashtext($1))",[accountId]);
  const row=(await client.query('SELECT * FROM hero_auction_bot_entries WHERE account_id=$1 AND request_id=$2',[accountId,requestId.toLowerCase()])).rows[0];
  if(!row)return null;
  return{room:structuredClone(await currentRoom(client,row)),entryReceipt:row.room_state.botEntry,replayed:true};
 });
}
