import http from 'node:http';
import {awardUnbidCard} from './auction-passes.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {simulateRosterBattle,battleRoster} from './battle-roster.js';
import {createCommanderProfile,validateCommanderProfile,resolveCommander,previewCommanderUpgrade,commanderLevelCap,commanderUpgradeCost,COMMANDER_STATS} from './arena-commanders.js';
import {auctionRoomToBattleState,prepareBattleTeams} from './battle-match.js';
import {createRoomCommanderSession,submitRoomCommanderTurn,viewRoomCommanderSession} from './commander-room-bridge.js';
import {createLiveCommanderAbilities,viewLiveCommanderAbilities} from './commander-live-abilities.js';
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
const artCache=new Map();
const cardDetails=JSON.parse(fs.readFileSync(path.join(root,'public','cards.json'),'utf8'));
const auditedArt=JSON.parse(fs.readFileSync(path.join(root,'public','verified-art.json'),'utf8'));

const listeners=new Map();
const waiting=new Map();
const onlineVisitors=new Map();
const database=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000}):null;
// Rewarded advertising remains disabled until an approved, verifiable provider is integrated.
const REWARDED_AD_DAILY_LIMIT=5;
const REWARDED_AD_GOLD=100;
const rewardedAdsEnabled=false;
const dirtyRooms=new Set();
const pendingGold=new Map();
const matchRecords=new Map();
const friendLinks=new Map();
const ratings=new Map();
const rankedTier=n=>n>=1800?'Efsane':n>=1500?'Elmas':n>=1250?'Altın':n>=1050?'Gümüş':'Bronz';
const profileOf=id=>{const p=ratings.get(id)||{rating:1000,wins:0,losses:0,draws:0,name:'Oyuncu'};return {...p,tier:rankedTier(p.rating),matches:p.wins+p.losses+p.draws};};
async function saveSocial(){if(!database||!databaseReady)return;try{await database.query('INSERT INTO hero_auction_social(id,state) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET state=$2',['global',JSON.stringify({ratings:[...ratings],matches:[...matchRecords],friends:[...friendLinks].map(([id,ids])=>[id,[...ids]])})])}catch(e){console.error('Social persistence:',e.message)}}
function recordMatch(r,scores){const id=r.code+':'+(r.matchNumber||1)+':'+r.created;if(matchRecords.has(id))return;const winner=scores[0]===scores[1]?-1:scores[0]>scores[1]?0:1;const participants=r.players.map((p,i)=>({id:p.accountId||null,name:p.name,score:scores[i]}));const before=r.players.map(p=>p.accountId?profileOf(p.accountId):null);const ranked=r.mode!=='bot'&&before.every(Boolean);const deltas=ranked?before.map((p,i)=>{const opponent=before[1-i];const expected=1/(1+Math.pow(10,(opponent.rating-p.rating)/400));const actual=winner<0?0.5:winner===i?1:0;return Math.round(32*(actual-expected))}):[0,0];r.rankChange=ranked?deltas:[0,0];r.rankBefore=before.map(p=>p?.rating??null);matchRecords.set(id,{id,at:Date.now(),mode:r.mode,universe:r.universe,participants,winner,rankChange:r.rankChange});for(let i=0;i<2;i++){const p=r.players[i];if(!p.accountId)continue;const prev=before[i];const next={...prev,name:p.name,wins:prev.wins+(winner===i?1:0),losses:prev.losses+(winner>=0&&winner!==i?1:0),draws:prev.draws+(winner<0?1:0)};if(ranked)next.rating=Math.max(0,prev.rating+deltas[i]);ratings.set(p.accountId,next)}while(matchRecords.size>2000)matchRecords.delete(matchRecords.keys().next().value);void saveSocial()}

let databaseReady=false;
function markRoom(r){if(database&&r)dirtyRooms.add(r.code)}
async function initializeDatabase(){if(!database)return;try{await database.query('CREATE TABLE IF NOT EXISTS hero_auction_rooms (code VARCHAR(3) PRIMARY KEY, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_wallets (account_id TEXT PRIMARY KEY, gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0))');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_user_profiles(account_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_admin_accounts (account_id TEXT PRIMARY KEY, banned BOOLEAN NOT NULL DEFAULT false)');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_admin_audit (id BIGSERIAL PRIMARY KEY, account_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, old_gold INTEGER, new_gold INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_commanders (account_id TEXT PRIMARY KEY, profile JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_social (id TEXT PRIMARY KEY, state JSONB NOT NULL)');const social=await database.query('SELECT state FROM hero_auction_social WHERE id=$1',['global']);if(social.rows[0]){const state=social.rows[0].state;for(const [k,v] of state.ratings||[])ratings.set(k,v);for(const [k,v] of state.matches||[])matchRecords.set(k,v);for(const [k,v] of state.friends||[])friendLinks.set(k,new Set(v))}await database.query('CREATE TABLE IF NOT EXISTS hero_auction_gold_awards (award_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, amount INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE TABLE IF NOT EXISTS hero_auction_rewarded_claims (provider_event_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, reward_day DATE NOT NULL, amount INTEGER NOT NULL CHECK(amount=100), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await database.query('CREATE INDEX IF NOT EXISTS hero_auction_rewarded_claims_account_day ON hero_auction_rewarded_claims(account_id,reward_day)');const result=await database.query('SELECT code,state FROM hero_auction_rooms');for(const row of result.rows){const r=row.state;if(r&&r.code===row.code&&r.players&&r.cards){rooms.set(row.code,r);if(r.phase==='finished'&&r.goldAward)queueGoldAward(r);if(r.phase==='finished'&&r.goldRefunds)for(const a of r.goldRefunds)pendingGold.set(a.id,a);if(r.phase==='matching'&&!r.players[1])waiting.set(row.code,{code:row.code,universe:r.universe,created:r.created})}}databaseReady=true;console.log('PostgreSQL connected; restored',rooms.size,'rooms')}catch(e){console.error('PostgreSQL initialization failed:',e.message)}}
async function flushRooms(){if(!database||!databaseReady||!dirtyRooms.size)return;const codes=[...dirtyRooms];dirtyRooms.clear();for(const code of codes){const r=rooms.get(code);try{if(r)await database.query('INSERT INTO hero_auction_rooms(code,state,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(code) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()',[code,JSON.stringify(r)]);else await database.query('DELETE FROM hero_auction_rooms WHERE code=$1',[code])}catch(e){dirtyRooms.add(code);console.error('Room persistence error:',e.message)}}}

function queueGoldAward(r){const a=r.goldAward;if(a&&a.accountId&&a.id)pendingGold.set(a.id,a)}
async function goldBalance(accountId){if(!database||!databaseReady)error('Altın sistemi geçici olarak kullanılamıyor.',503);await database.query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,500) ON CONFLICT DO NOTHING',[accountId]);const result=await database.query('SELECT gold FROM hero_auction_wallets WHERE account_id=$1',[accountId]);return Number(result.rows[0]?.gold||0)}
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
async function chargeEntry(accountIds,matchId){if(!database||!databaseReady)error('Altın sistemi şu anda kullanılamıyor.',503);const ids=[...new Set(accountIds.filter(Boolean))];if(ids.length!==accountIds.filter(Boolean).length)error('Aynı hesap iki oyuncu olarak katılamaz.');const client=await database.connect();try{await client.query('BEGIN');for(const id of ids.sort()){await client.query('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,500) ON CONFLICT DO NOTHING',[id]);const paid=await client.query('UPDATE hero_auction_wallets SET gold=gold-50 WHERE account_id=$1 AND gold>=50 RETURNING gold',[id]);if(!paid.rowCount)error('Maça katılmak için en az 50 altın gerekli.')}await client.query('COMMIT');return true}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}}
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

const curated={"marvel:thanos":95,"marvel:galactus":99,"marvel:odin":95,"marvel:sentry":94,"marvel:silver surfer":93,"marvel:thor":88,"marvel:hulk":87,"marvel:scarlet witch":94,"marvel:doctor strange":91,"marvel:iron man":75,"marvel:spider-man":70,"marvel:captain america":61,"dc:the spectre":100,"dc:anti-monitor":99,"dc:doctor manhattan":99,"dc:darkseid":97,"dc:superman":92,"dc:batman":65,"dc:wonder woman":88,"dc:the flash":90,"lotr:eru ilúvatar":100,"lotr:morgoth":99,"lotr:sauron":95,"lotr:gandalf":87,"lotr:aragorn":70,"pokemon:arceus":100,"pokemon:mewtwo":94,"pokemon:rayquaza":94,"pokemon:pikachu":65};
const stablePower=(id)=>{if(Number.isInteger(cardDetails[id]?.power))return cardDetails[id].power;const original=battleRoster.find(hero=>hero.id===id);if(original?.universe==='original')return original.proposedPower;if(curated[id]!=null)return curated[id];const h=crypto.createHash("sha256").update("hero-auction-v3:"+id).digest();return 15+(h.readUInt32BE(0)%86)};
const rarityForPower=(power)=>power>=90?'legendary':power>=70?'rare':power>=50?'advanced':'common';
const liveBattleIds=new Set(battleRoster.map(x=>x.id));
const newCards=(universe)=>shuffle([...catalogue.values()].filter(x=>liveBattleIds.has(x.id)&&(universe==="mixed"||x.universe===universe))).slice(0,10).map(x=>({...x,power:stablePower(x.id)}));
const words={
 marvel:'Iron Man,Thor,Hulk,Captain America,Black Widow,Hawkeye,Scarlet Witch,Doctor Strange,Spider-Man,Black Panther,Ant-Man,Wasp,Captain Marvel,Vision,War Machine,Falcon,Winter Soldier,Loki,Thanos,Ultron,Magneto,Wolverine,Deadpool,Storm,Cyclops,Jean Grey,Professor X,Mystique,Beast,Nightcrawler,Rogue,Gambit,Silver Surfer,Galactus,Doctor Doom,Fantastic Four Human Torch,Invisible Woman,Mr Fantastic,The Thing,Ghost Rider,Blade,Venom,Carnage,Green Goblin,Kingpin,Daredevil,Punisher,Shang-Chi,She-Hulk,Sentry,Odin,Hela,Heimdall,Namor,Moon Knight,Star-Lord,Rocket Raccoon,Groot,Gamora,Drax,Mantis,Nebula,Adam Warlock,Kang,Apocalypse,Emma Frost,Colossus,Juggernaut,Kitty Pryde,Iceman,Angel,Bishop,Cable,Domino,Black Bolt,Medusa,Quicksilver,America Chavez,Ms Marvel,Iron Fist,Luke Cage,Jessica Jones,Elektra,Bullseye,Red Skull,Taskmaster,Abomination,Enchantress,Mephisto,MODOK,Kraven,Mysterio,Electro,Sandman,Lizard,Doctor Octopus,Rhino,Vulture,Shocker,Black Cat,Silk,Spider-Gwen,Miles Morales,Spider-Woman,Nick Fury,Maria Hill,Agent Coulson',
 dc:'Superman,Batman,Wonder Woman,The Flash,Green Lantern,Aquaman,Cyborg,Martian Manhunter,Green Arrow,Black Canary,Shazam,Supergirl,Batgirl,Nightwing,Robin,Red Hood,Red Robin,Blue Beetle,Booster Gold,Doctor Fate,Zatanna,John Constantine,Swamp Thing,The Spectre,Darkseid,Anti-Monitor,Doctor Manhattan,Lex Luthor,Joker,Harley Quinn,Poison Ivy,Catwoman,The Riddler,Two-Face,Bane,Scarecrow,Mr Freeze,Ra’s al Ghul,Talia al Ghul,Deathstroke,Deadshot,Black Adam,Sinestro,Atrocitus,Brainiac,Doomsday,General Zod,Reverse-Flash,Zoom,Gorilla Grodd,Captain Cold,Heat Wave,Mirror Master,Trigon,Raven,Starfire,Beast Boy,Cyborg Superman,Black Manta,Ocean Master,King Shark,Peacemaker,Bloodsport,Enchantress,Katana,The Atom,Firestorm,Hawkman,Hawkgirl,Vixen,Plastic Man,Metamorpho,Red Tornado,Orion,Mister Miracle,Big Barda,Highfather,Steppenwolf,Granny Goodness,Lobo,Parasite,Metallo,Bizarro,Solomon Grundy,Clayface,Man-Bat,Killer Croc,Calendar Man,Huntress,Question,Wildcat,Stargirl,Power Girl,Jay Garrick,Alan Scott,Jessica Cruz,John Stewart,Hal Jordan,Kyle Rayner,Guy Gardner,Barry Allen,Wally West,Impulse,Donna Troy,Cassandra Cain,Stephanie Brown',
 lotr:'Frodo Baggins,Samwise Gamgee,Meriadoc Brandybuck,Peregrin Took,Gandalf,Aragorn,Legolas,Gimli,Boromir,Faramir,Denethor,Elrond,Arwen,Galadriel,Celeborn,Thranduil,Éowyn,Éomer,Théoden,Gríma Wormtongue,Saruman,Sauron,The Witch-king of Angmar,Nazgûl,Khamûl,Gollum,Bilbo Baggins,Treebeard,Tom Bombadil,Goldberry,Radagast,Beorn,Bard the Bowman,Thorin Oakenshield,Balin,Dwalin,Kíli,Fíli,Bifur,Bofur,Bombur,Dori,Nori,Ori,Óin,Glóin,Dáin Ironfoot,Smaug,Azog,Bolg,Elendil,Isildur,Anárion,Gil-galad,Elrond Half-elven,Glorfindel,Círdan,Eärendil,Lúthien,Beren,Thingol,Melian,Fëanor,Fingolfin,Finrod Felagund,Maedhros,Maglor,Tuor,Túrin Turambar,Húrin,Morgoth,Ungoliant,Ancalagon,Glaurung,Shelob,Gothmog the Balrog,Durin’s Bane,The Mouth of Sauron,Grond the Wolf,Shagrat,Gorbag,Uglúk,Lurtz,Háma,Grimbold,Erkenbrand,Halbarad,Elladan,Elrohir,Imrahil,Beregond,Bergil,Quickbeam,Farmer Maggot,Rosie Cotton,Barliman Butterbur,Bill Ferny,Old Man Willow,Déagol,Fredegar Bolger,Ar-Pharazôn,Elros,Tar-Míriel,Adar'
};
const fallbackPokemon='Pikachu,Raichu,Bulbasaur,Ivysaur,Venusaur,Charmander,Charmeleon,Charizard,Squirtle,Wartortle,Blastoise,Caterpie,Butterfree,Beedrill,Pidgeot,Rattata,Raticate,Spearow,Fearow,Ekans,Arbok,Sandshrew,Sandslash,Nidoran,Nidoqueen,Nidoking,Clefairy,Clefable,Vulpix,Ninetales,Jigglypuff,Wigglytuff,Zubat,Golbat,Oddish,Gloom,Vileplume,Paras,Parasect,Venonat,Venomoth,Diglett,Dugtrio,Meowth,Persian,Psyduck,Golduck,Mankey,Primeape,Growlithe,Arcanine,Poliwag,Poliwhirl,Poliwrath,Abra,Kadabra,Alakazam,Machop,Machoke,Machamp,Bellsprout,Weepinbell,Victreebel,Tentacool,Tentacruel,Geodude,Graveler,Golem,Ponyta,Rapidash,Slowpoke,Slowbro,Magnemite,Magneton,Farfetchd,Doduo,Dodrio,Seel,Dewgong,Grimer,Muk,Shellder,Cloyster,Gastly,Haunter,Gengar,Onix,Drowzee,Hypno,Krabby,Kingler,Voltorb,Electrode,Exeggcute,Exeggutor,Cubone,Marowak,Hitmonlee,Hitmonchan,Lickitung,Koffing,Weezing,Rhyhorn,Rhydon,Chansey,Tangela,Kangaskhan,Horsea,Seadra,Goldeen,Seaking,Staryu,Starmie,Mr Mime,Scyther,Jynx,Electabuzz,Magmar,Pinsir,Tauros,Magikarp,Gyarados,Lapras,Ditto,Eevee,Vaporeon,Jolteon,Flareon,Porygon,Omanyte,Omastar,Kabuto,Kabutops,Aerodactyl,Snorlax,Articuno,Zapdos,Moltres,Dratini,Dragonair,Dragonite,Mewtwo,Mew';
const catalogue=new Map();
function add(universe,names){for(const name of names){const n=name.trim();if(n)catalogue.set(`${universe}:${n.toLowerCase()}`,{id:`${universe}:${n.toLowerCase()}`,name:n,universe});}}
for(const [k,v] of Object.entries(words))add(k,v.split(','));add('pokemon',fallbackPokemon.split(','));
// Original Hero Auction characters are additive: preserve all existing catalogue entries.
for(const hero of battleRoster.filter(hero=>hero.universe==='original'))catalogue.set(hero.id,{id:hero.id,name:hero.name,universe:hero.universe,role:hero.role,rarity:hero.rarity,portrait:hero.portrait});
for(const [key,value] of Object.entries(cardDetails)){if(key.startsWith('pokemon:')&&value.pokedex&&value.name)add('pokemon',[value.name]);}
async function loadPokemon(){try{const r=await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1025',{signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error('API status '+r.status);const j=await r.json();for(const x of j.results)add('pokemon',[x.name.split('-').map(y=>y[0].toUpperCase()+y.slice(1)).join(' ')]);console.log('Loaded Pokemon species:',j.results.length);}catch(e){console.warn('PokeAPI unavailable; using bundled Kanto fallback:',e.message)}}
await loadPokemon();
const rand=n=>crypto.randomInt(n);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const code=()=>String(crypto.randomInt(100,1000));
const token=()=>crypto.randomBytes(24).toString('hex');
const publicRoom=(r,seat)=>({code:r.code,universe:r.universe,phase:r.phase,round:r.round,turn:r.turn,deadline:r.deadline||null,series:r.series||[0,0],rematch:r.rematch||[false,false],mode:r.mode||"friend",difficulty:r.mode==='bot'?(r.difficulty||'medium'):null,rankChange:r.phase==='finished'?(r.rankChange||[0,0]):null,rankBefore:r.phase==='finished'?(r.rankBefore||[null,null]):null,topBid:r.topBid,topSeat:r.topSeat,history:r.history,chat:r.chat||[],players:r.players.map((p,i)=>p?{name:p.name,credits:p.credits,team:p.team.map(x=>({name:x.name,universe:x.universe,cost:x.cost,rarity:rarityForPower(x.power)})),connected:true,seat:i}:null),card:r.phase==='auction'?{name:r.cards[r.round].name,universe:r.cards[r.round].universe,rarity:rarityForPower(r.cards[r.round].power)}:null,final:r.phase==='finished'?r.players.map(p=>({name:p.name,score:Math.round(p.team.reduce((a,c)=>a+c.power,0)*(1+p.credits*0.01)*100)/100,credits:p.credits,team:p.team.map(c=>({name:c.name,universe:c.universe,cost:c.cost,power:c.power,rarity:rarityForPower(c.power)}))})):null,me:seat,catalogueCount:catalogue.size});
function publish(r){markRoom(r);for(const client of listeners.get(r.code)||[]){try{client.res.write(`data: ${JSON.stringify(publicRoom(r,client.seat))}\n\n`)}catch{}}}
function log(r,msg){r.history.push(msg);if(r.history.length>30)r.history.shift();}
function forcedCardCost(card){return ({common:2,advanced:3,rare:4,legendary:5})[rarityForPower(card.power)]||2}
function finishUnbidCard(r){const {seat,card,cost}=awardUnbidCard(r,forcedCardCost);log(r,`${r.players[seat].name} ${card.name} karakterini iki pas sonrası ${cost} krediye aldı.`);advanceRound(r)}
function advanceRound(r){
 r.deadline=null;
 while(r.round<10){
  const open=r.players.map((p,i)=>p.team.length<5?i:-1).filter(i=>i>=0);
  if(!open.length)break;
  if(open.length===1){
   const seat=open[0],card=r.cards[r.round],cost=forcedCardCost(card);
   r.players[seat].credits-=cost;
   r.players[seat].team.push({...card,cost});
   log(r,`${r.players[seat].name} ${card.name} karakterini zorunlu alımda ${cost} krediye aldı.`);
   r.round++;continue;
  }
  const funded=open.filter(i=>r.players[i].credits>0);
  if(!funded.length){
   const seat=open.reduce((best,i)=>best<0||r.players[i].team.length<r.players[best].team.length?i:best,-1);
   const card=r.cards[r.round],cost=forcedCardCost(card);
   r.players[seat].credits-=cost;r.players[seat].team.push({...card,cost});
   log(r,`${r.players[seat].name} ${card.name} karakterini ${cost} krediye aldı (eksi bakiye uygulanabilir).`);
   r.round++;continue;
  }
  if(funded.length===1){
   const seat=funded[0],card=r.cards[r.round],cost=forcedCardCost(card);
   r.players[seat].credits-=cost;r.players[seat].team.push({...card,cost});
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
   r.goldAward={id:r.code+':'+(r.matchNumber||1)+':'+(r.created||0),accountId,amount:100};queueGoldAward(r);
   log(r,'🏆 Savaşı kazanan oyuncu 100 altın kazandı!');
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
function authorize(body){const r=rooms.get(String(body.code||'').toUpperCase());if(!r)error('Oda bulunamadı.',404);const seat=r.players.findIndex(p=>p&&p.token===body.token);if(seat<0)error('Oyuncu yetkisi geçersiz.',403);return{r,seat}}
async function rememberDisplayName(user){if(database&&databaseReady&&user?.sub&&user?.name)await database.query('INSERT INTO hero_auction_user_profiles(account_id,display_name) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=NOW()',[user.sub,user.name]);}
async function adminApi(url,b){
 const user=readLogin(b.authToken);
 if(!user||!ADMIN_GOOGLE_EMAIL||user.email!==ADMIN_GOOGLE_EMAIL||user.sub.startsWith('guest:'))error('Yönetici yetkisi gerekli.',403);
 if(!database||!databaseReady)error('Veritabanı kullanılamıyor.',503);
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
async function api(url,b){if(url.startsWith('/api/admin/'))return adminApi(url,b);if(url==='/api/auth/check'){const user=readLogin(b.authToken);if(!user)error('Oturumun sona erdi. Yeniden giriş yap.',401);await rememberDisplayName(user);return{user:{name:user.name},gold:await goldBalance(user.sub)}}if(url==='/api/auth/guest'){const name=String(b.name||'Oyuncu').trim().slice(0,24)||'Oyuncu';const user={sub:'guest:'+crypto.randomUUID(),name};await rememberDisplayName(user);return{user:{name},authToken:signLogin(user),gold:await goldBalance(user.sub)}}
if(!url.startsWith('/api/auth/')){const user=readLogin(b.authToken);if(!user)error('Odaya erişmek için giriş yapmalısın.',401);if(databaseReady){const block=await database.query('SELECT banned FROM hero_auction_admin_accounts WHERE account_id=$1',[user.sub]);if(block.rows[0]?.banned)error('Hesap askıya alınmıştır.',403)}}
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
  const wallet=await client.query('UPDATE hero_auction_wallets SET gold=gold-5000 WHERE account_id=$1 AND gold>=5000 RETURNING gold',[user.sub]);
  if(!wallet.rows.length)error('Komutan değiştirmek için 5.000 altın gerekiyor.',409);
  const changed={commanderId:newCommanderId,levels:{...profile.levels}};
  await client.query('UPDATE hero_auction_commanders SET profile=$2::jsonb,updated_at=NOW() WHERE account_id=$1',[user.sub,JSON.stringify(changed)]);
  await client.query('COMMIT');
  return{profile:changed,gold:Number(wallet.rows[0].gold),cost:5000};
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
if(url==='/api/leaderboard'){return{players:[...ratings.entries()].map(([id,p])=>({id,...profileOf(id)})).sort((a,b)=>b.rating-a.rating).slice(0,30)}}
if(url==='/api/friends'){const u=readLogin(b.authToken);return{friends:[...(friendLinks.get(u.sub)||[])].map(id=>({id,...profileOf(id)}))}} 
if(url==='/api/friend/add'){const u=readLogin(b.authToken);const id=String(b.accountId||'').trim();if(!id||id===u.sub||!ratings.has(id))error('Oyuncu bulunamadı.');if(!friendLinks.has(u.sub))friendLinks.set(u.sub,new Set());friendLinks.get(u.sub).add(id);await saveSocial();return{ok:true}}
if(url==='/api/friend/remove'){const u=readLogin(b.authToken);friendLinks.get(u.sub)?.delete(String(b.accountId||''));await saveSocial();return{ok:true}}
if(url==='/api/spectate/list'){return{matches:[...rooms.values()].filter(r=>r.phase==='auction'&&r.mode!=='bot').map(r=>({code:r.code,universe:r.universe,round:r.round,players:r.players.map(p=>p?.name||'Bekleniyor')})).slice(0,30)}}
if(url==='/api/spectate'){const r=rooms.get(String(b.code||''));if(!r||r.phase!=='auction'||r.mode==='bot')error('İzlenebilir maç bulunamadı.',404);return{room:publicRoom(r,-1)}}
if(url==='/api/rewarded/status'){return await rewardedAdStatus(readLogin(b.authToken).sub)}
if(url==='/api/rewarded/claim'){error('Ödüllü reklam sistemi henüz etkin değil.',503)}
if(url==='/api/wallet'){return{gold:await goldBalance(readLogin(b.authToken).sub)}}
if(url==='/api/auth/google'){const credential=String(b.credential||'');if(credential.length<100||credential.length>8000)error('Geçersiz Google kimliği.');const response=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(credential),{signal:AbortSignal.timeout(8000)});if(!response.ok)error('Google kimliği doğrulanamadı.',401);const claims=await response.json();if(claims.aud!==GOOGLE_CLIENT_ID||!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||Number(claims.exp)*1000<Date.now()||!claims.sub||claims.email_verified!=='true')error('Google kimliği doğrulanamadı.',401);const user={sub:claims.sub,name:String(claims.name||claims.given_name||'Oyuncu').slice(0,24),email:String(claims.email||'').toLowerCase()};await rememberDisplayName(user);return{user,authToken:signLogin(user),gold:await goldBalance(user.sub)}}
if(url==='/api/create'){const name=chosenName(b,'Oyuncu 1');const universe=['marvel','dc','mixed'].includes(b.universe)?b.universe:'mixed';const pool=shuffle([...catalogue.values()].filter(x=>universe==='mixed'||x.universe===universe));if(pool.length<10)error('Bu evrende yeterli karakter yok.');const cards=pool.slice(0,10).map(x=>({...x,power:stablePower(x.id)}));let id;do{id=code()}while(rooms.has(id));const t=token();const accountId=readLogin(b.authToken).sub;const r={code:id,universe,cards,round:0,phase:'waiting',turn:0,topBid:0,topSeat:null,players:[{name,token:t,accountId,credits:20,team:[]},null],history:[],created:Date.now(),series:[0,0],rematch:[false,false],deadline:null,mode:'friend'};rooms.set(id,r);markRoom(r);return{token:t,room:publicRoom(r,0)}}
if(url==='/api/join'){const r=rooms.get(String(b.code||'').toUpperCase());if(!r)error('Oda bulunamadı.',404);if(r.players[1])error('Oda dolu.');await chargeEntry([r.players[0].accountId,readLogin(b.authToken).sub],r.code);const t=token();r.entryPaid=true;r.players[1]={name:chosenName(b,'Oyuncu 2'),token:t,accountId:readLogin(b.authToken).sub,credits:20,team:[]};r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;log(r,`Oyun başladı. 1. kart için açılış: ${r.players[0].name}`);publish(r);return{token:t,room:publicRoom(r,1)}}
if(url==='/api/rematch'){const{r,seat}=authorize(b);if(r.battleSettlementPending&&!r.matchSettled)error('Savaş sonucu henüz kesinleşmedi.');if(r.players.every(p=>p?.team?.length===5)&&r.battleSync?.result&&!r.battleCompleted?.[seat])error('Önce 2.0 savaşını tamamlamalısın.');if(r.phase!=='finished')error('Maç henüz bitmedi.');r.rematch[seat]=true;if(r.mode==='bot')r.rematch[1]=true;if(r.rematch.every(Boolean)){if(r.mode!=='bot'){try{await chargeEntry(r.players.map(p=>p.accountId),r.code);}catch(e){r.rematch=[false,false];throw e}}r.entryPaid=r.mode!=='bot';r.goldRefunds=null;r.matchNumber=(r.matchNumber||1)+1;r.goldAward=null;r.rankChange=null;r.rankBefore=null;r.cards=newCards(r.universe);r.round=0;r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;r.topBid=0;r.topSeat=null;r.history=[];r.openingPassSeat=null;r.rematch=[false,false];r.battleCompleted=[false,false];r.matchSettled=false;r.battleSettlementPending=false;r.battleSync=null;r.created=Date.now();r.lastActivity=Date.now();for(const p of r.players){p.credits=20;p.team=[];}log(r,'Rövanş başladı!');}publish(r);return{room:publicRoom(r,seat)}}
if(url==='/api/bot'){const difficulty=['easy','medium','hard'].includes(b.difficulty)?b.difficulty:'medium';const universe=['marvel','dc','mixed'].includes(b.universe)?b.universe:'mixed';const name=chosenName(b,'Oyuncu');let id;do{id=code()}while(rooms.has(id));const t=token();const r={entryPaid:false,code:id,universe,cards:newCards(universe),round:0,phase:'auction',turn:0,deadline:Date.now()+20000,topBid:0,topSeat:null,players:[{name,token:t,accountId:readLogin(b.authToken).sub,credits:20,team:[]},{name:'Bilgisayar',token:token(),credits:20,team:[]}],history:[],created:Date.now(),series:[0,0],rematch:[false,false],mode:'bot',difficulty};rooms.set(id,r);markRoom(r);return{token:t,room:publicRoom(r,0)}}
if(url==='/api/match'){const universe=['marvel','dc','mixed'].includes(b.universe)?b.universe:'mixed';const name=chosenName(b,'Oyuncu');for(const [key,item] of waiting){if(item.universe!==universe||Date.now()-item.created>60000)continue;const r=rooms.get(item.code);if(!r||r.players[1]){waiting.delete(key);continue;}await chargeEntry([r.players[0].accountId,readLogin(b.authToken).sub],r.code);const t=token();r.entryPaid=true;r.players[1]={name,token:t,accountId:readLogin(b.authToken).sub,credits:20,team:[]};r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;r.mode='random';waiting.delete(key);publish(r);return{token:t,room:publicRoom(r,1)}}let id;do{id=code()}while(rooms.has(id));const t=token();const r={code:id,universe,cards:newCards(universe),round:0,phase:'matching',turn:0,deadline:null,topBid:0,topSeat:null,players:[{name,token:t,accountId:readLogin(b.authToken).sub,credits:20,team:[]},null],history:[],created:Date.now(),series:[0,0],rematch:[false,false],mode:'random'};rooms.set(id,r);markRoom(r);waiting.set(id,{code:id,universe,created:Date.now()});return{token:t,room:publicRoom(r,0)}}
if(url==='/api/chat'){const{r,seat}=authorize(b);if(r.mode==='bot')error('Sohbet yalnızca gerçek oyuncularla kullanılabilir.');const message=String(b.message||'').trim().replace(/[\u0000-\u001f\u007f]/g,' ');if(!message||message.length>240)error('Mesaj 1–240 karakter olmalı.');if(Date.now()-(r.lastChatAt?.[seat]||0)<1000)error('Yeni mesaj için bir saniye bekle.');r.lastChatAt??=[0,0];r.lastChatAt[seat]=Date.now();r.chat??=[];r.chat.push({seat,name:r.players[seat].name,message,time:Date.now()});if(r.chat.length>60)r.chat.shift();r.lastActivity=Date.now();publish(r);return{room:publicRoom(r,seat)}}
if(url==='/api/state'){const{r,seat}=authorize(b);r.lastActivity=Date.now();return{room:publicRoom(r,seat)}}
if(url==='/api/bid'){const{r,seat}=authorize(b);if(r.phase!=='auction')error('İhale aktif değil.');if(r.turn!==seat)error('Teklif sırası sende değil.');const amount=Number(b.amount);if(!Number.isInteger(amount)||amount<=r.topBid||amount>r.players[seat].credits)error('Teklif tutarı geçersiz.');if(r.players[seat].team.length>=5)error('Takımın tamamlandı.');r.topBid=amount;r.topSeat=seat;r.openingPassSeat=null;log(r,`${r.players[seat].name} ${amount} kredi teklif etti.`);const other=1-seat;if(r.players[other].credits<=amount||r.players[other].team.length>=5){finishAuction(r);}else{r.turn=other;r.deadline=Date.now()+20000;}publish(r);return{room:publicRoom(r,seat)}}
if(url==='/api/pass'){const{r,seat}=authorize(b);if(r.phase!=='auction'||r.turn!==seat)error('Şu an çekilemezsin.');if(r.topSeat===null){if(r.openingPassSeat===1-seat){finishUnbidCard(r);}else{r.openingPassSeat=seat;r.turn=1-seat;r.deadline=Date.now()+20000;log(r,r.players[seat].name+' pas geçti.');}}else finishAuction(r);publish(r);return{room:publicRoom(r,seat)}}
error('Bilinmeyen işlem.',404)}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
// Public encyclopedia thumbnails and Turkish character summaries. No image is fabricated.
// Some characters have no verified illustration or Turkish encyclopedia entry.
const characterHints={marvel:'Marvel Comics',dc:'DC Comics',lotr:'Tolkien',pokemon:'Pokémon'};
const knownDescriptions={
 'marvel:thanos':'Thanos, Marvel evreninin en güçlü kozmik tehditlerinden biridir. Sonsuzluk Taşları ile evrenin kaderini değiştirmeye çalışır.',
 'marvel:iron man':'Tony Stark, gelişmiş zırhlar tasarlayan dahi bir mucit ve Avengers üyesidir.',
 'marvel:thor':'Thor, Asgardlı gök gürültüsü tanrısı ve güçlü bir Avengers üyesidir.',
 'marvel:hulk':'Bruce Banner, öfkelendiğinde olağanüstü güce sahip Hulk’a dönüşür.',
 'marvel:spider-man':'Peter Parker, örümcek benzeri güçlere ve güçlü bir sorumluluk duygusuna sahip kahramandır.',
 'marvel:scarlet witch':'Wanda Maximoff, gerçekliği değiştirebilen olağanüstü büyü güçlerine sahiptir.',
 'marvel:doctor strange':'Stephen Strange, mistik sanatları kullanarak dünyayı büyülü tehditlerden korur.',
 'marvel:galactus':'Galactus, yaşamını sürdürmek için gezegenlerin enerjisini tüketen kozmik bir varlıktır.',
 'dc:superman':'Kripton gezegeninden gelen Superman, uçuş ve üstün fiziksel güç gibi yeteneklere sahiptir.',
 'dc:batman':'Bruce Wayne, ileri teknoloji ve dedektiflik yetenekleriyle Gotham City’yi korur.',
 'dc:wonder woman':'Amazon savaşçısı Diana, olağanüstü güç ve savaş becerileriyle tanınır.',
 'dc:the flash':'Flash, Süper Hız Gücü sayesinde olağanüstü hızlarda hareket eder.',
 'dc:darkseid':'Darkseid, Apokolips’in hükümdarı ve DC evreninin en tehlikeli kozmik düşmanlarından biridir.',
 'dc:doctor manhattan':'Doctor Manhattan, maddeyi atomik düzeyde kontrol edebilen son derece güçlü bir varlıktır.',
 'dc:the spectre':'Spectre, ilahi intikamın doğaüstü temsilcisi olarak tasvir edilir.',
 'lotr:gandalf':'Gandalf, Orta Dünya’da özgür halklara yol gösteren güçlü bir büyücüdür.',
 'lotr:aragorn':'Aragorn, Gondor tahtının varisi ve Yüzük Savaşı’nın önde gelen liderlerindendir.',
 'lotr:sauron':'Sauron, Tek Yüzük’ü yaratan ve Orta Dünya’ya hükmetmeye çalışan Karanlık Lord’dur.',
 'lotr:frodo baggins':'Frodo, Tek Yüzük’ü Mordor’a götürmekle görevlendirilen Hobbit’tir.',
 'lotr:legolas':'Legolas, usta bir elf okçusu ve Yüzük Kardeşliği üyesidir.',
 'lotr:morgoth':'Morgoth, Tolkien mitolojisindeki ilk Karanlık Lord ve Sauron’un eski efendisidir.',
 'pokemon:pikachu':'Pikachu, elektrik türündeki Pokémon’lardan biridir ve elektrik saldırılarıyla tanınır.',
 'pokemon:charizard':'Charizard, ateş ve uçan türündeki güçlü bir Pokémon’dur.',
 'pokemon:mewtwo':'Mewtwo, genetik deneylerle yaratılmış güçlü bir psişik Pokémon’dur.',
 'pokemon:arceus':'Arceus, Pokémon mitolojisinde evrenin yaratılışıyla ilişkilendirilen efsanevi bir Pokémon’dur.'
};
const compactText=(raw)=>{const txt=String(raw||'').replace(/\s+/g,' ').trim();if(!txt)return null;const sentences=txt.match(/[^.!?]+[.!?]+/g);return (sentences?.slice(0,2).join(' ')||txt.slice(0,210)).slice(0,320).trim()};
const verifiedRemoteArt={
 'marvel:cyclops':{
  url:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Cyclops_cosplay_at_Anime_Boston_2025-20250523_1558.jpg/450px-Cyclops_cosplay_at_Anime_Boston_2025-20250523_1558.jpg',
  source:'https://commons.wikimedia.org/wiki/File:Cyclops_cosplay_at_Anime_Boston_2025-20250523_1558.jpg',
  credit:'Abzeronow · CC BY 4.0'
 }
};
const originalHeroDescriptions={
  "original:mehmet-akgul": "Altın zırhlı efsanevi savaşçı Mehmet Akgül. Saldırı, savunma, yetenek, kontrol ve hareketlilik: 100. Sarsılmaz İrade ile kalkan kazanır.",
  "original:hakan-artun": "Gollum görselli sıradan kahraman Hakan Artun. Sinsi darbeler ve çeviklikle savaşır.",
  "original:01": "Ön safta darbeleri karşılayan, obsidyen kalkanıyla takımına zaman kazandıran dayanıklı muhafız.",
  "original:02": "Çelik siperini kurarak takım arkadaşlarını koruyan ağır zırhlı savunmacı.",
  "original:03": "Yer sarsıntılarıyla rakip düzenini bozan, güçlü ve dayanıklı kaya devi.",
  "original:04": "Buzdan kalkanı ve dondurucu etkileriyle ön hattı tutan savunma uzmanı.",
  "original:05": "Görünmezlik ve kritik darbelerle rakiplerini hazırlıksız yakalayan çevik suikastçı.",
  "original:06": "Kutsal kalkanıyla müttefiklerini koruyan, savunma odaklı ön saf savaşçısı.",
  "original:07": "Alevli kılıcıyla yakın dövüşte baskı kuran, yakıcı saldırılar kullanan savaşçı.",
  "original:08": "Uzun menzilli atışlarıyla rakiplerini yavaşlatan kadim nişancı.",
  "original:09": "Ruh çağırma yeteneğiyle savaş alanını etkileyen karanlık büyücü.",
  "original:10": "Taret kurarak uzaktan sürekli hasar veren teknik nişancı.",
  "original:11": "Buz alanı saldırılarıyla rakiplerini yavaşlatan ağır ön saf tankı.",
  "original:12": "Can çalma ve kaçış becerileriyle hayatta kalan hızlı suikastçı.",
  "original:13": "Kritik okları ve hareket kabiliyetiyle uzaktan yüksek baskı kuran okçu.",
  "original:14": "Yıldırım ve sersemletme etkileriyle yakın dövüşte rakiplerini durduran savaşçı.",
  "original:15": "Buz fırtınası ve ejderha kalkanıyla alan kontrolü sağlayan büyücü."
};
async function lookupCharacterInfo(universe,name){
 const key=universe+':'+name.toLowerCase();
 const local=cardDetails[key];
 const rosterHero=battleRoster.find(hero=>hero.universe===universe&&hero.name.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR'));
 const originalHero=universe==='original'?rosterHero:null;
 if(originalHero?.portrait&&fs.existsSync(path.join(root,'public',originalHero.portrait.slice(1))))return {url:originalHero.portrait,source:null,description:originalHeroDescriptions[originalHero.id]||originalHero.name,role:originalHero.role,laneModifiers:originalHero.laneModifiers};
 if(verifiedRemoteArt[key])return {...verifiedRemoteArt[key],description:local?.description||knownDescriptions[key]||null};
 if(auditedArt[key]?.url)return {...auditedArt[key],description:local?.description||knownDescriptions[key]||null};
 if(local?.image&&/^\/images\/[\w/-]+\.png$/i.test(local.image)&&fs.existsSync(path.join(root,'public',local.image.slice(1))))return {url:local.image,source:null,description:local.description||null};
 let image=null,source=null,description=local?.description||knownDescriptions[key]||null;
 const queries=[name+' '+characterHints[universe],name];
 // Resolve character pages directly before using broad search results.
 if(universe!=='pokemon'){
  const suffixes={marvel:[' (Marvel Comics)',' (Marvel Comics character)',' (comics)'],dc:[' (DC Comics)',' (DC Comics character)',' (comics)'],lotr:[' (Middle-earth)',' (The Lord of the Rings)']};
  const names=[name,...suffixes[universe].map(s=>name+s)];
  for(const candidate of names){
   if(image)break;
   try{
    const endpoint='https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(candidate.replaceAll(' ','_'));
    const r=await fetch(endpoint,{headers:{'User-Agent':'HeroAuction/1.3 (character image lookup; contact via GitHub)'},signal:AbortSignal.timeout(3500)});
    if(!r.ok)continue;
    const j=await r.json();
    if(j.type==='disambiguation')continue;
    const title=String(j.title||'').toLowerCase();
    const base=name.toLowerCase();
    if(title!==base&&!title.startsWith(base+' ('))continue;
    const context=(j.description||'')+' '+(j.extract||'').slice(0,350);
    const relevant={marvel:/marvel|x-men|spider-man|avengers|comic/i,dc:/dc comics|dc universe|batman|superman|comic/i,lotr:/tolkien|middle-earth|lord of the rings|silmarillion|hobbit/i};
    if(!relevant[universe].test(context))continue;
    if(j.thumbnail?.source){image=j.thumbnail.source;source=j.content_urls?.desktop?.page||null;}
   }catch{}
  }
 }

 for(const lang of ['tr','en']){
  if(image&&description)break;
  try{
   const apiUrl=new URL('https://'+lang+'.wikipedia.org/w/api.php');
   apiUrl.searchParams.set('action','query');apiUrl.searchParams.set('generator','search');
   apiUrl.searchParams.set('gsrsearch',queries[0]);apiUrl.searchParams.set('gsrlimit','6');
   apiUrl.searchParams.set('prop','pageimages|info|extracts');apiUrl.searchParams.set('inprop','url');
   apiUrl.searchParams.set('exintro','1');apiUrl.searchParams.set('explaintext','1');
   apiUrl.searchParams.set('exsentences','2');apiUrl.searchParams.set('pithumbsize','600');
   apiUrl.searchParams.set('format','json');
   const response=await fetch(apiUrl,{headers:{'User-Agent':'HeroAuction/1.2 (character information; educational demo)'},signal:AbortSignal.timeout(6500)});
   if(!response.ok)continue;
   const payload=await response.json();const pages=Object.values(payload.query?.pages||{});
   // Avoid attaching a completely unrelated search thumbnail to the character.
   const norm=x=>String(x).toLocaleLowerCase('en').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
   const needle=norm(name);
   const match=pages.find(p=>norm(p.title).includes(needle))||null;
   if(!match)continue;
   if(!image&&match.thumbnail?.source){image=match.thumbnail.source;source=match.fullurl||null;}
   if(!description&&lang==='tr'&&match.extract)description=compactText(match.extract);
  }catch{}
 }
 return {url:image,source,description:description||`${name}, ${({marvel:'Marvel',dc:'DC',lotr:'Yüzüklerin Efendisi',pokemon:'Pokémon'})[universe]} evrenindeki karakterlerden biridir. Ayrıntılı Türkçe tanıtım henüz eklenmedi.`};
}
// Isolated two-player preview sessions; no classic rooms or wallet effects.
const battleSessions=new Map();
setInterval(()=>{for(const [code,s] of battleSessions)if(Date.now()-s.created>2*3600_000)battleSessions.delete(code)},60000).unref();
const battleIdsA=['marvel:hulk','marvel:thor','marvel:wolverine','marvel:scarlet witch','marvel:iron man'];
const battleIdsB=['dc:superman','dc:wonder woman','dc:doomsday','dc:the flash','dc:doctor fate'];
function battleSessionView(session,token){const seat=session.players.findIndex(p=>p?.token===token);if(seat<0||session.players[seat].left)return null;return {code:session.code,seat,ready:session.players.map(p=>Boolean(p?.ready)),joined:session.players.map(Boolean),started:Boolean(session.result),result:session.result,created:session.created};}
function battleSessionResult(session){const cards=(ids,formation)=>formation.map((index,slot)=>({id:ids[index],power:Math.max(1,Math.min(100,Number(cardDetails[ids[index]]?.power)||70)),lane:session.players[ids===battleIdsA?0:1].lanes?.[slot]||(slot<2?'front':'back'),role:session.players[ids===battleIdsA?0:1].roles?.[slot]||((slot<2)?'tank':'energy')}));const a=cards(battleIdsA,session.players[0].positions),b=cards(battleIdsB,session.players[1].positions);const result=simulateRosterBattle(a,b,{seed:'battle-room-'+session.code+'-'+session.created});return {winner:result.winner,rounds:result.rounds,teams:result.teams,log:result.log};}
function validBattlePositions(v){return Array.isArray(v)&&v.length===5&&new Set(v).size===5&&v.every(x=>Number.isInteger(x)&&x>=0&&x<5)}
const server=http.createServer(async(req,res)=>{const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};try{const url=new URL(req.url,'http://localhost');if(req.method==='POST'&&url.pathname==='/api/battle-auction-complete'){
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000)return send(413,{error:'İstek çok büyük'})}
 let body;try{body=JSON.parse(raw)}catch{return send(400,{error:'Geçersiz veri'})}
 const room=rooms.get(String(body?.code||'').toUpperCase());const seat=room?.players?.findIndex(p=>p?.token===body?.token)??-1;
 if(!room||seat<0)return send(403,{error:'Yetkisiz'});
 if(room.phase!=='finished')return send(409,{error:'Açık artırma bitmedi'});
 try{prepareBattleTeams(auctionRoomToBattleState(room))}catch(e){return send(422,{error:e.message})}
 if(!room.battleSync?.result)return send(409,{error:'Savaş henüz başlamadı'});
 room.battleCompleted??=[false,false];room.battleCompleted[seat]=true;markRoom(room);return send(200,{ok:true,completed:room.battleCompleted,series:room.series||[0,0],seat,players:room.players.map(p=>({name:p?.name||'Oyuncu'}))});
}
if(url.pathname==='/api/experimental/commander-live'&&(req.method==='GET'||req.method==='POST')){
 if(!commanderTurnApiEnabled)return send(404,{error:'Experimental commander API disabled'});
 let body={};
 if(req.method==='POST'){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2000)return send(413,{error:'İstek çok büyük'})}
  try{body=JSON.parse(raw)}catch{return send(400,{error:'Geçersiz JSON'})}
 }else body={code:url.searchParams.get('code'),token:url.searchParams.get('token')};
 const room=rooms.get(String(body?.code||'').toUpperCase());
 const side=room?.players?.findIndex(p=>p?.token===body?.token)??-1;
 if(!room||side<0||room.mode==='bot')return send(403,{error:'Yetkisiz oda'});
 if(room.phase!=='finished'||!room.battleSync?.result||!room.battleSync?.commanderInput)return send(409,{error:'Arena henüz hazır değil'});
 const matchKey=room.code+':'+String(room.matchNumber||1)+':'+String(room.created);
 let session=liveCommanderAbilitySessions.get(matchKey);
 if(!session){
  session=createLiveCommanderAbilities({matchKey});
  liveCommanderAbilitySessions.set(matchKey,session);
 }
 try{
  if(req.method==='POST')return send(409,{error:'Anlık yetenek savaş motoruna bağlanana kadar kullanılamaz; enerji harcanmadı'});
  return send(200,{...viewLiveCommanderAbilities(session,side),mode:'preview',cooldownSeconds:5});
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
 const matchKey=String(room.matchNumber||1)+':'+String(room.created);
 if(room.battleSync?.key!==matchKey)room.battleSync={key:matchKey,ready:[null,null],result:null};
 const sync=room.battleSync;
 // Computer opponent uses an automatic, server-owned formation.
 if(room.mode==='bot'&&!sync.ready[1]){
  const botCards=teams[1].map((card,index)=>({...card,index,hero:battleRoster.find(hero=>hero.id===card.id)}));
  const hard=room.difficulty==='hard';
  const score=(card,lane)=>{
   const role=card.hero?.role||'fighter',power=Number(card.power)||0;
   const modifier=Number(card.hero?.laneModifiers?.[lane]);
   const bonus=Number.isFinite(modifier)?Math.max(-.10,Math.min(.10,modifier)):0;
   const survival=lane==='front'?(role==='tank'?18:role==='fighter'?7:role==='support'?-9:role==='energy'?-12:-5):0;
   return power*(1+bonus)+survival;
  };
  let frontIndices=[];
  if(hard){
   // Choose a resilient front line while respecting each hero's own lane modifiers.
   const ranked=botCards.map(c=>({index:c.index,advantage:score(c,'front')-score(c,'back')})).sort((a,b)=>b.advantage-a.advantage);
   const count=ranked[1]?.advantage>0?2:ranked[0]?.advantage>0?1:1;
   frontIndices=ranked.slice(0,count).map(c=>c.index);
  }else frontIndices=[0,1];
  const order=[...frontIndices,...botCards.map(c=>c.index).filter(i=>!frontIndices.includes(i))];
  sync.ready[1]={positions:order,lanes:order.map(i=>frontIndices.includes(i)?'front':'back'),roles:order.map(i=>botCards[i].hero?.role||'fighter')};
 }
 if(req.method==='POST'){
 if(sync.ready[seat])return send(409,{error:'Diziliş zaten onaylandı'});
 if(!validBattlePositions(body.positions)||!Array.isArray(body.lanes)||body.lanes.length!==5||body.lanes.some(l=>!['front','back'].includes(l)))return send(400,{error:'Geçersiz diziliş'});
 if(!Array.isArray(body.roles)||body.roles.length!==5||body.roles.some((v,i)=>v!==(battleRoster.find(hero=>hero.id===teams[seat][body.positions[i]].id)?.role)))return send(400,{error:'Kart türü değiştirilemez'});
 sync.ready[seat]={positions:body.positions,lanes:body.lanes,roles:body.roles};
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
 }
 const result=simulateRosterBattle(ordered[0],ordered[1],{seed:'auction-battle-'+room.code+'-'+matchKey,remainingCredits:[state.remainingCreditsA,state.remainingCreditsB],commanders:commanderProfiles});
 sync.commanderInput={cards:ordered,commanders:commanderProfiles,remainingCredits:[state.remainingCreditsA,state.remainingCreditsB]};
 sync.result={winner:result.winner,rounds:result.rounds,teams:result.teams,log:result.log,commanders:commanderProfiles.map(profile=>profile?{commanderId:profile.commanderId,levels:{...profile.levels}}:null)};
 if(room.battleSettlementPending&&!room.matchSettled){settleFinishedMatch(room,result.winner);room.battleSettlementPending=false;}
 }markRoom(room);
 }
 return send(200,{ready:sync.ready.map(Boolean),started:Boolean(sync.result),result:sync.result?{...sync.result,winner:sync.result.winner===null?null:sync.result.winner===seat?0:1,teams:seat===0?sync.result.teams:[...sync.result.teams].reverse(),commanders:seat===0?sync.result.commanders:[...sync.result.commanders].reverse(),log:seat===0?sync.result.log:sync.result.log.map(e=>({...e,side:typeof e.side==='number'?1-e.side:e.side}))}:null});
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
  return send(200,{ready:true,seat,credits:[state.remainingCreditsA,state.remainingCreditsB],teams:teams.map(team=>team.map(card=>{const hero=battleRoster.find(h=>h.id===card.id);return {...card,name:hero.name,universe:hero.universe,role:hero.role,laneModifiers:hero.laneModifiers}}))});
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
 const idsA=['marvel:hulk','marvel:thor','marvel:wolverine','marvel:scarlet witch','marvel:iron man'];
 const idsB=['dc:superman','dc:wonder woman','dc:doomsday','dc:the flash','dc:doctor fate'];
 const cards=ids=>ids.map((id,i)=>({id,power:Math.max(1,Math.min(100,Number(cardDetails[id]?.power)||70)),lane:i<2?'front':'back'}));
 const commander={commanderId,levels:{attack:0,defense:0,magic:0,support:0}};
 try{const result=simulateRosterBattle(cards(idsA),cards(idsB),{seed:'manual-commander-training-v1',maxRounds:15,commanders:[commander,null],commanderActions:actions.map(a=>({side:0,round:a.round,ability:a.ability}))});return send(200,{rounds:result.rounds,winner:result.winner,teams:result.teams.map(team=>team.map(u=>({id:u.id,name:u.name,maxHp:u.maxHp}))),log:result.log});}
 catch(e){return send(400,{error:e.message})}
}
if(req.method==='GET'&&url.pathname==='/api/battle-preview'){
 // Fixed public demo teams. This endpoint never accesses rooms, accounts or wallets.
 const idsA=['marvel:hulk','marvel:thor','marvel:wolverine','marvel:scarlet witch','marvel:iron man'];
 const idsB=['dc:superman','dc:wonder woman','dc:doomsday','dc:the flash','dc:doctor fate'];
 const roles=['tank','fighter','energy'];
 const selected=String(url.searchParams.get('roles')||'').split(',');
 if(selected.length!==5||selected.some(role=>!roles.includes(role)))return send(400,{error:'Beş geçerli rol seçilmelidir.'});
 const positions=String(url.searchParams.get('positions')||'0,1,2,3,4').split(',').map(Number);
 if(positions.length!==5||new Set(positions).size!==5||positions.some(n=>!Number.isInteger(n)||n<0||n>4))return send(400,{error:'Beş farklı yuva seçilmelidir.'});
 const cards=(ids,custom)=>ids.map((id,i)=>({id,power:Math.max(1,Math.min(100,Number(cardDetails[id]?.power)||70)),...(custom?{role:selected[i]}:{})}));
 const chosen=cards(idsA,true);
 const laneParam=String(url.searchParams.get('lanes')||'front,front,back,back,back').split(',');if(laneParam.length!==5||laneParam.some(l=>l!=='front'&&l!=='back'))return send(400,{error:'Geçersiz saf'});const ordered=positions.map((heroIndex,i)=>({...chosen[heroIndex],lane:laneParam[i],role:laneParam[i]==='back'?'energy':selected[i]}));
 const result=simulateRosterBattle(ordered,cards(idsB,false),{seed:'hero-auction-preview-v1'});
 return send(200,{demo:true,winner:result.winner,rounds:result.rounds,teams:result.teams,log:result.log});
}
if(req.method==='GET'&&url.pathname==='/api/events'){const r=rooms.get((url.searchParams.get('code')||'').toUpperCase());const t=url.searchParams.get('token');const seat=r?.players.findIndex(p=>p&&p.token===t)??-1;const loggedIn=readLogin(url.searchParams.get('authToken'));if(!r||seat<0||!loggedIn)return send(403,{error:'Yetkisiz'});res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(publicRoom(r,seat))}\n\n`);const clients=listeners.get(r.code)||new Set();clients.add({res,seat});listeners.set(r.code,clients);const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': heartbeat\n\n')},15000);req.on('close',()=>{clearInterval(heartbeat);for(const c of clients)if(c.res===res)clients.delete(c);if(!clients.size)listeners.delete(r.code)});return}
if(req.method==='GET'&&url.pathname==='/api/heroes'){return send(200,{heroes:battleRoster.map(h=>({id:h.id,name:h.name,universe:h.universe,role:h.role,displayRole:h.displayRole||h.role,rarity:h.rarity||null,portrait:h.portrait||null,stats:h.stats||null,active:h.active||null,passive:h.passive||null,laneModifiers:h.laneModifiers||null}))});}
if(req.method==='GET'&&url.pathname==='/api/art'){
 const universe=url.searchParams.get('universe')||'';
 const name=url.searchParams.get('name')||'';
 if(!['marvel','dc','lotr','pokemon','original'].includes(universe)||name.length>100||!(catalogue.has(`${universe}:${name.toLowerCase()}`)||(universe==='original'&&battleRoster.some(hero=>hero.universe==='original'&&hero.name.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR')))))return send(400,{error:'Geçersiz karakter'});
 const key=universe+':'+name.toLowerCase();
 if(!artCache.has(key)){
  const result=await lookupCharacterInfo(universe,name);
  artCache.set(key,result);
 }
 const art=artCache.get(key);
 const hero=battleRoster.find(h=>h.universe===universe&&h.name.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR'));
 return send(200,hero?{...art,role:hero.role,laneModifiers:hero.laneModifiers||null}:art);
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
if(req.method==='GET'&&url.pathname==='/api/info')return send(200,{catalogueCount:catalogue.size,counts:Object.fromEntries(['pokemon','marvel','dc','lotr','original'].map(k=>[k,[...catalogue.values()].filter(x=>x.universe===k).length]))});
if(req.method==='POST'&&url.pathname.startsWith('/api/')){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)error('İstek çok büyük.')}let body;try{body=JSON.parse(raw)}catch{error('Geçersiz JSON')}return send(200,await api(url.pathname,body))}
if(req.method==='GET'){const staticPath=url.pathname==='/'?'index.html':url.pathname==='/privacy'?'privacy.html':url.pathname==='/admin'?'admin.html':decodeURIComponent(url.pathname);const file=path.join(root,'public',staticPath);if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(404,{error:'Bulunamadı'});res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);return}send(405,{error:'İzin verilmeyen yöntem'});}catch(e){send(e.status||500,{error:e.status?e.message:'Sunucu hatası'})}});
setInterval(()=>{for(const r of rooms.values()){
if(r.phase==='matching'&&Date.now()-r.created>=60000){waiting.delete(r.code);r.players[1]={name:'Bilgisayar',token:token(),credits:20,team:[]};r.mode='bot';r.entryPaid=false;r.phase='auction';r.deadline=Date.now()+20000;publish(r);}
if(r.phase!=='auction')continue;
// A new round must start with a fresh timer and must never be deleted mid-match.
if(!r.deadline)r.deadline=Date.now()+20000;
if(r.players[r.turn].credits<=r.topBid&&r.topSeat!==null){finishAuction(r);publish(r);continue;}
if(r.mode==='bot'&&r.turn===1){
 const card=r.cards[r.round],bot=r.players[1],human=r.players[0];
 const offer=r.topBid+1,difficulty=r.difficulty||'medium';
 const slots=Math.max(0,5-bot.team.length),cardsLeft=r.cards.length-r.round;
 const future=r.cards.slice(r.round+1);
 const power=Number(card.power)||0;
 const futurePowers=future.map(c=>Number(c.power)||0).sort((x,y)=>y-x);
 const replacementPower=futurePowers[Math.min(Math.max(0,slots-1),futurePowers.length-1)]||0;
 const humanPower=human.team.reduce((n,c)=>n+(Number(c.power)||0),0);
 const botPower=bot.team.reduce((n,c)=>n+(Number(c.power)||0),0);
 // Preserve credits for future forced purchases and prioritize valuable cards.
 const reserve=Math.max(0,(slots-1)*3);
 const freeCredits=Math.max(0,bot.credits-reserve);
 const scarcity=cardsLeft<=slots;
 const advantage=Math.max(-15,Math.min(15,(humanPower-botPower)/Math.max(1,5-slots)));
 const strategicValue=power-replacementPower+advantage*.30;
 const idealPrice=Math.max(1,Math.min(bot.credits,
   Math.round(3+(power-55)*.14+Math.max(0,strategicValue)*.15)));
 const hardCap=scarcity?bot.credits:Math.max(1,Math.min(bot.credits,freeCredits,idealPrice));
 let willBid=false;
 if(offer<=bot.credits&&slots>0){
  if(difficulty==='easy'){
   willBid=(offer<=1&&Math.random()<.6)||(offer<=3&&Math.random()<.18);
  }else if(difficulty==='hard'){
   // Hard mode is deterministic: evaluate card quality, remaining opportunities,
   // opponent strength, credit reserve and the current auction price.
   const strongCard=power>=Math.max(65,replacementPower-3);
   const denyStrongOpponent=human.team.length<5&&power>=83&&human.credits<=offer+2;
   const qualityPremium=power>=90?3:power>=82?2:power>=74?1:0;
   const needed=slots>=3&&cardsLeft<=slots+3;
   const cap=Math.min(bot.credits,Math.max(1,hardCap+qualityPremium+(denyStrongOpponent?2:0)));
   willBid=(scarcity||strongCard||denyStrongOpponent||needed)&&offer<=cap;
  }else{
   willBid=offer<=2||Math.random()<.45;
  }
 }
 if(willBid){r.topBid=offer;r.topSeat=1;r.openingPassSeat=null;log(r,`Bilgisayar ${offer} kredi teklif etti.`);if(human.credits<=offer)finishAuction(r);else{r.turn=0;r.deadline=Date.now()+20000;}}
 else if(r.topSeat!==null){log(r,'Bilgisayar pas geçti.');finishAuction(r);}
 else if(r.openingPassSeat===0){finishUnbidCard(r);}
 else{r.openingPassSeat=1;r.turn=0;r.deadline=Date.now()+20000;log(r,'Bilgisayar pas geçti. Sıra sende.');}
 r.lastActivity=Date.now();publish(r);continue;
}
if(r.deadline&&Date.now()>=r.deadline){const expiredSeat=r.turn;log(r,`${r.players[expiredSeat].name} süresi dolduğu için otomatik pas geçti.`);if(r.topSeat!==null){finishAuction(r);}else if(r.openingPassSeat===1-expiredSeat){finishUnbidCard(r);}else{r.openingPassSeat=expiredSeat;r.turn=1-expiredSeat;r.deadline=Date.now()+20000;log(r,`Sıra ${r.players[r.turn].name} oyuncusuna geçti.`);}r.lastActivity=Date.now();publish(r);}
}for(const [id,r]of rooms){const age=Date.now()-(r.lastActivity||r.created);const expiry=r.phase==='finished'?24*3600_000:r.phase==='waiting'?2*3600_000:r.phase==='matching'?5*60_000:r.phase==='auction'?6*3600_000:24*3600_000;if(age>expiry){rooms.delete(id);dirtyRooms.add(id);waiting.delete(id);const clients=listeners.get(id);if(clients){for(const c of clients){try{c.res.end()}catch{}}listeners.delete(id)}}}for(const [id,w]of waiting)if(!rooms.has(w.code)||Date.now()-w.created>60000)waiting.delete(id)},500).unref();
setInterval(()=>{flushRooms().catch(e=>console.error('Database flush:',e.message));flushGold().catch(e=>console.error('Gold flush:',e.message))},1000).unref();
initializeDatabase().then(()=>{server.listen(PORT,'0.0.0.0',()=>console.log(`Hero Auction http://localhost:${PORT} | characters: ${catalogue.size}`));});
