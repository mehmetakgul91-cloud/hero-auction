// Release control only. Never changes an economy feature, wallet or match result.
// Drain evidence covers this boot only: operators must separately confirm that
// no other old/new service instance is admitting players or retaining work.
import {randomUUID} from 'node:crypto';
export const MAINTENANCE_ROW='economy-maintenance';
const failure=(message,status=503)=>Object.assign(Error(message),{status});
function storedState(value){
 if(value===undefined||value===null)return{version:1,revision:0,paused:false,uncertainLegacyEntry:false};
 if(!value||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0||typeof value.paused!=='boolean'||typeof value.uncertainLegacyEntry!=='boolean')throw failure('Bakım kaydı doğrulanamadı.');
 return{version:1,revision:value.revision,paused:value.paused,uncertainLegacyEntry:value.uncertainLegacyEntry};
}
export function createPaidEntryMaintenance({bootPaused=false,bootId=randomUUID(),now=Date.now}={}){
 let database=null,loaded=false,durable=false,paused=bootPaused,confirmed=false,state=storedState(null),uncertain=false,queue=Promise.resolve(),controls=0;
 const startedAt=now();let pausedAt=paused?startedAt:null;
 const flights={admissions:0,goldWrites:0,socialWrites:0,roomBatches:0};
 function track(kind){if(!Object.hasOwn(flights,kind))throw Error('Unknown maintenance counter');flights[kind]++;let done=false;return()=>{if(!done){done=true;flights[kind]--}}}
 function assertOpen(){if(!loaded||paused||uncertain||controls>0)throw failure('Canlı maça yeni girişler bakım için geçici olarak duraklatıldı. Mevcut maçlar ve bilgisayar antrenmanı devam eder.');}
 async function initialize(db,{volatile=false}={}){
  database=db;
  if(!database){loaded=volatile;confirmed=volatile;return;}
  try{state=storedState((await database.query('SELECT state FROM hero_auction_social WHERE id=$1',[MAINTENANCE_ROW])).rows[0]?.state);uncertain=state.uncertainLegacyEntry;paused=bootPaused||state.paused||uncertain;pausedAt=paused?now():null;loaded=true;durable=true;confirmed=!paused||state.paused}
  catch(error){paused=true;loaded=false;confirmed=false;throw error}
 }
 async function write(nextPaused){
  if(!database||!loaded)throw failure('Kalıcı bakım kaydı kullanılamıyor.');
  const client=await database.connect();
  try{
   await client.query('BEGIN');
   await client.query("SELECT pg_advisory_xact_lock(hashtext('hero-economy-maintenance'))");
   const current=storedState((await client.query('SELECT state FROM hero_auction_social WHERE id=$1 FOR UPDATE',[MAINTENANCE_ROW])).rows[0]?.state);
   if(current.revision!==state.revision){
    // Same desired state safely reconciles an uncertain prior COMMIT response.
    if(current.paused===nextPaused&&current.uncertainLegacyEntry===uncertain){await client.query('COMMIT');state=current;confirmed=true;durable=true;return;}
    throw failure('Başka sunucu bakım kaydını değiştirdi. Yeni sunucu durumunu doğrulayın.',409);
   }
   const next={version:1,revision:current.revision+1,paused:nextPaused,uncertainLegacyEntry:current.uncertainLegacyEntry||uncertain};
   await client.query('INSERT INTO hero_auction_social(id,state) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state',[MAINTENANCE_ROW,JSON.stringify(next)]);
   await client.query('COMMIT');state=next;confirmed=true;durable=true;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});confirmed=false;throw error}finally{client.release()}
 }
 function serialized(work){controls++;const result=queue.then(work);queue=result.catch(()=>{});return result.finally(()=>controls--)}
 async function setPaused(value,expectedBootId,expectedRevision){
  if(expectedBootId!==bootId)throw failure('Sunucu yeniden başladı veya değişti. Durumu yenileyip yeniden onaylayın.',409);
  if(typeof value!=='boolean')throw failure('Geçersiz bakım isteği.',400);
  const assertRevision=()=>{if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==state.revision)throw failure('Bakım durumu değişti. Durumu yenileyip yeniden onaylayın.',409);};
  assertRevision();
  if(value){paused=true;pausedAt??=now();confirmed=false;} // Close admission before the first await.
  return serialized(async()=>{
   try{assertRevision();if(!value&&uncertain)throw failure('Belirsiz eski giriş işlemi incelenmeden yeni maçlar açılamaz.',409);await write(value);paused=value;pausedAt=value?(pausedAt??now()):null;return true}
   catch(error){paused=true;pausedAt??=now();confirmed=false;throw error}
  });
 }
 // Legacy chargeEntry has no durable debit receipt. Do not reconstruct it or
 // invent a rollback: fail closed and preserve a release blocker for review.
 function latchLegacyUncertainty(){
  uncertain=true;paused=true;pausedAt??=now();confirmed=false;
  return serialized(()=>write(true));
 }
 function status(counts={},databaseHealthy=false){
  const numeric={paidEntriesInFlight:flights.admissions,uncertainLegacyEntries:uncertain?1:0,goldFlushesInFlight:flights.goldWrites,roomFlushBatchesInFlight:flights.roomBatches,socialWritesInFlight:flights.socialWrites,controlWritesInFlight:controls};
  for(const key of ['activePaidMatches','unconfirmedSocialWrites','pendingGold','dirtyPaidRooms','paidRoomWritesInFlight','uncertainInvitations','pendingVictoryChests','victoryChestWritesInFlight'])numeric[key]=Number.isSafeInteger(counts[key])&&counts[key]>=0?counts[key]:null;
  const ready=paused&&loaded&&durable&&confirmed&&databaseHealthy&&Object.values(numeric).every(value=>value===0);
  return{version:1,bootId,startedAt,paused,pausedAt,revision:state.revision,persistenceConfirmed:durable&&confirmed,loaded,databaseHealthy,ready,...numeric};
 }
 return{initialize,setPaused,latchLegacyUncertainty,track,status,assertOpen,isPaused:()=>paused||!loaded||uncertain||controls>0,beginAdmission(){assertOpen();return track('admissions')}};
}
export function isUnsettledPaidRoom(room){return room?.mode!=='bot'&&room?.entryPaid===true&&(room.matchSettled!==true||room.battleSettlementPending===true||room.victoryChestPending===true)}
