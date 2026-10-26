// Existing-admin, exact-selection cancellation. No new schema, invented outcome,
// rank change, new wallet, or amount supplied by a client.
import {createHash} from 'node:crypto';
const error=(message,status=409)=>Object.assign(Error(message),{status});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])])):value;
export const cancellationDigest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function cancellationMatchId(room){
 if(!room||typeof room.code!=='string'||!/^\d{3}$/.test(room.code)||!Number.isSafeInteger(room.created)||room.created<=0||!Number.isSafeInteger(room.matchNumber??1)||(room.matchNumber??1)<1)throw error('Maç kimliği doğrulanamadı.');
 return room.code+':'+(room.matchNumber??1)+':'+room.created;
}
export const cancellationIdentity=room=>cancellationDigest(cancellationMatchId(room));
export function assertCancellableRoom(room){
 cancellationMatchId(room);
 if(room.mode==='bot'||room.entryPaid!==true||room.phase!=='finished'||room.matchSettled===true||room.battleSettlementPending!==true||room.cancelled||room.battleSync?.result||room.goldAward||room.goldRefunds?.length||room.victoryChestPending||room.victoryChestReceipt||room.victoryChestWinner!==undefined&&room.victoryChestWinner!==null||room.inviteJoining||room.inviteUncertain||room.joinPending)throw error('Bu maç iptal ve iade için uygun değil.');
 if(!Array.isArray(room.players)||room.players.length!==2||room.players.some(player=>typeof player?.accountId!=='string'||!player.accountId)||room.players[0].accountId===room.players[1].accountId)throw error('Ücretli iki oyuncu doğrulanamadı.');
}
export function cancellationCandidate(room,durableRoom){
 assertCancellableRoom(room);assertCancellableRoom(durableRoom);
 if(cancellationMatchId(room)!==cancellationMatchId(durableRoom))throw error('Kalıcı maç kimliği değişti.');
 const snapshot=structuredClone(room),durableDigest=cancellationDigest(durableRoom),id=cancellationIdentity(room);
 return{id,digest:cancellationDigest({snapshot,durableDigest}),room:snapshot,durableDigest};
}
export const publicCancellationCandidate=plan=>({id:plan.id,digest:plan.digest,lastActivity:plan.room.lastActivity||plan.room.created,refundGoldPerSeat:50,paidSeats:2});
export function normalizeCancellationSelections(selections){
 if(!Array.isArray(selections)||selections.length!==3||selections.some(value=>!value||!(/^[a-f0-9]{64}$/).test(value.id)||!(/^[a-f0-9]{64}$/).test(value.digest))||new Set(selections.map(value=>value.id)).size!==3)throw error('Tam olarak üç farklı doğrulanmış maç seçilmeli.',400);
 return selections.map(({id,digest})=>({id,digest})).sort((a,b)=>a.id.localeCompare(b.id));
}
export const cancellationReceiptKey=selections=>'paid-cancel-batch:'+cancellationDigest(normalizeCancellationSelections(selections));
export async function cancelPaidMatches({database,selections,plans,actorId,expectedRevision,validateLive=()=>{},now=Date.now}){
 const selected=normalizeCancellationSelections(selections),receiptKey=cancellationReceiptKey(selected);
 if(typeof actorId!=='string'||!actorId||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw error('Yönetici isteği doğrulanamadı.',400);
 const client=await database.connect();let commitIssued=false,receiptObserved=false;
 try{
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
  // Same lock as pause/resume: no other boot can reopen admission during commit.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('hero-economy-maintenance'))");
  const maintenance=(await client.query('SELECT state FROM hero_auction_social WHERE id=$1 FOR UPDATE',['economy-maintenance'])).rows[0]?.state;
  if(maintenance?.version!==1||maintenance.paused!==true||maintenance.uncertainLegacyEntry!==false||maintenance.revision!==expectedRevision)throw error('Kalıcı duraklatma veya sürüm değişti. Durumu yenileyin.');
  const previous=(await client.query('SELECT state FROM hero_auction_social WHERE id=$1',[receiptKey])).rows[0]?.state;
  if(previous){
   receiptObserved=true;
   if(previous.version!==1||previous.kind!=='paid-match-cancellation'||cancellationDigest(previous.selections)!==cancellationDigest(selected)||!Array.isArray(previous.rooms)||previous.rooms.length!==3)throw error('İade makbuzu doğrulanamadı.',503);
   const expectedAwards=[];
   for(const room of previous.rooms){
    const id=cancellationIdentity(room),item=selected.find(value=>value.id===id);
    if(!item||room.cancelled?.receiptKey!==receiptKey||room.cancelled?.matchId!==cancellationMatchId(room)||room.cancelled?.refundGoldPerSeat!==50||room.matchSettled!==true||room.battleSettlementPending!==false||!Array.isArray(room.goldRefunds)||room.goldRefunds.length!==2)throw error('İade odası makbuzu doğrulanamadı.',503);
    for(let seat=0;seat<2;seat++){
     const award={id:room.code+':refund:'+seat+':'+(room.matchNumber??1)+':'+room.created,accountId:room.players?.[seat]?.accountId,amount:50};
     if(!award.accountId||cancellationDigest(award)!==cancellationDigest(room.goldRefunds[seat]))throw error('İade tutarı doğrulanamadı.',503);
     expectedAwards.push(award);
    }
   }
   if(new Set(previous.rooms.map(cancellationIdentity)).size!==3)throw error('İade maçları doğrulanamadı.',503);
   const awards=(await client.query('SELECT award_id,account_id,amount FROM hero_auction_gold_awards WHERE award_id=ANY($1::text[])',[expectedAwards.map(award=>award.id)])).rows;
   if(awards.length!==6||expectedAwards.some(expected=>!awards.some(row=>row.award_id===expected.id&&row.account_id===expected.accountId&&Number(row.amount)===50)))throw error('Kalıcı iade kayıtları doğrulanamadı.',503);
   commitIssued=true;await client.query('COMMIT');return{result:{ok:true,replayed:true,cancelled:selected.map(item=>({id:item.id,refundGold:100})),refundGold:300},rooms:previous.rooms};
  }
  const chosen=selected.map(item=>{const plan=plans?.get(item.id);if(!plan||plan.digest!==item.digest)throw error('Önizleme değişti veya bu sunucuda bulunamadı. Yeni önizleme gerekli.');assertCancellableRoom(plan.room);return plan});
  validateLive(chosen);
  const accountIds=[...new Set(chosen.flatMap(plan=>plan.room.players.map(player=>player.accountId)))].sort();
  // Lock the existing wallets in canonical order, consistent with paid admission.
  const walletRows=(await client.query('SELECT account_id,gold FROM hero_auction_wallets WHERE account_id=ANY($1::text[]) ORDER BY account_id FOR UPDATE',[accountIds])).rows;
  if(walletRows.length!==accountIds.length)throw error('Önceden ücretlendirilmiş cüzdan doğrulanamadı.');
  const balances=new Map(walletRows.map(row=>[row.account_id,Number(row.gold)]));
  const codes=chosen.map(plan=>plan.room.code).sort();
  const roomRows=(await client.query('SELECT code,state FROM hero_auction_rooms WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[codes])).rows;
  const durableRooms=new Map(roomRows.map(row=>[row.code,row.state]));
  for(const plan of chosen){const durable=durableRooms.get(plan.room.code);assertCancellableRoom(durable);if(cancellationDigest(durable)!==plan.durableDigest)throw error('Kalıcı oda önizlemeden sonra değişti.');}
  const awardIds=chosen.flatMap(plan=>{const r=plan.room;return[cancellationMatchId(r),...r.players.map((_,seat)=>r.code+':refund:'+seat+':'+(r.matchNumber??1)+':'+r.created)]});
  if((await client.query('SELECT award_id,account_id,amount FROM hero_auction_gold_awards WHERE award_id=ANY($1::text[])',[awardIds])).rows.length)throw error('Bu maçlardan biri için ödül veya iade kaydı zaten var.');
  const hasChestTable=(await client.query("SELECT to_regclass('public.hero_auction_victory_chest_intents') IS NOT NULL AS present")).rows[0]?.present;
  if(hasChestTable&&(await client.query('SELECT match_id FROM hero_auction_victory_chest_intents WHERE match_id=ANY($1::text[])',[chosen.map(plan=>cancellationMatchId(plan.room))])).rows.length)throw error('Bu maçlardan biri için sandık işlemi var.');
  validateLive(chosen);
  const at=now(),closed=[];
  for(const plan of chosen){
   const room=structuredClone(plan.room),matchId=cancellationMatchId(room),refunds=[];
   for(let seat=0;seat<2;seat++){
    const accountId=room.players[seat].accountId,before=balances.get(accountId);
    if(!Number.isSafeInteger(before)||before<0||before>2147483647-50)throw error('İade bakiyesi güvenle kaydedilemiyor.');
    const awardId=room.code+':refund:'+seat+':'+(room.matchNumber??1)+':'+room.created;
    const inserted=await client.query('INSERT INTO hero_auction_gold_awards(award_id,account_id,amount) VALUES($1,$2,50) ON CONFLICT DO NOTHING RETURNING award_id',[awardId,accountId]);
    if(inserted.rowCount!==1)throw error('İade kaydı eşzamanlı değişti.');
    await client.query('UPDATE hero_auction_wallets SET gold=gold+50 WHERE account_id=$1',[accountId]);
    await client.query('INSERT INTO hero_auction_admin_audit(account_id,actor_id,action,old_gold,new_gold) VALUES($1,$2,$3,$4,$5)',[accountId,actorId,'cancel_paid_match:'+matchId,before,before+50]);
    balances.set(accountId,before+50);refunds.push({id:awardId,accountId,amount:50});
   }
   // A cancellation is not a draw. Preserve all history, teams, series and rank.
   room.matchSettled=true;room.battleSettlementPending=false;room.victoryChestPending=false;room.goldRefunds=refunds;
   room.cancelled={kind:'admin-entry-refund',at,receiptKey,matchId,refundGoldPerSeat:50};
   room.deadline=null;room.turn=null;
   await client.query('UPDATE hero_auction_rooms SET state=$2::jsonb,updated_at=NOW() WHERE code=$1',[room.code,JSON.stringify(room)]);closed.push(room);
  }
  validateLive(chosen);
  const result={ok:true,replayed:false,cancelled:chosen.map(plan=>({id:plan.id,refundGold:100})),refundGold:300};
  const receipt={version:1,kind:'paid-match-cancellation',selections:selected,result,rooms:closed,actorId,at};
  await client.query('INSERT INTO hero_auction_social(id,state) VALUES($1,$2::jsonb)',[receiptKey,JSON.stringify(receipt)]);
  commitIssued=true;await client.query('COMMIT');return{result,rooms:closed};
 }catch(cause){await client.query('ROLLBACK').catch(()=>{});if(commitIssued||receiptObserved){const uncertain=error('İptal işleminin sonucu henüz doğrulanamadı. Aynı seçimi yeniden doğrulayın.',503);uncertain.uncertain=true;throw uncertain}throw cause}
 finally{client.release()}
}
