// Non-bot room terminal closure. No match result, rank, reward, or invented debit.
import {cancellationDigest, cancellationMatchId} from './paid-match-cancellation.js';
import {roomIdleDue,ROOM_IDLE_MS} from './room-inactivity.js';
const fail=(message,status=409)=>Object.assign(Error(message),{status});
export const idleCancellationReceiptKey=room=>'room-idle:'+cancellationDigest(cancellationMatchId(room));

export function assertIdleNonBotRoom(room,now){
 cancellationMatchId(room);
 if(room.mode==='bot'||!roomIdleDue(room,{now})||room.matchSettled===true||room.goldAward||room.goldRefunds?.length||room.victoryChestReceipt||room.botEntry||room.forfeitIntent||room.disconnectForfeit)throw fail('Oda hareketsizlik nedeniyle kapatılmaya uygun değil.');
 // Existing admission charges only when moving into auction. A paid waiting
 // room has no canonical debit receipt from which an actual refund can safely
 // be reconstructed. Preserve it for review rather than credit guessed gold.
 if(typeof room.auctionStarted!=='boolean'||room.entryPaid===true&&!room.auctionStarted)throw fail('Açık artırma veya giriş ücreti kanıtı doğrulanamadı.',503);
 if(['auction','finished'].includes(room.phase)&&!room.auctionStarted)throw fail('Açık artırma başlangıç kaydı çelişkili.',503);
}

export function idleNonBotClosure(room,now){
 assertIdleNonBotRoom(room,now);
 const saved=structuredClone(room),receipt={version:1,kind:'room-idle-cancellation',matchId:cancellationMatchId(room),receiptKey:idleCancellationReceiptKey(room),at:now,auctionStarted:room.auctionStarted,refundGold:0};
 saved.phase='closed';saved.deadline=null;saved.turn=null;
 saved.matchSettled=true;saved.battleSettlementPending=false;
 saved.idleClosed={...receipt};
 return{room:saved,receipt};
}

export async function cancelIdleNonBotRoom({database,room,now=Date.now(),validateLive=()=>{}}){
 const matchId=cancellationMatchId(room),receiptKey=idleCancellationReceiptKey(room),digest=cancellationDigest(room);
 if(!database?.connect)throw fail('Kalıcı oda kaydı kullanılamıyor.',503);
 const client=await database.connect();let commitIssued=false,receiptObserved=false;
 try{
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('room-idle-cancellation'),hashtext($1))",[matchId]);
  const prior=(await client.query('SELECT state FROM hero_auction_social WHERE id=$1',[receiptKey])).rows[0]?.state;
  if(prior){
   receiptObserved=true;
   if(prior.version!==1||prior.kind!=='room-idle-cancellation-receipt'||prior.receipt?.matchId!==matchId||prior.receipt?.receiptKey!==receiptKey||prior.receipt?.refundGold!==0||prior.room?.idleClosed?.matchId!==matchId||cancellationMatchId(prior.room)!==matchId||prior.room.phase!=='closed'||prior.room.matchSettled!==true||prior.room.battleSettlementPending!==false||cancellationDigest(prior.room)!==prior.roomDigest||cancellationDigest(prior.room.idleClosed)!==cancellationDigest(prior.receipt))throw fail('Oda kapatma makbuzu doğrulanamadı.',503);
   commitIssued=true;await client.query('COMMIT');
   return{room:structuredClone(prior.room),receipt:prior.receipt,replayed:true};
  }
  assertIdleNonBotRoom(room,now);validateLive();
  const durable=(await client.query('SELECT state FROM hero_auction_rooms WHERE code=$1 FOR UPDATE',[room.code])).rows[0]?.state;
  if(!durable||cancellationMatchId(durable)!==matchId||cancellationDigest(durable)!==digest)throw fail('Kalıcı oda kapatma öncesinde değişti.');
  assertIdleNonBotRoom(durable,now);validateLive();
  // A stale room snapshot must not cancel a match whose economic result is
  // already durable. Runtime reservations also exclude all reward writers.
  const awardIds=[matchId,...[0,1].map(seat=>`${room.code}:refund:${seat}:${room.matchNumber||1}:${room.created}`)];
  if((await client.query('SELECT award_id FROM hero_auction_gold_awards WHERE award_id=ANY($1::text[])',[awardIds])).rows.length)throw fail('Maç ödülü veya iadesi zaten kaydedilmiş.');
  const chestTable=(await client.query("SELECT to_regclass('hero_auction_victory_chest_intents') AS present")).rows[0]?.present;
  if(chestTable&&(await client.query('SELECT match_id FROM hero_auction_victory_chest_intents WHERE match_id=$1',[matchId])).rows.length)throw fail('Maç ödülü kesinleştirme aşamasında.');
  const closed=idleNonBotClosure(durable,now);
  const updated=await client.query('UPDATE hero_auction_rooms SET state=$2::jsonb,updated_at=NOW() WHERE code=$1',[room.code,JSON.stringify(closed.room)]);
  if(updated.rowCount!==1)throw fail('Oda kapanışı kaydedilemedi.',503);
  await client.query('INSERT INTO hero_auction_social(id,state) VALUES($1,$2::jsonb)',[receiptKey,JSON.stringify({version:1,kind:'room-idle-cancellation-receipt',...closed,roomDigest:cancellationDigest(closed.room)})]);
  validateLive();commitIssued=true;await client.query('COMMIT');
  return{...closed,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});if(commitIssued||receiptObserved){error.uncertain=true;error.status=503}throw error}finally{client.release()}
}

// A server-owned presence decision is an intent, not a fabricated arena result.
// The caller reserves the room and revalidates continuous presence until this
// transaction commits; browser payloads must never reach this API directly.
export function disconnectForfeitIntent(room,decision,now){
 const matchId=cancellationMatchId(room);
 if(room.mode==='bot'||room.auctionStarted!==true||!['auction','finished'].includes(room.phase)||room.matchSettled||room.idleClosed||room.cancelled||room.disconnectForfeit||room.forfeitIntent||room.battleSync?.result||room.battleCompleted?.some(Boolean)||room.goldAward||room.goldRefunds?.length||room.victoryChestPending||room.victoryChestReceipt||room.botEntry||room.inviteJoining||room.inviteUncertain||room.joinPending||room.rematchPending)throw fail('Bağlantı süresi nedeniyle sonuçlandırma uygun değil.');
 if(room.players?.length!==2||room.players.some(player=>typeof player?.accountId!=='string'||!player.accountId)||room.players[0].accountId===room.players[1].accountId)throw fail('İki gerçek oyuncu doğrulanamadı.');
 const {winner,absentSeat,absentSince,deadline,presentSince,presenceEpoch}=decision||{};
 if(![0,1].includes(winner)||absentSeat!==1-winner||![absentSince,deadline,presentSince,now].every(Number.isSafeInteger)||absentSince<0||presentSince<0||deadline!==Math.max(absentSince,presentSince)+ROOM_IDLE_MS||now<deadline||typeof presenceEpoch!=='string'||!presenceEpoch||presenceEpoch.length>200)throw fail('Kesintisiz oyuncu varlığı veya dönüş süresi doğrulanamadı.');
 // A returning survivor must remain present for a fresh full window; never
 // grant an immediate win based on an absence that predates their return.
 const saved=structuredClone(room),receipt={version:1,kind:'room-disconnect-forfeit',matchId,receiptKey:idleCancellationReceiptKey(room),at:now,winner,absentSeat,absentSince,deadline,presentSince,presenceEpoch};
 saved.phase='finished';saved.turn=null;saved.deadline=null;
 delete saved.pendingDisconnectForfeit;
 saved.disconnectForfeit={...receipt};
 // Preserve pending settlement until the ordinary reward/record path completes.
 saved.battleSettlementPending=true;saved.matchSettled=false;
 return{room:saved,receipt};
}

export async function persistRoomDisconnectForfeit({database,room,decision,now=Date.now(),validateLive=()=>{}}){
 const matchId=cancellationMatchId(room),receiptKey=idleCancellationReceiptKey(room),digest=cancellationDigest(room);
 if(!database?.connect)throw fail('Kalıcı oda kaydı kullanılamıyor.',503);
 const client=await database.connect();let commitIssued=false,receiptObserved=false;
 try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
  // Same decision namespace and row lock as no-result closure: only one wins.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('room-idle-cancellation'),hashtext($1))",[matchId]);
  const prior=(await client.query('SELECT state FROM hero_auction_social WHERE id=$1',[receiptKey])).rows[0]?.state;
  if(prior){
   receiptObserved=true;
   if(prior.version!==1||prior.kind!=='room-disconnect-forfeit-receipt'||prior.receipt?.kind!=='room-disconnect-forfeit'||prior.receipt?.matchId!==matchId||prior.receipt?.receiptKey!==receiptKey||prior.room?.disconnectForfeit?.matchId!==matchId||cancellationMatchId(prior.room)!==matchId||prior.room.phase!=='finished'||prior.room.matchSettled!==false||prior.room.battleSettlementPending!==true||prior.room.pendingDisconnectForfeit!==undefined||cancellationDigest(prior.room)!==prior.roomDigest||cancellationDigest(prior.room.disconnectForfeit)!==cancellationDigest(prior.receipt)||decision&&prior.receipt.winner!==decision.winner)throw fail('Bağlantı sonucu makbuzu doğrulanamadı.',503);
   commitIssued=true;await client.query('COMMIT');return{room:structuredClone(prior.room),receipt:prior.receipt,replayed:true};
  }
  disconnectForfeitIntent(room,decision,now);validateLive();
  const durable=(await client.query('SELECT state FROM hero_auction_rooms WHERE code=$1 FOR UPDATE',[room.code])).rows[0]?.state;
  if(!durable||cancellationMatchId(durable)!==matchId||cancellationDigest(durable)!==digest)throw fail('Kalıcı oda sonuçlandırma öncesinde değişti.');
  const intent=disconnectForfeitIntent(durable,decision,now);validateLive();
  const awardIds=[matchId,...[0,1].map(seat=>`${room.code}:refund:${seat}:${room.matchNumber||1}:${room.created}`)];
  if((await client.query('SELECT award_id FROM hero_auction_gold_awards WHERE award_id=ANY($1::text[])',[awardIds])).rows.length)throw fail('Maç ödülü veya iadesi zaten kaydedilmiş.');
  const chestTable=(await client.query("SELECT to_regclass('hero_auction_victory_chest_intents') AS present")).rows[0]?.present;
  if(chestTable&&(await client.query('SELECT match_id FROM hero_auction_victory_chest_intents WHERE match_id=$1',[matchId])).rows.length)throw fail('Maç ödülü kesinleştirme aşamasında.');
  const updated=await client.query('UPDATE hero_auction_rooms SET state=$2::jsonb,updated_at=NOW() WHERE code=$1',[room.code,JSON.stringify(intent.room)]);
  if(updated.rowCount!==1)throw fail('Bağlantı sonucu kaydedilemedi.',503);
  await client.query('INSERT INTO hero_auction_social(id,state) VALUES($1,$2::jsonb)',[receiptKey,JSON.stringify({version:1,kind:'room-disconnect-forfeit-receipt',...intent,roomDigest:cancellationDigest(intent.room)})]);
  validateLive();commitIssued=true;await client.query('COMMIT');return{...intent,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});if(commitIssued||receiptObserved){error.uncertain=true;error.status=503}throw error}finally{client.release()}
}
