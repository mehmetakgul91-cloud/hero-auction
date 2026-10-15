import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const root=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000);
const GOOGLE_CLIENT_ID=process.env.GOOGLE_CLIENT_ID||'742640702245-3e3t9m7t29fbqlkubpcqtso63l8v8bv6.apps.googleusercontent.com';
const authSecret=process.env.AUTH_SIGNING_SECRET?Buffer.from(process.env.AUTH_SIGNING_SECRET,'hex'):crypto.randomBytes(32);
function signLogin(user){const data=Buffer.from(JSON.stringify({sub:user.sub,name:user.name,expires:Date.now()+86400000})).toString('base64url');const sig=crypto.createHmac('sha256',authSecret).update(data).digest('base64url');return data+'.'+sig}
function readLogin(value){try{const [data,sig]=String(value||'').split('.');if(!data||!sig)return null;const expected=crypto.createHmac('sha256',authSecret).update(data).digest();const received=Buffer.from(sig,'base64url');if(expected.length!==received.length||!crypto.timingSafeEqual(expected,received))return null;const user=JSON.parse(Buffer.from(data,'base64url').toString());return user.expires>Date.now()?user:null}catch{return null}}
function chosenName(body,fallback){return readLogin(body.authToken)?.name||String(body.name||fallback).trim().slice(0,24)}
const rooms=new Map();
const artCache=new Map();
const cardDetails=JSON.parse(fs.readFileSync(path.join(root,'public','cards.json'),'utf8'));
const auditedArt=JSON.parse(fs.readFileSync(path.join(root,'public','verified-art.json'),'utf8'));

const listeners=new Map();
const waiting=new Map();
const onlineVisitors=new Map();
const database=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000}):null;
const dirtyRooms=new Set();
let databaseReady=false;
function markRoom(r){if(database&&r)dirtyRooms.add(r.code)}
async function initializeDatabase(){if(!database)return;try{await database.query('CREATE TABLE IF NOT EXISTS hero_auction_rooms (code VARCHAR(3) PRIMARY KEY, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');const result=await database.query('SELECT code,state FROM hero_auction_rooms');for(const row of result.rows){const r=row.state;if(r&&r.code===row.code&&r.players&&r.cards){rooms.set(row.code,r);if(r.phase==='matching'&&!r.players[1])waiting.set(row.code,{code:row.code,universe:r.universe,created:r.created})}}databaseReady=true;console.log('PostgreSQL connected; restored',rooms.size,'rooms')}catch(e){console.error('PostgreSQL initialization failed:',e.message)}}
async function flushRooms(){if(!database||!databaseReady||!dirtyRooms.size)return;const codes=[...dirtyRooms];dirtyRooms.clear();for(const code of codes){const r=rooms.get(code);try{if(r)await database.query('INSERT INTO hero_auction_rooms(code,state,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(code) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()',[code,JSON.stringify(r)]);else await database.query('DELETE FROM hero_auction_rooms WHERE code=$1',[code])}catch(e){dirtyRooms.add(code);console.error('Room persistence error:',e.message)}}}

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
const stablePower=(id)=>{if(Number.isInteger(cardDetails[id]?.power))return cardDetails[id].power;if(curated[id]!=null)return curated[id];const h=crypto.createHash("sha256").update("hero-auction-v3:"+id).digest();return 15+(h.readUInt32BE(0)%86)};
const rarityForPower=(power)=>power>=90?'legendary':power>=70?'rare':power>=50?'advanced':'common';
const newCards=(universe)=>shuffle([...catalogue.values()].filter(x=>universe==="mixed"||x.universe===universe)).slice(0,10).map(x=>({...x,power:stablePower(x.id)}));
const words={
 marvel:'Iron Man,Thor,Hulk,Captain America,Black Widow,Hawkeye,Scarlet Witch,Doctor Strange,Spider-Man,Black Panther,Ant-Man,Wasp,Captain Marvel,Vision,War Machine,Falcon,Winter Soldier,Loki,Thanos,Ultron,Magneto,Wolverine,Deadpool,Storm,Cyclops,Jean Grey,Professor X,Mystique,Beast,Nightcrawler,Rogue,Gambit,Silver Surfer,Galactus,Doctor Doom,Fantastic Four Human Torch,Invisible Woman,Mr Fantastic,The Thing,Ghost Rider,Blade,Venom,Carnage,Green Goblin,Kingpin,Daredevil,Punisher,Shang-Chi,She-Hulk,Sentry,Odin,Hela,Heimdall,Namor,Moon Knight,Star-Lord,Rocket Raccoon,Groot,Gamora,Drax,Mantis,Nebula,Adam Warlock,Kang,Apocalypse,Emma Frost,Colossus,Juggernaut,Kitty Pryde,Iceman,Angel,Bishop,Cable,Domino,Black Bolt,Medusa,Quicksilver,America Chavez,Ms Marvel,Iron Fist,Luke Cage,Jessica Jones,Elektra,Bullseye,Red Skull,Taskmaster,Abomination,Enchantress,Mephisto,MODOK,Kraven,Mysterio,Electro,Sandman,Lizard,Doctor Octopus,Rhino,Vulture,Shocker,Black Cat,Silk,Spider-Gwen,Miles Morales,Spider-Woman,Nick Fury,Maria Hill,Agent Coulson',
 dc:'Superman,Batman,Wonder Woman,The Flash,Green Lantern,Aquaman,Cyborg,Martian Manhunter,Green Arrow,Black Canary,Shazam,Supergirl,Batgirl,Nightwing,Robin,Red Hood,Red Robin,Blue Beetle,Booster Gold,Doctor Fate,Zatanna,John Constantine,Swamp Thing,The Spectre,Darkseid,Anti-Monitor,Doctor Manhattan,Lex Luthor,Joker,Harley Quinn,Poison Ivy,Catwoman,The Riddler,Two-Face,Bane,Scarecrow,Mr Freeze,Ra’s al Ghul,Talia al Ghul,Deathstroke,Deadshot,Black Adam,Sinestro,Atrocitus,Brainiac,Doomsday,General Zod,Reverse-Flash,Zoom,Gorilla Grodd,Captain Cold,Heat Wave,Mirror Master,Trigon,Raven,Starfire,Beast Boy,Cyborg Superman,Black Manta,Ocean Master,King Shark,Peacemaker,Bloodsport,Enchantress,Katana,The Atom,Firestorm,Hawkman,Hawkgirl,Vixen,Plastic Man,Metamorpho,Red Tornado,Orion,Mister Miracle,Big Barda,Highfather,Steppenwolf,Granny Goodness,Lobo,Parasite,Metallo,Bizarro,Solomon Grundy,Clayface,Man-Bat,Killer Croc,Calendar Man,Huntress,Question,Wildcat,Stargirl,Power Girl,Jay Garrick,Alan Scott,Jessica Cruz,John Stewart,Hal Jordan,Kyle Rayner,Guy Gardner,Barry Allen,Wally West,Impulse,Donna Troy,Cassandra Cain,Stephanie Brown',
 lotr:'Frodo Baggins,Samwise Gamgee,Meriadoc Brandybuck,Peregrin Took,Gandalf,Aragorn,Legolas,Gimli,Boromir,Faramir,Denethor,Elrond,Arwen,Galadriel,Celeborn,Thranduil,Éowyn,Éomer,Théoden,Gríma Wormtongue,Saruman,Sauron,The Witch-king of Angmar,Nazgûl,Khamûl,Gollum,Bilbo Baggins,Treebeard,Tom Bombadil,Goldberry,Radagast,Beorn,Bard the Bowman,Thorin Oakenshield,Balin,Dwalin,Kíli,Fíli,Bifur,Bofur,Bombur,Dori,Nori,Ori,Óin,Glóin,Dáin Ironfoot,Smaug,Azog,Bolg,Elendil,Isildur,Anárion,Gil-galad,Elrond Half-elven,Glorfindel,Círdan,Eärendil,Lúthien,Beren,Thingol,Melian,Fëanor,Fingolfin,Finrod Felagund,Maedhros,Maglor,Tuor,Túrin Turambar,Húrin,Morgoth,Ungoliant,Ancalagon,Glaurung,Shelob,Gothmog the Balrog,Durin’s Bane,The Mouth of Sauron,Grond the Wolf,Shagrat,Gorbag,Uglúk,Lurtz,Háma,Grimbold,Erkenbrand,Halbarad,Elladan,Elrohir,Imrahil,Beregond,Bergil,Quickbeam,Farmer Maggot,Rosie Cotton,Barliman Butterbur,Bill Ferny,Old Man Willow,Déagol,Fredegar Bolger,Ar-Pharazôn,Elros,Tar-Míriel,Adar'
};
const fallbackPokemon='Pikachu,Raichu,Bulbasaur,Ivysaur,Venusaur,Charmander,Charmeleon,Charizard,Squirtle,Wartortle,Blastoise,Caterpie,Butterfree,Beedrill,Pidgeot,Rattata,Raticate,Spearow,Fearow,Ekans,Arbok,Sandshrew,Sandslash,Nidoran,Nidoqueen,Nidoking,Clefairy,Clefable,Vulpix,Ninetales,Jigglypuff,Wigglytuff,Zubat,Golbat,Oddish,Gloom,Vileplume,Paras,Parasect,Venonat,Venomoth,Diglett,Dugtrio,Meowth,Persian,Psyduck,Golduck,Mankey,Primeape,Growlithe,Arcanine,Poliwag,Poliwhirl,Poliwrath,Abra,Kadabra,Alakazam,Machop,Machoke,Machamp,Bellsprout,Weepinbell,Victreebel,Tentacool,Tentacruel,Geodude,Graveler,Golem,Ponyta,Rapidash,Slowpoke,Slowbro,Magnemite,Magneton,Farfetchd,Doduo,Dodrio,Seel,Dewgong,Grimer,Muk,Shellder,Cloyster,Gastly,Haunter,Gengar,Onix,Drowzee,Hypno,Krabby,Kingler,Voltorb,Electrode,Exeggcute,Exeggutor,Cubone,Marowak,Hitmonlee,Hitmonchan,Lickitung,Koffing,Weezing,Rhyhorn,Rhydon,Chansey,Tangela,Kangaskhan,Horsea,Seadra,Goldeen,Seaking,Staryu,Starmie,Mr Mime,Scyther,Jynx,Electabuzz,Magmar,Pinsir,Tauros,Magikarp,Gyarados,Lapras,Ditto,Eevee,Vaporeon,Jolteon,Flareon,Porygon,Omanyte,Omastar,Kabuto,Kabutops,Aerodactyl,Snorlax,Articuno,Zapdos,Moltres,Dratini,Dragonair,Dragonite,Mewtwo,Mew';
const catalogue=new Map();
function add(universe,names){for(const name of names){const n=name.trim();if(n)catalogue.set(`${universe}:${n.toLowerCase()}`,{id:`${universe}:${n.toLowerCase()}`,name:n,universe});}}
for(const [k,v] of Object.entries(words))add(k,v.split(','));add('pokemon',fallbackPokemon.split(','));
for(const [key,value] of Object.entries(cardDetails)){if(key.startsWith('pokemon:')&&value.pokedex&&value.name)add('pokemon',[value.name]);}
async function loadPokemon(){try{const r=await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1025',{signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error('API status '+r.status);const j=await r.json();for(const x of j.results)add('pokemon',[x.name.split('-').map(y=>y[0].toUpperCase()+y.slice(1)).join(' ')]);console.log('Loaded Pokemon species:',j.results.length);}catch(e){console.warn('PokeAPI unavailable; using bundled Kanto fallback:',e.message)}}
await loadPokemon();
const rand=n=>crypto.randomInt(n);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const code=()=>String(crypto.randomInt(100,1000));
const token=()=>crypto.randomBytes(24).toString('hex');
const publicRoom=(r,seat)=>({code:r.code,universe:r.universe,phase:r.phase,round:r.round,turn:r.turn,deadline:r.deadline||null,series:r.series||[0,0],rematch:r.rematch||[false,false],mode:r.mode||"friend",topBid:r.topBid,topSeat:r.topSeat,history:r.history,chat:r.chat||[],players:r.players.map((p,i)=>p?{name:p.name,credits:p.credits,team:p.team.map(x=>({name:x.name,universe:x.universe,cost:x.cost,rarity:rarityForPower(x.power)})),connected:true,seat:i}:null),card:r.phase==='auction'?{name:r.cards[r.round].name,universe:r.cards[r.round].universe,rarity:rarityForPower(r.cards[r.round].power)}:null,final:r.phase==='finished'?r.players.map(p=>({name:p.name,score:p.team.reduce((a,c)=>a+c.power,0)+p.credits*10,credits:p.credits,team:p.team.map(c=>({name:c.name,universe:c.universe,cost:c.cost,power:c.power,rarity:rarityForPower(c.power)}))})):null,me:seat,catalogueCount:catalogue.size});
function publish(r){markRoom(r);for(const client of listeners.get(r.code)||[]){try{client.res.write(`data: ${JSON.stringify(publicRoom(r,client.seat))}\n\n`)}catch{}}}
function log(r,msg){r.history.push(msg);if(r.history.length>30)r.history.shift();}
function advanceRound(r){
  r.deadline=null;
  // A player without credits cannot block the next opening bid.
  while(r.round<10){
    const funded=r.players.map((p,i)=>p.credits>0?i:-1).filter(i=>i>=0);
    if(funded.length===0){endGame(r);log(r,'Krediler tükendi. Oyun sona erdi.');return;}
    if(funded.length===1){
      const winner=funded[0],card=r.cards[r.round];
      r.players[winner].credits-=1;
      r.players[winner].team.push({...card,cost:1});
      log(r,`${r.players[winner].name}, rakibinin kredisi kalmadığı için ${card.name} karakterini 1 krediye kazandı.`);
      r.round++;
      continue;
    }
    r.topBid=0;r.topSeat=null;r.openingPassSeat=null;
    r.turn=r.round%2;
    r.deadline=Date.now()+20000;
    log(r,`${r.round+1}. kart açıldı. İlk teklif: ${r.players[r.turn].name}`);
    return;
  }
  endGame(r);
  log(r,'Oyun bitti. Toplam puanlar açıklandı.');
}
function endGame(r){r.phase="finished";r.turn=null;r.deadline=null;r.topBid=0;r.topSeat=null;const scores=r.players.map(p=>p.team.reduce((a,c)=>a+c.power,0)+p.credits*10);if(scores[0]!==scores[1])r.series[scores[0]>scores[1]?0:1]++;}
function finishAuction(r){
  const winner=r.topSeat,price=r.topBid,card=r.cards[r.round];
  if(winner===null||price<1)error('Kazanan teklif yok.');
  r.players[winner].credits-=price;
  r.players[winner].team.push({...card,cost:price});
  log(r,`${r.players[winner].name} ${card.name} karakterini ${price} krediye kazandı.`);
  r.round++;r.topBid=0;r.topSeat=null;
  advanceRound(r);
}
function error(message,status=400){const e=new Error(message);e.status=status;throw e}
function authorize(body){const r=rooms.get(String(body.code||'').toUpperCase());if(!r)error('Oda bulunamadı.',404);const seat=r.players.findIndex(p=>p&&p.token===body.token);if(seat<0)error('Oyuncu yetkisi geçersiz.',403);return{r,seat}}
async function api(url,b){if(url==='/api/auth/guest'){const name=String(b.name||'Oyuncu').trim().slice(0,24)||'Oyuncu';return{user:{name},authToken:signLogin({sub:'guest:'+crypto.randomUUID(),name})}}
if(!url.startsWith('/api/auth/')){if(!readLogin(b.authToken))error('Odaya erişmek için giriş yapmalısın.',401)}
if(url==='/api/auth/google'){const credential=String(b.credential||'');if(credential.length<100||credential.length>8000)error('Geçersiz Google kimliği.');const response=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(credential),{signal:AbortSignal.timeout(8000)});if(!response.ok)error('Google kimliği doğrulanamadı.',401);const claims=await response.json();if(claims.aud!==GOOGLE_CLIENT_ID||!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||Number(claims.exp)*1000<Date.now()||!claims.sub||claims.email_verified!=='true')error('Google kimliği doğrulanamadı.',401);const user={sub:claims.sub,name:String(claims.name||claims.given_name||'Oyuncu').slice(0,24)};return{user,authToken:signLogin(user)}}
if(url==='/api/create'){const name=chosenName(b,'Oyuncu 1');const universe=['pokemon','marvel','dc','lotr','mixed'].includes(b.universe)?b.universe:'mixed';const pool=shuffle([...catalogue.values()].filter(x=>universe==='mixed'||x.universe===universe));if(pool.length<10)error('Bu evrende yeterli karakter yok.');const cards=pool.slice(0,10).map(x=>({...x,power:stablePower(x.id)}));let id;do{id=code()}while(rooms.has(id));const t=token();const r={code:id,universe,cards,round:0,phase:'waiting',turn:0,topBid:0,topSeat:null,players:[{name,token:t,credits:20,team:[]},null],history:[],created:Date.now(),series:[0,0],rematch:[false,false],deadline:null,mode:'friend'};rooms.set(id,r);markRoom(r);return{token:t,room:publicRoom(r,0)}}
if(url==='/api/join'){const r=rooms.get(String(b.code||'').toUpperCase());if(!r)error('Oda bulunamadı.',404);if(r.players[1])error('Oda dolu.');const t=token();r.players[1]={name:chosenName(b,'Oyuncu 2'),token:t,credits:20,team:[]};r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;log(r,`Oyun başladı. 1. kart için açılış: ${r.players[0].name}`);publish(r);return{token:t,room:publicRoom(r,1)}}
if(url==='/api/rematch'){const{r,seat}=authorize(b);if(r.phase!=='finished')error('Maç henüz bitmedi.');r.rematch[seat]=true;if(r.mode==='bot')r.rematch[1]=true;if(r.rematch.every(Boolean)){r.cards=newCards(r.universe);r.round=0;r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;r.topBid=0;r.topSeat=null;r.history=[];r.openingPassSeat=null;r.rematch=[false,false];r.created=Date.now();r.lastActivity=Date.now();for(const p of r.players){p.credits=20;p.team=[];}log(r,'Rövanş başladı!');}publish(r);return{room:publicRoom(r,seat)}}
if(url==='/api/bot'){const universe=['pokemon','marvel','dc','lotr','mixed'].includes(b.universe)?b.universe:'mixed';const name=chosenName(b,'Oyuncu');let id;do{id=code()}while(rooms.has(id));const t=token();const r={code:id,universe,cards:newCards(universe),round:0,phase:'auction',turn:0,deadline:Date.now()+20000,topBid:0,topSeat:null,players:[{name,token:t,credits:20,team:[]},{name:'Bilgisayar',token:token(),credits:20,team:[]}],history:[],created:Date.now(),series:[0,0],rematch:[false,false],mode:'bot'};rooms.set(id,r);markRoom(r);return{token:t,room:publicRoom(r,0)}}
if(url==='/api/match'){const universe=['pokemon','marvel','dc','lotr','mixed'].includes(b.universe)?b.universe:'mixed';const name=chosenName(b,'Oyuncu');for(const [key,item] of waiting){if(item.universe!==universe||Date.now()-item.created>60000)continue;const r=rooms.get(item.code);if(!r||r.players[1]){waiting.delete(key);continue;}const t=token();r.players[1]={name,token:t,credits:20,team:[]};r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;r.mode='random';waiting.delete(key);publish(r);return{token:t,room:publicRoom(r,1)}}let id;do{id=code()}while(rooms.has(id));const t=token();const r={code:id,universe,cards:newCards(universe),round:0,phase:'matching',turn:0,deadline:null,topBid:0,topSeat:null,players:[{name,token:t,credits:20,team:[]},null],history:[],created:Date.now(),series:[0,0],rematch:[false,false],mode:'random'};rooms.set(id,r);markRoom(r);waiting.set(id,{code:id,universe,created:Date.now()});return{token:t,room:publicRoom(r,0)}}
if(url==='/api/chat'){const{r,seat}=authorize(b);if(r.mode==='bot')error('Sohbet yalnızca gerçek oyuncularla kullanılabilir.');const message=String(b.message||'').trim().replace(/[\u0000-\u001f\u007f]/g,' ');if(!message||message.length>240)error('Mesaj 1–240 karakter olmalı.');if(Date.now()-(r.lastChatAt?.[seat]||0)<1000)error('Yeni mesaj için bir saniye bekle.');r.lastChatAt??=[0,0];r.lastChatAt[seat]=Date.now();r.chat??=[];r.chat.push({seat,name:r.players[seat].name,message,time:Date.now()});if(r.chat.length>60)r.chat.shift();r.lastActivity=Date.now();publish(r);return{room:publicRoom(r,seat)}}
if(url==='/api/state'){const{r,seat}=authorize(b);r.lastActivity=Date.now();return{room:publicRoom(r,seat)}}
if(url==='/api/bid'){const{r,seat}=authorize(b);if(r.phase!=='auction')error('İhale aktif değil.');if(r.turn!==seat)error('Teklif sırası sende değil.');const amount=Number(b.amount);if(!Number.isInteger(amount)||amount<=r.topBid||amount>r.players[seat].credits)error('Teklif tutarı geçersiz.');r.topBid=amount;r.topSeat=seat;r.openingPassSeat=null;log(r,`${r.players[seat].name} ${amount} kredi teklif etti.`);const other=1-seat;if(r.players[other].credits<=amount){finishAuction(r);}else{r.turn=other;r.deadline=Date.now()+20000;}publish(r);return{room:publicRoom(r,seat)}}
if(url==='/api/pass'){const{r,seat}=authorize(b);if(r.phase!=='auction'||r.turn!==seat)error('Şu an çekilemezsin.');if(r.topSeat===null){if(r.openingPassSeat===1-seat){log(r,'İki oyuncu da pas geçti. Kart atlandı.');r.round++;advanceRound(r);}else{r.openingPassSeat=seat;r.turn=1-seat;r.deadline=Date.now()+20000;log(r,r.players[seat].name+' pas geçti.');}}else finishAuction(r);publish(r);return{room:publicRoom(r,seat)}}
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
async function lookupCharacterInfo(universe,name){
 const key=universe+':'+name.toLowerCase();
 const local=cardDetails[key];
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
const server=http.createServer(async(req,res)=>{const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};try{const url=new URL(req.url,'http://localhost');if(req.method==='GET'&&url.pathname==='/api/events'){const r=rooms.get((url.searchParams.get('code')||'').toUpperCase());const t=url.searchParams.get('token');const seat=r?.players.findIndex(p=>p&&p.token===t)??-1;const loggedIn=readLogin(url.searchParams.get('authToken'));if(!r||seat<0||!loggedIn)return send(403,{error:'Yetkisiz'});res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(publicRoom(r,seat))}\n\n`);const clients=listeners.get(r.code)||new Set();clients.add({res,seat});listeners.set(r.code,clients);const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': heartbeat\n\n')},15000);req.on('close',()=>{clearInterval(heartbeat);for(const c of clients)if(c.res===res)clients.delete(c);if(!clients.size)listeners.delete(r.code)});return}
if(req.method==='GET'&&url.pathname==='/api/art'){
 const universe=url.searchParams.get('universe')||'';
 const name=url.searchParams.get('name')||'';
 if(!['marvel','dc','lotr','pokemon'].includes(universe)||name.length>100||!catalogue.has(`${universe}:${name.toLowerCase()}`))return send(400,{error:'Geçersiz karakter'});
 const key=universe+':'+name.toLowerCase();
 if(!artCache.has(key)){
  const result=await lookupCharacterInfo(universe,name);
  artCache.set(key,result);
 }
 return send(200,artCache.get(key));
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
if(req.method==='GET'&&url.pathname==='/api/info')return send(200,{catalogueCount:catalogue.size,counts:Object.fromEntries(['pokemon','marvel','dc','lotr'].map(k=>[k,[...catalogue.values()].filter(x=>x.universe===k).length]))});
if(req.method==='POST'&&url.pathname.startsWith('/api/')){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)error('İstek çok büyük.')}let body;try{body=JSON.parse(raw)}catch{error('Geçersiz JSON')}return send(200,await api(url.pathname,body))}
if(req.method==='GET'){const file=path.join(root,'public',url.pathname==='/'?'index.html':url.pathname==='/privacy'?'privacy.html':url.pathname);if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(404,{error:'Bulunamadı'});res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);return}send(405,{error:'İzin verilmeyen yöntem'});}catch(e){send(e.status||500,{error:e.status?e.message:'Sunucu hatası'})}});
setInterval(()=>{for(const r of rooms.values()){
if(r.phase==='matching'&&Date.now()-r.created>=60000){waiting.delete(r.code);r.players[1]={name:'Bilgisayar',token:token(),credits:20,team:[]};r.mode='bot';r.phase='auction';r.deadline=Date.now()+20000;publish(r);}
if(r.phase!=='auction')continue;
// A new round must start with a fresh timer and must never be deleted mid-match.
if(!r.deadline)r.deadline=Date.now()+20000;
if(r.players[r.turn].credits<=r.topBid&&r.topSeat!==null){finishAuction(r);publish(r);continue;}
if(r.mode==='bot'&&r.turn===1){const card=r.cards[r.round];const max=r.players[1].credits;const offer=r.topBid+1;const willBid=offer<=max && (offer<=2||Math.random()<0.45);if(willBid){r.topBid=offer;r.topSeat=1;r.openingPassSeat=null;log(r,`Bilgisayar ${offer} kredi teklif etti.`);if(r.players[0].credits<=offer)finishAuction(r);else{r.turn=0;r.deadline=Date.now()+20000;}}else if(r.topSeat!==null){log(r,'Bilgisayar pas geçti.');finishAuction(r);}else if(r.openingPassSeat===0){log(r,'İki oyuncu da pas geçti. Kart atlandı.');r.round++;advanceRound(r);}else{r.openingPassSeat=1;r.turn=0;r.deadline=Date.now()+20000;log(r,'Bilgisayar pas geçti. Sıra sende.');}r.lastActivity=Date.now();publish(r);continue;}
if(r.deadline&&Date.now()>=r.deadline){const expiredSeat=r.turn;log(r,`${r.players[expiredSeat].name} süresi dolduğu için otomatik pas geçti.`);if(r.topSeat!==null){finishAuction(r);}else if(r.openingPassSeat===1-expiredSeat){log(r,'İki oyuncu da pas geçti. Kart atlandı.');r.round++;advanceRound(r);}else{r.openingPassSeat=expiredSeat;r.turn=1-expiredSeat;r.deadline=Date.now()+20000;log(r,`Sıra ${r.players[r.turn].name} oyuncusuna geçti.`);}r.lastActivity=Date.now();publish(r);}
}for(const [id,r]of rooms){const age=Date.now()-(r.lastActivity||r.created);const expiry=r.phase==='finished'?24*3600_000:r.phase==='waiting'?2*3600_000:r.phase==='matching'?5*60_000:r.phase==='auction'?6*3600_000:24*3600_000;if(age>expiry){rooms.delete(id);dirtyRooms.add(id);waiting.delete(id);const clients=listeners.get(id);if(clients){for(const c of clients){try{c.res.end()}catch{}}listeners.delete(id)}}}for(const [id,w]of waiting)if(!rooms.has(w.code)||Date.now()-w.created>60000)waiting.delete(id)},500).unref();
setInterval(()=>{flushRooms().catch(e=>console.error('Database flush:',e.message))},1000).unref();
initializeDatabase().then(()=>{server.listen(PORT,'0.0.0.0',()=>console.log(`Hero Auction http://localhost:${PORT} | characters: ${catalogue.size}`));});
