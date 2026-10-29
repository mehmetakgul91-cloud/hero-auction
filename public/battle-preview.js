import {createVictoryChestPresentation} from '/victory-chest.js';
import {applyHeroRarity,createSummaryHeroIdentity} from '/hero-rarity.js';
import {applySummaryHeroStatus,captureFinalHeroHealth} from '/battle-summary-status.js';
import {ARENA_TRACKS} from '/arena-music-tracks.js';
import {createArenaPlaylist} from '/arena-playlist.js';
import {createArenaAudio} from '/arena-audio.js';
import {buildDefaultFormation,validateFormation} from '/preparation-formation.js';
import {createPreparationDraft} from '/preparation-draft.js';
import {createRoomInvitesUI} from '/room-invites.js';
import {createFriendsUI} from '/friends.js';
import {translate} from '/crazygames-en.js';
import {describeBattleEvent} from '/battle-event-text.js';
import {createBattleReplayHealth} from '/battle-replay-health.js';
import {createArenaTeamRenderer} from '/arena-team-renderer.js';
import {summarizeBattle} from '/battle-summary-data.js?v=complete-results-20261021';
import {commanderAbilityStats,commanderAbilityDescription} from '/commander-ability-rules.js?v=commander-attack-fix-20261021';
import {getArenaLaneLayout,refreshArenaViewport} from '/arena-viewport.js?v=equal-lanes-20261026';
import {playHeroAttack} from '/hero-attack-effects.js';
import {combatEffectKind,combatEffectActors,createCombatEffects} from '/arena-combat-effects.js';
import {stationaryArenaAction} from '/hero-combat-presentation.js';
import {createArenaThemePresentation} from '/arena-theme.js';
import {createArenaWeather} from '/arena-weather.js';
import {mountVikingLayout} from '/arena-viking-layout.js';
import {mountArenaSceneLayout} from '/arena-scene-layout.js';
// Verify the current portal account before accessing any saved arena seat.
if(window.HeroPlatform){
 const restart=()=>{localStorage.removeItem('hero-auction-session');sessionStorage.removeItem('hero-auction-formation');sessionStorage.removeItem('hero-auction-lanes');window.HeroPlatform.beforeNavigate?.('/crazygames/');location.replace('/crazygames/')};
 window.addEventListener('hero:platform-auth',restart);window.HeroPlatform.watchAccount();
 try{
  const identity=await window.HeroPlatform.identity();
  const saved=JSON.parse(localStorage.getItem('hero-auction-login')||'null');
  if(identity.kind==='user'){
   const response=await fetch('/api/auth/crazygames',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:identity.credential})});
   if(!response.ok)throw Error('CrazyGames hesabı doğrulanamadı');
   const result=await response.json();
   if(saved?.type!=='crazygames'||saved.user?.sub!==result.user.sub)throw Error('Hesap değişti');
   localStorage.setItem('hero-auction-login',JSON.stringify({type:'crazygames',user:result.user,authToken:result.authToken}));
  }else if(saved?.type!=='guest')throw Error('Misafir oturumu gerekli');
 }catch{restart();await new Promise(()=>{})}
 const portalParams=new URLSearchParams(location.search),portalCode=portalParams.get('auctionCode'),portalSeat=portalParams.get('auctionToken');
 if(portalCode&&portalSeat){
  try{const saved=JSON.parse(localStorage.getItem('hero-auction-login')||'null');const response=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:portalCode,token:portalSeat,authToken:saved?.authToken})});if(response.ok)window.HeroPlatform.setRoom((await response.json()).room)}catch{}
 }
 window.HeroPlatform.onJoin(code=>{const url='/crazygames/?join='+encodeURIComponent(code);window.HeroPlatform.beforeNavigate?.(url);location.assign(url)});
 const invite=window.HeroPlatform.takeInviteCode();
 if(invite){window.HeroPlatform.beforeNavigate?.('/crazygames/?join='+encodeURIComponent(invite));location.replace('/crazygames/?join='+encodeURIComponent(invite));await new Promise(()=>{})}
}
// Browser-only battle replay preview. No wallet or live room mutations.
const $=id=>document.getElementById(id);
const arenaTheme=createArenaThemePresentation({element:$('battle-arena'),language:document.documentElement.lang});
const arenaWeather=createArenaWeather({root:$('battle-arena')});
// Static floor geometry survives replay pause/results; it never depends on motion.
const arenaSceneLayout=createArenaWeather({root:$('battle-arena'),mounts:{ruins:mountArenaSceneLayout,savanna:mountArenaSceneLayout,fjord:mountVikingLayout}});
let arenaWeatherReady=false,arenaWeatherPageHidden=false;
function syncArenaWeather(){
 // Only an actual loaded, running battle can animate. Pause/results release
 // weather; static floor geometry stays until the arena is hidden or left.
 const visible=arenaWeatherReady&&!arenaWeatherPageHidden&&!document.hidden&&!leavingBattle;
 const active=visible&&!battlePresentationFinished&&(liveArenaMode||timer!==null);
 arenaSceneLayout.update(arenaTheme.current(),{active:visible});
 arenaWeather.update(arenaTheme.current(),{active});
}

let demoA=[["Obsidyen Muhafız", "tank", 90, "original"], ["Demir Sur", "tank", 69, "original"], ["Kaya Titanı", "tank", 80, "original"], ["Buz Kalesi", "tank", 83, "original"], ["Gölge Suikastçı", "assassin", 90, "original"]];
// Preview uses zero credits until verified auction balances are wired in.
let previewCredits=0;
const creditBonus=credits=>Math.max(-0.99,credits*0.01);
const effectivePower=power=>Math.round(power*(1+creditBonus(previewCredits))*10)/10;
let demoB=[["Altın Muhafız", "tank", 91, "original"], ["Alev Zırhı", "fighter", 84, "original"], ["Kadim Koruyucu", "fighter", 72, "original"], ["Morvan", "energy", 90, "original"], ["Brunn", "tank", 75, "original"]];
const roleNames={tank:'TANK',fighter:'SAVAŞÇI',energy:'ENERJİ / MESAFELİ',assassin:'SUİKASTÇI',support:'DESTEK'};
let states=[],events=[],cursor=0,timer=null,liveArenaMode=false,battlePresentationFinished=false;
const arenaActive=()=>!battlePresentationFinished&&!leavingBattle&&(arenaMode||timer!==null);
// Original procedural fallback; the primary playlist uses credited licensed assets.
let arenaAudio=null,arenaMusicInterval=null,arenaMusicStep=0,arenaMusicEnabled=true;
let arenaMusicStorage;try{arenaMusicStorage=sessionStorage;arenaMusicEnabled=arenaMusicStorage.getItem('hero-auction-arena-audio-enabled')!=='0'}catch{}
const arenaPlaylist=createArenaPlaylist(ARENA_TRACKS,{storage:arenaMusicStorage});
function updateMusicButton(){const b=$('arena-music-toggle');if(b){b.textContent=arenaMusicEnabled?'🔊':'🔇';b.setAttribute('aria-pressed',String(arenaMusicEnabled));b.setAttribute('aria-label',arenaMusicEnabled?'Arena sesini kapat':'Arena sesini aç');b.setAttribute('title',arenaMusicEnabled?'Sesi kapat':'Sesi aç')}}
function arenaTone(freq,start,length,type='sawtooth',volume=.025){
 if(!arenaAudio||window.HeroPlatform?.muteAudio)return;
 const oscillator=arenaAudio.createOscillator(),gain=arenaAudio.createGain();
 oscillator.type=type;oscillator.frequency.setValueAtTime(freq,start);
 gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.025);
 gain.gain.exponentialRampToValueAtTime(.0001,start+length);
 oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 oscillator.connect(gain);gain.connect(arenaAudio.destination);oscillator.start(start);oscillator.stop(start+length+.03);
}
function arenaMusicBeat(){
 if(!arenaAudio||arenaAudio.state!=='running')return;
 const now=arenaAudio.currentTime+.025,step=arenaMusicStep++%16;
 const bass=[110,110,146.83,110,98,98,130.81,98][Math.floor(arenaMusicStep/16)%8];
 if(step%4===0){arenaTone(bass,now,.28,'triangle',.075);arenaTone(bass/2,now,.19,'sine',.065)}
 if(step%2===0)arenaTone(440+(step%4)*55,now,.045,'triangle',.008);
 if(step===0||step===8){const chord=[220,261.63,329.63];chord.forEach((n,i)=>arenaTone(n,now+i*.03,.7,'sine',.012))}
 if(step===4||step===12)arenaTone(73.42,now,.13,'sawtooth',.019);
}
// Keep the already gesture-unlocked element across preparation, battle and resume.
// Only the current match's asset is loaded. Old music is a bounded error fallback.
const arenaTrack=new Audio();
const arenaMusic=createArenaAudio({audio:arenaTrack,volume:.60,
 canPlay:()=>!window.HeroPlatform?.muteAudio&&arenaMusicEnabled&&!document.hidden&&arenaActive(),
 canPrime:()=>!window.HeroPlatform?.muteAudio&&arenaMusicEnabled&&!document.hidden&&!arenaMode&&!leavingBattle,
 fallbackSrc:'/audio/hero-auction-senkron-davul-bas-2dk.mp3',
 startProcedural:startProceduralArenaMusic,stopProcedural:stopProceduralArenaMusic});
function selectArenaMusic(activate){
 const matchKey=auctionMode?(preparationMatchKey?'auction:'+auctionCode+':'+preparationMatchKey:null):previewMusicMatchKey;
 if(!matchKey)return false;
 arenaMusic.setTrack(arenaPlaylist.select(matchKey,{activate}));return true;
}
function startProceduralArenaMusic(){
 if(window.HeroPlatform?.muteAudio||!arenaMusicEnabled||document.hidden||arenaMusicInterval!==null||!arenaActive())return;
 const AudioContextClass=window.AudioContext||window.webkitAudioContext;
 if(!AudioContextClass)return;
 try{
  if(!arenaAudio)arenaAudio=new AudioContextClass();
  const resume=arenaAudio.state==='running'?Promise.resolve():arenaAudio.resume();
  void resume.then(()=>{
   if(window.HeroPlatform?.muteAudio||!arenaMusicEnabled||document.hidden||arenaMusicInterval!==null||!arenaActive()||!arenaTrack.paused)return;
   arenaMusicStep=0;arenaMusicBeat();arenaMusicInterval=setInterval(arenaMusicBeat,190);
  }).catch(()=>{});
 }catch(e){}
}
function stopProceduralArenaMusic(){
 if(arenaMusicInterval!==null){clearInterval(arenaMusicInterval);arenaMusicInterval=null}
 if(arenaAudio&&arenaAudio.state==='running')void arenaAudio.suspend().catch(()=>{});
}
function startArenaMusic(){
 if(window.HeroPlatform?.muteAudio||!arenaMusicEnabled||document.hidden||!arenaActive()||!selectArenaMusic(true))return Promise.resolve(false);
 return arenaMusic.play();
}
function stopArenaMusic(release=false){
 arenaAudioPrimed=false;
 if(release)arenaMusic.release();else arenaMusic.stop();
}

let arenaElapsedMs=0,arenaClockStartedAt=0,arenaClockTicker=null;
function updateArenaClock(){const elapsed=arenaElapsedMs+(arenaClockStartedAt?Date.now()-arenaClockStartedAt:0);const seconds=Math.floor(elapsed/1000);const el=$('arena-live-seconds');if(el)el.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')}
function startArenaClock(){if(arenaClockStartedAt)return;arenaClockStartedAt=Date.now();arenaClockTicker=setInterval(updateArenaClock,250);updateArenaClock()}
function pauseArenaClock(){if(arenaClockStartedAt){arenaElapsedMs+=Date.now()-arenaClockStartedAt;arenaClockStartedAt=0}if(arenaClockTicker!==null){clearInterval(arenaClockTicker);arenaClockTicker=null}updateArenaClock()}
function resetArenaClock(){pauseArenaClock();arenaElapsedMs=0;updateArenaClock()}
let auctionLaneModifiers=[];
let arenaCommanderProfile=null;
function commanderBonusForRole(role){
 const p=arenaCommanderProfile;if(!p?.levels)return 0;
 const stat=role==='tank'?'defense':role==='fighter'||role==='assassin'?'attack':role==='energy'?'magic':role==='support'?'support':null;
 if(!stat)return 0;
 const level=Number(p.levels[stat])||0;
 return Math.min(Math.max(0,level),p.commanderId===stat?40:20)*.005;
}
async function loadArenaCommander(){
 try{
  const login=JSON.parse(localStorage.getItem('hero-auction-login')||'null');
  if(!login?.authToken)return;
  const response=await fetch('/api/commander/get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authToken:login.authToken})});
  if(!response.ok)return;
  const data=await response.json();arenaCommanderProfile=data.profile||null;
  if(!prepDone){renderBoard()}
 }catch(error){console.warn('Komutan önizlemesi yüklenemedi:',error)}
}

let assignedRoles=demoA.map(x=>roleNames[x[1]]?x[1]:'fighter');
const lanes=['front','front','back','back','back'];
function roleAt(slot){return positions[slot]===null?'fighter':assignedRoles[positions[slot]]||'fighter'}
function setLane(slot,lane){
 if(prepDone||prepSubmitting||arenaMode||auctionMode&&!auctionLoaded||!Number.isInteger(slot)||!['front','back'].includes(lane)||positions[slot]===undefined||lanes[slot]===lane)return;
 lanes[slot]=lane;renderBoard();
 // The hero keeps its immutable roster index: moving rows never reorders combat.
 if(preparationDraft)void preparationDraft.save(formationSnapshot());
 else savePreviewDraft();
 document.querySelector('.lane-switch[data-slot="'+slot+'"]')?.focus({preventScroll:true});
}
function formationSnapshot(){return {positions:[...positions],lanes:[...lanes],roles:positions.map((_,slot)=>roleAt(slot))}}


const heroArtCache=new Map();
async function loadHeroArt(i){if(heroArtCache.has(i))return heroArtCache.get(i);const promise=fetch('/api/art?universe='+encodeURIComponent(demoA[i][3]||'original')+'&name='+encodeURIComponent(demoA[i][0])).then(r=>r.ok?r.json():null).then(data=>data?.url||null).catch(()=>null);heroArtCache.set(i,promise);return promise}
function heroPortrait(i,container){
 const img=document.createElement('img');img.className='slot-portrait';img.alt=demoA[i][0];
 // The portrait is attached only after load; detached lazy images never become visible.
 img.loading='eager';
 const fallback=document.createElement('span');fallback.className='portrait-fallback';fallback.textContent=demoA[i][0].slice(0,1);container.append(fallback);
 void loadHeroArt(i).then(url=>{
  if(!url||!container.isConnected)return;
  img.onload=()=>{img.classList.toggle('hero-portrait-wide',img.naturalWidth>img.naturalHeight);if(container.isConnected){fallback.remove();container.append(img)}};
  img.onerror=()=>img.remove();
  // Register both handlers before src, including cached-image completion.
  img.src=url;
 });
}

const query=new URLSearchParams(location.search);
let arenaMode=query.get('room')==='arena';
const auctionCode=query.get('auctionCode');
const auctionToken=query.get('auctionToken');
const auctionMode=Boolean(auctionCode&&auctionToken);
// Reuse authenticated friendships/presence across the separate preparation/arena page.
// The shared invitation dock has its own in-flow space, outside the fitted combat grid.
let arenaFriends=null,arenaInvites=null;
if(auctionMode){
 const nav=document.querySelector('.arena-room-nav');
 const friendButton=document.createElement('button');friendButton.type='button';friendButton.id='arena-friend-opponent';friendButton.hidden=true;friendButton.setAttribute('aria-live','polite');
 const title=nav?.querySelector('strong');nav?.append(friendButton);
 if(nav){nav.classList.add('arena-social-nav');nav.hidden=false;}
 const inviteBox=document.createElement('section');inviteBox.id='room-invites-inbox';inviteBox.className='room-invites';inviteBox.hidden=true;inviteBox.setAttribute('aria-label',document.documentElement.lang==='en'?'Match invitations':'Maç davetleri');
 const inviteHeading=document.createElement('div');inviteHeading.className='room-invites-heading';
 const inviteSigil=document.createElement('span');inviteSigil.className='room-invites-sigil';inviteSigil.textContent='✦';inviteSigil.setAttribute('aria-hidden','true');
 const inviteSummary=document.createElement('h2');inviteSummary.id='room-invites-summary';
 const inviteNext=document.createElement('button');inviteNext.type='button';inviteNext.id='room-invites-next';inviteNext.hidden=true;
 inviteHeading.append(inviteSigil,inviteSummary,inviteNext);
 const inviteAnnouncement=document.createElement('p');inviteAnnouncement.id='room-invites-announcement';inviteAnnouncement.className='room-invites-announcement';inviteAnnouncement.setAttribute('role','status');inviteAnnouncement.setAttribute('aria-live','polite');inviteAnnouncement.setAttribute('aria-atomic','true');
 const inviteList=document.createElement('div');inviteList.id='room-invites-list';
 const inviteMessage=document.createElement('p');inviteMessage.id='room-invites-message';inviteMessage.setAttribute('role','status');inviteMessage.setAttribute('aria-live','polite');
 const inviteHistory=document.createElement('details');inviteHistory.className='room-invites-history';inviteHistory.hidden=true;
 const historyTitle=document.createElement('summary');historyTitle.textContent=document.documentElement.lang==='en'?'Recent invitations':'Son davetler';
 const historyList=document.createElement('div');historyList.id='room-invites-history';inviteHistory.append(historyTitle,historyList);
 inviteBox.append(inviteHeading,inviteList,inviteMessage,inviteHistory);document.body.prepend(inviteBox);inviteBox.before(inviteAnnouncement);
 arenaInvites=createRoomInvitesUI({inboxRoot:inviteBox,translate:text=>document.documentElement.lang==='en'?translate(text):text,
  onJoined:({token,room})=>{
   // The server returns a seat only after the accepted source match has settled.
   localStorage.setItem('hero-auction-session',JSON.stringify({token,code:room.code}));
   return ()=>{const home=window.HeroPlatform?'/crazygames/':'/';window.HeroPlatform?.beforeNavigate(home);location.replace(home);};
  }
 });

 arenaFriends=createFriendsUI({opponentRoot:friendButton,translate:text=>document.documentElement.lang==='en'?translate(text):text,
  notify:text=>{friendButton.title=text;friendButton.setAttribute('aria-label',text);const message=document.getElementById('message');if(message)message.textContent=text;}
 });
 try{
  const auth=JSON.parse(localStorage.getItem('hero-auction-login')||'null');
  if(auth?.authToken){
   arenaFriends.setLogin(auth);arenaInvites.setLogin(auth);
   void fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:auctionCode,token:auctionToken,authToken:auth.authToken})})
    .then(async response=>{if(!response.ok)return;const result=await response.json();arenaFriends.setRoom(result.room);arenaInvites.setRoom(result.room,auctionToken);if(title)title.hidden=!friendButton.hidden;})
    .catch(()=>{});
  }
 }catch{/* Missing or expired account must never interrupt battle playback. */}
}

function mountCommanderDock(){
 const current=new URLSearchParams(location.search);
 if(!arenaMode||!auctionMode||current.get('commanderTest')!=='1')return;
 const arena=$('battle-arena'),matchup=$('arena-commander-matchup'),controls=$('experimental-commander-controls');
 if(!arena||!matchup||!controls)return;
 let dock=$('arena-commander-dock');
 if(!dock){dock=document.createElement('div');dock.id='arena-commander-dock';dock.className='arena-commander-dock';dock.setAttribute('aria-label','Komutan kontrol paneli');arena.after(dock)}
 dock.hidden=false;
 dock.append(matchup,controls);
}
function finishCommanderControls(){
 for(const id of ['arena-commander-dock','experimental-commander-controls','arena-commander-matchup']){
  const panel=$(id);if(panel)panel.hidden=true;
 }
 $('experimental-commander-controls')?.querySelectorAll('button').forEach(button=>button.disabled=true);
 window.dispatchEvent(new CustomEvent('heroarena:battle-finished'));
}
const multiplayerCode=query.get('code');
const multiplayerToken=query.get('token');
let battlePoll=null;
let leavingBattle=false;
async function leaveBattleAndGoHome(event){
 event?.preventDefault();
 if(leavingBattle)return;
 leavingBattle=true;syncArenaWeather();stopArenaMusic(true);
 const leavingStoredSeat=localStorage.getItem('hero-auction-session');
 const button=event?.currentTarget;if(button){button.textContent='Ayrılıyor…';button.style.pointerEvents='none'}
 if(auctionMode){
  try{
   const auth=JSON.parse(localStorage.getItem('hero-auction-login')||'null');
   const response=await fetch('/api/room/detach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:auctionCode,token:auctionToken,authToken:auth?.authToken})});
   if(!response.ok){const result=await response.json();throw Error(result.error||'Odadan ayrılamadın. Tekrar dene.')}
  }catch(error){leavingBattle=false;syncArenaWeather();if(arenaActive())void startArenaMusic();if(button){button.style.pointerEvents='';button.textContent=document.documentElement.lang==='en'?'Leave match':'Maçtan Ayrıl'}$('message').textContent=document.documentElement.lang==='en'?translate(error.message):error.message;return;}
 }
 if(battlePoll&&battlePoll!==-1)clearInterval(battlePoll);
 if(timer){clearInterval(timer);timer=null}
 try{
  if(multiplayerCode&&multiplayerToken){
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),3000);
   try{await fetch('/api/battle-room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'leave',code:multiplayerCode,token:multiplayerToken}),signal:controller.signal,keepalive:true})}
   finally{clearTimeout(timeout)}
  }
 }catch(error){console.warn('Battle leave request failed:',error)}
 // A consented transfer may complete while the explicit leave request is in flight.
 if(localStorage.getItem('hero-auction-session')!==leavingStoredSeat)return;
 try{sessionStorage.removeItem('hero-auction-formation');sessionStorage.removeItem('hero-auction-lanes');localStorage.removeItem('hero-auction-session')}catch{}
 window.HeroPlatform?.beforeNavigate('https://heroauction.com.tr/');location.replace('https://heroauction.com.tr/');
}
document.querySelectorAll('.arena-home-link').forEach(link=>link.addEventListener('click',leaveBattleAndGoHome));

async function battleLobby(action){try{const code=$('join-battle-code').value.trim();const response=await fetch('/api/battle-room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,code})});const v=await response.json();if(!response.ok)throw Error(v.error);window.HeroPlatform?.beforeNavigate('/battle-preview.html?code='+encodeURIComponent(v.code)+'&token='+encodeURIComponent(v.token));location.href='/battle-preview.html?code='+encodeURIComponent(v.code)+'&token='+encodeURIComponent(v.token)}catch(e){$('battle-lobby-status').textContent='⚠ '+e.message}}
$('create-battle-room').onclick=()=>battleLobby('create');
$('join-battle-room').onclick=()=>battleLobby('join');
if(multiplayerCode){$('battle-lobby-status').textContent='Oda kodu: '+multiplayerCode+' · Arkadaşınla paylaş. Dizilişini hazırlayıp Hazırım düğmesine bas.';$('battle-lobby').classList.add('lobby-connected')}if(arenaMode||auctionMode)$('battle-lobby').hidden=true;
// A complete formation is shown once verified; old unscoped saves are read only for legacy previews.
const previewTeam=()=>demoA.map((hero,index)=>({id:'preview-'+index,role:hero[1],laneModifiers:auctionLaneModifiers[index]}));
const positions=[0,1,2,3,4];let selectedHero=null,preparationDraft=null,preparationMatchKey=null;
let previewMusicMatchKey=null;
let multiplayerArenaKey=null;
function applyPreviewRoomTheme(view){
 if(view?.code!==multiplayerCode||!Number.isSafeInteger(view.created)||view.created<=0)return;
 multiplayerArenaKey=multiplayerCode+':1:'+view.created;
 arenaTheme.apply(view.arenaPresentation,multiplayerArenaKey);
}
if(!auctionMode){
 // The production path uses the authoritative match number + creation time.
 // Preview/test rooms have no rematch API; a reload of their arena keeps its key.
 if(multiplayerCode)previewMusicMatchKey='preview-room:'+multiplayerCode;
 else{
  try{if(arenaMode)previewMusicMatchKey=arenaMusicStorage?.getItem('hero-auction-preview-music-match')}catch{}
  if(!previewMusicMatchKey)previewMusicMatchKey='preview:'+Date.now()+':'+Math.random().toString(36).slice(2);
  try{arenaMusicStorage?.setItem('hero-auction-preview-music-match',previewMusicMatchKey)}catch{}
 }
}

if(!auctionMode){
 const defaults=buildDefaultFormation(previewTeam());lanes.splice(0,5,...defaults.lanes);
 try{
  const saved=JSON.parse(sessionStorage.getItem('hero-auction-preview-draft')||'null');
  const key=multiplayerCode?multiplayerCode+':'+multiplayerToken:'preview';
  if(saved?.key===key&&validateFormation(saved,previewTeam())){positions.splice(0,5,...saved.positions);lanes.splice(0,5,...saved.lanes)}
  else if(arenaMode){
   const legacy={positions:JSON.parse(sessionStorage.getItem('hero-auction-formation')||'null'),lanes:JSON.parse(sessionStorage.getItem('hero-auction-lanes')||'null')};
   if(Array.isArray(legacy.positions))legacy.roles=legacy.positions.map(i=>demoA[i]?.[1]);
   if(validateFormation(legacy,previewTeam())){positions.splice(0,5,...legacy.positions);lanes.splice(0,5,...legacy.lanes)}
  }
 }catch{}
}
function savePreviewDraft(){try{sessionStorage.setItem('hero-auction-preview-draft',JSON.stringify({key:multiplayerCode?multiplayerCode+':'+multiplayerToken:'preview',...formationSnapshot()}))}catch{}}
function displayedLanePower(heroIndex,lane){
 const base=Number(demoA[heroIndex]?.[2])||0;
 const credit=auctionMode?creditBonus(previewCredits):0;
 const modifier=Number(auctionLaneModifiers[heroIndex]?.[lane]);
 // Same bounded composition calculation as battle-engine.js, including lane and duplicate penalty.
 const role=assignedRoles[heroIndex]||'fighter';
 const roleCount=assignedRoles.filter(r=>r===role).length;
 const duplicatePenalty=Math.max(0,roleCount-3)*.075;
 const laneBonus=Number.isFinite(modifier)?Math.max(-.10,Math.min(.10,modifier)):0;
 const multiplier=Math.max(.90,Math.min(1.10,1-duplicatePenalty+laneBonus));
 const tacticalPower=base*multiplier*(1+credit);
 const commanderBonus=commanderBonusForRole(role);
 // Commander upgrades are applied AFTER the bounded tactical multiplier in the battle engine.
 // Display the boosted role-specific stat on the card-power scale; commander bonus is based on original power.
 return {base,bonus:laneBonus,commanderBonus,power:Math.round((tacticalPower+base*commanderBonus)*100)/100};
}
function updateFormationPowerSummary(){
 const placed=auctionMode&&!auctionLoaded?[]:positions.map((heroIndex,slot)=>({heroIndex,slot})).filter(item=>Number.isInteger(item.heroIndex));
 const base=placed.reduce((sum,{heroIndex})=>sum+(Number(demoA[heroIndex]?.[2])||0),0);
 const current=placed.reduce((sum,{heroIndex,slot})=>sum+displayedLanePower(heroIndex,lanes[slot]).power,0);
 const delta=current-base;
 if($('formation-placed-count'))$('formation-placed-count').textContent=placed.length+' / 5';
 if($('formation-base-power'))$('formation-base-power').textContent=base.toFixed(2);
 if($('formation-current-power'))$('formation-current-power').textContent=current.toFixed(2);
 if($('formation-power-change')){
  const el=$('formation-power-change');
  el.textContent=(delta>=0?'+':'')+delta.toFixed(2)+' ('+(base?((delta/base)*100).toFixed(1):'0.0')+'%)';
  el.classList.toggle('negative',delta<0);
 }
}
function renderCommanderBonusDetail(){
 const el=$('commander-bonus-content');if(!el)return;
 if(auctionMode&&!auctionLoaded){el.textContent='Açık artırma kartları doğrulanıyor…';return}
 const slot=positions.findIndex(index=>index===selectedHero&&index!==null);
 const chosen=slot>=0?slot:positions.findIndex(index=>index!==null);
 if(chosen<0){el.textContent='Kahramanları dizilişe yerleştirdiğinde bonuslar burada görünecek.';return}
 const heroIndex=positions[chosen],role=roleAt(chosen),power=displayedLanePower(heroIndex,lanes[chosen]);
 const base=power.base,rate=power.commanderBonus,stat=role==='tank'?'Savunma':role==='support'?'Can':role==='energy'?'Saldırı': 'Saldırı';
 const tactical=power.power-base*rate;
 const commanderPoints=base*rate;
 const format=n=>(n>=0?'+':'')+n.toFixed(2);
 const commanderStat=role==='energy'?'Saldırı istatistiğine yüzdesel uygulanır':role==='support'?'Maksimum cana uygulanır':'Temel güce göre ilgili savaş istatistiğine eklenir';
 el.replaceChildren();
 const title=document.createElement('div');title.style.cssText='font-weight:800;margin-bottom:7px';title.textContent=demoA[heroIndex][0]+' · '+roleNames[role]+' · '+(lanes[chosen]==='front'?'Ön saf':'Arka saf');el.append(title);
 for(const [label,value] of [['Temel kart gücü',base.toFixed(2)],['Saf / rol / kredi etkisi',format(tactical-base)],['Komutan önizleme katkısı ('+(rate*100).toFixed(1)+'%)',format(commanderPoints)],['Tahmini güç göstergesi',power.power.toFixed(2)]]){const row=document.createElement('div');row.style.cssText='display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid #294760';const left=document.createElement('span');left.textContent=label;const right=document.createElement('strong');right.textContent=value;row.append(left,right);el.append(row)}
 const note=document.createElement('small');note.style.cssText='display:block;margin-top:8px;opacity:.85';note.textContent='Gerçek savaş etkisi: '+stat+' · '+(rate*100).toFixed(1)+'% · '+commanderStat+'. Bu güç değeri önizlemedir; savaş motorunda bonus rolüne göre saldırı, savunma veya can istatistiğine uygulanır ve tam sayıya yuvarlanır.';el.append(note);
}
function renderBoard(){
 for(const [container,lane] of [['front-slots','front'],['back-slots','back']]){
  const root=$(container);root.replaceChildren();
  // No empty slot targets or duplicate roster: these are the five acquired heroes.
  if(auctionMode&&!auctionLoaded)continue;
  for(const slot of positions.map((_,i)=>i).filter(i=>lanes[i]===lane)){
   const heroIndex=positions[slot],role=roleAt(slot),power=displayedLanePower(heroIndex,lane);
   const wrap=document.createElement('article');wrap.className='slot-wrap';wrap.dataset.heroIndex=heroIndex;
   const label=document.createElement('span');label.className='slot-role';label.textContent=roleIcons[role]+' '+roleNames[role];
   const portrait=document.createElement('button');portrait.type='button';portrait.className='board-slot circle-slot filled';portrait.dataset.slot=slot;
   const rarityLabel=applyHeroRarity(document,portrait,{name:demoA[heroIndex][0],rarity:demoA[heroIndex][4]});
   portrait.title=demoA[heroIndex][0]+' · '+rarityLabel;
   portrait.disabled=prepDone||prepSubmitting;portrait.setAttribute('aria-label',demoA[heroIndex][0]+' · '+rarityLabel+' · '+roleNames[role]+' · '+(lane==='front'?'Ön saf':'Arka saf'));
   portrait.setAttribute('aria-pressed',String(selectedHero===heroIndex));portrait.classList.toggle('selected',selectedHero===heroIndex);
   heroPortrait(heroIndex,portrait);
   // Portrait selection only inspects bonuses; it cannot move/swap individual positions.
   portrait.onclick=()=>{selectedHero=heroIndex;renderBoard()};
   const identity=document.createElement('div');identity.className='board-hero-identity';
   const name=document.createElement('strong');name.className='board-hero-name';name.textContent=demoA[heroIndex][0];
   const powerLabel=document.createElement('span');powerLabel.className='board-hero-power';powerLabel.textContent='⚡ GÜÇ ≈'+power.power.toFixed(2);powerLabel.setAttribute('aria-label','Tahmini güç '+power.power.toFixed(2));powerLabel.title='Rol, saf ve komutan etkilerini özetleyen tahmini güç; gerçek savaş istatistikleri ayrı hesaplanır.';powerLabel.style.color=power.power>=power.base?'#83f4b6':'#ff9a9a';
   identity.append(name,powerLabel);
   const move=document.createElement('button');move.type='button';move.className='lane-switch';move.dataset.slot=slot;
   move.textContent=lane==='front'?'↓ Arka safa':'↑ Ön safa';move.setAttribute('aria-label',demoA[heroIndex][0]+' · '+move.textContent);
   move.disabled=prepDone||prepSubmitting;move.onclick=()=>setLane(slot,lane==='front'?'back':'front');
   wrap.append(label,portrait,identity,move);root.append(wrap);
  }
 }
 updateFormationPowerSummary();renderCommanderBonusDetail();
}
let prepTimer=null,prepDeadline=0,prepDone=false,prepSubmitting=false,auctionLoaded=false;
// Start the actual media element silently on the first trusted preparation gesture.
// Keeping it playing in the same document preserves Safari's user-gesture permission.
let arenaAudioPrimed=false;
function primeArenaAudio(){
 if(window.HeroPlatform?.muteAudio||document.hidden||arenaMode||arenaAudioPrimed||!arenaMusicEnabled||!selectArenaMusic(false))return;
 arenaAudioPrimed=true;
 void arenaMusic.prime().then(started=>{if(!started)arenaAudioPrimed=false;});
}
document.addEventListener('pointerdown',e=>{
 if(!arenaMode&&e.target.closest('.formation'))primeArenaAudio();
},{capture:true});
document.addEventListener('touchstart',e=>{
 if(!arenaMode&&e.target.closest('.formation'))primeArenaAudio();
},{capture:true,passive:true});
document.addEventListener('click',e=>{
 if(!arenaMode&&e.target.closest('.formation'))primeArenaAudio();
},{capture:true,passive:true});
function revealArenaAudio(){
 if(arenaMusicEnabled&&!document.hidden)void startArenaMusic();
}
function enterArenaWithoutReload(url){
 window.HeroPlatform?.gameplay(false);
 // Preserve the user-unlocked HTMLAudioElement across the formation-to-arena transition.
 history.replaceState(null,'',url);
 arenaMode=true;
 mountCommanderDock();
 window.dispatchEvent(new CustomEvent('heroarena:route-change',{detail:{url}}));
 void requestArenaWakeLock();

 revealArenaAudio();
 document.body.classList.add('arena-room');
 document.querySelector('.formation').hidden=true;
 $('battle-lobby').hidden=true;
 // Keep the painting hidden while waiting; reveal only its final fitted frame.
 $('battle-arena').hidden=true;

 $('play').textContent='▶ SAVAŞI BAŞLAT';
 $('play').disabled=true;
 if(prepTimer!==null){clearInterval(prepTimer);prepTimer=null}
 $('message').textContent='Rakibin hazırlanması bekleniyor…';
 if(auctionMode&&auctionCode&&auctionToken){
  const check=async()=>{
   try{
    const response=await fetch('/api/battle-auction-preview?code='+encodeURIComponent(auctionCode)+'&token='+encodeURIComponent(auctionToken),{cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Savaş durumu alınamadı');
    if(data.started){
     if(battlePoll!==null){clearInterval(battlePoll);battlePoll=null}
     await build(data.result);
     if(data.result?.live){
      $('play').textContent='⚡ CANLI SAVAŞ SÜRÜYOR';
      await import('/commander-experimental.js?live='+encodeURIComponent(auctionCode));
     }else if(events.length)startReplay();
    }else $('message').textContent='Rakibin dizilişi bekleniyor… '+data.ready.filter(Boolean).length+'/2 hazır';
   }catch(e){$('message').textContent='⚠ '+e.message}
  };
  void check();if(battlePoll===null)battlePoll=setInterval(check,1800);
 }else if(!multiplayerCode){void build().then(()=>{if(events.length)startReplay()})}
}
async function lockFormation(){
 if(prepDone||prepSubmitting||auctionMode&&!auctionLoaded)return;
 if(!arenaMode&&arenaMusicEnabled&&!arenaAudioPrimed)primeArenaAudio();
 prepSubmitting=true;$('apply-roles').disabled=true;renderBoard();
 try{
  if(!arenaMode){
   try{sessionStorage.setItem('hero-auction-arena-music','1');if(!auctionMode){sessionStorage.setItem('hero-auction-formation',JSON.stringify(positions));sessionStorage.setItem('hero-auction-lanes',JSON.stringify(lanes))}}catch{}
   const formation=formationSnapshot();
   if(auctionMode){
    // Finish queued row changes before confirmation; Ready also carries the full final draft.
    await preparationDraft?.flush();
    const response=await fetch('/api/battle-auction-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:auctionCode,token:auctionToken,matchKey:preparationMatchKey,...formation})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Diziliş gönderilemedi');
    preparationDraft?.clear();prepDone=true;
    enterArenaWithoutReload('/battle-preview.html?room=arena&auctionCode='+encodeURIComponent(auctionCode)+'&auctionToken='+encodeURIComponent(auctionToken)+'&commanderTest=1');return;
   }
   if(multiplayerCode&&multiplayerToken){
    const response=await fetch('/api/battle-room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ready',code:multiplayerCode,token:multiplayerToken,...formation})});
    const data=await response.json();if(!response.ok)throw Error(data.error);
    prepDone=true;enterArenaWithoutReload('/battle-preview.html?room=arena&code='+encodeURIComponent(multiplayerCode)+'&token='+encodeURIComponent(multiplayerToken));return;
   }
   prepDone=true;enterArenaWithoutReload('/battle-preview.html?room=arena');return;
  }
  prepDone=true;document.querySelector('.formation').hidden=true;$('battle-arena').hidden=true;
  if(prepTimer!==null){clearInterval(prepTimer);prepTimer=null}
  $('apply-roles').textContent='✓ HAZIR';$('ready-a').textContent='🔵 Sen: Hazır';$('prep-note').textContent='İki taraf hazır. Savaş başlıyor!';stop();$('events').replaceChildren();$('play').textContent='▶ SAVAŞI OYNAT';
  await build();if(events.length)$('play').click();
 }catch(error){$('prep-note').textContent='⚠ '+error.message;prepDone=false;$('apply-roles').disabled=false}
 finally{prepSubmitting=false;if(!prepDone)renderBoard()}
}
function startPreparation(){
 if(prepTimer!==null)clearInterval(prepTimer);prepDone=false;prepDeadline=Date.now()+60000;let expired=false;
 const tick=()=>{const remaining=Math.max(0,Math.ceil((prepDeadline-Date.now())/1000));$('prep-clock').textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');if(!remaining&&!expired){expired=true;void lockFormation()}};
 tick();prepTimer=setInterval(tick,200);
}
const roleIcons={tank:'🛡️',fighter:'⚔️',energy:'⚡',assassin:'🗡️',support:'💚'};
$('apply-roles').onclick=lockFormation;
if(arenaMode){document.body.classList.add('arena-room');document.querySelector('.formation').hidden=true;$('battle-arena').hidden=true;$('play').textContent='▶ SAVAŞI BAŞLAT';mountCommanderDock()}else{renderBoard();if(!auctionMode)startPreparation();else{$('apply-roles').disabled=true;$('prep-clock').textContent='--:--';$('prep-note').textContent='Açık artırma kartları doğrulanıyor…'}}
const combatEffects=createCombatEffects({document});
for(const event of ['pagehide','popstate','heroarena:route-change','heroarena:connection-lost','heroarena:ready'])window.addEventListener(event,()=>combatEffects.clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden)combatEffects.clear()});
$('motion').addEventListener('change',()=>{if(!$('motion').checked)combatEffects.clear()});
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>combatEffects.clear());
const motion=()=> !document.hidden&&!document.body.classList.contains('arena-catching-up')&&$('motion').checked&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration=()=>Number($('speed').value);
function comicBattleCue(e){
 if(!motion()||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const action=String(e.action||'');
 const healing=action==='heal'||action==='passive-heal',guard=combatEffectKind(e)==='shield';
 const splash=e.damageType==='splash';
 const special=!splash&&e.damageType==='special';
 const impact=Number(e.value)>0&&!healing&&!guard;
 if(splash||(!special&&!healing&&!guard&&!(impact&&Number(e.value)>=100)))return;
 const cue=document.createElement('div');
 cue.className='battle-comic-banner'+(healing?' heal':guard?' shield':'');
 cue.textContent=healing?'ŞİFA!':guard?'KALKAN!':special?'ÖZEL GÜÇ!':'BAM!';
 cue.setAttribute('aria-hidden','true');combatEffects.node(cue,document.body,750);
}

const arenaTeamRenderer=createArenaTeamRenderer({document,loadArt:unit=>podiumPortrait(unit),onDefeated:card=>showHeroSoul(card)});
function floatingArenaEffect(target,className,text,lifetime=1600){
 if(!target||document.hidden)return;
 const rect=target.getBoundingClientRect();
 const effect=document.createElement('span');effect.className=className;
 effect.textContent=text;effect.setAttribute('aria-hidden','true');
 effect.style.left=(rect.left+rect.width/2)+'px';effect.style.top=(rect.top+rect.height*.3)+'px';
 combatEffects.node(effect,document.body,lifetime);
}
function showHeroSoul(card){
 if(!motion())return;
 floatingArenaEffect(card,'arena-rising-soul','✦',2200);
}

function animateMove(e){
 if(!motion())return;
 // A committed skipped attack must never animate a strike or a projectile.
 if(e.action==='stun-skip'){
  const team=document.getElementById(e.side===0?'team-a':'team-b');
  const stunned=[...(team?.querySelectorAll('.hero')||[])].find(x=>x.dataset.heroId===e.actorId);
  floatingArenaEffect(stunned,'arena-floating-damage',document.documentElement.lang==='en'?'ATTACK SKIPPED':'SALDIRI ATLANDI');
  return;
 }
 // Delay changes initiative, not another attack or stun animation.
 if(e.action==='delay'){
  const {target:delayed}=combatEffectActors(document,e,'strike');
  floatingArenaEffect(delayed,'arena-floating-damage',document.documentElement.lang==='en'?'ACTS LAST':'SIRA SONU');
  return;
 }
 const splash=e.damageType==='splash';
 const {actor}=combatEffectActors(document,e,null);
 if(!actor)return;
 const hero={id:actor.dataset.heroId,role:actor.dataset.role};
 const kind=combatEffectKind(e,hero);
 if(!kind)return; // Status changes are not extra strikes (haste, rage, weaken…).
 const {target}=combatEffectActors(document,e,kind);
 const heal=kind==='heal',shield=kind==='shield',special=!splash&&e.damageType==='special';
 const ranged=splash||stationaryArenaAction(hero,e);
 const time=Math.max(320,Math.min(780,duration()*.72));
 if(!splash)comicBattleCue(e);
 // Capture portrait centers before the cosmetic actor lunge changes bounds.
 playHeroAttack({document,effects:combatEffects,actor,target,hero,kind,special,splash,time});
 if(target&&!heal&&!shield){
  if(!splash){
   const ar=actor.getBoundingClientRect(),tr=target.getBoundingClientRect();
   const dx=(tr.left+tr.width/2)-(ar.left+ar.width/2),dy=(tr.top+tr.height/2)-(ar.top+ar.height/2);
   if(!ranged)combatEffects.animate(actor,[{transform:'translate(0,0) scale(1)'},{transform:`translate(${dx*.77}px,${dy*.77}px) scale(1.13)`,offset:.45},{transform:'translate(0,0) scale(1)'}],{duration:time,easing:'ease-in-out'});
   else combatEffects.animate(actor,[{filter:'brightness(1)'},{filter:'brightness(1.35)',offset:.5},{filter:'brightness(1)'}],{duration:time*.8,easing:'ease-out'});
  }
  // Localized impact instead of a full-screen flash: HP and heroes stay readable.
  // Target signature lands on arrival; authoritative HP remains immediate.
  combatEffects.mark(target,[splash?'splash-target':'primary-target'],splash?450:850);
 }
 if(!splash){
  combatEffects.mark(actor,[ranged?'attack-energy':'attack-melee',...(special?['special-cast']:[])],700);
 }
 const effectTarget=target;
 if(Number(e.value)>0)floatingArenaEffect(effectTarget,'arena-floating-damage'+(heal?' healing':shield?' shielding':e.critical?' critical':'')+(splash?' area-hit':''),(heal||shield?'+':'−')+Math.round(Number(e.value))+(e.critical?'!':''));

}
window.addEventListener('heroarena:experimental-move',event=>{
 const move=event.detail?.event;
 if(!move||typeof move.actor!=='string')return;
 // Use the server-committed action in the visible 2D arena animations.
 animateMove({...move,actorId:move.actor,targetId:move.target});
});

const commanderPortraits={attack:'/images/Ate%C5%9Fler%20%C4%B0%C3%A7inde%20Sava%C5%9F%C3%A7%C4%B1%20Komutan.png',defense:'/images/Alt%C4%B1n%20Aslan%C4%B1n%20Kale%20Muhaf%C4%B1z%C4%B1.png',magic:'/images/Kozmik%20R%C3%BCnlerin%20B%C3%BCy%C3%BCc%C3%BC%20Komutan%C4%B1.png',support:'/images/Z%C3%BCmr%C3%BCt%20I%C5%9F%C4%B1%C4%9F%C4%B1n%20%C5%9Eifac%C4%B1%20Krali%C3%A7esi.png'};
const commanderDisplay={attack:['⚔️','Saldırı'],defense:['🛡️','Savunma'],magic:['🔮','Büyücü'],support:['💚','Destek']};
function renderArenaCommanderMatchup(profiles){
 const panel=$('arena-commander-matchup');if(!panel)return;
 panel.hidden=!Array.isArray(profiles)||!profiles.some(Boolean);
 if(panel.hidden)return;
 for(let side=0;side<2;side++){
  const target=$(side===0?'arena-commander-left':'arena-commander-right');
  target.replaceChildren();
  target.className='arena-commander-card '+(side===0?'blue':'red');
  const profile=profiles[side],info=commanderDisplay[profile?.commanderId];
  const portrait=document.createElement('img');portrait.className='arena-commander-portrait';portrait.alt=info?info[1]+' komutanı':'Komutan';
  if(info&&commanderPortraits[profile.commanderId]){portrait.src=commanderPortraits[profile.commanderId];portrait.onerror=()=>{portrait.hidden=true}}
  else portrait.hidden=true;
  const details=document.createElement('span');details.className='arena-commander-details';
  const name=document.createElement('strong');
  name.textContent=info?(info[0]+' '+info[1]+' · Sv. '+commanderAbilityStats(profile).level):'Komutan seçilmedi';
  if(info)target.title=commanderAbilityDescription(profile);
  const levels=document.createElement('small');
  levels.textContent=profile?.levels?Object.entries(profile.levels).filter(([,level])=>level>0).map(([stat,level])=>(commanderDisplay[stat]?.[1]||stat)+' +%'+(level*.5).toLocaleString('tr-TR')).join(' · ')||'Geliştirme yok':'Bonus yok';
  details.append(name,levels);target.append(portrait,details);
 }
}
async function build(overrideResult){
 resetVictoryChestPresentation();
 $('battle-arena').hidden=true;
 arenaWeatherReady=false;arenaWeather.clear();arenaSceneLayout.clear();
 document.body.classList.remove('arena-results');document.querySelector('.controls').hidden=false;
 combatEffects.clear();stop();if(victoryPendingTimer!==null){clearTimeout(victoryPendingTimer);victoryPendingTimer=null}resetArenaClock();arenaTeamRenderer.reset();battlePresentationFinished=false;cursor=0;events=[];$('arena-score').hidden=true;if($('battle-summary'))$('battle-summary').hidden=true;victoryRevealDone=false;if(victoryRevealTimer!==null){clearTimeout(victoryRevealTimer);victoryRevealTimer=null}if($('arena-victory-reveal'))$('arena-victory-reveal').hidden=true;$('next').disabled=true;$('play').disabled=true;
 $('message').textContent='Sunucudan gerçek savaş sonucu alınıyor…';
 try{
  let result=overrideResult;
  if(!result&&auctionMode){const response=await fetch('/api/battle-auction-preview?code='+encodeURIComponent(auctionCode)+'&token='+encodeURIComponent(auctionToken),{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Savaş alınamadı');if(!data.started){$('message').textContent='Rakibin dizilişi bekleniyor… '+data.ready.filter(Boolean).length+'/2 hazır';return}result=data.result}
  if(!result){const response=await fetch('/api/battle-preview?roles='+encodeURIComponent(positions.map((i,slot)=>roleAt(slot)).join(','))+'&positions='+encodeURIComponent(positions.join(','))+'&lanes='+encodeURIComponent(lanes.join(',')),{cache:'no-store'});if(!response.ok)throw Error('Savaş verisi alınamadı ('+response.status+')');result=await response.json()}
  // Only already-validated room identity selects the decorative board; no URL override.
  const arenaMatch=auctionMode?(preparationMatchKey?auctionCode+':'+preparationMatchKey:null):multiplayerArenaKey||previewMusicMatchKey;
  arenaTheme.apply(result.arenaPresentation,arenaMatch);
  renderArenaCommanderMatchup(result.commanders);
  liveArenaMode=!!result.live;
  states=result.teams.map((team,side)=>team.map((u,index)=>({...u,hp:u.maxHp,shieldKnown:liveArenaMode||Number.isFinite(result.initialShields?.[side]?.[index]),shield:liveArenaMode?(Number(u.shield)||0):(Number(result.initialShields?.[side]?.[index])||0)})));
  if(!liveArenaMode)for(const unit of states.flat())for(const key of ['arcaneSurgeBonusAttack','arcaneSurgeFromRound','arcaneSurgeUntilRound','commanderFocusUntilDeath','commanderStunNextAttack','commanderHuntNextAttack','lastStandReady','lastStandPersistent','lastStandUntilRound','lastStandImmortalRounds','lastStandTriggeredRound','lastStandImmortalUntilRound'])delete unit[key];
  const lookup=new Map(states.flat().map(u=>[u.id,u.name]));
  const replayHealth=createBattleReplayHealth(states);
  events=(liveArenaMode?[]:result.log).map(entry=>({
   ...entry,actorId:entry.actor,targetId:entry.target,actor:lookup.get(entry.actor)||entry.actor,target:lookup.get(entry.target)||entry.target,
   snapshot:replayHealth.apply(entry),statusSnapshot:replayHealth.statusSnapshot()
  }));
  if(!liveArenaMode&&events.length){replayHealth.finish();events[events.length-1].statusSnapshot=replayHealth.statusSnapshot();}
  // The server is authoritative for winner; the UI reconstructs interim HP from logs.
  finalResult=result;
  if(liveArenaMode)startArenaClock();
  if(arenaMode)void startArenaMusic();
  $('arena-score').hidden=false;$('battle-arena').hidden=false;
  // One synchronous reveal: final HUD, viewport fit, scene layout and heroes
  // are prepared in this task, never an intermediate cover-cropped waiting board.
  refreshArenaViewport();
  $('message').textContent=liveArenaMode?'Canlı savaş başladı · Komutanını yönet':'Gerçek savaş motoru hazır · '+result.rounds+' tur';
  arenaWeatherReady=true;render();window.HeroPlatform?.loaded();window.HeroPlatform?.gameplay(true);window.heroArenaTeams=states.map(t=>t.map(u=>({id:u.id,name:u.name,hp:u.hp,maxHp:u.maxHp,power:u.power,rarity:u.rarity,lane:u.lane,position:u.position})));window.dispatchEvent(new CustomEvent('heroarena:ready',{detail:{teams:window.heroArenaTeams}}));
 }catch(e){$('battle-arena').hidden=true;arenaWeatherReady=false;arenaWeather.clear();arenaSceneLayout.clear();refreshArenaViewport();$('message').textContent='⚠ '+e.message}
}
function battleEventText(event){
 const names=new Map(states.flat().map(unit=>[unit.id,unit.name]));
 return describeBattleEvent(event,{english:document.documentElement.lang==='en',names});
}
function showBattleFeedback(event){
 const text=document.createElement('span');text.setAttribute('translate','no');text.textContent=battleEventText(event);
 $('message').replaceChildren(text);
}
function appendBattleFeedback(event){
 const li=document.createElement('li');li.setAttribute('translate','no');
 li.textContent=(document.documentElement.lang==='en'?'Round ':'Tur ')+(event.round||0)+' · '+battleEventText(event);
 $('events').prepend(li);
 while($('events').children.length>120)$('events').lastElementChild.remove();
}
let feedbackVersion=0;
window.addEventListener('heroarena:ready',()=>{feedbackVersion=0;});
// Experimental round-end HP is server-owned. Do not interfere with manual replay.
window.addEventListener('heroarena:experimental-round-end',e=>{
 if(timer!==null||!Array.isArray(e.detail?.teams)||states.length!==2)return;
 if(victoryRevealDone)return;
 const snapshot=e.detail.teams;
 for(let side=0;side<2;side++){
  const hpById=new Map((snapshot[side]||[]).map(u=>[u.id,u.hp]));
  for(const unit of states[side])if(hpById.has(unit.id)){const live=snapshot[side].find(u=>u.id===unit.id);delete unit.commanderFocusUntilDeath;delete unit.commanderStunNextAttack;delete unit.commanderHuntNextAttack;for(const key of ['lastStandReady','lastStandPersistent','lastStandUntilRound','lastStandImmortalRounds','lastStandTriggeredRound','lastStandImmortalUntilRound'])delete unit[key];Object.assign(unit,live);if(e.detail.finished){delete unit.commanderFocusUntilDeath;delete unit.commanderStunNextAttack;delete unit.commanderHuntNextAttack;for(const key of ['lastStandReady','lastStandPersistent','lastStandUntilRound','lastStandImmortalRounds','lastStandTriggeredRound','lastStandImmortalUntilRound'])delete unit[key];}unit.hp=Math.max(0,Math.min(unit.maxHp,Number(live.hp)||0));unit.shield=Number(live.shield)||0;unit.shieldKnown=true;}
 }
 const fresh=(e.detail.events||[]).filter(entry=>Number.isSafeInteger(entry.version)&&entry.version>feedbackVersion);
 for(const entry of fresh){appendBattleFeedback(entry);feedbackVersion=Math.max(feedbackVersion,entry.version);}
 render();
 $('round').textContent=String(e.detail.round||0);$('message').textContent=e.detail.finished?'Canlı savaş tamamlandı':'Canlı savaş · Tur '+e.detail.round;
 if(!e.detail.finished&&fresh.length)showBattleFeedback(fresh[fresh.length-1]);
 if(liveArenaMode&&e.detail.finished){finalResult={...finalResult,winner:[0,1].includes(e.detail.winner)?e.detail.winner:null,rounds:Number(e.detail.round)||0,teams:states,finalHealthTeams:captureFinalHeroHealth(snapshot),summary:e.detail.summary,log:[...(finalResult?.log||[]),...(e.detail.events||[])]};showVictoryReveal();}
});
const arenaArtCache=new Map();
let finalResult=null;
let victoryChestPresentation=null;
function resetVictoryChestPresentation(){victoryChestPresentation?.destroy();victoryChestPresentation=null;}
function showVictoryChest(result){
 // This is a view of the winning seat's committed receipt, not a claim button.
 const panel=$('battle-summary');
 if(!auctionMode||finalResult?.winner!==0||!panel||!preparationMatchKey||leavingBattle)return;
 const matchId=auctionCode+':'+preparationMatchKey;
 if(result?.matchId&&result.matchId!==matchId)return;
 let root=$('arena-victory-chest');
 if(!root){root=document.createElement('section');root.id='arena-victory-chest';root.hidden=true;const detail=$('battle-summary-detail');if(detail)detail.after(root);else panel.prepend(root)}
 if(!victoryChestPresentation){
  let storage,loginSnapshot,account='winner';
  try{storage=sessionStorage}catch{}
  try{loginSnapshot=localStorage.getItem('hero-auction-login');account=JSON.parse(loginSnapshot||'null')?.user?.sub||account}catch{}
  const scope=(window.HeroPlatform?'crazygames:':'web:')+account;
  victoryChestPresentation=createVictoryChestPresentation({root,matchId,accountScope:scope,winner:finalResult.winner,english:document.documentElement.lang==='en',storage,
   isCurrent:()=>{if(leavingBattle||panel.hidden||auctionCode+':'+preparationMatchKey!==matchId||finalResult?.winner!==0)return false;if(loginSnapshot===undefined)return true;try{return localStorage.getItem('hero-auction-login')===loginSnapshot}catch{return true}},
   load:async({signal})=>{
    const response=await fetch('/api/battle-auction-preview?code='+encodeURIComponent(auctionCode)+'&token='+encodeURIComponent(auctionToken),{cache:'no-store',signal});
    const value=await response.json();
    if(!response.ok)throw Object.assign(Error(value.error||'Sandık kaydı alınamadı'),{status:response.status});
    if(!value.started||value.result?.matchId&&value.result.matchId!==matchId)throw Object.assign(Error('Maç değişti'),{status:409});
    return value.result;
   }
  });
 }
 victoryChestPresentation.update(result);
}
window.addEventListener('pagehide',resetVictoryChestPresentation);
window.addEventListener('pagehide',()=>{arenaWeatherPageHidden=true;arenaWeather.clear();arenaSceneLayout.clear();});
window.addEventListener('pageshow',()=>{arenaWeatherPageHidden=false;syncArenaWeather();});
window.addEventListener('hero:login-changed',()=>{arenaWeatherReady=false;arenaWeather.clear();arenaSceneLayout.clear();});
window.addEventListener('storage',event=>{if(event.key==='hero-auction-login')resetVictoryChestPresentation()});
window.addEventListener('hero:login-changed',resetVictoryChestPresentation);
function render(flash){
 const fittedLayout=getArenaLaneLayout(states);
 for(let side=0;side<2;side++){
  const parent=$(side?'team-b':'team-a');
  const laneRows=fittedLayout.teams[side];
  arenaTeamRenderer.update(parent,states[side],{side,rows:fittedLayout.rows,laneRows,fittedRows:fittedLayout.teams[side],flash,roleNames});
  $(side?'score-b':'score-a').textContent=states[side].filter(u=>u.hp>0).length+' / 5';
  const suffix=side?'b':'a';
  const maxHp=states[side].reduce((sum,u)=>sum+Math.max(0,Number(u.maxHp)||0),0);
  const remainingHp=states[side].reduce((sum,u)=>sum+Math.max(0,Math.min(Number(u.hp)||0,Number(u.maxHp)||0)),0);
  const percent=maxHp>0?Math.max(0,Math.min(100,remainingHp/maxHp*100)):0;
  $('team-hp-'+suffix+'-fill').style.width=percent+'%';
  $('team-hp-'+suffix+'-label').textContent=Math.round(remainingHp).toLocaleString('tr-TR')+' / '+Math.round(maxHp).toLocaleString('tr-TR')+' HP';
  $('team-hp-'+suffix+'-track').setAttribute('aria-valuenow',String(Math.round(percent)));
  $('team-hp-'+suffix+'-track').setAttribute('aria-valuetext',Math.round(remainingHp)+' / '+Math.round(maxHp)+' HP');
 }
 syncArenaWeather();arenaSceneLayout.refresh();arenaWeather.refresh();
 $('round').textContent=cursor?events[cursor-1].round:'0';
 $('next').disabled=cursor>=events.length;
 $('play').disabled=cursor>=events.length;
 if(events.length&&cursor===events.length){
  showVictoryReveal();
  $('message').textContent=finalResult?.winner===null?'🤝 Beraberlik':finalResult?.winner===0?'🏆 Mavi takım kazandı!':'🏆 Kırmızı takım kazandı!';
 }
}
let victoryRevealDone=false,victoryRevealTimer=null,victoryPendingTimer=null;
function podiumPortrait(hero,side){
 const universe=String(hero.id||'').split(':')[0]||'original';
 const key=universe+':'+hero.name;
 if(!arenaArtCache.has(key))arenaArtCache.set(key,fetch('/api/art?universe='+encodeURIComponent(universe)+'&name='+encodeURIComponent(hero.name)).then(r=>r.ok?r.json():null).then(data=>data?.url||null).catch(()=>null));
 return arenaArtCache.get(key);
}
function showVictoryReveal(){
 window.HeroPlatform?.gameplay(false);
 if(victoryRevealDone||!finalResult||victoryPendingTimer!==null)return;
 pauseArenaClock();
 finishCommanderControls();
 $('play').textContent='✓ SAVAŞ TAMAMLANDI';$('play').disabled=true;
 $('message').textContent='Son hamle tamamlandı · Savaş sonucu hazırlanıyor…';
 const finish=()=>{
  const effectRemaining=Math.max(0,Math.max(window.heroCommanderEffectUntil||0,window.heroCommanderImpactUntil||0)-Date.now());
  if(effectRemaining>0||arenaFinaleActive){victoryPendingTimer=setTimeout(finish,Math.max(100,effectRemaining));return;}
  victoryPendingTimer=null;revealVictoryNow();
 };
 // Let the final hit and rising soul finish before the victory podium covers the arena.
 victoryPendingTimer=setTimeout(finish,2400);
}
function revealVictoryNow(){
 if(victoryRevealDone||!finalResult)return;
 victoryRevealDone=true;
 pauseArenaClock();
 const overlay=$('arena-victory-reveal');
 if(!overlay){showBattleSummary();return}
 const winner=finalResult.winner;
 overlay.dataset.winner=winner===null?'draw':winner===0?'blue':'red';
 $('arena-victory-label').textContent=winner===null?'BERABERLİK':winner===0?'MAVİ TAKIM':'KIRMIZI TAKIM';
 $('arena-victory-subtitle').textContent=winner===null?'ONURLU MÜCADELE':'ŞAMPİYONLAR PODYUMU';
 $('arena-victory-symbol').textContent=winner===null?'⚔':'🏆';
 const podium=$('arena-victory-podium');
 podium.replaceChildren();
 if(winner!==null){
  const commander=finalResult.commanders?.[winner];
  const id=commander?.commanderId;
  const info=commanderDisplay[id];
  const leader=document.createElement('div');leader.className='victory-commander';
  const portrait=document.createElement('img');portrait.className='victory-commander-image';portrait.alt=info?info[1]+' Komutanı':'Komutan';
  if(info&&commanderPortraits[id]){portrait.src=commanderPortraits[id];portrait.onerror=()=>{portrait.hidden=true}}
  else portrait.hidden=true;
  const title=document.createElement('strong');title.textContent=info?info[1].toUpperCase()+' KOMUTANI':'TAKIM KOMUTANI';
  const caption=document.createElement('span');caption.textContent='♛ ŞAMPİYON TAKIMIN LİDERİ';
  leader.append(portrait,title,caption);podium.before(leader);
  const old=overlay.querySelectorAll('.victory-commander');for(const node of old)if(node!==leader)node.remove();
 }else{overlay.querySelectorAll('.victory-commander').forEach(node=>node.remove())}
 const side=winner===null?null:winner;
 if(side!==null&&states[side]){
  // Center stage is highest; the other four podium places flank the champion.
  const order=[2,0,1,3,4];
  for(const [slot,index] of order.entries()){
   const hero=states[side][index];if(!hero)continue;
   const standing=hero.hp>0;
   const figure=document.createElement('div');figure.className='victory-podium-hero'+(standing?'':' victory-podium-fallen');
   figure.style.setProperty('--podium-order',String(slot));
   const art=document.createElement('div');art.className='victory-podium-art';
   const fallback=document.createElement('span');fallback.className='victory-podium-fallback';fallback.textContent=hero.name.slice(0,1);art.append(fallback);
   void podiumPortrait(hero,side).then(url=>{if(!url||!art.isConnected)return;const img=document.createElement('img');img.alt=hero.name;img.loading='eager';img.onload=()=>{if(art.isConnected){fallback.remove();art.append(img)}};img.src=url});
   const name=document.createElement('strong');name.className='victory-podium-name';name.textContent=hero.name;
   const status=document.createElement('span');status.className='victory-podium-status';status.textContent=standing?'AYAKTA':'ELENDİ';
   const base=document.createElement('div');base.className='victory-podium-base';base.textContent=String(slot+1).padStart(2,'0');
   figure.append(art,name,status,base);podium.append(figure);
  }
 }else{
  const draw=document.createElement('p');draw.className='victory-podium-draw';draw.textContent='İki takım da sonuna kadar mücadele etti.';podium.append(draw);
 }
 overlay.hidden=false;
 const finish=()=>{if(overlay.hidden)return;overlay.hidden=true;if(victoryRevealTimer!==null){clearTimeout(victoryRevealTimer);victoryRevealTimer=null}showBattleSummary()};
 $('arena-victory-continue').onclick=finish;
 victoryRevealTimer=setTimeout(finish,6500);
}
function showBattleSummary(){
 const panel=$('battle-summary');if(!panel||!finalResult)return;
 finishCommanderControls();
 const winner=finalResult.winner;
 const survivors=states.map(team=>team.filter(unit=>unit.hp>0).length);
 panel.dataset.winner=winner===null?'draw':winner===0?'blue':'red';
 $('battle-summary-title').textContent=winner===null?'BERABERLİK':winner===0?'ZAFER SENİN':'RAKİP KAZANDI';
 $('battle-summary-detail').textContent='Kahramanların ve komutanın savaştaki katkısı.';
 $('battle-summary-rounds').textContent=String(finalResult.rounds??events.at(-1)?.round??0);
 $('battle-summary-survivors').textContent=survivors.join(' - ');
 const summary=finalResult.summary||summarizeBattle(finalResult.teams,finalResult.log||[]);
 $('battle-summary-actions').textContent=String(summary.actionCount);
 const stats=panel.querySelector('.battle-hero-stats')||document.createElement('div');stats.className='battle-hero-stats';stats.replaceChildren();
 for(let side=0;side<2;side++){
  const section=document.createElement('section');section.className='battle-hero-stats-team';
  const heading=document.createElement('h3');heading.textContent=side?'🔴 RAKİP TAKIM':'🔵 SENİN TAKIMIN';section.append(heading);
  const header=document.createElement('div');header.className='battle-stat-head';
  for(const label of ['Kahraman','Hasar','Alınan','Kalkan','Şifa']){const text=document.createElement('span');text.textContent=label;header.append(text)}
  section.append(header);
  const rankedHeroes=summary.teams[side].map((stats,index)=>({...stats,hero:finalResult.teams[side].find(hero=>hero.id===stats.id),index})).sort((a,b)=>b.dealt-a.dealt||a.index-b.index);
  for(const {hero,dealt,taken,blocked,healing} of rankedHeroes){
   const line=document.createElement('div');line.className='battle-hero-stat-row';
   line.append(createSummaryHeroIdentity(document,hero));
   // Server result HP for replays; the uncoerced terminal snapshot for live battles.
   const finalHero=(finalResult.finalHealthTeams||finalResult.teams)?.[side]?.find(unit=>unit.id===hero.id);
   applySummaryHeroStatus(document,line,finalHero);
   for(const [label,value] of [['Hasar',dealt],['Alınan',taken],['Kalkan',blocked],['Şifa',healing]]){
    const number=document.createElement('span');number.textContent=Number(value).toLocaleString('tr-TR');number.setAttribute('aria-label',label+': '+value);line.append(number);
   }
   section.append(line);
  }
  const commander=summary.commanders[side];
  if(commander?.casts){
   const line=document.createElement('p');line.className='battle-commander-stats';
   line.textContent='Komutan · '+commander.casts+' beceri'+(commander.dealt?' · '+commander.dealt+' hasar':'')+(commander.healing?' · '+commander.healing+' şifa':'')+(commander.shield?' · '+commander.shield+' kalkan':'');section.append(line);
  }
  stats.append(section);
 }
 panel.append(stats);
 document.body.classList.remove('arena-fit');document.body.classList.add('arena-results');
 $('arena-score').hidden=true;document.querySelector('.controls').hidden=true;
 $('message').textContent='Savaş tamamlandı';
 panel.hidden=false;
 showVictoryChest(finalResult);
 if(auctionMode)void showAuctionRematch();
 $('battle-arena').hidden=true;
 panel.scrollIntoView({behavior:'smooth',block:'start'});
}
let arenaFinaleTimer=null,arenaFinaleActive=false;
function showFinalKnockout(loser,attacker){
 const old=document.getElementById('arena-final-knockout');if(old)old.remove();
 const overlay=document.createElement('div');overlay.id='arena-final-knockout';overlay.className='arena-final-knockout';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
 const content=document.createElement('div');content.className='arena-final-knockout-content';
 const eyebrow=document.createElement('div');eyebrow.className='arena-final-knockout-eyebrow';eyebrow.textContent='⚡ SON DARBE ⚡';
 const hero=document.createElement('div');hero.className='arena-final-knockout-hero';hero.textContent=loser.name;
 const sub=document.createElement('div');sub.className='arena-final-knockout-sub';sub.textContent='ARENADAN ELENDİ';
 const victor=document.createElement('div');victor.className='arena-final-knockout-victor';victor.textContent=attacker?'SON VURUŞ · '+attacker:'SAVAŞ SONA ERDİ';
 content.append(eyebrow,hero,sub,victor);overlay.append(content);document.body.append(overlay);
 requestAnimationFrame(()=>overlay.classList.add('visible'));
 arenaFinaleActive=true;
 if(arenaFinaleTimer)clearTimeout(arenaFinaleTimer);
 arenaFinaleTimer=setTimeout(()=>{overlay.remove();arenaFinaleActive=false;arenaFinaleTimer=null;showVictoryReveal()},2600);
}
function step(){
 if(cursor>=events.length){stop();if(events.length)showVictoryReveal();return}
 // Shield/heal effects and hits from a server-owned action share one snapshot frame.
 // Older logs put splash hits before the primary hit. Show all hits from one cast
 // in the same animation frame, without changing any damage or the server result.
 const first=events[cursor];
 const batch=[];
 if(first.actionId){
  while(cursor<events.length&&events[cursor].actionId===first.actionId)batch.push(events[cursor++]);
 }else if(first.damageType==='splash'){
  let end=cursor;
  while(end<events.length&&events[end].damageType==='splash'&&events[end].actorId===first.actorId&&events[end].round===first.round)end++;
  const primary=events[end];
  if(primary&&primary.damageType==='special'&&primary.actorId===first.actorId&&primary.round===first.round){
   batch.push(...events.slice(cursor,end+1));cursor=end+1;
  }
 }
 if(!batch.length){batch.push(events[cursor++])}
 const last=batch[batch.length-1];
 const previous=states.map(team=>team.map(unit=>unit.hp));
 states.forEach((t,side)=>t.forEach((u,i)=>{u.hp=last.snapshot[side][i];if(last.statusSnapshot){for(const key of ['arcaneSurgeBonusAttack','arcaneSurgeFromRound','arcaneSurgeUntilRound','commanderFocusUntilDeath','commanderStunNextAttack','commanderHuntNextAttack','lastStandReady','lastStandPersistent','lastStandUntilRound','lastStandImmortalRounds','lastStandTriggeredRound','lastStandImmortalUntilRound'])delete u[key];Object.assign(u,last.statusSnapshot[side][i]);}u.shieldKnown=Number.isFinite(last.shieldSnapshot?.[side]?.[i]);if(u.shieldKnown)u.shield=Math.max(0,last.shieldSnapshot[side][i]);}));
 const defeatedSide=states.findIndex((team,side)=>previous[side].some(hp=>hp>0)&&team.every(u=>u.hp<=0));
 const lastFallen=defeatedSide<0?null:states[defeatedSide].find((u,i)=>previous[defeatedSide][i]>0&&u.hp<=0);
 for(const e of batch){
  appendBattleFeedback(e);
 }
 const primary=batch.find(e=>e.damageType!=='splash')||last;
 showBattleFeedback(primary);
 render(primary);
 // Main target and all secondary splash targets are animated together.
 animateMove(primary);
 for(const e of batch){if(e!==primary)animateMove(e)}
 window.heroArenaTeams=states.map(t=>t.map(u=>({id:u.id,name:u.name,hp:u.hp,maxHp:u.maxHp,power:u.power,rarity:u.rarity,lane:u.lane,position:u.position})));
 window.dispatchEvent(new CustomEvent('heroarena:move',{detail:{event:primary,events:batch,teams:window.heroArenaTeams}}));
 if(cursor>=events.length){stop();$('play').textContent='✓ SAVAŞ TAMAMLANDI';if(lastFallen)$('message').textContent=lastFallen.name+' elendi · Savaş sona erdi';showVictoryReveal()}
}
// Advance the replay by elapsed wall-clock time, not by the number of browser timer ticks.
// Mobile browsers throttle or suspend intervals when the tab is in the background.
let replayDueAt=0;
// Keep the display awake while an arena replay is actively playing (where supported).
let arenaWakeLock=null,arenaWakeRequestPending=false,arenaWakeRetryAt=0;
async function requestArenaWakeLock(){
 if(!arenaActive()||document.hidden||!('wakeLock' in navigator)||arenaWakeLock||arenaWakeRequestPending||Date.now()<arenaWakeRetryAt)return;
 arenaWakeRequestPending=true;
 try{
  const lock=await navigator.wakeLock.request('screen');
  if(!arenaActive()||document.hidden){await lock.release();return}
  arenaWakeLock=lock;
  lock.addEventListener('release',()=>{if(arenaWakeLock===lock){arenaWakeLock=null;arenaWakeRetryAt=Date.now()+1200;if(arenaActive()&&!document.hidden)setTimeout(()=>{void requestArenaWakeLock()},1250)}},{once:true});
 }catch(e){arenaWakeRetryAt=Date.now()+5000;/* iOS Safari may deny wake lock; retry while playing. */}
 finally{arenaWakeRequestPending=false}
}
window.addEventListener('heroarena:battle-finished',()=>{
 for(const team of states)for(const unit of team){delete unit.commanderFocusUntilDeath;delete unit.commanderStunNextAttack;delete unit.commanderHuntNextAttack;for(const key of ['lastStandReady','lastStandPersistent','lastStandUntilRound','lastStandImmortalRounds','lastStandTriggeredRound','lastStandImmortalUntilRound'])delete unit[key];}
 battlePresentationFinished=true;syncArenaWeather();stopArenaMusic(true);releaseArenaWakeLock();
});
window.addEventListener('heroarena:connection-lost',()=>{
 battlePresentationFinished=true;stop();stopArenaMusic(true);releaseArenaWakeLock();
 $('message').textContent='Maç bağlantısı sona erdi. Maçtan ayrılıp yeni bir oyun başlatabilirsin.';
 $('play').textContent='BAĞLANTI SONA ERDİ';$('play').disabled=true;
});
function releaseArenaWakeLock(){
 const lock=arenaWakeLock;arenaWakeLock=null;
 if(lock)void lock.release().catch(()=>{});
}
function stop(){if(timer!==null){clearInterval(timer);timer=null}replayDueAt=0;pauseArenaClock();if(!arenaMode){stopArenaMusic();releaseArenaWakeLock();}syncArenaWeather();}
function advanceReplay(){
 if(timer===null||!replayDueAt)return;
 if(!document.hidden&&!arenaWakeLock)void requestArenaWakeLock();
 const interval=Math.max(50,duration());
 const now=Date.now();
 // Skip animations for overdue moves; preserve the server-calculated event order/result.
 let steps=0;
 while(timer!==null&&cursor<events.length&&Date.now()>=replayDueAt&&steps<4){
  const overdue=now-replayDueAt>=interval;
  if(overdue)document.body.classList.add('arena-catching-up');
  step();
  replayDueAt+=interval;
  steps++;
 }
 document.body.classList.remove('arena-catching-up');
 if(cursor>=events.length&&events.length&&!arenaFinaleActive){stop();$('play').textContent='✓ SAVAŞ TAMAMLANDI';showVictoryReveal()}
}
function startReplay(){
 if(timer!==null)return;
 startArenaClock();
 replayDueAt=Date.now()+Math.max(50,duration());
 timer=setInterval(advanceReplay,Math.min(200,Math.max(50,duration())));
 syncArenaWeather();
 void requestArenaWakeLock();

 $('play').textContent='⏸ DURDUR';
}
$('play').onclick=()=>{if(timer!==null){stop();$('play').textContent='▶ DEVAM ET';return}startReplay()};
$('speed').onchange=()=>{if(timer!==null){clearInterval(timer);timer=null;replayDueAt=0;startReplay()}};
let arenaAudioSuspendedByBackground=false;
function syncArenaAudioVisibility(){
 syncArenaWeather();
 if(document.hidden||document.visibilityState==='hidden'){
  arenaAudioSuspendedByBackground=true;
  stopArenaMusic();
  releaseArenaWakeLock();
  return;
 }
 if(arenaAudioSuspendedByBackground){
  arenaAudioSuspendedByBackground=false;
  if(arenaMusicEnabled&&arenaActive())void startArenaMusic();
 }
 advanceReplay();
 void requestArenaWakeLock();
}
document.addEventListener('visibilitychange',syncArenaAudioVisibility);
window.addEventListener('pagehide',event=>{arenaAudioSuspendedByBackground=true;stopArenaMusic(!event.persisted);if(!event.persisted)arenaMusic.destroy();releaseArenaWakeLock();});
window.addEventListener('focus',syncArenaAudioVisibility);
document.addEventListener('pointerdown',event=>{if(arenaActive()&&!document.hidden){void requestArenaWakeLock();if(arenaMusicEnabled&&arenaTrack.paused&&!event.target.closest('#arena-music-toggle'))void startArenaMusic();}},{passive:true});
// A click is also a WebKit-recognized gesture if touch pointerdown was denied.
document.addEventListener('click',event=>{if(arenaActive()&&!document.hidden&&arenaMusicEnabled&&arenaTrack.paused&&!event.target.closest('#arena-music-toggle'))void startArenaMusic();},{passive:true});
window.addEventListener('pageshow',syncArenaAudioVisibility);
// Entering the arena, rather than pressing Play, triggers the soundtrack.
if(arenaMode){
 try{if(sessionStorage.getItem('hero-auction-arena-music')==='1')sessionStorage.removeItem('hero-auction-arena-music')}catch{}
 // Browsers permitting autoplay begin immediately; iOS users can use the always-visible toggle.
 void startArenaMusic();
 // Keep the screen on for live matches and while waiting for the opponent too.
 void requestArenaWakeLock();

}
$('arena-music-toggle').onclick=()=>{arenaMusicEnabled=!arenaMusicEnabled;try{arenaMusicStorage?.setItem('hero-auction-arena-audio-enabled',arenaMusicEnabled?'1':'0')}catch{}updateMusicButton();if(arenaMusicEnabled&&arenaActive())void startArenaMusic();else stopArenaMusic()};updateMusicButton();
$('next').onclick=()=>{stop();$('play').textContent='▶ SAVAŞI OYNAT';step()};
$('reset').onclick=()=>{stop();$('play').textContent='▶ SAVAŞI OYNAT';$('events').replaceChildren();$('message').textContent='Başlamak için savaşı oynat.';build()};
if(multiplayerCode&&multiplayerToken){const check=async()=>{try{const response=await fetch('/api/battle-room?code='+encodeURIComponent(multiplayerCode)+'&token='+encodeURIComponent(multiplayerToken),{cache:'no-store'});const v=await response.json();if(!response.ok)throw Error(v.error);applyPreviewRoomTheme(v);if(v.started){clearInterval(battlePoll);battlePoll=null;document.body.classList.add('online-battle');if(!arenaMode){enterArenaWithoutReload('/battle-preview.html?room=arena&code='+encodeURIComponent(multiplayerCode)+'&token='+encodeURIComponent(multiplayerToken));return}await build(v.result);if(events.length)$('play').click()}else{$('message').textContent='Rakibin hazırlanması bekleniyor… '+v.ready.filter(Boolean).length+'/2 hazır';if(arenaMode)$('play').disabled=true}}catch(e){$('message').textContent='⚠ '+e.message}};void check();battlePoll=setInterval(check,1800)}else if(arenaMode&&!auctionCode){void build().then(()=>{if(events.length)$('play').click()})}

if(auctionCode&&auctionToken){void (async()=>{try{
 const response=await fetch('/api/battle-auction-team?code='+encodeURIComponent(auctionCode)+'&token='+encodeURIComponent(auctionToken),{cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Açık artırma verisi alınamadı');
 const own=data.teams[data.seat],rival=data.teams[1-data.seat];
 if(!Array.isArray(own)||own.length!==5||!Array.isArray(rival)||rival.length!==5)throw Error('Her oyuncunun beş kahramanı olmalı');
 if(own.some(c=>!c.id||!c.name)||rival.some(c=>!c.id||!c.name)||new Set(own.map(c=>c.id)).size!==5||new Set(rival.map(c=>c.id)).size!==5)throw Error('Açık artırma kahramanları doğrulanamadı');
 demoA=own.map(c=>[c.name,c.role||'fighter',c.power,c.universe,c.rarity]);demoB=rival.map(c=>[c.name,c.role||'fighter',c.power,c.universe,c.rarity]);
 previewCredits=data.credits[data.seat];assignedRoles=demoA.map(c=>c[1]);auctionLaneModifiers=own.map(c=>c.laneModifiers||{});heroArtCache.clear();void loadArenaCommander();
 const preparation=data.preparation;
 if(!preparation?.matchKey||!validateFormation(preparation,own))throw Error('Diziliş doğrulanamadı');
 preparationMatchKey=preparation.matchKey;
 arenaTheme.apply(data.arenaPresentation,auctionCode+':'+preparationMatchKey);
 if(arenaMode)void startArenaMusic();
 let draftStorage;try{draftStorage=sessionStorage}catch{}
 preparationDraft=createPreparationDraft({matchKey:auctionCode+':'+auctionToken+':'+preparationMatchKey,team:own,storage:draftStorage,
  save:async formation=>{
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
   try{const response=await fetch('/api/battle-auction-formation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...formation,matchKey:preparationMatchKey,code:auctionCode,token:auctionToken}),signal:controller.signal});const value=await response.json();if(!response.ok)throw Error(value.error||'Diziliş kaydedilemedi')}finally{clearTimeout(timeout)}
  },onError:()=>{$('prep-note').textContent='Saf değişikliği bu cihazda saklandı. Hazırım ile tekrar gönderilecek.'}});
 const pending=!preparation.ready&&!arenaMode?preparationDraft.pending():null;
 const restored=pending||preparation;positions.splice(0,5,...restored.positions);lanes.splice(0,5,...restored.lanes);
 if(pending)void preparationDraft.save(pending);
 if(preparation.ready){preparationDraft.clear();prepDone=true;window.HeroPlatform?.loaded();if(!arenaMode){auctionLoaded=true;enterArenaWithoutReload('/battle-preview.html?room=arena&auctionCode='+encodeURIComponent(auctionCode)+'&auctionToken='+encodeURIComponent(auctionToken)+'&commanderTest=1');return}}
 $('battle-lobby-status').textContent='Açık artırma kartların yüklendi · Kalan kredi: '+previewCredits+' · Bonus: %'+(creditBonus(previewCredits)*100).toFixed(1);
 if(!arenaMode){auctionLoaded=true;renderBoard();$('apply-roles').disabled=false;startPreparation();$('prep-note').textContent='Kahramanların hazır. İstersen ön/arka safı değiştir, sonra Hazırım.';window.HeroPlatform?.loaded();window.HeroPlatform?.gameplay(true)}else{window.HeroPlatform?.loaded();window.HeroPlatform?.gameplay(false);let auctionBattleStarted=false;const check=async()=>{if(auctionBattleStarted)return;try{const response=await fetch('/api/battle-auction-preview?code='+encodeURIComponent(auctionCode)+'&token='+encodeURIComponent(auctionToken),{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Savaş durumu alınamadı');if(data.started){auctionBattleStarted=true;if(battlePoll!==null){clearInterval(battlePoll);battlePoll=null}await build(data.result);if(data.result?.live){$('play').textContent='⚡ CANLI SAVAŞ SÜRÜYOR';await import('/commander-experimental.js?live='+encodeURIComponent(auctionCode))}else if(events.length)startReplay()}else $('message').textContent='Rakibin dizilişi bekleniyor… '+data.ready.filter(Boolean).length+'/2 hazır'}catch(e){$('message').textContent='⚠ '+e.message}};await check();if(!auctionBattleStarted&&battlePoll===null)battlePoll=setInterval(check,1800)}
 }catch(e){$('prep-note').textContent='⚠ '+e.message;$('message').textContent='⚠ '+e.message;$('battle-lobby-status').textContent='⚠ Açık artırmada seçilen kahramanlar yüklenemedi: '+e.message;$('apply-roles').disabled=true;$('play').disabled=true}})()}

let battleRematchShown=false;
async function showAuctionRematch(){
 if(battleRematchShown||!auctionMode)return;battleRematchShown=true;
 const completedMatchKey=preparationMatchKey;
 try{const response=await fetch('/api/battle-auction-complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:auctionCode,token:auctionToken})});const data=await response.json();if(!response.ok)throw Error(data.error||'Savaş tamamlanamadı');
 if(leavingBattle||preparationMatchKey!==completedMatchKey)return;
 showVictoryChest(data);
 const controls=$('battle-summary');if(!controls)return;
 const button=document.createElement('button');button.type='button';button.textContent='⚔ RÖVANŞ İSTE';button.className='primary arena-rematch-button';
 const title=$('battle-summary-title');if(title)title.after(button);else controls.prepend(button);
 const series=document.createElement('div');series.id='arena-rematch-series';series.setAttribute('role','status');series.style.cssText='display:block;width:100%;box-sizing:border-box;margin:12px 0;padding:16px;border:2px solid #58dfff;border-radius:12px;background:#11233b;color:#fff;text-align:center;font-weight:700';
 const seat=Number(data.seat),scores=Array.isArray(data.series)?data.series:[0,0],players=Array.isArray(data.players)?data.players:[];
 series.removeAttribute('style');
 const caption=document.createElement('small');caption.textContent='RÖVANŞ SERİSİ';
 const scoreline=document.createElement('div');scoreline.className='arena-series-scoreline';
 const own=document.createElement('span');own.textContent=players[seat]?.name||'SEN';
 const score=document.createElement('strong');score.textContent=(Number(scores[seat])||0)+' – '+(Number(scores[1-seat])||0);
 const rival=document.createElement('span');rival.textContent=players[1-seat]?.name||'RAKİP';
 scoreline.append(own,score,rival);series.append(caption,scoreline);

 button.after(series);
 button.onclick=async()=>{button.disabled=true;try{const auth=JSON.parse(localStorage.getItem('hero-auction-login')||'null');const response=await fetch('/api/rematch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:auctionCode,token:auctionToken,authToken:auth?.authToken})});const result=await response.json();if(!response.ok)throw Error(result.error||'Rövanş gönderilemedi');button.textContent='✓ RÖVANŞ İSTEĞİ GÖNDERİLDİ';const watch=setInterval(async()=>{try{const response=await fetch('/api/battle-auction-team?code='+encodeURIComponent(auctionCode)+'&token='+encodeURIComponent(auctionToken),{cache:'no-store'});if(response.status===409){clearInterval(watch);window.HeroPlatform?.beforeNavigate('/crazygames/');location.replace('/')} }catch{}},2500);}catch(e){button.disabled=false;$('message').textContent='⚠ '+e.message}};
 }catch(e){battleRematchShown=false;$('message').textContent='⚠ '+e.message}
}



if(!auctionMode&&!arenaMode){window.HeroPlatform?.loaded();window.HeroPlatform?.gameplay(true)}

window.addEventListener('hero:platform-settings',()=>{if(window.HeroPlatform?.muteAudio)stopArenaMusic();else if(arenaMusicEnabled&&arenaMode)void startArenaMusic()});
