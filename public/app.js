import {flyAwardCard} from '/auction-card-flight.js';
import {collectOfferedAwards,displaySeat} from '/auction-awards.js';
import {collectTailAwards,mountTailReveal} from '/auction-tail-reveal.js';
let tailReveal=null;
const awardFlights=new Set(),seenAwardFlights=new Set();
import {auctionDeckMarkup,revealAuctionCard,cancelAuctionReveal} from '/auction-deck.js';
import {commanderAbilityStats,COMMANDER_START_ENERGY} from '/commander-ability-rules.js?v=commander-attack-fix-20261021';
import {abilityImpact} from '/hero-ability-text.js?v=ability-amounts-20261021';
const $=id=>document.getElementById(id);
let session=null,room=null,stream=null;
const world='mixed';
let lastCardKey=null;
let auctionSfxContext=null;
function playAuctionActionSound(action){
 if(window.HeroPlatform?.muteAudio)return;
 try{
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)return;
  if(!auctionSfxContext)auctionSfxContext=new Ctx();
  const ctx=auctionSfxContext;
  if(ctx.state==='suspended')void ctx.resume().catch(()=>{});
  const now=ctx.currentTime+.012;
  const notes=action==='bid'?[[450,850,.17,'sine'],[720,1450,.21,'triangle']]:[[390,210,.19,'triangle'],[260,110,.27,'sine']];
  for(let i=0;i<notes.length;i++){
   const [start,end,duration,wave]=notes[i],at=now+i*.095;
   const osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type=wave;osc.frequency.setValueAtTime(start,at);
   osc.frequency.exponentialRampToValueAtTime(end,at+duration);
   gain.gain.setValueAtTime(.0001,at);
   gain.gain.exponentialRampToValueAtTime(.075,at+.018);
   gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start(at);osc.stop(at+duration+.02);
  }
 }catch(e){/* Sound must never interrupt auction actions. */}
}

const googleClientId='742640702245-3e3t9m7t29fbqlkubpcqtso63l8v8bv6.apps.googleusercontent.com';
let login=null;try{login=JSON.parse(localStorage.getItem('hero-auction-login')||'null')}catch{}
let platformStoredLogin=window.HeroPlatform?login:null;
if(window.HeroPlatform)login=null;
const signedIn=()=>!!login?.authToken;

const commanderOptions=[
 {id:'attack',icon:'⚔️',name:'Saldırı Komutanı',detail:'Savaşçı / Suikastçı'},
 {id:'defense',icon:'🛡️',name:'Savunma Komutanı',detail:'Tank'},
 {id:'magic',icon:'🔮',name:'Büyücü Komutanı',detail:'Enerji'},
 {id:'support',icon:'💚',name:'Destek Komutanı',detail:'Destek'}
];
const commanderPortraits={"attack":"/images/Ate%C5%9Fler%20%C4%B0%C3%A7inde%20Sava%C5%9F%C3%A7%C4%B1%20Komutan.png","defense":"/images/Alt%C4%B1n%20Aslan%C4%B1n%20Kale%20Muhaf%C4%B1z%C4%B1.png","magic":"/images/Kozmik%20R%C3%BCnlerin%20B%C3%BCy%C3%BCc%C3%BC%20Komutan%C4%B1.png","support":"/images/Z%C3%BCmr%C3%BCt%20I%C5%9F%C4%B1%C4%9F%C4%B1n%20%C5%9Eifac%C4%B1%20Krali%C3%A7esi.png"};
function commanderPortrait(id){return commanderPortraits[id]||'/images/commander-attack.svg';}
let commanderProfile=null,commanderLoaded=false,commanderPending=null,commanderChangePending=null,commanderProfileOpen=false,commanderBusy=false,commanderLoading=false,commanderChangeOpen=false;
function commanderVisibility(){
 renderLobbyIdentity();
 const logged=signedIn(),needSelection=logged&&commanderLoaded&&!commanderProfile&&(!window.HeroPlatform||!room);
 $('commander-onboarding').hidden=!needSelection;
 $('commander-profile').hidden=!logged||!commanderProfileOpen||!commanderProfile;
 $('home').hidden=!logged||!!room||!commanderLoaded||needSelection||commanderProfileOpen;
 $('commander-open-profile').hidden=!commanderProfile;
}
function renderCommanderOnboarding(){
 const root=$('commander-onboarding-options');root.replaceChildren();
 for(const c of commanderOptions){
  const b=document.createElement('button');b.type='button';b.className='commander-option'+(commanderPending===c.id?' chosen':'');
  const img=document.createElement('img');img.src=commanderPortrait(c.id);img.alt='';img.loading='lazy';const label=document.createElement('span');label.textContent=c.name+' · '+c.detail;b.append(img,label);
  b.setAttribute('aria-pressed',String(commanderPending===c.id));
  b.onclick=()=>{commanderPending=c.id;renderCommanderOnboarding()};
  root.append(b);
 }
 $('commander-select-confirm').disabled=!commanderPending||commanderBusy;
}
function renderCommanderRoster(){
 $('commander-change-panel').hidden=!commanderChangeOpen;
 $('commander-change-open').setAttribute('aria-expanded',String(commanderChangeOpen));
 const root=$('commander-roster-options');if(!root||!commanderProfile)return;
 root.replaceChildren();
 for(const c of commanderOptions){
  const active=c.id===commanderProfile.commanderId,selected=c.id===commanderChangePending;
  const button=document.createElement('button');button.type='button';
  button.className='commander-roster-card'+(active?' active':'')+(selected?' chosen':'');
  button.setAttribute('aria-pressed',String(selected||active));
  button.disabled=commanderBusy;
  const img=document.createElement('img');img.src=commanderPortrait(c.id);img.alt='';img.loading='lazy';
  const info=document.createElement('span');const title=document.createElement('strong');title.textContent=c.name;
  const detail=document.createElement('small');detail.textContent=active?'✓ AKTİF KOMUTAN':c.detail;
  info.append(title,detail);button.append(img,info);
  button.onclick=()=>{commanderChangePending=active?null:c.id;renderCommanderRoster()};
  root.append(button);
 }
 const confirm=$('commander-change-confirm');
 confirm.disabled=commanderBusy||!commanderChangePending||walletGold<5000;
 confirm.textContent=commanderChangePending?'🪙 5.000 · '+commanderOptions.find(c=>c.id===commanderChangePending).name.toLocaleUpperCase('tr-TR')+' SEÇ':'🪙 5.000 · KOMUTAN DEĞİŞTİR';
}
async function changeCommander(){
 if(commanderBusy||!commanderChangePending||!commanderProfile||walletGold<5000)return;
 const target=commanderOptions.find(c=>c.id===commanderChangePending);
 if(!target||!window.confirm(target.name+' komutanına geçmek için 5.000 altın harcamak istiyor musun? Gelişim seviyelerin korunacak.'))return;
 commanderBusy=true;renderCommanderRoster();
 try{
  const result=await post('/api/commander/change',{commanderId:target.id});
  commanderProfile=result.profile;commanderChangePending=null;commanderChangeOpen=false;showGold(result.gold);
  $('commander-upgrade-message').textContent='✓ Komutan değiştirildi. 5.000 altın harcandı.';
 }catch(e){$('commander-upgrade-message').textContent='⚠ '+e.message}
 finally{commanderBusy=false;renderCommanderProfile()}
}
$('commander-change-confirm').onclick=()=>void changeCommander();
$('commander-change-open').onclick=()=>{commanderChangeOpen=!commanderChangeOpen;commanderChangePending=null;renderCommanderRoster()};
$('commander-change-close').onclick=()=>{commanderChangeOpen=false;commanderChangePending=null;renderCommanderRoster()};
function renderCommanderProfile(){
 renderLobbyIdentity();
 if(!commanderProfile)return;
 const chosen=commanderOptions.find(c=>c.id===commanderProfile.commanderId);
 const stats=commanderAbilityStats(commanderProfile),activeLevel=stats.level;
 const number=value=>value.toLocaleString('tr-TR',{maximumFractionDigits:2});
 const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 $('commander-profile').dataset.type=chosen.id;
 $('commander-profile-name').textContent='Komutan geliştirme';
 $('commander-profile-gold').textContent=number(walletGold);
 const activeImg=$('commander-active-portrait');activeImg.src=commanderPortrait(chosen.id);activeImg.alt=chosen.name;
 $('commander-active-art').dataset.type=chosen.id;
 $('commander-active-name').textContent=chosen.name;
 $('commander-active-role').textContent=chosen.detail;
 $('commander-level-number').textContent=activeLevel;
 $('commander-active-level').textContent=activeLevel+' / 40';
 $('commander-active-progress').style.width=(activeLevel/40*100)+'%';
 $('commander-main-progress').setAttribute('aria-valuenow',String(activeLevel));
 $('commander-start-energy').textContent=COMMANDER_START_ENERGY;
 $('commander-round-energy').textContent='+'+stats.energyPerRound;
 $('commander-effect-bonus').textContent='+%'+stats.bonusPercent+' BECERİ GÜCÜ';
 $('commander-active-detail').textContent=activeLevel>=40?'Ana uzmanlık tamamlandı.':activeLevel%2===0?'Her 2 ana dal seviyesinde tur enerjisi +1.':'Sonraki ana dal seviyesinde tur enerjisi +1.';
 const skillCopy={
  attack:['Savaş başındaki takım saldırısı oranında toplam hasar; yaşayan düşmanlara bölünür.','Savaş başındaki takım saldırısı oranında toplam hasar; yaşayan düşmanlara bölünür.'],
  defense:['Yaşayan takımın azami canı oranında toplam kalkan paylaşılır.','Yaşayan takımın azami canı oranında toplam kalkan paylaşılır.'],
  magic:['1 hedefin saldırısını azaltır.','En fazla 2 hedefin saldırısını azaltır.'],
  support:['Eksik canı iyileştirir. Can oranı en düşük kahraman önceliklidir.','Eksik canı iyileştirir. Can oranı en düşük kahraman önceliklidir.']
 };
 const skillNames={attack:['Güçlü Darbe','Yıkıcı Hücum'],defense:['Koruyucu Kalkan','Sarsılmaz Savunma'],magic:['Zayıflatma','Kitle Zayıflatma'],support:['Şifa Dokunuşu','Büyük İyileştirme']};
 const skillRoot=$('commander-skill-summary');skillRoot.replaceChildren();
 [stats.normalRate,stats.ultimateRate].forEach((rate,i)=>{
  const card=el('article','cp-skill'+(i?' ultimate':''));
  const top=el('div','cp-skill-top');top.append(el('span','',i?'NİHAİ BECERİ':'NORMAL BECERİ'),el('b','',i?'100 ENERJİ':'40 ENERJİ'));
  const main=el('div','cp-skill-main');main.append(el('strong','','%'+number(rate*100)),el('span','',skillNames[chosen.id][i]));
  card.append(top,main,el('p','',skillCopy[chosen.id][i]));skillRoot.append(card);
 });
 renderCommanderRoster();
 const root=$('commander-upgrades');root.replaceChildren();
 const abilityNames={attack:'Savaş Ustalığı',defense:'Çelik İrade',magic:'Arkane Güç',support:'Yaşam Enerjisi'};
 const abilityDescriptions={attack:'Savaşçı / Suikastçı',defense:'Tank',magic:'Enerji',support:'Destek'};
 const ordered=[chosen,...commanderOptions.filter(c=>c.id!==chosen.id)];
 for(const c of ordered){
  const primary=c.id===chosen.id,level=Number(commanderProfile.levels[c.id]||0),max=primary?40:20,cost=200*(level+1),isMax=level>=max,canAfford=walletGold>=cost;
  const card=el('article','cp-upgrade'+(primary?' specialty':'')+(isMax?' maxed':''));card.dataset.type=c.id;
  const head=el('div','cp-upgrade-head'),img=el('img','cp-branch-art');img.src=commanderPortrait(c.id);img.alt='';img.loading='lazy';
  const title=el('div','cp-branch-title');title.append(el('span','cp-branch-tag',primary?'★ ANA UZMANLIK':'YAN UZMANLIK'),el('h4','',abilityNames[c.id]),el('small','',abilityDescriptions[c.id]));head.append(img,title);
  const values=el('div','cp-bonus');const current=el('span','');current.append(el('small','','SINIF BONUSU'),el('b','','+%'+number(level*.5)));
  const next=el('span','cp-next');next.append(el('small','',isMax?'TAMAMLANDI':'SONRAKİ SEVİYE'),el('b','',isMax?'✓':'+%'+number((level+1)*.5)));values.append(current,el('span','cp-arrow','→'),next);
  const progress=el('div','cp-branch-progress');progress.append(el('span','','SEVİYE '+level+' / '+max),el('span','',number(100*level/max)+'%'));
  const bar=el('div','cp-progress');bar.setAttribute('role','progressbar');bar.setAttribute('aria-label',abilityNames[c.id]+' gelişimi');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(max));bar.setAttribute('aria-valuenow',String(level));
  const fill=el('span','');fill.style.width=(100*level/max)+'%';bar.append(fill);
  const benefit=el('p','cp-upgrade-benefit');
  if(primary&&!isMax){
   const preview=commanderAbilityStats({...commanderProfile,levels:{...commanderProfile.levels,[c.id]:level+1}});
   benefit.textContent='Beceri gücü +%'+stats.bonusPercent+' → +%'+preview.bonusPercent+' · Enerji / tur '+stats.energyPerRound+' → '+preview.energyPerRound;
  }else benefit.textContent=isMax?'Bu dalın en yüksek seviyesine ulaştın.':'Yalnızca ilgili kahraman sınıfını güçlendirir.';
  const button=el('button','cp-upgrade-button');button.type='button';
  button.append(el('span','',isMax?'✓ TAMAMLANDI':!canAfford?'ALTIN YETERSİZ':'GELİŞTİR'),el('b','',isMax?'':number(cost)+' ALTIN'));
  button.setAttribute('aria-label',abilityNames[c.id]+' · '+(isMax?'Tamamlandı':number(cost)+' altın · '+(!canAfford?'Altın yetersiz':'Geliştir')));
  button.disabled=commanderBusy||isMax||!canAfford;button.onclick=()=>void upgradeCommander(c.id);
  card.append(head,values,progress,bar,benefit,button);root.append(card);
 }
}
async function loadCommander(){
 if(!signedIn()||commanderLoading)return;
 commanderLoading=true;const authToken=login.authToken;
 commanderLoaded=false;commanderProfile=null;commanderProfileOpen=false;commanderChangeOpen=false;commanderVisibility();
 try{
  const result=await post('/api/commander/get',{});
  if(!signedIn()||login.authToken!==authToken)return;
  commanderProfile=result.profile;commanderLoaded=true;showGold(result.gold);
  renderCommanderOnboarding();renderCommanderProfile();commanderVisibility();
 }catch(e){notify('Komutan profili yüklenemedi: '+e.message)}
 finally{commanderLoading=false}
}
async function selectCommander(){
 if(!commanderPending||commanderBusy)return;
 commanderBusy=true;renderCommanderOnboarding();
 try{
  const result=await post('/api/commander/select',{commanderId:commanderPending});
  commanderProfile=result.profile;commanderLoaded=true;showGold(result.gold);
  renderCommanderProfile();commanderVisibility();notify('Komutanın hesabına kaydedildi.');
 }catch(e){$('commander-onboarding-message').textContent=e.message}
 finally{commanderBusy=false;renderCommanderOnboarding()}
}
async function upgradeCommander(stat){
 if(commanderBusy||!commanderProfile)return;
 commanderBusy=true;renderCommanderProfile();
 try{
  const result=await post('/api/commander/upgrade',{stat});
  commanderProfile=result.profile;showGold(result.gold);
  $('commander-upgrade-message').textContent='✓ '+result.cost.toLocaleString('tr-TR')+' altın harcandı.';
 }catch(e){$('commander-upgrade-message').textContent='⚠ '+e.message}
 finally{commanderBusy=false;renderCommanderProfile()}
}
$('commander-select-confirm').onclick=()=>void selectCommander();
$('commander-open-profile').onclick=()=>{commanderProfileOpen=true;commanderVisibility();renderCommanderProfile()};
$('commander-profile-close').onclick=()=>{commanderProfileOpen=false;commanderVisibility()};
let walletGold=0;
function showGold(value){walletGold=Math.max(0,Number(value)||0);if(commanderProfileOpen)renderCommanderProfile();const el=$('gold-balance');if(el)el.textContent=walletGold.toLocaleString('tr-TR');}
async function refreshGold(){if(!signedIn())return;try{const data=await post('/api/wallet',{});showGold(data.gold)}catch(e){console.warn('Gold balance unavailable:',e.message)}}
function clearExpiredLogin(){login=null;session=null;room=null;stream?.close();localStorage.removeItem('hero-auction-login');localStorage.removeItem('hero-auction-session');showGold(0);commanderProfile=null;commanderLoaded=false;commanderProfileOpen=false;applyLogin();notify('Oturumun sona ermiş. Lütfen yeniden giriş yap.');}
async function validateLogin(){if(!signedIn())return false;try{const result=await post('/api/auth/check',{});showGold(result.gold);if(!commanderLoaded)void loadCommander();return true}catch(e){if(/giriş yap|Oturumun sona erdi|401/.test(e.message)){clearExpiredLogin();return false}notify('Sunucuya bağlanılamadı. Tekrar dene.');return false}}
function renderLobbyIdentity(){
 const active=signedIn(),bar=$('account-bar');if(!bar)return;
 bar.hidden=!active;
 if(!active){$('account-name').textContent='';$('account-meta').textContent='';return;}
 const name=login.user?.name||'Oyuncu',provider=login.type==='crazygames'?'CrazyGames':login.type==='google'?'Google':'Misafir';
 const chosen=commanderOptions.find(c=>c.id===commanderProfile?.commanderId);
 $('account-name').textContent=name;
 $('account-meta').textContent=provider+(chosen?' · '+chosen.name+' · Sv. '+commanderAbilityStats(commanderProfile).level:'');
 $('account-status').setAttribute('aria-label',name+' · '+provider+' · Hesap menüsünü aç');
 const portrait=chosen?commanderPortrait(chosen.id):'/images/lobby-crest.svg';
 if($('account-avatar').getAttribute('src')!==portrait)$('account-avatar').src=portrait;
 if(chosen&&$('nav-commander-portrait').getAttribute('src')!==portrait)$('nav-commander-portrait').src=portrait;
}
function applyLogin(){if(!room){cancelAwardFlights();tailReveal?.cancel();tailReveal=null;cancelAuctionReveal($('stage'));}const active=signedIn();if(!room)window.HeroPlatform?.gameplay(false);if(!room)window.HeroPlatform?.setRoom(null);const wallet=$('gold-wallet');if(wallet)wallet.hidden=!active;$('login-gate').hidden=active;$('home').hidden=!active||!!room;$('game').hidden=!active||!room;$('account-status').hidden=!active;$('google-logout').hidden=true;$('account-status').setAttribute('aria-expanded','false');if(active){$('name').value=login.user?.name||'Oyuncu';$('name').readOnly=login.type==='google'||login.type==='crazygames';}renderLobbyIdentity();commanderVisibility();}
async function enterGuest(){try{const name=$('guest-name').value.trim()||'Oyuncu';const result=await post('/api/auth/guest',{name});login={type:'guest',user:result.user,authToken:result.authToken};localStorage.setItem('hero-auction-login',JSON.stringify(login));showGold(result.gold);applyLogin();void loadCommander();restoreGame()}catch(e){notify(e.message)}}
$('guest-login').onclick=()=>window.HeroPlatform?startPlatform():enterGuest();
$('account-status').onclick=()=>{if(window.HeroPlatform||!signedIn())return;const button=$('google-logout');button.hidden=!button.hidden;$('account-status').setAttribute('aria-expanded',String(!button.hidden));};
$('google-logout').onclick=()=>{login=null;localStorage.removeItem('hero-auction-login');localStorage.removeItem('hero-auction-session');session=null;room=null;stream?.close();stream=null;showGold(0);commanderProfile=null;commanderLoaded=false;commanderProfileOpen=false;window.google?.accounts?.id?.disableAutoSelect();applyLogin();window.scrollTo({top:0,behavior:'instant'})};
window.heroGoogleCallback=async response=>{try{const result=await post('/api/auth/google',{credential:response.credential});login={type:'google',user:result.user,authToken:result.authToken};localStorage.setItem('hero-auction-login',JSON.stringify(login));showGold(result.gold);applyLogin();void loadCommander();restoreGame();notify('Google hesabınla giriş yaptın.')}catch(e){notify(e.message)}};
function initGoogle(attempt=0){
 if(window.HeroPlatform)return;
 const target=$('google-login');if(!target)return;
 if(!window.google?.accounts?.id){
  if(attempt<40){setTimeout(()=>initGoogle(attempt+1),500);return}
  target.textContent='Google giriş hizmeti yüklenemedi. Sayfayı yenileyip tekrar deneyin.';
  return;
 }
 try{
  window.google.accounts.id.initialize({client_id:googleClientId,callback:window.heroGoogleCallback});
  target.replaceChildren();
  window.google.accounts.id.renderButton(target,{theme:'filled_black',size:'large',shape:'rectangular',text:'continue_with',logo_alignment:'left',width:Math.min(320,Math.max(220,window.innerWidth-80))});
 }catch(e){target.textContent='Google giriş düğmesi başlatılamadı. Lütfen tekrar deneyin.';console.error('Google sign-in initialization:',e)}
}
function gameIdentity(){return signedIn()?{authToken:login.authToken}:{}}
async function restoreGame(){if(!signedIn()||!await validateLogin())return;try{session=JSON.parse(localStorage.getItem('hero-auction-session'));if(session){const j=await post('/api/state',{...session,...gameIdentity()});show(j.room);connect()}}catch(e){if(e.message.includes('giriş yap')||e.message.includes('Oturumun sona erdi')){login=null;localStorage.removeItem('hero-auction-login');localStorage.removeItem('hero-auction-session');session=null;room=null;applyLogin();notify('Oturum süren doldu. Yeniden giriş yap.')}else if(e.message==='Oda bulunamadı.'||e.message==='Oyuncu yetkisi geçersiz.'){localStorage.removeItem('hero-auction-session');session=null;room=null;applyLogin();notify('Önceki oda artık mevcut değil. Yeni bir maç oluşturabilirsin.')}else{notify('Bağlantı kurulamadı. Biraz sonra tekrar dene.')}}}
const homePlayTab=$('home-play-tab'),homePlayPanel=$('home-play-panel');
const homeGuidePlay=$('home-guide-play');if(homeGuidePlay)homeGuidePlay.onclick=()=>{if(homePlayPanel.hidden)homePlayTab.click();else homePlayPanel.scrollIntoView({behavior:'smooth',block:'start'});};
if(homePlayTab&&homePlayPanel){homePlayTab.onclick=()=>{homePlayPanel.hidden=false;homePlayTab.setAttribute('aria-expanded','true');homePlayTab.classList.add('selected');homePlayPanel.scrollIntoView({behavior:'smooth',block:'start'});};const lobbyBack=$('play-lobby-back');if(lobbyBack)lobbyBack.onclick=()=>{homePlayPanel.hidden=true;homePlayTab.setAttribute('aria-expanded','false');homePlayTab.classList.remove('selected');homePlayTab.scrollIntoView({behavior:'smooth',block:'start'});};}
applyLogin();initGoogle();
// Isolated test service only: create a fresh guest seat automatically.
// Production deployments do not set this flag.
if(window.location.hostname==='hero-auction-commander-test.onrender.com'&&!signedIn()){
 void enterGuest();
}


const visitorId=crypto.randomUUID();
async function refreshOnline(){
 try{
  const q=new URLSearchParams({visitor:visitorId});
  if(session){q.set('code',session.code);q.set('token',session.token);}
  const res=await fetch('/api/online?'+q,{cache:'no-store'});
  if(!res.ok)return;
  const data=await res.json();
  for(const [id,value] of [['online-players',data.players],['online-matches',data.matches],['online-waiting',data.waiting]]){
   const el=$(id);if(el)el.textContent=String(value);
  }
 }catch{}
}
setInterval(refreshOnline,15000);
setInterval(refreshGold,20000);

const artMemo=new Map();
const infoMemo=new Map();
const emojis={pokemon:'⚡',marvel:'🦸',dc:'🦇',lotr:'💍',original:'⚔️'};
const rarityNames={common:'SIRADAN',advanced:'GELİŞMİŞ',rare:'NADİR',legendary:'EFSANEVİ'};
const rarityLabel=r=>rarityNames[r]||'SIRADAN';
const specialtyGroups={
 '🛡️ TANK':'Hulk|Juggernaut|Colossus|The Thing|Luke Cage|Doomsday|Bane|Solomon Grundy|Killer Croc|Metallo',
 '⚔️ DÖVÜŞ USTASI':'Captain America|Wolverine|Black Panther|Shang-Chi|Wonder Woman|Deathstroke',
 '💪 GÜÇ SAVAŞÇISI':'Sentry|Namor|Superman|Aquaman|Shazam|Black Adam|Darkseid',
 '⚡ YILDIRIM SAVAŞÇISI':'Thor',
 '🗡️ KARANLIK SAVAŞÇI':'Hela',
 '🔮 BÜYÜCÜ':'Scarlet Witch|Doctor Strange|Doctor Fate|Zatanna|Raven',
 '🌌 KOZMİK GÜÇ':'Captain Marvel|Silver Surfer',
 '🧲 ENERJİ KONTROLÜ':'Magneto|Storm|Green Lantern',
 '🥷 SUİKASTÇI':'Black Widow|Elektra|Batman|Nightwing',
 '💨 HIZ USTASI':'Quicksilver|The Flash',
 '🕸️ ÇEVİK DÖVÜŞÇÜ':'Spider-Man|Deadpool',
 '🤖 TEKNOLOJİ USTASI':'Iron Man|Cyborg',
 '🧠 ZİHİN USTASI':'Professor X|Martian Manhunter',
 '✨ DESTEK / HİLE':'Loki|Vision|Starfire'
};
const specialtyByName=new Map(Object.entries(specialtyGroups).flatMap(([label,names])=>names.split('|').map(name=>[name.toLowerCase(),label])));
const originalRoleLabels={tank:'🛡️ TANK',fighter:'⚔️ SAVAŞÇI',assassin:'🥷 SUİKASTÇI',energy:'🔮 BÜYÜCÜ',support:'💚 ŞİFACI / DESTEK'};
const originalRolesByName=new Map();
fetch('/api/heroes',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{for(const hero of data?.heroes||[])originalRolesByName.set(String(hero.name||'').toLocaleLowerCase('tr-TR'),hero.role)}).catch(()=>{});
const specialtyLabel=hero=>{
 const name=String(hero?.name||'').toLocaleLowerCase('tr-TR');
 const role=hero?.role||hero?.displayRole||originalRolesByName.get(name);
 if(originalRoleLabels[role])return originalRoleLabels[role];
 return specialtyByName.get(String(hero?.name||'').toLowerCase())||'⚔️ SAVAŞÇI';
};
const specialtyLaneBonuses={
 '🛡️ TANK':[8,-6],'⚔️ DÖVÜŞ USTASI':[6,-4],'💪 GÜÇ SAVAŞÇISI':[7,-5],
 '⚡ YILDIRIM SAVAŞÇISI':[4,4],'🗡️ KARANLIK SAVAŞÇI':[5,3],
 '🔮 BÜYÜCÜ':[-6,8],'🌌 KOZMİK GÜÇ':[3,6],'🧲 ENERJİ KONTROLÜ':[-5,7],
 '🥷 SUİKASTÇI':[7,-5],'💨 HIZ USTASI':[5,3],'🕸️ ÇEVİK DÖVÜŞÇÜ':[6,1],
 '🤖 TEKNOLOJİ USTASI':[-3,7],'🧠 ZİHİN USTASI':[-7,9],'✨ DESTEK / HİLE':[-6,8]
};
const laneLabel=hero=>{const [front,back]=specialtyLaneBonuses[specialtyLabel(hero)]||[0,0];const fmt=n=>(n>0?'+':'')+n+'%';return 'Ön '+fmt(front)+' · Arka '+fmt(back)};


const worldNames={original:'HERO AUCTION',pokemon:'POKÉMON',marvel:'MARVEL',dc:'DC',lotr:'YÜZÜKLERİN EFENDİSİ',mixed:'KARMA EVREN'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notify=msg=>{const t=$('toast');t.textContent=msg;t.style.display='block';setTimeout(()=>t.style.display='none',3300)};
async function post(url,data){const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...gameIdentity(),...data})});const j=await res.json();if(!res.ok)throw Error(j.error||'İşlem başarısız');return j}
function save(token,r){session={token,code:r.code};localStorage.setItem('hero-auction-session',JSON.stringify(session));show(r);connect();refreshOnline()}
function connect(){stream?.close();if(!session)return;stream=new EventSource(`/api/events?code=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}&authToken=${encodeURIComponent(login?.authToken||'')}`);stream.onmessage=e=>{try{show(JSON.parse(e.data))}catch{}};stream.onerror=()=>{if(session&&!stream?.__rechecking){stream.__rechecking=true;setTimeout(async()=>{if(!session)return;try{await post('/api/state',session)}catch(e){if(e.message==='Oda bulunamadı.'||e.message==='Oyuncu yetkisi geçersiz.'){stream?.close();localStorage.removeItem('hero-auction-session');session=null;room=null;applyLogin();notify('Oyun odası artık mevcut değil. Yeni bir oyun oluşturabilirsin.')}}if(stream)stream.__rechecking=false},3000)}};}
function cancelAwardFlights(){for(const flight of awardFlights)flight.cancel();awardFlights.clear();seenAwardFlights.clear();}
function awardDestination(seat,me){return document.querySelector('#player'+displaySeat(seat,me)+' .teams')||$('player'+displaySeat(seat,me));}
function animateWonAuctionCard(award,me,sourceSnapshot){
 const key=award.code+':'+award.round+':'+award.seat+':'+award.card.universe+':'+award.card.name;
 if(seenAwardFlights.has(key)||!sourceSnapshot)return Promise.resolve();
 seenAwardFlights.add(key);
 const flight=flyAwardCard(sourceSnapshot,awardDestination(award.seat,me),{duration:1400,reducedMotion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,label:award.seat===me?(document.documentElement.lang==='en'?'Your team':'Senin takımın'):(document.documentElement.lang==='en'?'Opponent team':'Rakip takım')});
 awardFlights.add(flight);return flight.finished.finally(()=>awardFlights.delete(flight));
}
function show(r){if(!signedIn())return;if(tailReveal?.active&&r.phase==='finished'&&room?.code===r.code&&tailReveal.signature===JSON.stringify(r.final)){room=r;renderChat(r);return;}tailReveal?.cancel();tailReveal=null;const tailAwards=collectTailAwards(room,r);
 if(room?.code!==r.code||(r.phase==='auction'&&room?.phase!=='auction')||(r.phase==='auction'&&r.round<room?.round))cancelAwardFlights();
 const offeredAwards=collectOfferedAwards(room,r),offeredArt=document.querySelector('#stage .card-art');
 const offeredSnapshot=offeredArt?{element:offeredArt.cloneNode(true),rect:offeredArt.getBoundingClientRect()}:null;
 cancelAuctionReveal($('stage'));$('game').classList.remove('auction-results-only');
 // Keep the auction presentation until every already-awarded card has opened.
 // Authoritative state still advances immediately; no bidding or server timers are paused.
 if(r.phase==='finished'&&(tailAwards.length||offeredAwards.length||awardFlights.size)&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
  room=r;window.HeroPlatform?.setRoom(r);window.HeroPlatform?.gameplay(false);refreshGold();
  offeredAwards.forEach(award=>animateWonAuctionCard(award,r.me,offeredSnapshot));
  const startAfter=Promise.all([...awardFlights].map(flight=>flight.finished));
  const stage=$('stage');stage.replaceChildren();$('game').dataset.phase='auction';
  $('phase').textContent=document.documentElement.lang==='en'?'REMAINING HEROES':'KALAN KAHRAMANLAR';renderChat(r);
  tailReveal=mountTailReveal(stage,null,tailAwards,{english:document.documentElement.lang==='en',me:r.me,startAfter,resolveDestination:seat=>awardDestination(seat,r.me),onComplete:()=>{
   cancelAwardFlights();tailReveal=null;show(room);
  },loadArt:async card=>{
   const response=await fetch('/api/art?universe='+encodeURIComponent(card.universe)+'&name='+encodeURIComponent(card.name));
   return response.ok?(await response.json()).url:null;
  }});tailReveal.signature=JSON.stringify(r.final);return;
 }
 window.HeroPlatform?.gameplay(r.phase==='auction');const currentCardKey=r.phase==='auction'?r.code+':'+r.round+':'+r.card?.name:null;const isNewCard=!!currentCardKey&&currentCardKey!==lastCardKey;lastCardKey=currentCardKey;const wasFinished=room?.phase==='finished'&&room?.code===r.code;const enteredAuction=r.phase==='auction'&&(room?.phase!=='auction'||room?.code!==r.code||room?.round>r.round);room=r;$('game').dataset.phase=r.phase;window.HeroPlatform?.setRoom(r);if(window.HeroPlatform)commanderVisibility();if(enteredAuction)refreshGold();if(r.phase==='finished'&&!wasFinished){refreshGold();}
 for(let i=0;i<2;i++){const seat=r.me===1?1-i:i;const p=r.players[seat];$('player'+i).className='player player-side'+(r.me===seat?' me':'')+(r.phase==='auction'&&r.turn===seat?' active-turn':'');$('player'+i).innerHTML=p?`<div class="name">${esc(p.name)} ${r.me===seat?'(SEN)':''}</div><div class="credit">${p.credits} <small>kalan kredi</small></div><div class="spent-credit">💸 ${20-p.credits} kredi kullanıldı</div><div class="side-team-title">🎴 KARTLAR (${p.team.length})</div><div class="teams">${p.team.map(x=>`<span class="side-hero"><span class="side-hero-name">${esc(x.name)} <small class="rarity rarity-${esc(x.rarity||'common')}">${rarityLabel(x.rarity)}</small></span><small class="side-hero-role">${esc(specialtyLabel(x))}</small><span class="side-hero-cost">${Number(x.cost)||0} <small>kredi</small></span></span>`).join('')||'Henüz karakter yok'}</div>`:'<div class="name">2. OYUNCU</div><p class="status">Katılması bekleniyor…</p>'}
 for(const award of offeredAwards)animateWonAuctionCard(award,r.me,offeredSnapshot);
 if(r.phase==='finished'&&r.final?.length===2&&r.final.every(p=>p.team?.length===5)&&session?.token){
  $('game').classList.add('auction-results-only');
  renderChat(r);$('login-gate').hidden=true;$('home').hidden=true;$('game').hidden=false;
  $('room-title').textContent=r.code;$('phase').textContent='KAHRAMAN GÜÇLERİ · ARENA ONAYI';
  const stage=$('stage'),my=r.final[r.me],opponent=r.final[1-r.me];
  const teamBlock=(p,title,seat)=>{const base=p.team.reduce((sum,hero)=>sum+hero.power,0),rate=p.credits,adjusted=base*(1+rate/100);return `<section class="final-team"><h3>${title} · ${esc(p.name)}</h3>${p.team.map(hero=>{const updated=(hero.power*(1+rate/100)).toFixed(2);return `<div class="final-hero "><span><span class="mini-hero-icon">${emojis[hero.universe]||'✦'}</span>${esc(hero.name)} <small class="rarity rarity-${esc(hero.rarity||'common')}">${rarityLabel(hero.rarity)}</small></span><b>${hero.power} → ${updated}</b></div>`}).join('')}<div class="final-hero"><span>Kahramanların temel gücü</span><b>${base}</b></div><div class="final-hero"><span>Kalan kredi: ${p.credits} · Güç değişimi</span><b>${rate>=0?'+':''}${rate}%</b></div><div class="final-hero total"><span>BONUS DAHİL TAKIM GÜCÜ</span><b>${adjusted.toFixed(2)}</b></div></section>`};
  stage.innerHTML=`<section class="victory-screen"><div class="victory-kicker">✦ AÇIK ARTIRMA TAMAMLANDI ✦</div><div class="victory-heading">TAKIM GÜÇLERİ AÇIKLANDI</div><p class="victory-subtitle">Her kalan kredi kahraman güçlerini %1 artırır; negatif kredi aynı oranda azaltır. Hazır olduğunda arenaya geç.</p><div class="final-teams victory-teams">${teamBlock(my,'SENİN TAKIMIN',r.me)}${teamBlock(opponent,'RAKİP TAKIM',1-r.me)}</div><p class="status">Bu ekran savaş sonucu değildir. Arena yalnızca onayından sonra açılır.</p><button type="button" id="confirm-arena-entry" class="primary">⚔ ONAYLA VE ARENAYA GEÇ</button></section>`;
  const entryButton=stage.querySelector('#confirm-arena-entry');
  entryButton.onclick=()=>{if(tailReveal?.active)return;const params=new URLSearchParams({auctionCode:r.code,auctionToken:session.token});location.assign('/battle-preview.html?'+params.toString())};
  return;
 }renderChat(r);$('login-gate').hidden=true;$('home').hidden=true;$('game').hidden=false;$('room-title').textContent=r.code;$('phase').textContent=['waiting','matching'].includes(r.phase)?'RAKİP BEKLENİYOR':r.phase==='finished'?'MAÇ TAMAMLANDI':`${worldNames[r.universe]} · KART ${r.round+1}/10`;

$('log').innerHTML=[...r.history].reverse().map(x=>`<div class="event">${esc(x)}</div>`).join('')||'<div class="event">Oyun henüz başlamadı.</div>';
const stage=$('stage');
if(['waiting','matching'].includes(r.phase)){stage.innerHTML='<div class="card-art">⌛</div><h2>ARKADAŞINI DAVET ET</h2><p class="status">Arkadaşına davet bağlantısını gönder. Bağlantıyı açtığında oda kodu hazır olacak.</p><div class="big-bid">'+esc(r.code)+'</div><div class="controls"><button class="primary" id="invite-room">📲 WHATSAPP İLE DAVET ET</button></div>';$('invite-room').onclick=()=>shareInvite(r.code);return}
if(r.phase==='finished'){const [a,b]=r.final;const tied=a.score===b.score;const winnerIndex=tied?-1:(a.score>b.score?0:1);const winner=winnerIndex<0?'BERABERE':r.final[winnerIndex].name;const iWon=winnerIndex===r.me;const emblem='<div class="victory-emblem" aria-hidden="true"><span class="victory-rays"></span><svg viewBox="0 0 180 180" role="presentation" focusable="false"><defs><linearGradient id="victoryGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4af4f1"/><stop offset=".5" stop-color="#bca0ff"/><stop offset="1" stop-color="#ff6ec3"/></linearGradient></defs><path d="M90 10 154 47 154 122 90 160 26 122 26 47Z" fill="#101a36" stroke="url(#victoryGradient)" stroke-width="4"/><path d="M90 26 140 55 140 113 90 143 40 113 40 55Z" fill="none" stroke="#5ceef0" stroke-opacity=".32" stroke-width="2"/><path d="M90 40 104 75 139 77 111 99 121 134 90 114 59 134 69 99 41 77 76 75Z" fill="url(#victoryGradient)" stroke="#d7faff" stroke-width="2"/><path d="M90 2v17M90 161v17M2 90h19M159 90h19" stroke="#64edf6" stroke-width="3" stroke-linecap="round"/></svg></div>';stage.innerHTML=`<section class="victory-screen"><div class="victory-kicker">✦ ARENA SONUCU ✦</div>${emblem}<div class="victory-heading">${tied?'MÜCADELE BERABERE BİTTİ':iWon?'ZAFER SENİN!':'MAÇ TAMAMLANDI'}</div><p class="victory-subtitle">${tied?'İki takım aynı güce ulaştı.':esc(winner)+' bu mücadeleyi kazandı.'}</p><div class="results victory-results"><div class="${winnerIndex===0?'victory-leader':''}"><span class="victory-player-label">${winnerIndex===0?'✦ KAZANAN':'OYUNCU 1'}</span><span class="victory-player-name">${esc(a.name)}</span><strong>${a.score}</strong><small>TOPLAM PUAN</small></div><div class="${winnerIndex===1?'victory-leader':''}"><span class="victory-player-label">${winnerIndex===1?'✦ KAZANAN':'OYUNCU 2'}</span><span class="victory-player-name">${esc(b.name)}</span><strong>${b.score}</strong><small>TOPLAM PUAN</small></div></div><div class="victory-reward ${iWon?'reward-earned':''}"><span class="reward-coin">🪙</span><div><strong>${r.mode==='bot'?'ANTRENMAN · 0 ALTIN':tied?'BERABERLİK':iWon?'+120 ALTIN KAZANDIN':'+120 ALTIN ÖDÜLÜ'}</strong><small>${r.mode==='bot'?'Bilgisayara karşı altın kazanılmaz veya kaybedilmez.':tied?'Bu maçta altın ödülü verilmedi.':iWon?'120 altınlık zafer ödülünü kazandın.':'Kazanan oyuncuya 120 altın verilir.'}</small></div></div>${r.mode==='bot'?'<div class="victory-rank">🤖 Antrenman maçı · Lig puanı değişmez</div>':`<div class="victory-rank">🏅 LİG PUANI ${r.rankChange?.map((d,i)=>`<span>${esc(r.players[i]?.name||"Oyuncu")} <b class="${d>=0?"rank-plus":"rank-minus"}">${d>=0?"+":""}${d}</b> (${(r.rankBefore?.[i]??1000)+d})</span>`).join(" · ")||"Hesaplanıyor"}</div>`}<p class="victory-scoreline">PUAN FARKI <b>${Math.abs(a.score-b.score)}</b> <span>•</span> SERİ <b>${r.series[0]} - ${r.series[1]}</b></p><div class="final-teams victory-teams">${[a,b].map(p=>`<section class="final-team"><h3>${esc(p.name)}</h3>${p.team.map(c=>`<div class="final-hero"><span><span class="mini-hero-icon">${emojis[c.universe]||'✦'}</span>${esc(c.name)} <small class="rarity rarity-${esc(c.rarity||'common')}">${rarityLabel(c.rarity)}</small></span><b>${c.power}/100</b></div>`).join('')}<div class="final-hero"><span>Kalan kredi bonusu (${p.credits} × 10)</span><b>+${p.credits*10}</b></div><div class="final-hero total"><span>GENEL TOPLAM</span><b>${p.score}</b></div></section>`).join('')}</div><p class="status victory-rematch-note">${r.mode==='bot'?'Bilgisayara karşı hemen yeniden oynayabilirsin.':r.rematch[r.me]?'Rövanş isteğin gönderildi. Rakibin onayı bekleniyor.':r.rematch[1-r.me]?'Rakibin rövanş istiyor. Onaylarsan yeni maç başlayacak.':'Yeni maç için iki oyuncunun da onayı gerekiyor.'}</p><div class="controls victory-controls"><button class="primary" id="rematch">${r.rematch[r.me]?'ONAYIN GÖNDERİLDİ':r.rematch[1-r.me]?'RÖVANŞI KABUL ET':'⚔ AYNI RAKİPLE TEKRAR OYNA'}</button></div><div id="rematch-series" class="victory-scoreline" role="status" aria-label="Rövanş serisi" style="display:block!important;visibility:visible!important;margin:18px auto;padding:18px;border:2px solid #58dfff;border-radius:14px;background:#11233b;color:#fff;text-align:center;font-size:1.12rem;font-weight:700">🏆 RÖVANŞ SERİSİ <div style="margin-top:10px">${esc(r.players[r.me]?.name||"Sen")} &nbsp; <strong style="font-size:1.7rem">${Number(r.series?.[r.me]||0)} – ${Number(r.series?.[1-r.me]||0)}</strong> &nbsp; ${esc(r.players[1-r.me]?.name||"Rakip")}</div></div></section>`; $('rematch').disabled=!!r.rematch[r.me];$('rematch').onclick=()=>act('/api/rematch',{});return}
const card=r.card;const canBid=r.turn===r.me;const min=r.topBid+1;const max=r.players[r.me].credits;const art=`<div class="hero-art-placeholder">${emojis[card.universe]}<small>Görsel yükleniyor…</small></div>`;
const timer=`<p class="status" id="turntimer">⏱ ${Math.max(0,Math.ceil((r.deadline-Date.now())/1000))} saniye</p>`;const status=r.topBid?`En yüksek teklif: <b>${r.topBid} kredi</b> · ${esc(r.players[r.topSeat].name)}`:'Henüz teklif yok';
stage.innerHTML=`<div class="auction-main"><div class="auction-hero"><div class="eyebrow">KART ${r.round+1} / 10</div><div class="auction-deck-scene rarity-frame-${esc(card.rarity||'common')}">${auctionDeckMarkup(r.round,document.documentElement.lang==='en')}<div class="auction-draw-back" aria-hidden="true"><b>✦</b></div><div class="card-art rarity-frame rarity-frame-${esc(card.rarity||'common')}">${art}</div></div><div class="card-name">${esc(card.name)}</div><span class="tag">${worldNames[card.universe]} · 🔒 GÜÇ GİZLİ</span><span class="rarity rarity-${esc(card.rarity||'common')} rarity-feature">✦ ${rarityLabel(card.rarity)}</span><span class="tag" id="auction-lane-bonuses">ÖN / ARKA SAF BONUSLARI YÜKLENİYOR…</span><div class="auction-abilities" id="auction-abilities" style="display:grid;gap:4px;margin:6px 0;font-size:.86rem;line-height:1.35"><div id="auction-active">⚔ Aktif yetenek yükleniyor…</div><div id="auction-passive">✦ Pasif yetenek yükleniyor…</div></div><p class="status hero-description" id="hero-description">${esc(card.description||"Karakter bilgisi yükleniyor…")}</p></div><div class="auction-action"><div class="auction-budget" aria-label="Kalan krediler"><div class="auction-budget-own"><small>Senin kredin</small><strong>${r.players[r.me].credits}</strong></div><div class="auction-budget-rival"><small>Rakibin kredisi</small><strong>${r.players[1-r.me].credits}</strong></div></div><p class="status">${status}</p>${timer}${canBid&&max>=min?`<div class="bid-stepper"><button id="minusbid" type="button" aria-label="Teklifi azalt">−</button><div class="big-bid" id="bidview">${min} KREDİ</div><button id="plusbid" type="button" aria-label="Teklifi artır">+</button></div><input id="bidrange" class="range" type="range" min="${min}" max="${max}" value="${min}" step="1"><div class="controls"><button class="primary" id="bidbutton">${r.topBid?'TEKLİFİ ARTIR':'AÇILIŞ TEKLİFİ VER'} →</button><button class="danger" id="passbutton">PAS</button></div>`:canBid?'<p class="status">Bütçen artırmaya yetmiyor. İhale otomatik kapanıyor.</p>':`<p class="status">⏳ Teklif sırası: <b>${esc(r.players[r.turn].name)}</b><br>Rakibin kararını bekle.</p>`}</div></div>`;
revealAuctionCard(stage,{round:r.round,newCard:isNewCard,reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches});
loadHeroInfo(card);
if(canBid&&max>=min){$('bidrange').oninput=e=>$('bidview').textContent=e.target.value+' KREDİ';$('bidbutton').onclick=()=>{playAuctionActionSound('bid');void act('/api/bid',{amount:Number($('bidrange').value)})};$('minusbid').onclick=()=>{const el=$('bidrange');el.value=Math.max(min,Number(el.value)-1);el.oninput({target:el})};$('plusbid').onclick=()=>{const el=$('bidrange');el.value=Math.min(max,Number(el.value)+1);el.oninput({target:el})};$('passbutton').onclick=()=>{playAuctionActionSound('pass');void act('/api/pass',{})}}
}
function renderChat(r){const panel=$('chat-panel');if(!panel)return;panel.hidden=r.mode==='bot'||Boolean(window.HeroPlatform?.disableChat);if(panel.hidden)return;const list=$('chat-messages');const oldCount=Number(list.dataset.count||0);const messages=r.chat||[];if(oldCount!==messages.length||list.dataset.room!==r.code){const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;list.innerHTML=messages.map(m=>`<div class="chat-line ${m.seat===r.me?'chat-mine':''}"><span class="chat-author">${esc(m.name)} · ${new Date(m.time).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span><span class="chat-text">${esc(m.message)}</span></div>`).join('')||'<p class="status">Henüz mesaj yok. Rakibine merhaba de!</p>';list.dataset.count=String(messages.length);list.dataset.room=r.code;if(nearBottom||!oldCount)list.scrollTop=list.scrollHeight;}}
let chatSending=false;
$('chat-send').onclick=async()=>{if(!session||room?.mode==='bot'||chatSending||window.HeroPlatform?.disableChat)return;const input=$('chat-input');const message=input.value.trim();if(!message)return;chatSending=true;$('chat-send').disabled=true;try{const result=await post('/api/chat',{...session,message});input.value='';show(result.room);}catch(e){notify('Sohbet mesajı gönderilemedi: '+e.message)}finally{chatSending=false;$('chat-send').disabled=false}};
// Keep chat synchronized even when a proxy interrupts the live event stream.
setInterval(async()=>{if(!session||!room||room.mode==='bot'||document.hidden)return;try{const result=await post('/api/state',session);if(result.room?.chat?.length!==room.chat?.length||result.room?.code!==room.code)show(result.room)}catch{}},4000);
// Delegate focus directly from the user's tap; iOS requires synchronous focus in the gesture.
const chatPanel=$('chat-panel');
const chatInput=$('chat-input');
chatPanel.addEventListener('click',event=>{
 if(!room||room.mode==='bot'||event.target.closest('#chat-send'))return;
 if(event.target!==chatInput)chatInput.focus({preventScroll:true});
});
chatInput.addEventListener('touchend',()=>{
 if(document.activeElement!==chatInput)chatInput.focus({preventScroll:true});
},{passive:true});
$('chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chat-send').click()}});
// PokeAPI species are indexed by national Pokédex number; name mapping is loaded lazily.
let pokeMap={};async function loadPokeMap(){try{const r=await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1025');const j=await r.json();j.results.forEach((x,i)=>pokeMap[x.name.replaceAll('-',' ').toLowerCase()]=i+1);if(room)show(room)}catch{}}
function pokemonId(name){return pokeMap[name.toLowerCase()]||null}
async function act(url,extra){try{const j=await post(url,{...session,...extra});show(j.room)}catch(e){notify(e.message)}}

$('create').onclick=async()=>{if(!await validateLogin())return;try{const j=await post('/api/create',{...gameIdentity(),name:$('name').value,universe:world});save(j.token,j.room)}catch(e){notify(e.message)}};
$('join').onclick=async()=>{if(!await validateLogin())return;try{const j=await post('/api/join',{...gameIdentity(),name:$('name').value,code:$('roomcode').value.trim().toUpperCase()});save(j.token,j.room)}catch(e){notify(e.message)}};
$('bot').onclick=async()=>{if(!await validateLogin())return;try{const j=await post('/api/bot',{...gameIdentity(),name:$('name').value,universe:world,difficulty:$('bot-difficulty').value});save(j.token,j.room)}catch(e){notify(e.message)}};
$('match').onclick=async()=>{if(!await validateLogin())return;try{const j=await post('/api/match',{...gameIdentity(),name:$('name').value,universe:world});save(j.token,j.room)}catch(e){notify(e.message)}};
setInterval(()=>{if(room?.phase==='auction'&&room.deadline){const el=$('turntimer');if(el)el.textContent='⏱ '+Math.max(0,Math.ceil((room.deadline-Date.now())/1000))+' saniye'}},250);
function inviteUrl(code){const u=new URL('/',location.origin);u.searchParams.set('join',code);return u.toString()}
async function shareInvite(code){
 if(window.HeroPlatform){try{const link=await window.HeroPlatform.inviteLink(code);await navigator.clipboard.writeText(link);notify('Davet bağlantısı kopyalandı.')}catch{notify('Davet bağlantısı kopyalanamadı. CrazyGames davet düğmesini kullan.')}return}
 const message='⚔️ Hero Auction\'da sana meydan okuyorum! Odaya katıl ve 20 krediyle takımını kur: '+inviteUrl(code);
 window.open('https://wa.me/?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');
}
$('share').textContent='📲 ARKADAŞINI DAVET ET';
$('share').onclick=()=>{if(room)shareInvite(room.code)};
const invitedCode=new URLSearchParams(location.search).get('join');
if(invitedCode&&/^\d{3}$/.test(invitedCode)){
 $('roomcode').value=invitedCode.toUpperCase();
 $('join-invite').hidden=false;
 $('join-invite-code').textContent=invitedCode.toUpperCase();
 $('join-invite-button').onclick=()=>$('join').click();
}
$('leave').onclick=()=>{if(!confirm('Bu cihazda odadan ayrılmak istiyor musun?'))return;window.HeroPlatform?.setRoom(null);localStorage.removeItem('hero-auction-session');stream?.close();session=null;room=null;applyLogin();refreshOnline()};

// CrazyGames session bridge: authenticate before restoring any device-local seat.
let platformStarting=false,platformJoinQueue=Promise.resolve();
function discardPlatformSeat(){
 stream?.close();stream=null;session=null;room=null;
 localStorage.removeItem('hero-auction-session');
 sessionStorage.removeItem('hero-auction-formation');sessionStorage.removeItem('hero-auction-lanes');
 window.HeroPlatform.setRoom(null);
}
async function authenticatePlatform(){
 const identity=await window.HeroPlatform.identity();
 let result,type;
 if(identity.kind==='user'){
  result=await post('/api/auth/crazygames',{credential:identity.credential});type='crazygames';
 }else{
  type='guest';
  if(platformStoredLogin?.type==='guest'){
   try{result=await post('/api/auth/check',{authToken:platformStoredLogin.authToken});result.authToken=platformStoredLogin.authToken}
   catch(e){if(!/giriş yap|Oturumun sona erdi|401/.test(e.message))throw e}
  }
  if(!result)result=await post('/api/auth/guest',{name:'Oyuncu'});
 }
 if(type!==platformStoredLogin?.type||(type==='crazygames'&&result.user.sub!==platformStoredLogin?.user?.sub)||result.authToken!==platformStoredLogin?.authToken&&type==='guest')discardPlatformSeat();
 login={type,user:result.user,authToken:result.authToken};platformStoredLogin=login;
 localStorage.setItem('hero-auction-login',JSON.stringify(login));showGold(result.gold);applyLogin();await loadCommander();
}
async function joinPlatformRoom(code){
 if(!/^\d{3}$/.test(String(code)))return;
 if(room?.code===code)return;
 try{
  const j=await post('/api/join',{code,name:login.user?.name,universe:world});
  discardPlatformSeat();save(j.token,j.room);commanderVisibility();
 }catch(e){notify('Davete katılınamadı: '+e.message)}
}
async function startPlatform(){
 if(platformStarting)return;platformStarting=true;$('guest-login').disabled=true;
 try{
  window.HeroPlatform.watchAccount();await authenticatePlatform();await restoreGame();
  const code=window.HeroPlatform.takeInviteCode()||new URLSearchParams(location.search).get('join');
  if(code)await joinPlatformRoom(code);
  else if(window.HeroPlatform.instantMultiplayer&&!room){const j=await post('/api/create',{name:login.user?.name,universe:world});save(j.token,j.room);commanderVisibility()}
  window.HeroPlatform.onJoin(code=>{platformJoinQueue=platformJoinQueue.then(()=>joinPlatformRoom(code));return platformJoinQueue});
  if(!room&&homePlayPanel.hidden)homePlayTab.click();
 }catch(e){notify(e.message);$('guest-login').textContent='TEKRAR DENE'}
 finally{window.HeroPlatform.loaded();platformStarting=false;$('guest-login').disabled=false}
}
window.addEventListener('hero:platform-auth',()=>{
 // Re-enter through the verified account flow; never reuse another user's room.
 discardPlatformSeat();location.replace('/crazygames/');
});
// End CrazyGames session bridge.

(async()=>{try{const r=await fetch('/api/info');const j=await r.json();$('catalogue').textContent=`Şu anda ${j.catalogueCount} özgün kahraman hazır`;}catch{}if(window.HeroPlatform)await startPlatform();else await restoreGame();loadPokeMap();refreshOnline()})();

async function loadHeroInfo(card){
 const key=card.universe+':'+card.name;
 if(!infoMemo.has(key)){
  try{const response=await fetch('/api/art?universe='+encodeURIComponent(card.universe)+'&name='+encodeURIComponent(card.name));if(!response.ok)throw Error('Karakter bilgisi alınamadı');infoMemo.set(key,await response.json())}
  catch{infoMemo.set(key,{url:null,description:null})}
 }
 if(!room||room.phase!=='auction'||room.card?.name!==card.name||room.card?.universe!==card.universe)return;
 const data=infoMemo.get(key);
 const desc=document.getElementById('hero-description');
 if(desc)desc.textContent=data?.description||card.description||card.name+' hakkında doğrulanmış kısa açıklama henüz eklenmedi.';

 const activeNode=document.getElementById('auction-active'),passiveNode=document.getElementById('auction-passive');
 if(activeNode)activeNode.textContent='⚔ Aktif: '+abilityImpact(data?.active);
 if(passiveNode)passiveNode.textContent='✦ Pasif: '+abilityImpact(data?.passive);
 const tag=document.getElementById('auction-lane-bonuses');
 if(tag){
  const front=Number(data?.laneModifiers?.front),back=Number(data?.laneModifiers?.back);
  const valid=data?.laneModifiers&&Number.isFinite(front)&&Number.isFinite(back);
  const fmt=n=>(n>=0?'+':'')+(n*100).toFixed(0)+'%';
  tag.textContent=valid?'🛡 ÖN SAF '+fmt(front)+'   ·   🎯 ARKA SAF '+fmt(back):'ÖN / ARKA SAF BONUSU TANIMLI DEĞİL';
 }
 const target=document.querySelector('#stage .card-art');if(!target)return;
 if(data?.url){
  target.innerHTML='';const img=document.createElement('img');img.onload=()=>img.classList.toggle('hero-portrait-wide',img.naturalWidth>img.naturalHeight);img.src=data.url;img.alt=card.name;
  img.onerror=()=>{target.innerHTML='<div class="hero-art-placeholder">'+emojis[card.universe]+'<small>Görsel yüklenemedi</small></div>'};
  target.append(img);
  if(data.source){const link=document.createElement('a');link.href=data.source;link.target='_blank';link.rel='noopener noreferrer';link.className='art-credit';link.textContent='Görsel kaynağı';target.append(link)}
 }else{
  target.innerHTML='<div class="hero-art-placeholder">'+emojis[card.universe]+'<small>Doğrulanmış görsel yok</small></div>';
 }
}


const socialEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function socialView(type){
 const el=$('social-content');if(!el)return;
 el.textContent='Yükleniyor…';
 try{
  const api={profile:'/api/profile',leaders:'/api/leaderboard',friends:'/api/friends',live:'/api/spectate/list'}[type];
  const data=await post(api,{});
  if(type==='profile'){
   const p=data.profile;el.innerHTML='<h3>'+socialEsc(p.name)+' · '+socialEsc(p.tier)+'</h3><p>Lig puanı: '+p.rating+' · Galibiyet: '+p.wins+' · Mağlubiyet: '+p.losses+' · Beraberlik: '+p.draws+'</p><h4>Son 20 maç</h4>'+((data.history||[]).map(m=>'<p>'+new Date(m.at).toLocaleDateString('tr-TR')+' · '+socialEsc(m.universe)+' · '+socialEsc(m.participants.map(p=>p.name+' ('+p.score+')').join(' - '))+'</p>').join('')||'<p>Henüz maç yok.</p>');
  }else if(type==='leaders'){
   el.innerHTML='<h3>Lig sıralaması</h3>'+((data.players||[]).map((p,i)=>'<p>'+(i+1)+'. '+socialEsc(p.name)+' · '+socialEsc(p.tier)+' · '+p.rating+' puan</p>').join('')||'<p>Henüz sıralama yok.</p>');
  }else if(type==='friends'){
   el.innerHTML='<h3>Arkadaşlarım</h3><p>Arkadaş eklemek için sıralamadaki oyuncu kimliğini kullan.</p><input id="friend-id" placeholder="Oyuncu hesap kimliği"><button class="outline" id="friend-add">EKLE</button>'+((data.friends||[]).map(p=>'<p>'+socialEsc(p.name)+' · '+socialEsc(p.tier)+' <button class="outline friend-remove" data-id="'+socialEsc(p.id)+'">ÇIKAR</button></p>').join('')||'<p>Henüz arkadaş yok.</p>');
   $('friend-add').onclick=async()=>{try{await post('/api/friend/add',{accountId:$('friend-id').value});socialView('friends')}catch(e){notify(e.message)}};
   el.querySelectorAll('.friend-remove').forEach(b=>b.onclick=async()=>{await post('/api/friend/remove',{accountId:b.dataset.id});socialView('friends')});
  }else{
   el.innerHTML='<h3>Canlı maçlar</h3>'+((data.matches||[]).map(m=>'<p>'+socialEsc(m.players.join(' - '))+' · '+socialEsc(m.universe)+' · Kart '+(m.round+1)+'/10 <button class="outline watch-match" data-code="'+socialEsc(m.code)+'">İZLE</button></p>').join('')||'<p>Şu anda izlenebilir maç yok.</p>')+'<div id="watch-content"></div>';
   el.querySelectorAll('.watch-match').forEach(b=>b.onclick=()=>watchSocialMatch(b.dataset.code));
  }
 }catch(e){el.textContent=e.message}
}
let watchInterval=null;
async function watchSocialMatch(code){
 clearInterval(watchInterval);
 const update=async()=>{try{const {room:r}=await post('/api/spectate',{code});const el=$('watch-content');if(!el){clearInterval(watchInterval);return}el.innerHTML='<h4>👁 '+socialEsc(r.players.map(p=>p?.name).join(' - '))+'</h4><p>Kart '+(r.round+1)+'/10 · '+socialEsc(r.card?.name||'')+' · En yüksek teklif: '+r.topBid+'</p><p>'+socialEsc((r.history||[]).slice(-5).join(' | '))+'</p>'}catch(e){clearInterval(watchInterval);const el=$('watch-content');if(el)el.textContent='Maç tamamlandı veya kapandı.'}};
 await update();watchInterval=setInterval(update,3000);
}
for(const [id,type] of [['social-profile','profile'],['social-leaders','leaders'],['social-friends','friends'],['social-live','live']]){const b=$(id);if(b)b.onclick=()=>{clearInterval(watchInterval);socialView(type)}}


window.addEventListener('hero:platform-settings',()=>{if(room)renderChat(room);if(window.HeroPlatform?.muteAudio&&auctionSfxContext)void auctionSfxContext.suspend().catch(()=>{})});

window.addEventListener('pagehide',()=>{cancelAwardFlights();tailReveal?.cancel();tailReveal=null;cancelAuctionReveal($('stage'));});
