import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000);
const rooms=new Map();
const artCache=new Map();
const listeners=new Map();
const waiting=new Map();
const curated={"marvel:thanos":95,"marvel:galactus":99,"marvel:odin":95,"marvel:sentry":94,"marvel:silver surfer":93,"marvel:thor":88,"marvel:hulk":87,"marvel:scarlet witch":94,"marvel:doctor strange":91,"marvel:iron man":75,"marvel:spider-man":70,"marvel:captain america":61,"dc:the spectre":100,"dc:anti-monitor":99,"dc:doctor manhattan":99,"dc:darkseid":97,"dc:superman":92,"dc:batman":65,"dc:wonder woman":88,"dc:the flash":90,"lotr:eru ilúvatar":100,"lotr:morgoth":99,"lotr:sauron":95,"lotr:gandalf":87,"lotr:aragorn":70,"pokemon:arceus":100,"pokemon:mewtwo":94,"pokemon:rayquaza":94,"pokemon:pikachu":65};
const stablePower=(id)=>{if(curated[id]!=null)return curated[id];const h=crypto.createHash("sha256").update("hero-auction-v3:"+id).digest();return 15+(h.readUInt32BE(0)%86)};
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
async function loadPokemon(){try{const r=await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1025',{signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error('API status '+r.status);const j=await r.json();for(const x of j.results)add('pokemon',[x.name.split('-').map(y=>y[0].toUpperCase()+y.slice(1)).join(' ')]);console.log('Loaded Pokemon species:',j.results.length);}catch(e){console.warn('PokeAPI unavailable; using bundled Kanto fallback:',e.message)}}
await loadPokemon();
const rand=n=>crypto.randomInt(n);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const code=()=>crypto.randomBytes(3).toString('hex').toUpperCase();
const token=()=>crypto.randomBytes(24).toString('hex');
const publicRoom=(r,seat)=>({code:r.code,universe:r.universe,phase:r.phase,round:r.round,turn:r.turn,deadline:r.deadline||null,series:r.series||[0,0],rematch:r.rematch||[false,false],mode:r.mode||"friend",topBid:r.topBid,topSeat:r.topSeat,history:r.history,players:r.players.map((p,i)=>p?{name:p.name,credits:p.credits,team:p.team.map(x=>({name:x.name,universe:x.universe,cost:x.cost})),connected:true,seat:i}:null),card:r.phase==='auction'?{name:r.cards[r.round].name,universe:r.cards[r.round].universe}:null,final:r.phase==='finished'?r.players.map(p=>({name:p.name,score:p.team.reduce((a,c)=>a+c.power,0)+p.credits*10,credits:p.credits,team:p.team.map(c=>({name:c.name,universe:c.universe,cost:c.cost,power:c.power}))})):null,me:seat,catalogueCount:catalogue.size});
function publish(r){for(const client of listeners.get(r.code)||[]){try{client.res.write(`data: ${JSON.stringify(publicRoom(r,client.seat))}\n\n`)}catch{}}}
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
    r.topBid=0;r.topSeat=null;
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
async function api(url,b){if(url==='/api/create'){const name=String(b.name||'Oyuncu 1').trim().slice(0,24);const universe=['pokemon','marvel','dc','lotr','mixed'].includes(b.universe)?b.universe:'mixed';const pool=shuffle([...catalogue.values()].filter(x=>universe==='mixed'||x.universe===universe));if(pool.length<10)error('Bu evrende yeterli karakter yok.');const cards=pool.slice(0,10).map(x=>({...x,power:stablePower(x.id)}));let id;do{id=code()}while(rooms.has(id));const t=token();const r={code:id,universe,cards,round:0,phase:'waiting',turn:0,topBid:0,topSeat:null,players:[{name,token:t,credits:20,team:[]},null],history:[],created:Date.now(),series:[0,0],rematch:[false,false],deadline:null,mode:'friend'};rooms.set(id,r);return{token:t,room:publicRoom(r,0)}}
if(url==='/api/join'){const r=rooms.get(String(b.code||'').toUpperCase());if(!r)error('Oda bulunamadı.',404);if(r.players[1])error('Oda dolu.');const t=token();r.players[1]={name:String(b.name||'Oyuncu 2').trim().slice(0,24),token:t,credits:20,team:[]};r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;log(r,`Oyun başladı. 1. kart için açılış: ${r.players[0].name}`);publish(r);return{token:t,room:publicRoom(r,1)}}
if(url==='/api/rematch'){const{r,seat}=authorize(b);if(r.phase!=='finished')error('Maç henüz bitmedi.');r.rematch[seat]=true;if(r.rematch.every(Boolean)){const universe=['pokemon','marvel','dc','lotr','mixed'].includes(b.universe)?b.universe:r.universe;r.universe=universe;r.cards=newCards(universe);r.round=0;r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;r.topBid=0;r.topSeat=null;r.history=[];r.rematch=[false,false];for(const p of r.players){p.credits=20;p.team=[];}log(r,'Rövanş başladı!');}publish(r);return{room:publicRoom(r,seat)}}
if(url==='/api/bot'){const universe=['pokemon','marvel','dc','lotr','mixed'].includes(b.universe)?b.universe:'mixed';const name=String(b.name||'Oyuncu').trim().slice(0,24);let id;do{id=code()}while(rooms.has(id));const t=token();const r={code:id,universe,cards:newCards(universe),round:0,phase:'auction',turn:0,deadline:Date.now()+20000,topBid:0,topSeat:null,players:[{name,token:t,credits:20,team:[]},{name:'Bilgisayar',token:token(),credits:20,team:[]}],history:[],created:Date.now(),series:[0,0],rematch:[false,false],mode:'bot'};rooms.set(id,r);return{token:t,room:publicRoom(r,0)}}
if(url==='/api/match'){const universe=['pokemon','marvel','dc','lotr','mixed'].includes(b.universe)?b.universe:'mixed';const name=String(b.name||'Oyuncu').trim().slice(0,24);for(const [key,item] of waiting){if(item.universe!==universe||Date.now()-item.created>60000)continue;const r=rooms.get(item.code);if(!r||r.players[1]){waiting.delete(key);continue;}const t=token();r.players[1]={name,token:t,credits:20,team:[]};r.phase='auction';r.turn=0;r.deadline=Date.now()+20000;r.mode='random';waiting.delete(key);publish(r);return{token:t,room:publicRoom(r,1)}}let id;do{id=code()}while(rooms.has(id));const t=token();const r={code:id,universe,cards:newCards(universe),round:0,phase:'matching',turn:0,deadline:null,topBid:0,topSeat:null,players:[{name,token:t,credits:20,team:[]},null],history:[],created:Date.now(),series:[0,0],rematch:[false,false],mode:'random'};rooms.set(id,r);waiting.set(id,{code:id,universe,created:Date.now()});return{token:t,room:publicRoom(r,0)}}
if(url==='/api/state'){const{r,seat}=authorize(b);return{room:publicRoom(r,seat)}}
if(url==='/api/bid'){const{r,seat}=authorize(b);if(r.phase!=='auction')error('İhale aktif değil.');if(r.turn!==seat)error('Teklif sırası sende değil.');const amount=Number(b.amount);if(!Number.isInteger(amount)||amount<=r.topBid||amount>r.players[seat].credits)error('Teklif tutarı geçersiz.');r.topBid=amount;r.topSeat=seat;log(r,`${r.players[seat].name} ${amount} kredi teklif etti.`);const other=1-seat;if(r.players[other].credits<=amount){finishAuction(r);}else{r.turn=other;r.deadline=Date.now()+20000;}publish(r);return{room:publicRoom(r,seat)}}
if(url==='/api/pass'){const{r,seat}=authorize(b);if(r.phase!=='auction'||r.turn!==seat)error('Şu an çekilemezsin.');if(r.topSeat===null){r.turn=1-seat;r.deadline=Date.now()+20000;log(r,r.players[seat].name+' pas geçti.');}else finishAuction(r);publish(r);return{room:publicRoom(r,seat)}}
error('Bilinmeyen işlem.',404)}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};try{const url=new URL(req.url,'http://localhost');if(req.method==='GET'&&url.pathname==='/api/events'){const r=rooms.get((url.searchParams.get('code')||'').toUpperCase());const t=url.searchParams.get('token');const seat=r?.players.findIndex(p=>p&&p.token===t)??-1;if(!r||seat<0)return send(403,{error:'Yetkisiz'});res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(publicRoom(r,seat))}\n\n`);const clients=listeners.get(r.code)||new Set();clients.add({res,seat});listeners.set(r.code,clients);req.on('close',()=>{for(const c of clients)if(c.res===res)clients.delete(c)});return}
if(req.method==='GET'&&url.pathname==='/api/art'){
  const universe=url.searchParams.get('universe')||'';
  const name=url.searchParams.get('name')||'';
  if(!['marvel','dc','lotr'].includes(universe)||name.length>100||!catalogue.has(`${universe}:${name.toLowerCase()}`))return send(400,{error:'Geçersiz karakter'});
  const cacheKey=universe+':'+name.toLowerCase();
  if(!artCache.has(cacheKey)){
    const hint=universe==='marvel'?' Marvel Comics':universe==='dc'?' DC Comics':' Tolkien';
    try{
      const q=new URL('https://en.wikipedia.org/w/api.php');
      q.searchParams.set('action','query');q.searchParams.set('generator','search');q.searchParams.set('gsrsearch',name+hint);q.searchParams.set('gsrlimit','5');q.searchParams.set('prop','pageimages|info');q.searchParams.set('inprop','url');q.searchParams.set('pithumbsize','600');q.searchParams.set('format','json');q.searchParams.set('origin','*');
      const response=await fetch(q,{headers:{'User-Agent':'HeroAuctionDemo/1.1 (illustration lookup)'},signal:AbortSignal.timeout(5500)});
      const data=await response.json();const pages=Object.values(data.query?.pages||{});
      const match=pages.find(x=>x.thumbnail?.source && x.title.toLowerCase().includes(name.toLowerCase())) || pages.find(x=>x.thumbnail?.source);
      artCache.set(cacheKey,match?{url:match.thumbnail.source,source:match.fullurl||'https://en.wikipedia.org/',credit:'Wikimedia / Wikipedia'}:{url:null});
    }catch{artCache.set(cacheKey,{url:null})}
  }
  return send(200,artCache.get(cacheKey));
}
if(req.method==='GET'&&url.pathname==='/api/info')return send(200,{catalogueCount:catalogue.size,counts:Object.fromEntries(['pokemon','marvel','dc','lotr'].map(k=>[k,[...catalogue.values()].filter(x=>x.universe===k).length]))});
if(req.method==='POST'&&url.pathname.startsWith('/api/')){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)error('İstek çok büyük.')}let body;try{body=JSON.parse(raw)}catch{error('Geçersiz JSON')}return send(200,await api(url.pathname,body))}
if(req.method==='GET'){const file=path.join(root,'public',url.pathname==='/'?'index.html':url.pathname);if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(404,{error:'Bulunamadı'});res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);return}send(405,{error:'İzin verilmeyen yöntem'});}catch(e){send(e.status||500,{error:e.status?e.message:'Sunucu hatası'})}});
setInterval(()=>{for(const r of rooms.values()){
if(r.phase==='matching'&&Date.now()-r.created>=60000){waiting.delete(r.code);r.players[1]={name:'Bilgisayar',token:token(),credits:20,team:[]};r.mode='bot';r.phase='auction';r.deadline=Date.now()+20000;publish(r);}
if(r.phase!=='auction')continue;
if(r.players[r.turn].credits<=r.topBid&&r.topSeat!==null){finishAuction(r);publish(r);continue;}
if(r.mode==='bot'&&r.turn===1){const card=r.cards[r.round];const max=r.players[1].credits;const offer=r.topBid+1;const willBid=offer<=max && (offer<=2||Math.random()<0.45);if(willBid){r.topBid=offer;r.topSeat=1;if(r.players[0].credits<=offer)finishAuction(r);else{r.turn=0;r.deadline=Date.now()+20000;}}else if(r.topSeat!==null)finishAuction(r);else{r.turn=0;r.deadline=Date.now()+20000;}publish(r);continue;}
if(r.deadline&&Date.now()>=r.deadline){if(r.topSeat!==null)finishAuction(r);else{r.turn=1-r.turn;r.deadline=Date.now()+20000;log(r,'Süre doldu: otomatik pas.');}publish(r);}
}for(const [id,r]of rooms)if(Date.now()-r.created>24*3600_000){rooms.delete(id);listeners.delete(id)}},3600_000).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Hero Auction http://localhost:${PORT} | characters: ${catalogue.size}`));
