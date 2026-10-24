import {buildDefaultFormation,validateFormation} from './public/preparation-formation.js';
import {COMMANDER_CHANGE_COST} from './public/commander-economy.js';
import {requireModerationForInteraction} from './moderation-availability.js';
import {createModerationService,assertModeratedText} from './moderation-service.js';
import {chooseBotBid,chooseBotFormation,chooseBotCommander,chooseBotCast,createBotCommanderProfile} from './bot-strategy.js';
import {selectAuctionCards,rarityForPower} from './auction-card-pool.js';
import {auctionRevealSnapshot,recordTailAward} from './auction-reveal-events.js';
import {crazyGamesSource} from './crazygames-build.js';
import {serveStaticAudio} from './static-audio.js';
import {verifyCrazyGamesToken} from './crazygames-auth.js';
import http from 'node:http';
import {createFriendsService} from './friends-service.js';
import {createRoomInvites} from './room-invites.js';
import {awardUnbidCard} from './auction-passes.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {simulateRosterBattle,battleRoster} from './battle-roster.js';
import {createCommanderProfile,validateCommanderProfile,resolveCommander,previewCommanderUpgrade,commanderLevelCap,commanderUpgradeCost,COMMANDER_STATS} from './arena-commanders.js';
import {auctionRoomToBattleState,prepareBattleTeams} from './battle-match.js';
import {createRoomCommanderSession,submitRoomCommanderTurn,viewRoomCommanderSession} from './commander-room-bridge.js';
import {createLiveCommanderAbilities,viewLiveCommanderAbilities} from './commander-live-abilities.js';
import {deriveLiveArenaRoomBinding,verifyLiveArenaRoomBinding} from './commander-live-room-binding.js';
import {createLiveArenaLifecycle} from './commander-live-arena-lifecycle.js';
import {prepareLiveArenaTeams} from './commander-live-team-preparation.js';
import {createLiveCommanderCombat} from './commander-live-combat.js';
import {isLiveCommanderApiAvailable} from './commander-live-api-access.js';
import {settleLiveBattle} from './live-battle-settlement.js';
import {orientBattleSummary} from './public/battle-summary-data.js';
import {createArena3dDemo} from './arena-3d-demo.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000);
const GOOGLE_CLIENT_ID=process.env.GOOGLE_CLIENT_ID||'742640702245-3e3t9m7t29fbqlkubpcqtso63l8v8bv6.apps.googleusercontent.com';
const ADMIN_GOOGLE_EMAIL=String(process.env.ADMIN_GOOGLE_EMAIL||'').trim().toLowerCase();
const authSecret=process.env.AUTH_SIGNING_SECRET?Buffer.from(process.env.AUTH_SIGNING_SECRET,'hex'):crypto.randomBytes(32);
function signLogin(user){const data=Buffer.from(JSON.stringify({sub:user.sub,name:user.name,email:user.email||null,expires:Date.now()+86400000})).toString('base64url');const sig=crypto.createHmac('sha256',authSecret).update(data).digest('base64url');return data+'.'+sig}
function readLogin(value){try{const [data,sig]=String(value||'').split('.');if(!data||!sig)return null;const expected=crypto.createHmac('sha256',authSecret).update(data).digest();const received=Buffer.from(sig,'base64url');if(expected.length!==received.length||!crypto.timingSafeEqual(expected,received))return null;const user=JSON.parse(Buffer.from(data,'base64url').toString());return user.expires>Date.now()?user:null}catch{return null}}
function chosenName(body,fallback){return readLogin(body.authToken)?.name||String(body.name||fallback).trim().slice(0,24)}
const rooms=new Map();
// Experimental commander turn endpoint; disabled unless explicitly enabled in a test environment.
const commanderTurnSessions=new Map();
const liveCommanderAbilitySessions=new Map();
const commanderTurnApiEnabled=process.env.EXPERIMENTAL_COMMANDER_TURNS==='1';
const liveArenaLifecycle=createLiveArenaLifecycle({intervalMs:900,onError:(e,key)=>console.error('Live arena stopped:',key,e.message),onFinish:(snapshot,key)=>{
 const room=rooms.get(key.split(':')[0]);
 if(settleLiveBattle(room,key,snapshot,settleFinishedMatch))publish(room);
}});
const liveArenaMatchKeys=new Map();
// Match-scoped training opponents: no account progression or extra auction heroes.
const lastBotCommanders=new Map();
function assignBotCommander(room){
 const accountId=room.players[0]?.accountId;
 const previous=room.botCommander?.commanderId||lastBotCommanders.get(accountId);
 room.botCommander=chooseBotCommander(previous,Math.random,room.difficulty);
 // Concurrent training rooms must not make a rematch repeat its own commander either.
 if(room.botCommander.commanderId===lastBotCommanders.get(accountId))room.botCommander=createBotCommanderProfile(COMMANDER_STATS.find(id=>id!==previous&&id!==lastBotCommanders.get(accountId)),room.difficulty);
 if(accountId){lastBotCommanders.delete(accountId);lastBotCommanders.set(accountId,room.botCommander.commanderId);}
 while(lastBotCommanders.size>2000)lastBotCommanders.delete(lastBotCommanders.keys().next().value);
 room.botBattle=null;
}
function tickBotBattle(room){
 const key=liveArenaMatchKeys.get(room.code),state=room.botBattle;
 if(room.mode!=='bot'||!key||!state||room.matchSettled)return;
 const now=Date.now(),token=room.players[1].token;
 try{
  // The bot sees exactly its authenticated snapshot, including only its own energy.
  const snapshot=liveArenaLifecycle.snapshot({matchKey:key,token,now});
  const action=chooseBotCast(snapshot,room.botCommander.commanderId,room.difficulty||'medium',{now,lastCastAt:state.lastCastAt,startedAt:state.startedAt,side:1});
  if(!action)return;
  liveArenaLifecycle.cast({matchKey:key,token,...action,requestId:'bot-cast-'+(++state.sequence),now});
  state.lastCastAt=now;
 }catch(e){console.error('Bot commander action:',key,e.message)}
}
// Standalone preview only: temporary, non-persistent guest credits without a database.
const previewGuestWallets=new Map();
const previewCommanderProfiles=new Map();
const previewGuestMode=process.env.COMMANDER_TEST_GUEST_MODE==='1';
const artCache=new Map();
const threeAssetCache=new Map();
let arena3dDemo=null;

const listeners=new Map();
const waiting=new Map();
const onlineVisitors=new Map();
const database=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000}):null;
// Rewarded advertising remains disabled until an approved, verifiable provider is integrated.
const REWARDED_AD_DAILY_LIMIT=5;
const REWARDED_AD_GOLD=100;
const MATCH_WIN_GOLD=120;
const rewardedAdsEnabled=false;
const dirtyRooms=new Set();
const pendingGold=new Map();
const matchRecords=new Map();
const roomInvites=createRoomInvites();
const activeSeats=new Map();
const roomFlushes=new Map();
const friends=createFriendsService({persist:()=>saveSocial(true),profile:id=>profileOf(id),canInteract:(a,b)=>moderationReady&&!moderation.blocked(a,b)});
let socialSaveQueue=Promise.resolve();
const ratings=new Map();
const rankedTier=n=>n>=1800?'Efsane':n>=1500?'Elmas':n>=1250?'Altın':n>=1050?'Gümüş':'Bronz';
const profileOf=id=>{const p=ratings.get(id)||{rating:1000,wins:0,losses:0,draws:0,name:'Oyuncu'};return {...p,tier:rankedTier(p.rating),matches:p.wins+p.losses+p.draws};};
async function saveSocial(strict=false){
 if(!database)return;
 // Match writes share the friendship transaction queue: never persist tentative links
 // while a failed friend write is still awaiting its in-memory rollback.
 if(!strict)return friends.afterMutations(()=>saveSocial(true)).catch(e=>console.error('Social persistence:',e.message));
 if(!databaseReady){if(strict)error('Arkadaş sistemi geçici olarak kullanılamıyor.',503);return}
 const run=socialSaveQueue.then(()=>database.query('INSERT INTO hero_auction_social(id,state) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET state=$2',['global',JSON.stringify({ratings:[...ratings],matches:[...matchRecords],friendships:friends.snapshot(),roomInvites:roomInvites.snapshot(),activeSeats:[...activeSeats]})]));
 socialSaveQueue=run.catch(()=>{});
 try{await run}catch(e){console.error('Social persistence:',e.message);if(strict)error('Arkadaş değişikliği kaydedilemedi. Tekrar dene.',503)}
}
function recordMatch(r,scores){const id=r.code+':'+(r.matchNumber||1)+':'+r.created;if(matchRecords.has(id))return;const winner=scores[0]===scores[1]?-1:scores[0]>scores[1]?0:1;const participants=r.players.map((p,i)=>({id:p.accountId||null,name:p.name,score:scores[i]}));const before=r.players.map(p=>p.accountId?profileOf(p.accountId):null);const ranked=r.mode!=='bot'&&before.every(Boolean);const deltas=ranked?before.map((p,i)=>{const opponent=before[1-i];const expected=1/(1+Math.pow(10,(opponent.rating-p.rating)/400));const actual=winner<0?0.5:winner===i?1:0;return Math.round(32*(actual-expected))}):[0,0];r.rankChange=ranked?deltas:[0,0];r.rankBefore=before.map(p=>p?.rating??null);matchRecords.set(id,{id,at:Date.now(),mode:r.mode,universe:r.universe,participants,winner,rankChange:r.rankChange});for(let i=0;i<2;i++){const p=r.players[i];if(!p.accountId)continue;const prev=before[i];const next={...prev,name:p.name,wins:prev.wins+(winner===i?1:0),losses:prev.losses+(winner>=0&&winner!==i?1:0),draws:prev.draws+(winner<0?1:0)};if(ranked)next.rating=Math.max(0,prev.rating+deltas[i]);ratings.set(p.accountId,next)}while(matchRecords.size>2000)matchRecords.delete(matchRecords.keys().next().value);void saveSocial()}

let moderationReady=!database;
const moderation=createModerationService({
 resolvePlayer:id=>friends.accountFor(id),publicPlayer:id=>friends.publicPlayer(id),
 isAdmin:user=>Boolean(user&&ADMIN_GOOGLE_EMAIL&&user.email===ADMIN_GOOGLE_EMAIL&&!user.sub.startsWith('guest:')),
 persist:async state=>{if(database){if(!databaseReady||!moderationReady)error('Denetim sistemi kullanılamıyor.',503);try{await database.query({text:'INSERT INTO hero_auction_moderation(id,state) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET state=$2',values:['global',JSON.stringify(state)],query_timeout:5000})}catch(e){moderationReady=false;console.error('Moderation persistence unresolved; peer interactions paused until reload.');throw e}}},
 evidence:(actor,target,context)=>{
  const r=rooms.get(String(context.code||''));
  if(r&&r.players.some(p=>p?.accountId===actor&&p.token===context.token)&&r.players.some(p=>p?.accountId===target))return{kind:'room',code:r.code,created:r.created,names:r.players.map(p=>p?.name||''),chat:(r.chat||[]).slice(-20).map(({seat,name,message,time})=>({seat,name,message,time}))};
  const state=friends.state(actor),playerId=friends.playerId(target);
  if([...state.friends,...state.incoming,...state.outgoing].some(p=>p.playerId===playerId))return{kind:'friend',playerId,name:friends.publicPlayer(target)?.name};
  return null;
 }
});
async function moderationApi(url,b){
 const user=readLogin(b.authToken);if(!user)error('Giriş gerekli.',401);
 if(!moderationReady||database&&!databaseReady)error('Denetim sistemi kullanılamıyor.',503);
 if(url==='/api/moderation/state')return moderation.state(user.sub);
 if(url==='/api/moderation/block')return friends.afterMutations(async()=>{const result=await moderation.block(user.sub,b.playerId);for(const r of rooms.values())if(r.players.some(p=>p?.accountId===user.sub))publish(r);return result});
 if(url==='/api/moderation/unblock')return moderation.unblock(user.sub,b.playerId);
 if(url==='/api/moderation/report')return moderation.report(user.sub,b);
 error('Bilinmeyen denetim işlemi.',404);
}

async function initializeModeration(){
 if(!database)return;
 try{
  await database.query({text:'CREATE TABLE IF NOT EXISTS hero_auction_moderation(id TEXT PRIMARY KEY,state JSONB NOT NULL)',query_timeout:5000});
  const found=await database.query({text:'SELECT state FROM hero_auction_moderation WHERE id=$1',values:['global'],query_timeout:5000});
  if(found.rows[0])moderation.restore(found.rows[0].state);
  moderationReady=true;console.log('Moderation storage ready');
 }catch(e){moderationReady=false;console.error('Moderation storage unavailable:',e.message)}
}

let databaseReady=false;
function markRoom(r){if(database&&r)dirtyRooms.add(r.code)}
async function initializeDatabase(){if(!database)return;try{await database.query('CREATE TABLE IF NOT EXISTS hero_auction_rooms (code VARCHAR(3) PRIMARY KEY, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_wallets (account_id TEXT PRIMARY KEY, gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0))');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_user_profiles(account_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_admin_accounts (account_id TEXT PRIMARY KEY, banned BOOLEAN NOT NULL DEFAULT false)');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_admin_audit (id BIGSERIAL PRIMARY KEY, account_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, old_gold INTEGER, new_gold INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_commanders (account_id TEXT PRIMARY KEY, profile JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_invite_joins (invite_id TEXT PRIMARY KEY, state JSONB NOT NULL)');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_social (id TEXT PRIMARY KEY, state JSONB NOT NULL)');const social=await database.query('SELECT state FROM hero_auction_social WHERE id=$1',['global']);if(social.rows[0]){const state=social.rows[0].state;for(const [k,v] of state.ratings||[])ratings.set(k,v);for(const [k,v] of state.matches||[])matchRecords.set(k,v);roomInvites.restore(state.roomInvites);for(const [id,seat] of state.activeSeats||[])activeSeats.set(id,seat);if(state.friendships)friends.restore(state.friendships);else friends.migrate(state.friends||[],ratings)}await database.query('CREATE TABLE IF NOT EXISTS hero_auction_gold_awards (award_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, amount INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_rewarded_claims (provider_event_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, reward_day DATE NOT NULL, amount INTEGER NOT NULL CHECK(amount=100), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE INDEX IF NOT EXISTS hero_auction_rewarded_claims_account_day ON hero_auction_rewarded_claims(account_id,reward_day)');const result=await database.query('SELECT code,state FROM hero_auction_rooms');for(const row of result.rows){const r=row.state;if(r&&r.code===row.code&&r.players&&r.cards){rooms.set(row.code,r);if(r.phase==='finished'&&r.goldAward)queueGoldAward(r);if(r.phase==='finished'&&r.goldRefunds)for(const a of r.goldRefunds)pendingGold.set(a.id,a);if(r.phase==='matching'&&!r.players[1])waiting.set(row.code,{code:row.code,universe:r.universe,created:r.created})}}const legacySeats=new Map();for(const r of [...rooms.values()].sort((a,b)=>b.created-a.created))r.players.forEach((p,seat)=>{if(p?.accountId&&!activeSeats.has(p.accountId)){const all=legacySeats.get(p.accountId)||[];all.push({code:r.code,created:r.created,matchNumber:r.matchNumber||1,seat,unsettled:r.phase==='auction'||(r.phase==='finished'&&!r.matchSettled)});legacySeats.set(p.accountId,all)}});for(const [id,all] of legacySeats)activeSeats.set(id,all.filter(p=>p.unsettled).length>1?{ambiguous:true}:all.find(p=>p.unsettled)||all[0]);for(const [id,pointer] of activeSeats){const newer=[...rooms.values()].some(r=>r.players.some(p=>p?.accountId===id)&&(r.phase==='auction'||(r.phase==='finished'&&!r.matchSettled))&&(r.created>(pointer?.created??pointer?.at??0)||(r.code===pointer?.code&&r.created===pointer?.created&&(r.matchNumber||1)!==pointer?.matchNumber)));if(newer)activeSeats.set(id,{ambiguous:true})}friends.seed([...ratings].map(([id,p])=>[id,p.name]));friends.seed([...rooms.values()].flatMap(r=>r.players.filter(p=>p?.accountId).map(p=>[p.accountId,p.name])));databaseReady=true;await initializeModeration();await saveSocial(true);console.log('PostgreSQL connected; restored',rooms.size,'rooms')}catch(e){databaseReady=false;console.error('PostgreSQL initialization failed:',e.message)}}
async function flushRooms(){if(!database||!databaseReady||!dirtyRooms.size)return;const codes=[...dirtyRooms];dirtyRooms.clear();for(const code of codes){const r=rooms.get(code);if(r?.inviteJoining){dirtyRooms.add(code);continue}try{if(r){const write=database.query('INSERT INTO hero_auction_rooms(code,state,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(code) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()',[code,JSON.stringify(r)]);roomFlushes.set(code,write);try{await write}finally{if(roomFlushes.get(code)===write)roomFlushes.delete(code)}}else await database.query('DELETE FROM hero_auction_rooms WHERE code=$1',[code])}catch(e){dirtyRooms.add(code);console.error('Room persistence error:',e.message)}}}

function queueGoldAward(r){const a=r.goldAward;if(a&&a.accountId&&a.id)pendingGold.set(a.id,a)}
async function goldBalance(accountId){if(previewGuestMode&&!databaseReady){if(!previewGuestWallets.has(accountId))previewGuestWallets.set(accountId,500);return previewGuestWallets.get(accountId)}if(!database||!databaseReady)error('Altın sistemi geçici olarak kullanılamıyor.',503);await database.query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,500) ON CONFLICT DO NOTHING',[accountId]);const result=await database.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1',[accountId]);return Number(result.rows[0]?.gold||0)}
async function rewardedAdStatus(accountId){
  if(!database||!databaseReady)return {enabled:false,rewardGold:REWARDED_AD_GOLD,dailyLimit:REWARDED_AD_DAILY_LIMIT,remaining:0,message:'Reklam ödülleri için veritabanı bağlantısı bekleniyor.'};
  const result=await database.query("SELECT COUNT(*)::int AS used FROM hero_auction_rewarded_claims WHERE account_id=$1 AND reward_day=(NOW() AT TIME ZONE 'UTC')::date",[accountId]);
  const used=Number(result.rows[0]?.used||0);
  return {enabled:rewardedAdsEnabled,rewardGold:REWARDED_AD_GOLD,dailyLimit:REWARDED_AD_DAILY_LIMIT,used,remaining:rewardedAdsEnabled?Math.max(0,REWARDED_AD_DAILY_LIMIT-used):0,message:'Google reklam onayı ve güvenli ödül doğrulaması bekleniyor.'};
}
// Only call this from a future TRUSTED provider-verification handler.
// Never expose it to the browser, and never trust a client-supplied event ID.
async function applyVerifiedReward(accountId,providerEventId){
  if(!rewardedAdsEnabled)error('Ödüllü reklamlar henüz etkin değil.',503);
  if(!database||!databaseReady)error('Altın sistemi geçici olarak kullanılamıyor.',503);
  if(!accountId||!providerEventId||typeof providerEventId!=='string'||providerEventId.length>200)error('Geçersiz reklam ödülü.',400);
  const client=await database.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[accountId]);
    const duplicate=await client.query('SELECT account_id FROM hero_auction_rewarded_claims WHERE provider_event_id=$1',[providerEventId]);
    if(duplicate.rowCount){await client.query('ROLLBACK');return {credited:false,reason:'duplicate'};}
    const count=await client.query("SELECT COUNT(*)::int AS used FROM hero_auction_rewarded_claims WHERE account_id=$1 AND reward_day=(NOW() AT TIME ZONE 'UTC')::date",[accountId]);
    if(Number(count.rows[0].used)>=REWARDED_AD_DAILY_LIMIT){await client.query('ROLLBACK');return {credited:false,reason:'daily_limit'};}
    await client.query("INSERT INTO hero_auction_rewarded_claims(provider_event_id,account_id,reward_day,amount) VALUES($1,$2,(NOW() AT TIME ZONE 'UTC')::date,$3)",[providerEventId,accountId,REWARDED_AD_GOLD]);
    await client.query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET gold=hero_auction_wallets.gold+EXCLUDED.gold',[accountId,REWARDED_AD_GOLD]);
    await client.query('COMMIT');
    return {credited:true,amount:REWARDED_AD_GOLD};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}
async function chargeEntry(accountIds,matchId){const ids=[...new Set(accountIds.filter(Boolean))];if(ids.length!==accountIds.filter(Boolean).length)error('Aynı hesap iki oyuncu olarak katılamaz.');if(previewGuestMode&&!databaseReady){const before=new Map(ids.map(id=>[id,previewGuestWallets.get(id)??500]));if([...before.values()].some(gold=>gold<50))error('Maça katılmak için en az 50 altın gerekli.');for(const [id,gold] of before)previewGuestWallets.set(id,gold-50);return true}if(!database||!databaseReady)error('Altın sistemi şu anda kullanılamıyor.',503);const client=await database.connect();try{await client.query('BEGIN');for(const id of ids.sort()){await client.query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,500) ON CONFLICT DO NOTHING',[id]);const paid=await client.query('UPDATE hero_auction_wallets SET gold=gold-50 WHERE account_id=$1 AND gold>=50 RETURNING gold',[id]);if(!paid.rowCount)error('Maça katılmak için en az 50 altın gerekli.')}await client.query('COMMIT');return true}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}}
async function flushGold(){if(!database||!databaseReady)return;for(const [id,a] of [...pendingGold]){const client=await database.connect().catch(()=>null);if(!client)break;try{await client.query('BEGIN');const inserted=await client.query('INSERT INTO hero_auction_gold_awards(award_id,account_id,amount) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING award_id',[id,a.accountId,a.amount]);if(inserted.rowCount){await client.query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET gold=hero_auction_wallets.gold+$2',[a.accountId,a.amount])}await client.query('COMMIT');pendingGold.delete(id)}catch(e){await client.query('ROLLBACK').catch(()=>{});console.error('Gold reward error:',e.message)}finally{client.release()}}}
function onlineStats(){
 const now=Date.now();
 for(const [id,p] of onlineVisitors)if(now-p.seen>45000)onlineVisitors.delete(id);
 const activeRooms=new Set(),waitingRooms=new Set();
 for(const p of onlineVisitors.values()){
  if(!p.code)continue;
  const r=rooms.get(p.code);
  if(!r)continue;
  if(r.phase==='auction')activeRooms.add(r.code);
  else if(['waiting','matching'].includes(r.phase))waitingRooms.add(r.code);
 }
 return {players:onlineVisitors.size,matches:activeRooms.size,waiting:waitingRooms.size};
}

const stablePower=id=>battleRoster.find(hero=>hero.id===id)?.proposedPower||70;
const liveBattleIds=new Set(battleRoster.map(x=>x.id));
function newCards(universe){
 const eligible=[...catalogue.values()].filter(x=>liveBattleIds.has(x.id)&&(universe==='mixed'||x.universe===universe));
 return selectAuctionCards(eligible,{shuffle,powerFor:stablePower});
}
// Only original Hero Auction characters are part of the active catalogue.
const catalogue=new Map(battleRoster.filter(hero=>hero.universe==='original').map(hero=>[hero.id,{id:hero.id,name:hero.name,universe:hero.universe,role:hero.role,rarity:hero.rarity,portrait:hero.portrait}]));
const rand=n=>crypto.randomInt(n);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const code=()=>String(crypto.randomInt(100,1000));
const token=()=>crypto.randomBytes(24).toString('hex');
const publicRoom=(r,seat)=>({...auctionRevealSnapshot(r),code:r.code,universe:r.universe,phase:r.phase,round:r.round,turn:r.turn,deadline:r.deadline||null,series:r.series||[0,0],rematch:r.rematch||[false,false],mode:r.mode||"friend",difficulty:r.mode==='bot'?(r.difficulty||'medium'):null,rankChange:r.phase==='finished'?(r.rankChange||[0,0]):null,rankBefore:r.phase==='finished'?(r.rankBefore||[null,null]):null,topBid:r.topBid,topSeat:r.topSeat,history:r.history,chat:(r.chat||[]).filter(message=>moderationReady&&seat>=0&&!moderation.blocked(r.players[seat]?.accountId,r.players[message.seat]?.accountId)),players:r.players.map((p,i)=>p?{name:p.name,credits:p.credits,team:p.team.map(x=>({name:x.name,universe:x.universe,cost:x.cost,rarity:rarityForPower(x.power)})),connected:true,seat:i,playerId:seat>=0&&p.accountId?friends.playerId(p.accountId):null}:null),card:r.phase==='auction'?{name:r.cards[r.round].name,universe:r.cards[r.round].universe,rarity:rarityForPower(r.cards[r.round].power)}:null,final:r.phase==='finished'?r.players.map(p=>({name:p.name,score:Math.round(p.team.reduce((a,c)=>a+c.power,0)*(1+p.credits*0.01)*100)/100,credits:p.credits,team:p.team.map(c=>({name:c.name,universe:c.universe,cost:c.cost,power:c.power,rarity:rarityForPower(c.power)}))})):null,me:seat,catalogueCount:catalogue.size});
function publish(r){r.revision=(Number.isSafeInteger(r.revision)?r.revision:0)+1;markRoom(r);for(const client of listeners.get(r.code)||[]){try{client.res.write(`data: ${JSON.stringify(publicRoom(r,client.seat))}\n\n`)}catch{}}}
function log(r,msg){r.history.push(msg);if(r.history.length>30)r.history.shift();}
function forcedCardCost(card){return ({common:2,advanced:3,rare:4,legendary:5})[rarityForPower(card.power)]||2}
function finishUnbidCard(r){const {seat,card,cost}=awardUnbidCard(r,forcedCardCost);log(r,`${r.players[seat].name} ${card.name} karakterini iki pas sonrası ${cost} krediye aldı.`);advanceRound(r)}
function advanceRound(r){
 r.deadline=null;
 r.tailAwards??=[];
 while(r.round<10){
  const open=r.players.map((p,i)=>p.team.length<5?i:-1).filter(i=>i>=0);
  if(!open.length)break;
  if(open.length===1){
   const seat=open[0],card=r.cards[r.round],cost=forcedCardCost(card);
   r.players[seat].credits-=cost;
   r.players[seat].team.push({...card,cost});
   recordTailAward(r,seat,card,cost);
   log(r,`${r.players[seat].name} ${card.name} karakterini zorunlu alımda ${cost} krediye aldı.`);
   r.round++;continue;
  }
  const funded=open.filter(i=>r.players[i].credits>0);
  if(!funded.length){
   const seat=open.reduce((best,i)=>best<0||r.players[i].team.length<r.players[best].team.length?i:best,-1);
   const card=r.cards[r.round],cost=forcedCardCost(card);
   r.players[seat].credits-=cost;r.players[seat].team.push({...card,cost});
   recordTailAward(r,seat,card,cost);
   log(r,`${r.players[seat].name} ${card.name} karakterini ${cost} krediye aldı (eksi bakiye uygulanabilir).`);
   r.round++;continue;
  }
  if(funded.length===1){
   const seat=funded[0],card=r.cards[r.round],cost=forcedCardCost(card);
   r.players[seat].credits-=cost;r.players[seat].team.push({...card,cost});
   recordTailAward(r,seat,card,cost);
   log(r,`${r.players[seat].name} ${card.name} karakterini ${cost} krediye aldı.`);
   r.round++;continue;
  }
  r.topBid=0;r.topSeat=null;r.openingPassSeat=null;
  r.turn=funded.includes(r.round%2)?r.round%2:funded[0];
  r.deadline=Date.now()+20000;
  log(r,`${r.round+1}. kart açıldı. İlk teklif: ${r.players[r.turn].name}`);
  return;
 }
 endGame(r);log(r,'Açık artırma tamamlandı.');
}
function settleFinishedMatch(r,winner,scores){
 if(r.matchSettled)return;
 if(r.phase!=='finished')throw Error('Match must finish before settlement');
 if(winner!==null&&winner!==0&&winner!==1)throw Error('Invalid match winner');
 r.matchSettled=true;
 const rankedScores=winner===null?[0,0]:winner===0?[1,0]:[0,1];
 recordMatch(r,rankedScores);
 if(winner!==null){
  r.series[winner]++;
  const accountId=r.players[winner].accountId;
  if(accountId&&r.entryPaid&&r.mode!=='bot'){
   r.goldAward={id:r.code+':'+(r.matchNumber||1)+':'+(r.created||0),accountId,amount:MATCH_WIN_GOLD};queueGoldAward(r);
   log(r,`🏆 Savaşı kazanan oyuncu ${MATCH_WIN_GOLD} altın kazandı!`);
  }
 }else if(r.entryPaid&&r.mode!=='bot'){
  for(let i=0;i<2;i++){
   const accountId=r.players[i].accountId;
   if(accountId){const award={id:r.code+':refund:'+i+':'+(r.matchNumber||1)+':'+(r.created||0),accountId,amount:50};pendingGold.set(award.id,award);(r.goldRefunds??=[]).push(award)}
  }
 }
 markRoom(r);
}
function endGame(r){
 if(r.phase==='finished')return;
 r.phase='finished';r.turn=null;r.deadline=null;r.topBid=0;r.topSeat=null;
 // Real-player five-card auctions must be decided by the authoritative 2.0 battle.
 // Unsupported rosters retain the classic scoring path until the adapter supports them.
 if(r.players.every(p=>p?.team?.length===5)){
  try{prepareBattleTeams(auctionRoomToBattleState(r));r.battleSettlementPending=true;markRoom(r);return}
  catch(e){log(r,'2.0 savaş havuzu desteklenmiyor; klasik sonuç uygulanıyor.')}
 }
 const scores=r.players.map(p=>Math.round(p.team.reduce((sum,c)=>sum+c.power,0)*(1+p.credits*0.01)*100)/100);
 const winner=scores[0]===scores[1]?null:scores[0]>scores[1]?0:1;
 settleFinishedMatch(r,winner,scores);
}

function finishAuction(r){
  const winner=r.topSeat,price=r.topBid,card=r.cards[r.round];
  if(winner===null||price<1)error('Kazanan teklif yok.');
  if(r.players[winner].team.length>=5)error('Takımında zaten 5 kahraman var.');
  r.players[winner].credits-=price;
  r.players[winner].team.push({...card,cost:price});
  log(r,`${r.players[winner].name} ${card.name} karakterini ${price} krediye kazandı.`);
  r.round++;r.topBid=0;r.topSeat=null;
  advanceRound(r);
}
function error(message,status=400){const e=new Error(message);e.status=status;throw e}
function authorize(body){const r=rooms.get(String(body.code||'').toUpperCase());if(!r)error('Oda bulunamadı.',404);const seat=r.players.findIndex(p=>p&&p.token===body.token);if(seat<0||r.players[seat].accountId!==readLogin(body.authToken)?.sub)error('Oyuncu yetkisi geçersiz.',403);return{r,seat}}
async function rememberDisplayName(user){if(user?.name){try{user.name=assertModeratedText(user.name,{kind:'name'})}catch{user.name='Oyuncu'}}if(user?.sub&&(!database||databaseReady))await friends.register(user.sub,user.name);if(database&&databaseReady&&user?.sub&&user?.name)await database.query('INSERT INTO hero_auction_user_profiles(account_id,display_name) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=NOW()',[user.sub,user.name]);}
async function adminApi(url,b){
 const user=readLogin(b.authToken);
 if(!user||!ADMIN_GOOGLE_EMAIL||user.email!==ADMIN_GOOGLE_EMAIL||user.sub.startsWith('guest:'))error('Yönetici yetkisi gerekli.',403);
 if(!database||!databaseReady)error('Veritabanı kullanılamıyor.',503);
 if(url==='/api/admin/moderation/list'||url==='/api/admin/moderation/review'){if(!moderationReady)error('Denetim sistemi geçici olarak kullanılamıyor.',503);return url.endsWith('/list')?moderation.adminList(user):moderation.review(user,b)}
 if(url==='/api/admin/list'){
  const search=String(b.search||'').slice(0,100);
  const rows=await database.query("SELECT w.account_id,COALESCE(p.display_name,w.account_id) AS display_name,w.gold,COALESCE(a.banned,false) AS banned FROM hero_auction_wallets w LEFT JOIN hero_auction_admin_accounts a ON a.account_id=w.account_id LEFT JOIN hero_auction_user_profiles p ON p.account_id=w.account_id WHERE ($1='' OR w.account_id ILIKE '%'||$1||'%' OR p.display_name ILIKE '%'||$1||'%') ORDER BY p.display_name NULLS LAST,w.account_id LIMIT 200",[search]);
  const accounts=rows.rows.map(row=>{const known=ratings.get(row.account_id)?.name;return {...row,display_name:row.display_name===row.account_id&&known&&known!=='Oyuncu'?known:row.display_name}});return {accounts};
 }
 if(url==='/api/admin/history'){
  const rows=await database.query('SELECT account_id,action,old_gold,new_gold,created_at FROM hero_auction_admin_audit ORDER BY id DESC LIMIT 100');
  return {history:rows.rows};
 }
 if(url==='/api/admin/gold'||url==='/api/admin/ban'){
  const id=String(b.accountId||'').trim();
  if(!id||id.length>150)error('Geçersiz hesap.',400);if(url==='/api/admin/ban'&&id===user.sub)error('Yönetici kendi hesabını askıya alamaz.',400);
  const client=await database.connect();
  try{
   await client.query('BEGIN');
   const old=await client.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1 FOR UPDATE',[id]);
   if(!old.rowCount)error('Hesap bulunamadı.',404);
   const oldGold=Number(old.rows[0].gold);
   let gold=oldGold,action='';
   if(url==='/api/admin/gold'){
    gold=b.gold;
    if(!Number.isSafeInteger(gold)||gold<0||gold>100000000)error('Geçersiz altın miktarı.',400);
    await client.query('UPDATE hero_auction_wallets SET gold=$2 WHERE account_id=$1',[id,gold]);
    action='gold';
   }else{
    if(typeof b.banned!=='boolean')error('Geçersiz işlem.',400);
    await client.query('INSERT INTO hero_auction_admin_accounts(account_id,banned) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET banned=$2',[id,b.banned]);
    action=b.banned?'ban':'unban';
   }
   await client.query('INSERT INTO hero_auction_admin_audit(account_id,actor_id,action,old_gold,new_gold) VALUES($1,$2,$3,$4,$5)',[id,user.sub,action,oldGold,gold]);
   await client.query('COMMIT');
   return {ok:true,gold,action};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
 }
 error('Bilinmeyen işlem.',404);
}
function sameSeat(a,b){return !!a&&!!b&&a.code===b.code&&a.created===b.created&&a.matchNumber===b.matchNumber&&a.seat===b.seat}
function seatRoom(pointer){const r=pointer&&rooms.get(pointer.code);return r&&r.created===pointer.created&&(r.matchNumber||1)===pointer.matchNumber?r:null}
function seatUnsettled(pointer){if(pointer?.ambiguous)return true;const r=seatRoom(pointer);return !!r&&(r.phase==='auction'||(r.phase==='finished'&&!r.matchSettled))}
function inviteCanJoin(invite){if(moderation.blocked(invite.from,invite.to))return false;const current=activeSeats.get(invite.to);return !seatUnsettled(invite.source)&&!seatUnsettled(current)}
function validInviteRoom(invite){const r=rooms.get(invite.code);return r&&r.created===invite.created&&r.phase==='waiting'&&r.mode==='friend'&&r.players[0]?.accountId===invite.from&&!r.players[1]&&activeSeats.get(invite.from)?.code===r.code&&activeSeats.get(invite.from)?.created===r.created?r:null}
function invitationView(account){
 const view=i=>{const entry={id:i.id,from:friends.publicPlayer(i.from),to:friends.publicPlayer(i.to),code:i.code,status:i.status,expiresAt:i.expiresAt,...(i.reason?{reason:i.reason}:{})};
  if(i.to===account&&i.status==='joined'&&!i.delivered){const r=rooms.get(i.code);if(r&&r.created===i.created&&r.players[1]?.accountId===account&&r.players[1]?.token===i.joinedToken&&sameSeat(activeSeats.get(account),{code:r.code,created:r.created,matchNumber:r.matchNumber||1,seat:1})){entry.token=i.joinedToken;entry.room=publicRoom(r,1)}else{entry.status='failed';entry.reason='Davet edilen maç artık kullanılamıyor.'}}
  return entry};
 const all=[...roomInvites.items.values()];return{incoming:all.filter(i=>i.to===account).map(view),outgoing:all.filter(i=>i.from===account).map(view)};
}
function applyInvitationReceipt(invite,receipt){
 Object.assign(invite,receipt.invite);
 const r=rooms.get(receipt.room.code);
 if(r&&r.created===receipt.room.created){
  // Recovery must never rewind an auction that has progressed since its receipt.
  if(r.phase==='waiting'&&!r.players[1])Object.assign(r,receipt.room);
  if(r.players[1]?.token===receipt.invite.joinedToken&&r.players[1]?.accountId===invite.to){const current=activeSeats.get(invite.to),target={code:r.code,created:r.created,matchNumber:r.matchNumber||1,seat:1};if(current===undefined||sameSeat(current,invite.source)||sameSeat(current,target)||(!current&&!invite.source))activeSeats.set(invite.to,target);publish(r)}
 }
 return true;
}
async function commitInvitationJoin(invite,r,user){
 // Reserve before awaiting DB: normal /join cannot pass its existing joinPending check.
 if(r.joinPending&&!r.inviteUncertain)return false;
 r.joinPending=true;r.inviteJoining=true;
 const before={...invite},beforeSeat=activeSeats.get(user.sub);const joined=structuredClone(r);delete joined.inviteJoining;delete joined.joinPending;
 const t=token();joined.entryPaid=true;joined.players[1]={name:user.name,token:t,accountId:user.sub,credits:20,team:[]};joined.phase='auction';joined.turn=0;joined.deadline=Date.now()+20000;
 log(joined,`Oyun başladı. 1. kart için açılış: ${joined.players[0].name}`);
 let client,commitIssued=false,keepReserved=false;
 const restoreReceipt=receipt=>applyInvitationReceipt(invite,receipt);
 try{
  await roomFlushes.get(r.code);
  invite.status='joined';invite.joinedToken=t;activeSeats.set(user.sub,{code:r.code,created:r.created,matchNumber:r.matchNumber||1,seat:1});
  if(previewGuestMode&&!databaseReady){await chargeEntry([invite.from,invite.to],invite.id)}
  else{
   if(!database||!databaseReady)error('Altın sistemi şu anda kullanılamıyor.',503);
   client=await database.connect();await client.query('BEGIN');
   const receipt={invite:{...invite},room:joined};
   const inserted=await client.query('INSERT INTO hero_auction_invite_joins(invite_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING invite_id',[invite.id,JSON.stringify(receipt)]);
   if(!inserted.rowCount){const existing=await client.query('SELECT state FROM hero_auction_invite_joins WHERE invite_id=$1',[invite.id]);await client.query('ROLLBACK');return restoreReceipt(existing.rows[0].state)}
   // Wallet debit, durable room tokens, and invitation receipt are one commit.
   // A lost response/restart restores joined status instead of charging again.
   for(const id of [invite.from,invite.to].sort()){
    await client.query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,500) ON CONFLICT DO NOTHING',[id]);
    const paid=await client.query('UPDATE hero_auction_wallets SET gold=gold-50 WHERE account_id=$1 AND gold>=50 RETURNING gold',[id]);if(!paid.rowCount)error('Maça katılmak için en az 50 altın gerekli.');
   }
   await client.query('INSERT INTO hero_auction_rooms(code,state,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(code) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()',[r.code,JSON.stringify(joined)]);
   await client.query('INSERT INTO hero_auction_social(id,state) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET state=$2',['global',JSON.stringify({ratings:[...ratings],matches:[...matchRecords],friendships:friends.snapshot(),roomInvites:roomInvites.snapshot(),activeSeats:[...activeSeats]})]);
   commitIssued=true;await client.query('COMMIT');
  }
  Object.assign(r,joined);publish(r);return true;
 }catch(e){
  if(client)await client.query('ROLLBACK').catch(()=>{});
  if(commitIssued||r.inviteUncertain){
   try{const found=await database.query('SELECT state FROM hero_auction_invite_joins WHERE invite_id=$1',[invite.id]);if(found.rows[0])return restoreReceipt(found.rows[0].state)}catch{keepReserved=true;r.inviteUncertain=true;e.uncertain=true}
  }
  for(const key of Object.keys(invite))delete invite[key];Object.assign(invite,before);if(beforeSeat!==undefined)activeSeats.set(user.sub,beforeSeat);else activeSeats.delete(user.sub);throw e;
 }finally{client?.release();if(!keepReserved){delete r.inviteJoining;delete r.joinPending;delete r.inviteUncertain}}

}
async function invitationApi(url,b){
 const user=readLogin(b.authToken);if(database&&!databaseReady)error('Arkadaş sistemi geçici olarak kullanılamıyor.',503);
 await friends.register(user.sub,user.name);
 return friends.afterMutations(async()=>{
  requireModerationForInteraction(moderationReady,url);
  const before=roomInvites.snapshot();let joined=false;
  try{
   // Resolve any uncertain previous commit before allowing cancellation or another debit.
   for(const i of roomInvites.items.values())if(i.status==='queued'&&(i.to===user.sub||i.from===user.sub)){
    if(database&&databaseReady){const receipt=await database.query('SELECT state FROM hero_auction_invite_joins WHERE invite_id=$1',[i.id]);if(receipt.rows[0]){joined=applyInvitationReceipt(i,receipt.rows[0].state);continue}}
    const r=rooms.get(i.code);if(r?.inviteUncertain){if(i.to!==user.sub)error('Davet işlemi doğrulanıyor. Biraz sonra tekrar dene.',503);joined=await commitInvitationJoin(i,r,user);}
   }
   roomInvites.prune(i=>i.status==='queued'&&(rooms.get(i.code)?.inviteUncertain||![i.from,i.to].includes(user.sub)));
   for(const i of roomInvites.items.values())if(roomInvites.pending(i)&&(i.to===user.sub||i.from===user.sub)&&(moderation.blocked(i.from,i.to)||!friends.accepted(i.from,i.to)||!validInviteRoom(i))){i.status='failed';i.reason='Davet odası artık açık değil veya arkadaşlık sona erdi.'}
   if(url==='/api/friend/invite'){
    const {r,seat}=authorize(b);const other=friends.accountFor(b.playerId);
    if(seat!==0||r.phase!=='waiting'||r.mode!=='friend'||r.players[1]||r.joinPending||activeSeats.get(user.sub)?.code!==r.code||activeSeats.get(user.sub)?.created!==r.created)error('Davet için boş bir oda oluştur.',409);
    if(!other||moderation.blocked(user.sub,other)||!friends.accepted(user.sub,other))error('Yalnızca arkadaşlarını davet edebilirsin.',403);
    roomInvites.create(user.sub,other,r);
   }else if(url==='/api/friend/invite/respond'){
    const item=roomInvites.items.get(String(b.inviteId));
    if(b.response==='accept'&&item?.status==='pending'){
     if(activeSeats.get(user.sub)?.ambiguous)error('Birden fazla eski aktif odan var. Davet şu anda işlenemiyor.',409);
     if(b.expectedCost!==50)error('Davet için 50 altın giriş ücretini onayla.',400);
     if(b.sourceCode||b.sourceToken){const {r,seat}=authorize({...b,code:b.sourceCode,token:b.sourceToken});const pointer=activeSeats.get(user.sub);if(!pointer||pointer.code!==r.code||pointer.created!==r.created||pointer.seat!==seat)error('Aktif odan değişti. Daveti yeniden aç.',409)}
     item.source=activeSeats.get(user.sub)?{...activeSeats.get(user.sub)}:null;
    }
    roomInvites.respond(user.sub,b.inviteId,b.response,b.consent);
   }
   else if(url==='/api/friend/invite/cancel')roomInvites.cancel(user.sub,b.inviteId);
   else if(url==='/api/friend/invite/ack'){const item=roomInvites.items.get(String(b.inviteId));if(!item||item.to!==user.sub||item.status!=='joined')error('Davet bulunamadı.',404);item.delivered=true}
   // Only the recipient's authenticated request can deliver its room credential.
   const queued=[...roomInvites.items.values()].find(i=>i.to===user.sub&&i.status==='queued');
   if(queued&&inviteCanJoin(queued)){
    const r=validInviteRoom(queued);
    if(r){try{joined=await commitInvitationJoin(queued,r,user)}catch(e){if(e.uncertain)throw e;queued.status='failed';queued.reason=e.status?e.message:'Davete katılma işlemi tamamlanamadı.'}}
   }
   if(JSON.stringify(before)!==JSON.stringify(roomInvites.snapshot())){if(joined)await saveSocial(true).catch(e=>console.error('Invitation receipt persistence:',e.message));else await saveSocial(true);}
   return invitationView(user.sub);
  }catch(e){if(!joined&&!e.uncertain)roomInvites.restore(before);throw e}
 });
}
async function api(url,b){
 requireModerationForInteraction(moderationReady,url);
 if(url.startsWith('/api/moderation/'))return moderationApi(url,b);
 const entryRoutes=['/api/create','/api/join','/api/match','/api/bot','/api/rematch'];
 if(!entryRoutes.includes(url)&&url!=='/api/room/detach')return apiAction(url,b);
 const user=readLogin(b.authToken);if(!user)error('Odaya erişmek için giriş yapmalısın.',401);
 await friends.register(user.sub,user.name);
 return friends.afterMutations(async()=>{
  requireModerationForInteraction(moderationReady,url);
  if([...roomInvites.items.values()].some(i=>[i.from,i.to].includes(user.sub)&&i.status==='queued'&&rooms.get(i.code)?.inviteUncertain))error('Davet işlemi doğrulanıyor. Biraz sonra tekrar dene.',503);
  if([...roomInvites.items.values()].some(i=>i.to===user.sub&&i.status==='joined'&&!i.delivered&&activeSeats.get(user.sub)?.code===i.code&&activeSeats.get(user.sub)?.created===i.created))error('Davet odasına geçiş tamamlanıyor. Biraz sonra tekrar dene.',409);
  if(url==='/api/room/detach'){
   const {r,seat}=authorize(b),pointer=activeSeats.get(user.sub),beforeInvites=roomInvites.snapshot();
   if(pointer?.code===r.code&&pointer.created===r.created&&pointer.seat===seat)activeSeats.set(user.sub,{detached:true,at:Date.now()});
   for(const i of roomInvites.items.values())if(i.from===user.sub&&i.code===r.code&&i.created===r.created&&roomInvites.pending(i))i.status='cancelled';
   try{await saveSocial(true)}catch(e){if(pointer===undefined)activeSeats.delete(user.sub);else activeSeats.set(user.sub,pointer);roomInvites.restore(beforeInvites);throw e}return{ok:true};
  }
  if([...roomInvites.items.values()].some(i=>i.to===user.sub&&i.status==='queued'&&i.expiresAt>Date.now()))error('Önce kabul ettiğin daveti tamamla veya iptal et.',409);
  if(url==='/api/rematch'){const {r}=authorize(b);if(moderation.blocked(r.players[0]?.accountId,r.players[1]?.accountId))error('Bu oyuncuyla etkileşim kullanılamıyor.',403);if(r.players.some(p=>[...roomInvites.items.values()].some(i=>i.to===p?.accountId&&i.status==='queued'&&i.expiresAt>Date.now())))error('Bir oyuncu kabul ettiği daveti bekliyor.',409)}
  const result=await apiAction(url,b);
  const r=result.room&&rooms.get(result.room.code);if(r){const seat=r.players.findIndex(p=>p?.accountId===user.sub);if(seat>=0)activeSeats.set(user.sub,{code:r.code,created:r.created,matchNumber:r.matchNumber||1,seat});
   if(url==='/api/rematch')r.players.forEach((p,index)=>{if(p?.accountId&&activeSeats.get(p.accountId)?.code===r.code)activeSeats.set(p.accountId,{code:r.code,created:r.created,matchNumber:r.matchNumber||1,seat:index})});
   // Keep the match response successful if the secondary pointer write fails.
   // The room itself remains the source of truth for bootstrap recovery.
   await saveSocial(true).catch(e=>console.error('Current room persistence:',e.message));
  }
  return result;
 });
}
async function apiAction(url,b){if(url.startsWith('/api/admin/'))return adminApi(url,b);if(url==='/api/auth/check'){const user=readLogin(b.authToken);if(!user)error('Oturumun sona erdi. Yeniden giriş yap.',401);await rememberDisplayName(user);return{user:{sub:user.sub,name:user.name},gold:await goldBalance(user.sub)}}if(url==='/api/auth/crazygames'){const user=await verifyCrazyGamesToken(b.credential);await rememberDisplayName(user);for(const r of rooms.values()){let changed=false;for(const p of r.players){if(p?.accountId===user.sub&&p.name!==user.name){p.name=user.name;changed=true}}if(changed)publish(r)}return{user,authToken:signLogin(user),gold:await goldBalance(user.sub)}}if(url==='/api/auth/guest'){const name=assertModeratedText(b.name||'Oyuncu',{kind:'name'});const user={sub:'guest:'+crypto.randomUUID(),name};await rememberDisplayName(user);return{user:{name},authToken:signLogin(user),gold:await goldBalance(user.sub)}}
if(!url.startsWith('/api/auth/')){const user=readLogin(b.authToken);if(!user)error('Odaya erişmek için giriş yapmalısın.',401);if(databaseReady){const block=await database.query('SELECT banned FROM hero_auction_admin_accounts WHERE account_id=$1',[user.sub]);if(block.rows[0]?.banned)error('Hesap askıya alınmıştır.',403)}}
if(previewGuestMode&&url==='/api/commander/get'){
 const user=readLogin(b.authToken);
 return {profile:previewCommanderProfiles.get(user.sub)||null,gold:await goldBalance(user.sub)};
}
if(previewGuestMode&&url==='/api/commander/select'){
 const user=readLogin(b.authToken);
 if(previewCommanderProfiles.has(user.sub))error('Komutanın zaten seçilmiş.',409);
 const profile=createCommanderProfile(String(b.commanderId||''));
 previewCommanderProfiles.set(user.sub,profile);
 return {profile,gold:await goldBalance(user.sub)};
}
if(previewGuestMode&&url==='/api/commander/change'){
 const user=readLogin(b.authToken);
 if(!previewCommanderProfiles.has(user.sub))error('Önce komutan seçmelisin.',409);
 const commanderId=String(b.commanderId||'');
 if(!resolveCommander(commanderId))error('Geçersiz komutan.',400);
 const old=previewCommanderProfiles.get(user.sub);
 const profile={commanderId,levels:{...old.levels}};
 previewCommanderProfiles.set(user.sub,profile);
 return {profile,gold:await goldBalance(user.sub),cost:0};
}
if(url==='/api/commander/get'){
 const user=readLogin(b.authToken);
 if(!database||!databaseReady)error('Komutan sistemi geçici olarak kullanılamıyor.',503);
 const found=await database.query('SELECT profile FROM hero_auction_commanders WHERE account_id=$1',[user.sub]);
 return{profile:found.rows[0]?.profile||null,gold:await goldBalance(user.sub)};
}
if(url==='/api/commander/select'){
 const user=readLogin(b.authToken);
 if(!database||!databaseReady)error('Komutan sistemi geçici olarak kullanılamıyor.',503);
 const profile=createCommanderProfile(String(b.commanderId||''));
 const result=await database.query('INSERT INTO hero_auction_commanders(account_id,profile) VALUES($1,$2::jsonb) ON CONFLICT(account_id) DO NOTHING RETURNING profile',[user.sub,JSON.stringify(profile)]);
 if(!result.rows.length)error('Komutanın zaten seçilmiş. Değiştirilemez.',409);
 return{profile:result.rows[0].profile,gold:await goldBalance(user.sub)};
}
if(url==='/api/commander/change'){
 const user=readLogin(b.authToken);
 if(!database||!databaseReady)error('Komutan sistemi geçici olarak kullanılamıyor.',503);
 const newCommanderId=String(b.commanderId||'');
 if(!resolveCommander(newCommanderId))error('Geçersiz komutan.',400);
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  const existing=await client.query('SELECT profile FROM hero_auction_commanders WHERE account_id=$1 FOR UPDATE',[user.sub]);
  if(!existing.rows.length)error('Önce bir komutan seçmelisin.',409);
  const profile=validateCommanderProfile(existing.rows[0].profile);
  if(profile.commanderId===newCommanderId)error('Bu komutan zaten seçili.',409);
  const wallet=await client.query('UPDATE hero_auction_wallets SET gold=gold-$2 WHERE account_id=$1 AND gold>=$2 RETURNING gold',[user.sub,COMMANDER_CHANGE_COST]);
  if(!wallet.rows.length)error(`Komutan değiştirmek için ${COMMANDER_CHANGE_COST} altın gerekiyor.`,409);
  const changed={commanderId:newCommanderId,levels:{...profile.levels}};
  await client.query('UPDATE hero_auction_commanders SET profile=$2::jsonb,updated_at=NOW() WHERE account_id=$1',[user.sub,JSON.stringify(changed)]);
  await client.query('COMMIT');
  return{profile:changed,gold:Number(wallet.rows[0].gold),cost:COMMANDER_CHANGE_COST};
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
if(url==='/api/commander/upgrade'){
 const user=readLogin(b.authToken);
 if(!database||!databaseReady)error('Komutan sistemi geçici olarak kullanılamıyor.',503);
 const stat=String(b.stat||'');
 if(!COMMANDER_STATS.includes(stat))error('Geçersiz geliştirme alanı.',400);
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  const existing=await client.query('SELECT profile FROM hero_auction_commanders WHERE account_id=$1 FOR UPDATE',[user.sub]);
  if(!existing.rows.length)error('Önce komutan seçmelisin.',409);
  const profile=validateCommanderProfile(existing.rows[0].profile);
  if(profile.levels[stat]>=commanderLevelCap(profile.commanderId,stat))error('Bu dal maksimum seviyede.',409);
  const cost=commanderUpgradeCost(profile.levels[stat]);
  const wallet=await client.query('UPDATE hero_auction_wallets SET gold=gold-$2 WHERE account_id=$1 AND gold >= $2 RETURNING gold',[user.sub,cost]);
  if(!wallet.rows.length)error('Yetersiz altın.',409);
  const upgraded=previewCommanderUpgrade(profile,stat,cost).profile;
  await client.query('UPDATE hero_auction_commanders SET profile=$2::jsonb,updated_at=NOW() WHERE account_id=$1',[user.sub,JSON.stringify(upgraded)]);
  await client.query('COMMIT');
  return{profile:upgraded,gold:Number(wallet.rows[0].gold),cost};
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
if(url==='/api/profile'){const u=readLogin(b.authToken);return{profile:{...profileOf(u.sub),name:u.name},history:[...matchRecords.values()].filter(m=>m.participants.some(p=>p.id===u.sub)).reverse().slice(0,20)}}
if(url==='/api/leaderboard'){return{players:[...ratings.entries()].map(([id,p])=>({playerId:friends.playerId(id),...profileOf(id)})).sort((a,b)=>b.rating-a.rating).slice(0,30)}}
if(['/api/friend/invite','/api/friend/invite/respond','/api/friend/invite/cancel','/api/friend/invite/ack','/api/friend/invitations'].includes(url))return invitationApi(url,b);
if(url==='/api/friends'||url.startsWith('/api/friend/')||url==='/api/friends/presence'){
 const u=readLogin(b.authToken);
 if(database&&!databaseReady)error('Arkadaş sistemi geçici olarak kullanılamıyor.',503);
 await friends.register(u.sub,u.name);
 if(url==='/api/friends'){const state=friends.state(u.sub);for(const key of ['friends','incoming','outgoing'])state[key]=state[key].filter(p=>!moderation.blocked(u.sub,friends.accountFor(p.playerId)));return{...state,persistent:Boolean(databaseReady),guest:u.sub.startsWith('guest:')};}
 if(url==='/api/friends/presence')return friends.heartbeat(u.sub,b.sessionId,b.online);
 const action=url.slice('/api/friend/'.length);
 return await friends.action(u.sub,action,b.playerId);
}
if(url==='/api/spectate/list'){return{matches:[...rooms.values()].filter(r=>r.phase==='auction'&&r.mode!=='bot'&&!r.players.some(p=>moderation.blocked(readLogin(b.authToken).sub,p?.accountId))).map(r=>({code:r.code,universe:r.universe,round:r.round,players:r.players.map(p=>p?.name||'Bekleniyor')})).slice(0,30)}}
if(url==='/api/spectate'){const r=rooms.get(String(b.code||''));if(!r||r.phase!=='auction'||r.mode==='bot'||r.players.some(p=>moderation.blocked(readLogin(b.authToken).sub,p?.accountId)))error('İzlenebilir maç bulunamadı.',404);return{room:publicRoom(r,-1)}}
if(url==='/api/rewarded/status'){return await rewardedAdStatus(readLogin(b.authToken).sub)}
if(url==='/api/rewarded/claim'){error('Ödüllü reklam sistemi henüz etkin değil.',503)}
if(url==='/api/wallet'){return{gold:await goldBalance(readLogin(b.authToken).sub)}}
if(url==='/api/auth/google'){const credential=String(b.credential||'');if(credential.length<100||credential.length>8000)error('Geçersiz Google kimliği.');const response=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(credential),{signal:AbortSignal.timeout(8000)});if(!response.ok)error('Google kimliği doğrulanamadı.',401);const claims=await response.json();if(claims.aud!==GOOGLE_CLIENT_ID||!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||Number(claims.exp)*1000<Date.now()||!claims.sub||claims.email_verified!=='true')error('Google kimliği doğrulanamadı.',401);const user={sub:claims.sub,name:String(claims.name||claims.given_name||'Oyuncu').slice(0,24),email:String(claims.email||'').toLowerCase()};await rememberDisplayName(user);return{user,authToken:signLogin(user),gold:await goldBalance(user.sub)}}
if(url==='/api/create'){const name=chosenName(b,'Oyuncu 1');const universe='mixed';const cards=newCards(universe);let id;do{id=code()}while(rooms.has(id));const t=token();const accountId=readLogin(b.authToken).sub;const r={code:id,universe,cards,round:0,phase:'waiting',turn:0,topBid:0,topSeat:null,players:[{name,token:t,accountId,credits:20,team:[]},null],history:[],created:Date.now(),series:[0,0],rematch:[false,false],deadline:null,mode:'friend'};rooms.set(id,r);markRoom(r);return{token:t,room:publicRoom(r,0)}}
if(url==='/api/join'){const r=rooms.get(String(b.code||'').toUpperCase());if(!r)error('Oda bulunamadı.',404);if(moderation.blocked(readLogin(b.authToken).sub,r.players[0]?.accountId))error('Bu oyuncuyla etkileşim kullanılamıyor.',403);if(r.players[1]||r.joinPending)error('Oda dolu.');if(r.phase!=='waiting'||r.mode!=='friend'||activeSeats.get(r.players[0]?.accountId)?.code!==r.code||activeSeats.get(r.players[0]?.accountId)?.created!==r.created)error('Davet odası artık açık değil.',409);r.joinPending=true;try{await chargeEntry([r.players[0].accountId,readLogin(b.authToken).sub],r.code);const t=token();r.entryPaid=true;r.players[1]={name:chosenName(b,'Oyuncu 2'),token:t,accountId:readLogin(b.authToken).sub,credits:20,team:[]};r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;log(r,`Oyun başladı. 1. kart için açılış: ${r.players[0].name}`);publish(r);return{token:t,room:publicRoom(r,1)}}finally{r.joinPending=false}}
if(url==='/api/rematch'){
 const{r,seat}=authorize(b);
 if(r.rematchPending)error('Rövanş hazırlanıyor.',409);
 if(r.battleSettlementPending&&!r.matchSettled)error('Savaş sonucu henüz kesinleşmedi.');
 if(r.players.every(p=>p?.team?.length===5)&&r.battleSync?.result&&!r.battleCompleted?.[seat])error('Önce 2.0 savaşını tamamlamalısın.');
 if(r.phase!=='finished')error('Maç henüz bitmedi.');
 r.rematch[seat]=true;if(r.mode==='bot')r.rematch[1]=true;
 if(r.rematch.every(Boolean)){
  r.rematchPending=true;
  try{
   if(r.mode!=='bot'){try{await chargeEntry(r.players.map(p=>p.accountId),r.code);}catch(e){r.rematch=[false,false];throw e}}
   liveArenaLifecycle.endRoom(r.code);liveArenaMatchKeys.delete(r.code);
   if(r.mode==='bot')assignBotCommander(r);
   r.entryPaid=r.mode!=='bot';r.goldRefunds=null;r.matchNumber=(r.matchNumber||1)+1;
   r.goldAward=null;r.rankChange=null;r.rankBefore=null;r.cards=newCards(r.universe);
   r.round=0;r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;r.topBid=0;r.topSeat=null;
   r.history=[];r.openingPassSeat=null;r.rematch=[false,false];r.battleCompleted=[false,false];
   r.tailAwards=[];r.revision=0;
   r.matchSettled=false;r.battleSettlementPending=false;r.battleSync=null;r.created=Date.now();r.lastActivity=Date.now();
   for(const p of r.players){p.credits=20;p.team=[];}
   log(r,'Rövanş başladı!');
  }finally{r.rematchPending=false}
 }
 publish(r);return{room:publicRoom(r,seat)};
}
if(url==='/api/bot'){const difficulty=['easy','medium','hard'].includes(b.difficulty)?b.difficulty:'medium';const universe='mixed';const name=chosenName(b,'Oyuncu');let id;do{id=code()}while(rooms.has(id));const t=token();const r={entryPaid:false,code:id,universe,cards:newCards(universe),round:0,phase:'auction',turn:0,deadline:Date.now()+20000,topBid:0,topSeat:null,players:[{name,token:t,accountId:readLogin(b.authToken).sub,credits:20,team:[]},{name:'Bilgisayar',token:token(),credits:20,team:[]}],history:[],created:Date.now(),series:[0,0],rematch:[false,false],mode:'bot',difficulty};assignBotCommander(r);rooms.set(id,r);markRoom(r);return{token:t,room:publicRoom(r,0)}}
if(url==='/api/match'){const universe='mixed';const name=chosenName(b,'Oyuncu');for(const [key,item] of waiting){if(item.universe!==universe||Date.now()-item.created>60000)continue;const r=rooms.get(item.code);if(r&&moderation.blocked(readLogin(b.authToken).sub,r.players[0]?.accountId))continue;if(!r||r.players[1]||r.joinPending||activeSeats.get(r.players[0]?.accountId)?.code!==r.code||activeSeats.get(r.players[0]?.accountId)?.created!==r.created){waiting.delete(key);continue;}await chargeEntry([r.players[0].accountId,readLogin(b.authToken).sub],r.code);const t=token();r.entryPaid=true;r.players[1]={name,token:t,accountId:readLogin(b.authToken).sub,credits:20,team:[]};r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;r.mode='random';waiting.delete(key);publish(r);return{token:t,room:publicRoom(r,1)}}let id;do{id=code()}while(rooms.has(id));const t=token();const r={code:id,universe,cards:newCards(universe),round:0,phase:'matching',turn:0,deadline:null,topBid:0,topSeat:null,players:[{name,token:t,accountId:readLogin(b.authToken).sub,credits:20,team:[]},null],history:[],created:Date.now(),series:[0,0],rematch:[false,false],mode:'random'};rooms.set(id,r);markRoom(r);waiting.set(id,{code:id,universe,created:Date.now()});return{token:t,room:publicRoom(r,0)}}
if(url==='/api/chat'){const{r,seat}=authorize(b);if(moderation.blocked(r.players[0]?.accountId,r.players[1]?.accountId))error('Bu oyuncuyla sohbet kullanılamıyor.',403);if(r.mode==='bot')error('Sohbet yalnızca gerçek oyuncularla kullanılabilir.');const message=assertModeratedText(b.message);if(!message||message.length>240)error('Mesaj 1–240 karakter olmalı.');if(Date.now()-(r.lastChatAt?.[seat]||0)<1000)error('Yeni mesaj için bir saniye bekle.');r.lastChatAt??=[0,0];r.lastChatAt[seat]=Date.now();r.chat??=[];r.chat.push({seat,name:r.players[seat].name,message,time:Date.now()});if(r.chat.length>60)r.chat.shift();r.lastActivity=Date.now();publish(r);return{room:publicRoom(r,seat)}}
if(url==='/api/state'){const{r,seat}=authorize(b);r.lastActivity=Date.now();return{room:publicRoom(r,seat)}}
if(url==='/api/bid'){const{r,seat}=authorize(b);if(r.phase!=='auction')error('İhale aktif değil.');if(r.turn!==seat)error('Teklif sırası sende değil.');const amount=Number(b.amount);if(!Number.isInteger(amount)||amount<=r.topBid||amount>r.players[seat].credits)error('Teklif tutarı geçersiz.');if(r.players[seat].team.length>=5)error('Takımın tamamlandı.');r.topBid=amount;r.topSeat=seat;r.openingPassSeat=null;log(r,`${r.players[seat].name} ${amount} kredi teklif etti.`);const other=1-seat;if(r.players[other].credits<=amount||r.players[other].team.length>=5){finishAuction(r);}else{r.turn=other;r.deadline=Date.now()+20000;}publish(r);return{room:publicRoom(r,seat)}}
if(url==='/api/pass'){const{r,seat}=authorize(b);if(r.phase!=='auction'||r.turn!==seat)error('Şu an çekilemezsin.');if(r.topSeat===null){if(r.openingPassSeat===1-seat){finishUnbidCard(r);}else{r.openingPassSeat=seat;r.turn=1-seat;r.deadline=Date.now()+20000;log(r,r.players[seat].name+' pas geçti.');}}else finishAuction(r);publish(r);return{room:publicRoom(r,seat)}}
error('Bilinmeyen işlem.',404)}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
// Only locally hosted artwork belonging to the active original roster is served.
async function lookupCharacterInfo(universe,name){
 const hero=battleRoster.find(h=>h.universe===universe&&h.name.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR'));
 const portrait=hero?.portrait;
 const url=portrait&&fs.existsSync(path.join(root,'public',portrait.slice(1)))?portrait:null;
 return {url,source:null,description:hero?.name||null,role:hero?.role,laneModifiers:hero?.laneModifiers};
}
// Isolated two-player preview sessions; no classic rooms or wallet effects.
const battleSessions=new Map();
setInterval(()=>{for(const [code,s] of battleSessions)if(Date.now()-s.created>2*3600_000)battleSessions.delete(code)},60000).unref();
const battleIdsA=["original:01", "original:02", "original:03", "original:04", "original:05"];
const battleIdsB=["original:06", "original:07", "original:08", "original:09", "original:10"];
function battleSessionView(session,token){const seat=session.players.findIndex(p=>p?.token===token);if(seat<0||session.players[seat].left)return null;return {code:session.code,seat,ready:session.players.map(p=>Boolean(p?.ready)),joined:session.players.map(Boolean),started:Boolean(session.result),result:session.result,created:session.created};}
// Draft formation belongs to the completed auction, not a browser or account profile.
// Creation does not imply Ready; both existing confirmation gates remain unchanged.
function preparationTeams(teams){return teams.map(team=>team.map(card=>{const hero=battleRoster.find(hero=>hero.id===card.id);return {...card,role:hero.role,laneModifiers:hero.laneModifiers}}))}
function ensureBattlePreparation(room,teams){
 const matchKey=String(room.matchNumber||1)+':'+String(room.created);
 let changed=false;
 if(room.battleSync?.key!==matchKey){room.battleSync={key:matchKey,ready:[null,null],result:null};changed=true;}
 const sync=room.battleSync;
 if(!Array.isArray(sync.drafts)){sync.drafts=[null,null];changed=true;}
 for(let seat=0;seat<2;seat++)if(!sync.drafts[seat]){sync.drafts[seat]=sync.ready[seat]||buildDefaultFormation(teams[seat]);changed=true;}
 if(changed)markRoom(room);
 return sync;
}
function preparationView(sync,seat){
 const formation=sync.ready[seat]||sync.drafts[seat];
 return {matchKey:sync.key,positions:[...formation.positions],lanes:[...formation.lanes],roles:[...formation.roles],ready:Boolean(sync.ready[seat])};
}
function battleSessionResult(session){const cards=(ids,formation)=>formation.map((index,slot)=>({id:ids[index],power:stablePower(ids[index]),lane:session.players[ids===battleIdsA?0:1].lanes?.[slot]||(slot<2?'front':'back'),role:session.players[ids===battleIdsA?0:1].roles?.[slot]||((slot<2)?'tank':'energy')}));const a=cards(battleIdsA,session.players[0].positions),b=cards(battleIdsB,session.players[1].positions);const result=simulateRosterBattle(a,b,{seed:'battle-room-'+session.code+'-'+session.created});return {winner:result.winner,rounds:result.rounds,teams:result.teams,initialShields:result.initialShields,log:result.log};}
function validBattlePositions(v){return Array.isArray(v)&&v.length===5&&new Set(v).size===5&&v.every(x=>Number.isInteger(x)&&x>=0&&x<5)}
const server=http.createServer(async(req,res)=>{const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};try{const url=new URL(req.url,'http://localhost');if(req.method==='POST'&&url.pathname==='/api/battle-auction-complete'){
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000)return send(413,{error:'İstek çok büyük'})}
 let body;try{body=JSON.parse(raw)}catch{return send(400,{error:'Geçersiz veri'})}
 const room=rooms.get(String(body?.code||'').toUpperCase());const seat=room?.players?.findIndex(p=>p?.token===body?.token)??-1;
 if(!room||seat<0)return send(403,{error:'Yetkisiz'});
 if(room.phase!=='finished')return send(409,{error:'Açık artırma bitmedi'});
 try{prepareBattleTeams(auctionRoomToBattleState(room))}catch(e){return send(422,{error:e.message})}
 if(!room.battleSync?.result)return send(409,{error:'Savaş henüz başlamadı'});
 if(room.battleSync.result.live&&!room.battleSync.result.finished){
  const key=liveArenaMatchKeys.get(room.code);
  if(!key)return send(409,{error:'Canlı savaş sonucu henüz kesinleşmedi'});
  try{if(!liveArenaLifecycle.snapshot({matchKey:key,token:body.token}).finished)return send(409,{error:'Canlı savaş henüz tamamlanmadı'});}
  catch{return send(409,{error:'Canlı savaş sonucu henüz kesinleşmedi'});}
 }
 room.battleCompleted??=[false,false];room.battleCompleted[seat]=true;markRoom(room);return send(200,{ok:true,completed:room.battleCompleted,series:room.series||[0,0],seat,players:room.players.map(p=>({name:p?.name||'Oyuncu'}))});
}
if(url.pathname==='/api/experimental/live-room-binding'&&req.method==='GET'){
 if(!commanderTurnApiEnabled)return send(404,{error:'Experimental commander API disabled'});
 const room=rooms.get(String(url.searchParams.get('code')||'').toUpperCase());
 try{
  const binding=deriveLiveArenaRoomBinding(room);
  const side=verifyLiveArenaRoomBinding(room,binding,url.searchParams.get('token'));
  // Only readiness metadata; never return private seat tokens or claim live combat exists.
  return send(200,{readyForPreparation:true,liveCombatReady:false,matchKey:binding.matchKey,side});
 }catch(e){return send(403,{error:e.message})}
}
if(url.pathname==='/api/experimental/commander-live'&&(req.method==='GET'||req.method==='POST')){
 let body={};
 if(req.method==='POST'){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2000)return send(413,{error:'İstek çok büyük'})}
  try{body=JSON.parse(raw)}catch{return send(400,{error:'Geçersiz JSON'})}
 }else body={code:url.searchParams.get('code'),token:url.searchParams.get('token')};
 const room=rooms.get(String(body?.code||'').toUpperCase());
 const side=room?.players?.findIndex(p=>p?.token===body?.token)??-1;
 if(!room||side<0)return send(403,{error:'Oda veya oyuncu oturumu geçersiz'});
 if(room.phase!=='finished'||!room.battleSync?.result||!room.battleSync?.commanderInput)return send(409,{error:'Arena henüz hazır değil'});
 const matchKey=room.code+':'+String(room.matchNumber||1)+':'+String(room.created);
 const activeLiveKey=liveArenaMatchKeys.get(room.code);
 if(!isLiveCommanderApiAvailable({apiEnabled:commanderTurnApiEnabled,previewGuestMode,activeMatchKey:activeLiveKey,currentMatchKey:matchKey}))return send(404,{error:'Experimental commander API disabled'});
 const liveKey=activeLiveKey||matchKey;
 const sinceVersion=Number(req.method==='GET'?url.searchParams.get('sinceVersion')||0:body.sinceVersion||0);
 if(!Number.isSafeInteger(sinceVersion)||sinceVersion<0)return send(400,{error:'Geçersiz savaş sürümü'});
 const snapshot=()=>{const current=liveArenaLifecycle.snapshot({matchKey:liveKey,token:body.token,sinceVersion});return side===0?current:{...current,side:0,summary:orientBattleSummary(current.summary,side),winner:current.winner===null?null:1-current.winner,teams:[...current.teams].reverse(),abilities:[...current.abilities].reverse(),events:current.events.map(e=>({...e,side:typeof e.side==='number'?1-e.side:e.side,shieldSnapshot:e.shieldSnapshot?.slice().reverse()}))};};
 try{
  if(req.method==='POST'){
   if(!['normal','ultimate'].includes(body?.ability))return send(422,{error:'Geçersiz komutan yeteneği'});
   if(typeof body?.requestId!=='string'||!/^[-a-zA-Z0-9_]{8,80}$/.test(body.requestId))return send(422,{error:'Geçersiz yetenek istek kimliği'});
   if(body?.targetIds!==undefined&&(!Array.isArray(body.targetIds)||body.targetIds.length>2||body.targetIds.some(id=>typeof id!=='string'||id.length>120)||new Set(body.targetIds).size!==body.targetIds.length))return send(422,{error:'Geçersiz büyü hedefleri'});
   const cast=liveArenaLifecycle.cast({matchKey:liveKey,token:body.token,ability:body.ability,requestId:body.requestId,targetIds:body.targetIds,now:Date.now()});
   const current=snapshot();
   return send(200,{...current,cast,serverTime:Date.now()});
  }
  const current=snapshot();
  return send(200,{...current,commanderId:room.battleSync.commanderInput.commanders[side]?.commanderId,serverTime:Date.now()});
 }catch(e){return send(422,{error:e.message})}
}
if(url.pathname==='/api/experimental/commander-turn'&&(req.method==='GET'||req.method==='POST')){
 if(!commanderTurnApiEnabled)return send(404,{error:'Experimental commander API disabled'});
 let body={};
 if(req.method==='POST'){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2000)return send(413,{error:'İstek çok büyük'})}
  try{body=JSON.parse(raw)}catch{return send(400,{error:'Geçersiz JSON'})}
 }else body={code:url.searchParams.get('code'),token:url.searchParams.get('token')};
 const room=rooms.get(String(body?.code||'').toUpperCase());
 if(!room||room.players?.findIndex(p=>p?.token===body.token)<0)return send(403,{error:'Yetkisiz oda'});
 if(room.mode==='bot')return send(409,{error:'Bu deneysel mod yalnızca iki gerçek oyuncu içindir'});
 if(room.phase!=='finished'||!room.battleSync?.result||!room.battleSync?.commanderInput)return send(409,{error:'Arena dizilişleri hazır değil'});
 const matchKey=String(room.matchNumber||1)+':'+String(room.created);
 const key=room.code+':'+matchKey;
 try{
  let bound=commanderTurnSessions.get(key);
  if(!bound){
   const input=room.battleSync.commanderInput;
   if(input.commanders.some(c=>!c?.commanderId))return send(409,{error:'İki oyuncunun da komutanı seçili olmalı'});
   bound=createRoomCommanderSession(room,{cardsA:input.cards[0],cardsB:input.cards[1],commanders:input.commanders,remainingCredits:input.remainingCredits});
   commanderTurnSessions.set(key,bound);
  }
  if(req.method==='POST'){
   const outcome=submitRoomCommanderTurn(room,bound,{token:body.token,round:body.round,command:body.command});
   return send(200,{...viewRoomCommanderSession(room,bound,body.token),ready:outcome.ready});
  }
  return send(200,viewRoomCommanderSession(room,bound,body.token));
 }catch(e){return send(422,{error:e.message})}
}
if(url.pathname==='/api/battle-auction-preview'&&(req.method==='POST'||req.method==='GET')){
 let body={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4000)return send(413,{error:'İstek çok büyük'})}try{body=JSON.parse(raw)}catch{return send(400,{error:'Geçersiz JSON'})}}
 else body={code:url.searchParams.get('code'),token:url.searchParams.get('token')};
 const room=rooms.get(String(body?.code||'').toUpperCase());const seat=room?.players?.findIndex(p=>p?.token===body?.token)??-1;
 if(!room||seat<0)return send(403,{error:'Yetkisiz oda'});
 if(room.phase!=='finished')return send(409,{error:'Açık artırma tamamlanmadı'});
 try{const state=auctionRoomToBattleState(room),teams=prepareBattleTeams(state);
 const metadata=preparationTeams(teams),sync=ensureBattlePreparation(room,metadata),matchKey=sync.key;
 if(req.method==='POST'&&body.matchKey!==undefined&&body.matchKey!==matchKey)return send(409,{error:'Diziliş başka bir maça ait.'});
 // Computer opponent uses an automatic, server-owned formation.
 if(room.mode==='bot'&&!sync.ready[1]){
  sync.ready[1]=chooseBotFormation(teams[1],room.difficulty||'medium');
 }
 // Re-entering a confirmed formation returns the existing battle without changing it.
 if(req.method==='POST'&&!sync.ready[seat]){
 if(!validateFormation(body,metadata[seat]))return send(400,{error:'Geçersiz diziliş veya kart türü'});
 sync.ready[seat]={positions:[...body.positions],lanes:[...body.lanes],roles:[...body.roles]};
 sync.drafts[seat]=sync.ready[seat];
 if(sync.ready.every(Boolean)){
 const ordered=teams.map((team,i)=>sync.ready[i].positions.map((index,slot)=>({...team[index],lane:sync.ready[i].lanes[slot],role:sync.ready[i].roles[slot]})));
 // Read both commanders from authenticated room account IDs, never from client payloads.
 // Snapshot profiles when both formations are ready so subsequent upgrades cannot alter this battle.
 const commanderProfiles=[null,null];
 if(database&&databaseReady){
  const accountIds=room.players.map(player=>player?.accountId||null);
  const ids=accountIds.filter(Boolean);
  if(ids.length){
   const records=await database.query('SELECT account_id,profile FROM hero_auction_commanders WHERE account_id=ANY($1::text[])',[ids]);
   const byId=new Map(records.rows.map(row=>[row.account_id,row.profile]));
    for(let i=0;i<2;i++){
    const profile=byId.get(accountIds[i]);
    if(profile)commanderProfiles[i]=validateCommanderProfile(profile);
   }
  }
 }else if(previewGuestMode){
  for(let i=0;i<2;i++){const accountId=room.players[i]?.accountId;const profile=accountId&&previewCommanderProfiles.get(accountId);if(profile)commanderProfiles[i]=validateCommanderProfile(profile);}
 }
 if(room.mode==='bot'){
  if(!room.botCommander)assignBotCommander(room);
  commanderProfiles[1]=validateCommanderProfile(room.botCommander);
  // Older accounts without a selected profile can train; this never writes progression.
  commanderProfiles[0]??=createCommanderProfile('attack');
 }
 sync.commanderInput={cards:ordered,commanders:commanderProfiles,remainingCredits:[state.remainingCreditsA,state.remainingCreditsB]};
 let result;
 if(commanderProfiles.every(Boolean)){
  const liveKey=room.code+':'+matchKey;
  const liveTeams=prepareLiveArenaTeams(ordered[0],ordered[1],{remainingCredits:[state.remainingCreditsA,state.remainingCreditsB],commanders:commanderProfiles,cardAdapter:'auction'});
  const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:liveKey}),teams:liveTeams,commanders:commanderProfiles});
  liveArenaLifecycle.begin({matchKey:liveKey,tokens:room.players.map(p=>p.token),combat,options:{parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true}});
  liveArenaMatchKeys.set(room.code,liveKey);
  if(room.mode==='bot')room.botBattle={startedAt:Date.now(),lastCastAt:0,sequence:0};
 }
 if(liveArenaMatchKeys.get(room.code)===room.code+':'+matchKey){
  const live=liveArenaLifecycle.snapshot({matchKey:liveArenaMatchKeys.get(room.code),token:room.players[0].token});
  result={winner:null,rounds:live.round,teams:live.teams,log:[]};
 }else result=simulateRosterBattle(ordered[0],ordered[1],{seed:'auction-battle-'+room.code+'-'+matchKey,remainingCredits:[state.remainingCreditsA,state.remainingCreditsB],commanders:commanderProfiles});
 sync.result={winner:result.winner,rounds:result.rounds,teams:result.teams,initialShields:result.initialShields,log:result.log,live:liveArenaMatchKeys.get(room.code)===room.code+':'+matchKey,commanders:commanderProfiles.map(profile=>profile?{commanderId:profile.commanderId,levels:{...profile.levels}}:null)};
 if(!sync.result.live&&room.battleSettlementPending&&!room.matchSettled){settleFinishedMatch(room,result.winner);room.battleSettlementPending=false;}
 }markRoom(room);
 }
 return send(200,{ready:sync.ready.map(Boolean),started:Boolean(sync.result),result:sync.result?{...sync.result,summary:orientBattleSummary(sync.result.summary,seat),winner:sync.result.winner===null?null:sync.result.winner===seat?0:1,teams:seat===0?sync.result.teams:[...sync.result.teams].reverse(),initialShields:seat===0?sync.result.initialShields:sync.result.initialShields?.slice().reverse(),commanders:seat===0?sync.result.commanders:[...sync.result.commanders].reverse(),log:seat===0?sync.result.log:sync.result.log.map(e=>({...e,side:typeof e.side==='number'?1-e.side:e.side,shieldSnapshot:e.shieldSnapshot?.slice().reverse()}))}:null});
 }catch(e){return send(422,{error:e.message})}
}
if(req.method==='POST'&&url.pathname==='/api/battle-auction-formation'){
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4000)return send(413,{error:'İstek çok büyük'})}
 let body;try{body=JSON.parse(raw)}catch{return send(400,{error:'Geçersiz JSON'})}
 const room=rooms.get(String(body?.code||'').toUpperCase()),seat=room?.players?.findIndex(p=>p?.token===body?.token)??-1;
 if(!room||seat<0)return send(403,{error:'Yetkisiz oda'});
 if(room.phase!=='finished')return send(409,{error:'Açık artırma tamamlanmadı'});
 try{
  const teams=preparationTeams(prepareBattleTeams(auctionRoomToBattleState(room))),sync=ensureBattlePreparation(room,teams);
  if(body.matchKey!==sync.key)return send(409,{error:'Diziliş başka bir maça ait.'});
  if(sync.ready[seat]||sync.result)return send(409,{error:'Hazır diziliş değiştirilemez.'});
  if(!validateFormation(body,teams[seat]))return send(400,{error:'Geçersiz diziliş veya kart türü'});
  sync.drafts[seat]={positions:[...body.positions],lanes:[...body.lanes],roles:[...body.roles]};
  markRoom(room);
  return send(200,{preparation:preparationView(sync,seat)});
 }catch(e){return send(422,{error:e.message})}
}
if(req.method==='GET'&&url.pathname==='/api/battle-auction-team'){
 const room=rooms.get(String(url.searchParams.get('code')||'').toUpperCase());
 const seat=room?.players?.findIndex(p=>p?.token===url.searchParams.get('token'))??-1;
 if(!room||seat<0)return send(403,{error:'Oda veya oyuncu yetkisi geçersiz.'});
 if(room.phase!=='finished')return send(409,{error:'Açık artırma henüz bitmedi.'});
 try{
  const state=auctionRoomToBattleState(room);
  const teams=prepareBattleTeams(state);
  const sync=ensureBattlePreparation(room,preparationTeams(teams));
  return send(200,{ready:true,seat,preparation:preparationView(sync,seat),credits:[state.remainingCreditsA,state.remainingCreditsB],teams:teams.map(team=>team.map(card=>{const hero=battleRoster.find(h=>h.id===card.id);return {...card,name:hero.name,universe:hero.universe,role:hero.role,laneModifiers:hero.laneModifiers}}))});
 }catch(e){return send(422,{error:'Bu açık artırma 2.0 savaşına uygun değil: '+e.message})}
}
if(req.method==='GET'&&url.pathname==='/api/battle-room'){const session=battleSessions.get(String(url.searchParams.get('code')||'').toUpperCase());const view=session&&battleSessionView(session,url.searchParams.get('token'));return view?send(200,view):send(404,{error:'Oda veya oturum bulunamadı.'})}
if(req.method==='POST'&&url.pathname==='/api/battle-room'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4000)return send(413,{error:'İstek çok büyük'})}let body;try{body=JSON.parse(raw)}catch{return send(400,{error:'Geçersiz veri'})}const action=body?.action;let session;if(action==='create'){let code;do{code=String(100000+crypto.randomInt(900000))}while(battleSessions.has(code));session={code,created:Date.now(),players:[{token:crypto.randomBytes(24).toString('hex'),ready:false,positions:null},null],result:null};battleSessions.set(code,session);return send(200,{...battleSessionView(session,session.players[0].token),token:session.players[0].token})}
 session=battleSessions.get(String(body?.code||'').toUpperCase());if(!session)return send(404,{error:'Oda bulunamadı'});
 if(action==='join'){if(session.players[1]&&!session.players[1].left)return send(409,{error:'Oda dolu'});session.players[1]={token:crypto.randomBytes(24).toString('hex'),ready:false,positions:null};return send(200,{...battleSessionView(session,session.players[1].token),token:session.players[1].token})}
 const seat=session.players.findIndex(p=>p?.token===body?.token);if(seat<0||session.players[seat].left)return send(403,{error:'Geçersiz oturum'});if(action==='leave'){session.players[seat].left=true;session.players[seat].ready=false;if(session.players.every(p=>!p||p.left))battleSessions.delete(session.code);return send(200,{ok:true,left:true})}if(action==='ready'){if(!validBattlePositions(body.positions))return send(400,{error:'Geçersiz diziliş'});if(session.result)return send(409,{error:'Savaş başladı'});if(!Array.isArray(body.lanes)||body.lanes.length!==5||body.lanes.some(l=>l!=='front'&&l!=='back'))return send(400,{error:'Geçersiz ön/arka saf dizilişi'});if(!Array.isArray(body.roles)||body.roles.length!==5||body.roles.some(role=>!['tank','fighter','energy','assassin','support'].includes(role)))return send(400,{error:'Geçersiz savaş rolü'});session.players[seat].roles=body.roles;session.players[seat].lanes=body.lanes;session.players[seat].positions=body.positions;session.players[seat].ready=true;if(session.players.every(p=>p?.ready))session.result=battleSessionResult(session);return send(200,battleSessionView(session,body.token))}return send(400,{error:'Geçersiz işlem'})}
if(req.method==='POST'&&url.pathname==='/api/commander-manual-demo'){
 // Isolated training arena: fixed server-side teams, no rooms, accounts, currency or payouts.
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>6000)return send(413,{error:'İstek çok büyük'})}
 let body;try{body=JSON.parse(raw)}catch{return send(400,{error:'Geçersiz JSON'})}
 const commanderId=String(body?.commanderId||'');if(!resolveCommander(commanderId))return send(400,{error:'Geçersiz komutan'});
 const actions=body?.actions;if(!Array.isArray(actions)||actions.length>15||actions.some(a=>!a||!Number.isInteger(a.round)||a.round<1||a.round>15||!['normal','ultimate'].includes(a.ability)))return send(400,{error:'Geçersiz yetenek listesi'});
 const seen=new Set();if(actions.some(a=>{if(seen.has(a.round))return true;seen.add(a.round);return false}))return send(400,{error:'Bir turda yalnızca bir yetenek kullanılabilir'});
 const idsA=["original:01", "original:02", "original:03", "original:04", "original:05"];
 const idsB=["original:06", "original:07", "original:08", "original:09", "original:10"];
 const cards=ids=>ids.map((id,i)=>({id,power:stablePower(id),lane:i<2?'front':'back'}));
 const commander={commanderId,levels:{attack:0,defense:0,magic:0,support:0}};
 try{const result=simulateRosterBattle(cards(idsA),cards(idsB),{seed:'manual-commander-training-v1',maxRounds:15,commanders:[commander,null],commanderActions:actions.map(a=>({side:0,round:a.round,ability:a.ability}))});return send(200,{rounds:result.rounds,winner:result.winner,teams:result.teams.map(team=>team.map(u=>({id:u.id,name:u.name,maxHp:u.maxHp}))),log:result.log});}
 catch(e){return send(400,{error:e.message})}
}
if(req.method==='GET'&&url.pathname==='/api/arena-3d-demo'){
 // Fixed, public rehearsal. No supplied teams, rooms, identities or gold operations.
 return send(200,arena3dDemo??=(createArena3dDemo()));
}
if(req.method==='GET'&&url.pathname.startsWith('/vendor/three-0.186.1/')){
 const name=url.pathname.slice('/vendor/three-0.186.1/'.length);
 const allowed={'three.module.js':'build/three.module.js','three.core.js':'build/three.core.js','addons/loaders/GLTFLoader.js':'examples/jsm/loaders/GLTFLoader.js','addons/utils/BufferGeometryUtils.js':'examples/jsm/utils/BufferGeometryUtils.js','addons/utils/SkeletonUtils.js':'examples/jsm/utils/SkeletonUtils.js'};
 if(!Object.hasOwn(allowed,name))return send(404,{error:'Bulunamadı'});
 if(!threeAssetCache.has(name)){const raw=fs.readFileSync(path.join(root,'node_modules/three',allowed[name]));threeAssetCache.set(name,{raw,gzip:gzipSync(raw)});}
 const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');
 res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=31536000, immutable','Vary':'Accept-Encoding',...(gzip?{'Content-Encoding':'gzip'}:{})});
 res.end(threeAssetCache.get(name)[gzip?'gzip':'raw']);return;
}
if(req.method==='GET'&&url.pathname==='/api/battle-preview'){
 // Fixed public demo teams. This endpoint never accesses rooms, accounts or wallets.
 const idsA=["original:01", "original:02", "original:03", "original:04", "original:05"];
 const idsB=["original:06", "original:07", "original:08", "original:09", "original:10"];
 const roles=['tank','fighter','energy'];
 const selected=String(url.searchParams.get('roles')||'').split(',');
 if(selected.length!==5||selected.some(role=>!roles.includes(role)))return send(400,{error:'Beş geçerli rol seçilmelidir.'});
 const positions=String(url.searchParams.get('positions')||'0,1,2,3,4').split(',').map(Number);
 if(positions.length!==5||new Set(positions).size!==5||positions.some(n=>!Number.isInteger(n)||n<0||n>4))return send(400,{error:'Beş farklı yuva seçilmelidir.'});
 const cards=(ids,custom)=>ids.map((id,i)=>({id,power:stablePower(id),...(custom?{role:selected[i]}:{})}));
 const chosen=cards(idsA,true);
 const laneParam=String(url.searchParams.get('lanes')||'front,front,back,back,back').split(',');if(laneParam.length!==5||laneParam.some(l=>l!=='front'&&l!=='back'))return send(400,{error:'Geçersiz saf'});const ordered=positions.map((heroIndex,i)=>({...chosen[heroIndex],lane:laneParam[i],role:laneParam[i]==='back'?'energy':selected[i]}));
 const result=simulateRosterBattle(ordered,cards(idsB,false),{seed:'hero-auction-preview-v1'});
 return send(200,{demo:true,winner:result.winner,rounds:result.rounds,teams:result.teams,initialShields:result.initialShields,log:result.log});
}
if(req.method==='GET'&&url.pathname==='/api/events'){const r=rooms.get((url.searchParams.get('code')||'').toUpperCase());const t=url.searchParams.get('token');const seat=r?.players.findIndex(p=>p&&p.token===t)??-1;const loggedIn=readLogin(url.searchParams.get('authToken'));if(!r||seat<0||!loggedIn||r.players[seat].accountId!==loggedIn.sub)return send(403,{error:'Yetkisiz'});res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(publicRoom(r,seat))}\n\n`);const clients=listeners.get(r.code)||new Set();clients.add({res,seat});listeners.set(r.code,clients);const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': heartbeat\n\n')},15000);req.on('close',()=>{clearInterval(heartbeat);for(const c of clients)if(c.res===res)clients.delete(c);if(!clients.size)listeners.delete(r.code)});return}
if(req.method==='GET'&&url.pathname==='/api/heroes'){return send(200,{heroes:battleRoster.map(h=>({id:h.id,name:h.name,universe:h.universe,role:h.role,displayRole:h.displayRole||h.role,power:stablePower(h.id),rarity:h.rarity||null,portrait:h.portrait||null,stats:h.stats||null,active:h.active||null,passive:h.passive||null,laneModifiers:h.laneModifiers||null}))});}
if(req.method==='GET'&&url.pathname==='/api/art'){
 const universe=url.searchParams.get('universe')||'';
 const name=url.searchParams.get('name')||'';
 if(universe!=='original'||name.length>100||!(catalogue.has(`${universe}:${name.toLowerCase()}`)||(universe==='original'&&battleRoster.some(hero=>hero.universe==='original'&&hero.name.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR')))))return send(400,{error:'Geçersiz karakter'});
 const key=universe+':'+name.toLowerCase();
 if(!artCache.has(key)){
  const result=await lookupCharacterInfo(universe,name);
  artCache.set(key,result);
 }
 const art=artCache.get(key);
 const hero=battleRoster.find(h=>h.universe===universe&&h.name.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR'));
 return send(200,hero?{...art,role:hero.role,active:hero.active||null,passive:hero.passive||null,laneModifiers:hero.laneModifiers||null}:art);
}
if(req.method==='GET'&&url.pathname==='/api/online'){
 const id=url.searchParams.get('visitor')||'';
 if(!/^[a-zA-Z0-9_-]{12,90}$/.test(id))return send(400,{error:'Geçersiz ziyaretçi'});
 const code=(url.searchParams.get('code')||'').toUpperCase();
 const t=url.searchParams.get('token')||'';
 const r=rooms.get(code);
 const belongs=!!r&&r.players.some(p=>p&&p.token===t);
 onlineVisitors.set(id,{seen:Date.now(),code:belongs?code:null});
 return send(200,onlineStats());
}
if(req.method==='GET'&&url.pathname==='/api/info')return send(200,{catalogueCount:catalogue.size,counts:Object.fromEntries(['original'].map(k=>[k,[...catalogue.values()].filter(x=>x.universe===k).length]))});
if(req.method==='POST'&&url.pathname.startsWith('/api/')){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)error('İstek çok büyük.')}let body;try{body=JSON.parse(raw)}catch{error('Geçersiz JSON')}return send(200,await api(url.pathname,body))}
const audioHead=req.method==='HEAD'&&path.extname(decodeURIComponent(url.pathname)).toLowerCase()==='.mp3';
if((req.method==='GET'||audioHead)&&(url.pathname==='/crazygames'||url.pathname.startsWith('/crazygames/'))){
 if(url.pathname==='/crazygames'){res.writeHead(302,{Location:'/crazygames/'});res.end();return}
 const relative=decodeURIComponent(url.pathname.slice('/crazygames/'.length))||'index.html';
 // Public game assets only; admin and development screens are not submission pages.
 if(/(?:^|\/)(?:admin|commander-training)(?:\.|$)/.test(relative))return send(404,{error:'Bulunamadı'});
 const file=path.resolve(root,'public',relative==='privacy'?'privacy.html':relative);
 if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(404,{error:'Bulunamadı'});
 const ext=path.extname(file);if(ext.toLowerCase()==='.mp3')return serveStaticAudio(req,res,file);
 res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store'});
 if(ext==='.html'||ext==='.js')res.end(crazyGamesSource(fs.readFileSync(file,'utf8'),ext));else fs.createReadStream(file).pipe(res);return;
}
if(req.method==='GET'||audioHead){const staticPath=url.pathname==='/'?'index.html':url.pathname==='/privacy'?'privacy.html':url.pathname==='/admin'?'admin.html':decodeURIComponent(url.pathname);const file=path.join(root,'public',staticPath);if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(404,{error:'Bulunamadı'});if(path.extname(file).toLowerCase()==='.mp3')return serveStaticAudio(req,res,file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);return}send(405,{error:'İzin verilmeyen yöntem'});}catch(e){send(e.status||500,{error:e.status?e.message:'Sunucu hatası'})}});
setInterval(()=>{for(const r of rooms.values()){
if(r.phase==='matching'&&Date.now()-r.created>=60000){waiting.delete(r.code);r.players[1]={name:'Bilgisayar',token:token(),credits:20,team:[]};r.mode='bot';assignBotCommander(r);r.entryPaid=false;r.phase='auction';r.deadline=Date.now()+20000;publish(r);}
tickBotBattle(r);
if(r.phase!=='auction')continue;
// A new round must start with a fresh timer and must never be deleted mid-match.
if(!r.deadline)r.deadline=Date.now()+20000;
if(r.players[r.turn].credits<=r.topBid&&r.topSeat!==null){finishAuction(r);publish(r);continue;}
if(r.mode==='bot'&&r.turn===1){
 const card=r.cards[r.round],bot=r.players[1],human=r.players[0];
 const offer=r.topBid+1,difficulty=r.difficulty||'medium';
 // Do not pass hidden exact powers or unrevealed cards to auction decisions.
 const publicPlayer=p=>({credits:p.credits,team:p.team.map(c=>({id:c.id,role:catalogue.get(c.id)?.role,rarity:rarityForPower(c.power)}))});
 const willBid=chooseBotBid({difficulty,card:{id:card.id,role:catalogue.get(card.id)?.role,rarity:rarityForPower(card.power)},bot:publicPlayer(bot),human:publicPlayer(human),round:r.round,topBid:r.topBid});
 if(willBid){r.topBid=offer;r.topSeat=1;r.openingPassSeat=null;log(r,`Bilgisayar ${offer} kredi teklif etti.`);if(human.credits<=offer)finishAuction(r);else{r.turn=0;r.deadline=Date.now()+20000;}}
 else if(r.topSeat!==null){log(r,'Bilgisayar pas geçti.');finishAuction(r);}
 else if(r.openingPassSeat===0){finishUnbidCard(r);}
 else{r.openingPassSeat=1;r.turn=0;r.deadline=Date.now()+20000;log(r,'Bilgisayar pas geçti. Sıra sende.');}
 r.lastActivity=Date.now();publish(r);continue;
}
if(r.deadline&&Date.now()>=r.deadline){const expiredSeat=r.turn;log(r,`${r.players[expiredSeat].name} süresi dolduğu için otomatik pas geçti.`);if(r.topSeat!==null){finishAuction(r);}else if(r.openingPassSeat===1-expiredSeat){finishUnbidCard(r);}else{r.openingPassSeat=expiredSeat;r.turn=1-expiredSeat;r.deadline=Date.now()+20000;log(r,`Sıra ${r.players[r.turn].name} oyuncusuna geçti.`);}r.lastActivity=Date.now();publish(r);}
}for(const [id,r]of rooms){const age=Date.now()-(r.lastActivity||r.created);const expiry=r.phase==='finished'?24*3600_000:r.phase==='waiting'?2*3600_000:r.phase==='matching'?5*60_000:r.phase==='auction'?6*3600_000:24*3600_000;if(age>expiry){liveArenaLifecycle.endRoom(id);liveArenaMatchKeys.delete(id);rooms.delete(id);dirtyRooms.add(id);waiting.delete(id);const clients=listeners.get(id);if(clients){for(const c of clients){try{c.res.end()}catch{}}listeners.delete(id)}}}for(const [id,w]of waiting)if(!rooms.has(w.code)||Date.now()-w.created>60000)waiting.delete(id)},500).unref();
setInterval(()=>{flushRooms().catch(e=>console.error('Database flush:',e.message));flushGold().catch(e=>console.error('Gold flush:',e.message))},1000).unref();
initializeDatabase().then(()=>{server.listen(PORT,'0.0.0.0',()=>console.log(`Hero Auction http://localhost:${PORT} | characters: ${catalogue.size}`));});

// Moderation evidence expiry only; no account deletion or native transport changes.
setInterval(()=>{if(moderationReady&&(!database||databaseReady))moderation.prune().catch(e=>console.error('Moderation retention cleanup:',e.message))},3600000).unref();
