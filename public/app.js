import {victoryChestReceipt} from '/victory-chest.js';
import {createHeaderWallet} from '/header-wallet.js';
import {createWalletOperations} from '/wallet-operations.js';
import {createStorefront} from '/storefront.js';
import {renderCommanderExchange,commanderExchangeQuote} from '/commander-exchange-view.js';
import {renderCommanderSkills,renderCommanderDevelopment,commanderBranchView,commanderDiamondPolicyCopy} from '/commander-profile-view.js';
import {COMMANDER_CHANGE_COST} from '/commander-economy.js';
import {createRoomInvitesUI} from '/room-invites.js';
import {createFriendsUI} from '/friends.js';
import {heroDescriptionEnglish} from '/hero-stories-en.js';
import {translate} from '/crazygames-en.js';
const uiText=text=>document.documentElement.lang==='en'?translate(text):text;
const displayPlayerName=(player,bot=false)=>document.documentElement.lang==='en'&&bot?'Computer':player?.name||uiText('Oyuncu');
import {createWebInvite,renderWebInvite} from '/web-invite.js';
import {createInviteSharer} from '/invite-share.js';
let webInvite=null;
import {auctionCalculationMarkup} from '/auction-calculation.js';
import {flyAwardCard} from '/auction-card-flight.js?v=every-player-20261024';
import {collectOfferedAwards,displaySeat} from '/auction-awards.js';
import {collectTailAwards,mountTailReveal} from '/auction-tail-reveal.js?v=every-player-20261024';
import {auctionMatchKey,isStaleAuctionSnapshot,createTailReceipts} from '/auction-delivery-state.js';
const tailReceipts=createTailReceipts({storage:()=>window.sessionStorage,scope:location.pathname.startsWith('/crazygames/')?'crazygames':'web'});
let tailReveal=null;
const awardFlights=new Set(),seenAwardFlights=new Set();
import {auctionDeckMarkup,revealAuctionCard,cancelAuctionReveal} from '/auction-deck.js';
import {commanderAbilityStats,COMMANDER_START_ENERGY} from '/commander-ability-rules.js?v=commander-attack-fix-20261021';
import {abilityImpact} from '/hero-ability-text.js?v=ability-amounts-20261021';
const $=id=>document.getElementById(id);
let session=null,room=null,stream=null;
let roomEntryPending=0;
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
const friendsUI=createFriendsUI({translate:uiText,notify:message=>notify(message),onInvite:playerId=>roomInvitesUI.sendTo(playerId),onOpen:()=>{storefrontUI.close();const panel=$('home-play-panel');if(panel)panel.hidden=true;$('home-play-tab')?.setAttribute('aria-expanded','false');$('home-play-tab')?.classList.remove('selected');}});

const roomInvitesUI=createRoomInvitesUI({translate:uiText,onStateChange:state=>friendsUI.setInvitations(state),canStart:()=>roomEntryPending===0,onHosted:({token,room:r})=>{save(token,r);commanderVisibility();},onJoined:({token,room:r})=>{save(token,r);commanderVisibility();notify(uiText('Davet edilen odaya katıldın.'));}});

const headerWallet=createHeaderWallet({document});
const walletOperations=createWalletOperations({storage:()=>window.sessionStorage});
const storefrontUI=createStorefront({walletOperations,canOpen:()=>!room&&!commanderProfileOpen,onOpen:()=>{friendsUI.close();const panel=$('home-play-panel');if(panel)panel.hidden=true;$('home-play-tab')?.setAttribute('aria-expanded','false');$('home-play-tab')?.classList.remove('selected');},onBalance:result=>{headerWallet.update(result,login?.authToken);if(Number.isSafeInteger(result.gold))showGold(result.gold);if(Number.isSafeInteger(result.diamonds))commanderDiamonds=result.diamonds;}});

// A store request may finish after the player has opened the commander screen.
// Refresh only that same open account; never reset navigation or apply old data
// over a commander mutation/new profile that completed during the read.
walletOperations.subscribe(({key,busy})=>{if(!busy)void refreshCommanderAfterWalletOperation(key);});
async function refreshCommanderAfterWalletOperation(key){
 if(key!==walletOperations.keyFor(login)||!commanderProfileOpen||commanderBusy||!signedIn())return;
 const authToken=login.authToken,previous=commanderProfile;
 try{
  const result=await post('/api/commander/get',{});
  if(login?.authToken!==authToken||!commanderProfileOpen||commanderBusy||commanderProfile!==previous)return;
  commanderProfile=result.profile;commanderProgression=result.progression||null;commanderDiamonds=result.diamonds??null;commanderExchange=result.exchange||null;showGold(result.gold);renderCommanderProfile();
 }catch{if(login?.authToken===authToken&&commanderProfileOpen&&!commanderBusy)renderCommanderProfile();}
}

const commanderOptions=[
 {id:'attack',icon:'⚔️',name:'Saldırı Komutanı',detail:'Savaşçı / Suikastçı'},
 {id:'defense',icon:'🛡️',name:'Savunma Komutanı',detail:'Tank'},
 {id:'magic',icon:'🔮',name:'Büyücü Komutanı',detail:'Enerji'},
 {id:'support',icon:'💚',name:'Destek Komutanı',detail:'Destek'}
];
const commanderPortraits={"attack":"/images/Ate%C5%9Fler%20%C4%B0%C3%A7inde%20Sava%C5%9F%C3%A7%C4%B1%20Komutan.png","defense":"/images/Alt%C4%B1n%20Aslan%C4%B1n%20Kale%20Muhaf%C4%B1z%C4%B1.png","magic":"/images/Kozmik%20R%C3%BCnlerin%20B%C3%BCy%C3%BCc%C3%BC%20Komutan%C4%B1.png","support":"/images/Z%C3%BCmr%C3%BCt%20I%C5%9F%C4%B1%C4%9F%C4%B1n%20%C5%9Eifac%C4%B1%20Krali%C3%A7esi.png"};
function commanderPortrait(id){return commanderPortraits[id]||'/images/commander-attack.svg';}
let commanderProfile=null,commanderLoaded=false,commanderPending=null,commanderChangePending=null,commanderProfileOpen=false,commanderBusy=false,commanderLoading=false,commanderChangeOpen=false;
let commanderSelectedBranch=null,commanderProgression=null,commanderDiamonds=null,commanderUpgradeRequest=null;
let commanderExchange=null,commanderExchangeAmount='1',commanderExchangeRequest=null;
function commanderVisibility(){
 renderLobbyIdentity();
 const logged=signedIn(),needSelection=logged&&commanderLoaded&&!commanderProfile&&(!window.HeroPlatform||!room);
 $('commander-onboarding').hidden=!needSelection;
 $('commander-profile').hidden=!logged||!commanderProfileOpen||!commanderProfile;
 $('home').hidden=!logged||!!room||!commanderLoaded||needSelection||commanderProfileOpen;
 $('commander-open-profile').hidden=!commanderProfile;
 webInvite?.sync();
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
 confirm.disabled=commanderBusy||!commanderChangePending||walletGold<COMMANDER_CHANGE_COST;
 confirm.textContent=commanderChangePending?`🪙 ${COMMANDER_CHANGE_COST} · `+commanderOptions.find(c=>c.id===commanderChangePending).name.toLocaleUpperCase('tr-TR')+' SEÇ':`🪙 ${COMMANDER_CHANGE_COST} · KOMUTAN DEĞİŞTİR`;
}
async function changeCommander(){
 if(commanderBusy||!commanderChangePending||!commanderProfile||walletGold<COMMANDER_CHANGE_COST)return;
 const target=commanderOptions.find(c=>c.id===commanderChangePending);
 if(!target||!window.confirm(document.documentElement.lang==='en'?`Spend ${COMMANDER_CHANGE_COST} gold to switch to `+uiText(target.name)+'? Your upgrade levels will be preserved.':target.name+` komutanına geçmek için ${COMMANDER_CHANGE_COST} altın harcamak istiyor musun? Gelişim seviyelerin korunacak.`))return;
 commanderBusy=true;renderCommanderRoster();
 try{
  const result=await post('/api/commander/change',{commanderId:target.id});
  commanderProfile=result.profile;commanderProgression=result.progression||null;commanderDiamonds=result.diamonds??null;commanderExchange=result.exchange||null;commanderChangePending=null;commanderChangeOpen=false;showGold(result.gold);
  $('commander-upgrade-message').textContent=`✓ Komutan değiştirildi. ${result.cost??COMMANDER_CHANGE_COST} altın harcandı.`;
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
 const number=value=>value.toLocaleString(document.documentElement.lang==='en'?'en-US':'tr-TR',{maximumFractionDigits:2});
 $('commander-profile').dataset.type=chosen.id;
 $('commander-profile-name').textContent=document.documentElement.lang==='en'?'Development tree':'Gelişim ağacı';
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
 $('commander-effect-bonus').textContent=document.documentElement.lang==='en'?'NORMAL +'+stats.bonusPercent+'%':'NORMAL +%'+stats.bonusPercent;
 $('commander-active-detail').textContent=activeLevel>=40?'Ana uzmanlık tamamlandı.':activeLevel%2===0?'Her 2 ana dal seviyesinde tur enerjisi +1.':'Sonraki ana dal seviyesinde tur enerjisi +1.';
 renderCommanderSkills($('commander-skill-summary'),commanderProfile,{english:document.documentElement.lang==='en',document});
 renderCommanderRoster();
 if(!commanderSelectedBranch)commanderSelectedBranch=chosen.id;
 renderCommanderDevelopment($('commander-upgrades'),commanderProfile,{
  branchesRoot:$('commander-branch-nodes'),selected:commanderSelectedBranch,gold:walletGold,diamonds:commanderDiamonds,progression:commanderProgression,busy:commanderBusy,english:document.documentElement.lang==='en',document,
  onSelect:id=>{commanderSelectedBranch=id;renderCommanderProfile();$('commander-branch-nodes').querySelector(`[data-branch="${id}"]`)?.focus();},
  onUpgrade:id=>void upgradeCommander(id)
 });
 $('commander-command-tree').dataset.selected=commanderSelectedBranch;
 const diamondWallet=$('commander-diamond-wallet');diamondWallet.hidden=commanderProgression?.diamondsEnabled!==true;
 $('commander-diamond-info').hidden=diamondWallet.hidden;
 $('commander-diamond-info').textContent=commanderDiamondPolicyCopy(commanderProgression,{english:document.documentElement.lang==='en'});
 $('commander-profile-diamonds').textContent=commanderDiamonds===null?'—':number(commanderDiamonds);
 $('commander-exchange-availability').textContent=commanderExchange?.available===true?'1 → '+number(commanderExchange.rate):(document.documentElement.lang==='en'?'Not available yet':'Henüz açık değil');
 renderCommanderExchange($('commander-exchange-controls'),{
  policy:commanderExchange,diamonds:commanderDiamonds,gold:walletGold,amount:commanderExchangeAmount,
  pending:walletOperations.read(login).exchange,busy:commanderBusy||walletOperations.busy(login),english:document.documentElement.lang==='en',document,
  onAmount:value=>{commanderExchangeAmount=value;},onExchange:amount=>void exchangeCommanderDiamonds(amount)
 });

}
async function loadCommander(){
 if(!signedIn()||commanderLoading)return;
 commanderLoading=true;const authToken=login.authToken;
 commanderLoaded=false;commanderProfile=null;commanderProgression=null;commanderDiamonds=null;commanderSelectedBranch=null;commanderUpgradeRequest=null;commanderExchange=null;commanderExchangeRequest=null;commanderExchangeAmount='1';commanderProfileOpen=false;commanderChangeOpen=false;commanderVisibility();
 try{
  const result=await post('/api/commander/get',{});
  if(!signedIn()||login.authToken!==authToken)return;
  commanderProfile=result.profile;commanderProgression=result.progression||null;commanderDiamonds=result.diamonds??null;commanderExchange=result.exchange||null;commanderLoaded=true;showGold(result.gold);
  renderCommanderOnboarding();renderCommanderProfile();commanderVisibility();
 }catch(e){notify('Komutan profili yüklenemedi: '+e.message)}
 finally{commanderLoading=false}
}
async function selectCommander(){
 if(!commanderPending||commanderBusy)return;
 commanderBusy=true;renderCommanderOnboarding();
 try{
  const result=await post('/api/commander/select',{commanderId:commanderPending});
  commanderProfile=result.profile;commanderProgression=result.progression||null;commanderDiamonds=result.diamonds??null;commanderExchange=result.exchange||null;commanderLoaded=true;showGold(result.gold);
  renderCommanderProfile();commanderVisibility();notify('Komutanın hesabına kaydedildi.');
 }catch(e){$('commander-onboarding-message').textContent=e.message}
 finally{commanderBusy=false;renderCommanderOnboarding()}
}
async function exchangeCommanderDiamonds(amount){
 if(commanderBusy||walletOperations.busy(login)||!commanderProfile||!signedIn())return;
 const authToken=login.authToken,english=document.documentElement.lang==='en',operationKey=walletOperations.keyFor(login);
 const stored=walletOperations.read(login).exchange;
 let request=stored?{authToken,body:stored}:null;
 if(!request){
  const quote=commanderExchangeQuote(commanderExchange,commanderDiamonds,walletGold,amount);
  if(!quote.canExchange)return;
  const fmt=value=>value.toLocaleString(english?'en-US':'tr-TR');
  const prompt=english?`Spend ${fmt(quote.diamondsToSpend)} diamonds to receive ${fmt(quote.goldGranted)} gold? This exchange cannot be reversed.`:`${fmt(quote.diamondsToSpend)} elmas harcayıp ${fmt(quote.goldGranted)} altın almak istiyor musun? Bu dönüşüm geri alınamaz.`;
  if(!window.confirm(prompt))return;
  request={authToken,body:{diamondsToSpend:quote.diamondsToSpend,expectedRate:quote.expectedRate,pricingVersion:quote.pricingVersion,requestId:crypto.randomUUID()}};
 }
 if(!walletOperations.write(operationKey,'exchange',request.body)){
  $('commander-upgrade-message').textContent=english?'Session storage is required for safe retries. No request was sent.':'Güvenli yeniden deneme için tarayıcı oturum depolaması gerekli. İşlem gönderilmedi.';return;
 }
 if(!walletOperations.begin(operationKey))return;
 commanderExchangeRequest=request;
 commanderBusy=true;renderCommanderProfile();
 try{
  const result=await post('/api/diamonds/exchange',request.body);
  walletOperations.write(operationKey,'exchange',null);
  if(login?.authToken!==authToken)return;
  commanderExchangeRequest=null;commanderDiamonds=result.diamonds;commanderExchange=result.exchange||null;showGold(result.gold);
  $('commander-upgrade-message').textContent=english?'✓ Exchange confirmed. Balances updated.':'✓ Dönüşüm doğrulandı. Bakiyeler güncellendi.';
 }catch(e){
  if(e.status===400||e.status===409)walletOperations.write(operationKey,'exchange',null);
  if(login?.authToken!==authToken)return;
  if(e.status===400||e.status===409)commanderExchangeRequest=null;
  $('commander-upgrade-message').textContent='⚠ '+e.message;
  // Balances alone cannot prove an uncertain exchange; retain its request ID.
  try{
   const result=await post('/api/commander/get',{});
   if(login?.authToken!==authToken)return;
   commanderProfile=result.profile;commanderProgression=result.progression||null;commanderDiamonds=result.diamonds??null;commanderExchange=result.exchange||null;showGold(result.gold);
  }catch{/* Retry the same request ID, even if a reconciliation request fails. */}
 }finally{walletOperations.finish(operationKey);commanderBusy=false;renderCommanderProfile();}
}
async function upgradeCommander(stat){
 if(commanderBusy||!commanderProfile||!signedIn())return;
 const view=commanderBranchView(commanderProfile,stat,{gold:walletGold,diamonds:commanderDiamonds,progression:commanderProgression});
 if(!view.canUpgrade)return;
 const authToken=login.authToken,commanderId=commanderProfile.commanderId,expectedCurrentLevel=commanderProfile.levels[stat];
 const key=[authToken,commanderId,stat,expectedCurrentLevel].join(':');
 // Retain the same request after a transport-uncertain response; never debit twice.
 if(commanderUpgradeRequest?.key!==key)commanderUpgradeRequest={key,body:{stat,commanderId,expectedCurrentLevel,requestId:crypto.randomUUID()}};
 const request=commanderUpgradeRequest;
 const restoreFocus=document.activeElement?.dataset?.upgrade===stat;
 commanderBusy=true;renderCommanderProfile();
 try{
  const result=await post('/api/commander/upgrade',request.body);
  if(login?.authToken!==authToken)return;
  commanderUpgradeRequest=null;
  commanderProfile=result.profile;commanderProgression=result.progression||null;commanderDiamonds=result.diamonds??null;commanderExchange=result.exchange||null;showGold(result.gold);
  const english=document.documentElement.lang==='en';
  $('commander-upgrade-message').textContent=english?'✓ Upgrade saved.':'✓ Geliştirme kaydedildi.';
 }catch(e){
  if(login?.authToken!==authToken)return;
  if(e.status&&e.status<500)commanderUpgradeRequest=null;
  $('commander-upgrade-message').textContent='⚠ '+e.message;
  // Reconcile stale levels, balances, and a possibly completed network request.
  try{
   const result=await post('/api/commander/get',{});
   if(login?.authToken!==authToken)return;
   commanderProfile=result.profile;commanderProgression=result.progression||null;commanderDiamonds=result.diamonds??null;commanderExchange=result.exchange||null;showGold(result.gold);
   if(commanderProfile?.commanderId!==commanderId||commanderProfile?.levels[stat]!==expectedCurrentLevel)commanderUpgradeRequest=null;
  }catch{/* Keep the original error and request ID for a safe retry. */}
 }finally{
  commanderBusy=false;renderCommanderProfile();
  if(restoreFocus&&login?.authToken===authToken&&commanderProfileOpen&&(!document.activeElement||document.activeElement===document.body))$('commander-upgrades').querySelector(`[data-upgrade="${stat}"]`)?.focus({preventScroll:true});
 }
}
$('commander-select-confirm').onclick=()=>void selectCommander();
$('commander-open-profile').onclick=()=>{storefrontUI.close();commanderProfileOpen=true;commanderVisibility();renderCommanderProfile()};
$('commander-profile-close').onclick=()=>{commanderProfileOpen=false;commanderVisibility()};
let walletGold=0;
let victoryChestCapability=null;
function renderLobbyEconomy(capability){
 victoryChestCapability=capability&&typeof capability.enabled==='boolean'?capability:null;
 const english=document.documentElement.lang==='en',label=$('play-reward-label'),prefix=$('play-reward-prefix'),odds=$('play-reward-odds');
 if(!label||!odds)return;
 if(prefix)prefix.textContent=english?'Winner':'Kazanan';
 const guide=$('home-guide-economy'),guideCopy=reward=>{if(guide)guide.textContent=english?`Live match: 50 gold each · ${reward}. Computer training is free.`:`Oyunculu maç: kişi başı 50 altın · ${reward}. Bilgisayara karşı antrenman ücretsiz.`;};
 odds.hidden=true;odds.textContent='';
 if(!victoryChestCapability){label.textContent=english?'Reward unavailable':'Ödül bilgisi alınamadı';guideCopy(label.textContent);return;}
 if(!capability.enabled){label.textContent=english?'120 gold':'120 altın';guideCopy(english?'Winner receives 120 gold':'Kazanana 120 altın');return;}
 if(capability.available!==true){label.textContent=english?'Chest unavailable':'Sandık hazırlanıyor';guideCopy(label.textContent);odds.hidden=false;odds.textContent=english?'Victory chest storage is unavailable; new live matches are paused.':'Zafer sandığı altyapısı kullanılamıyor; yeni canlı maçlara giriş bekletiliyor.';return;}
 label.textContent=english?'Victory chest':'Zafer sandığı';guideCopy(english?'Winner receives a victory chest':'Kazanana zafer sandığı');
 const gold=Array.isArray(capability.goldOptions)&&capability.goldOptions.every(n=>Number.isSafeInteger(n)&&n>0)?capability.goldOptions.join(' / '):null;
 const chance=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100?n:null,dust=chance(capability.magicDustChance),diamonds=chance(capability.diamondChance);
 const dustOptions=Array.isArray(capability.magicDustOptions)&&capability.magicDustOptions.length&&capability.magicDustOptions.every(n=>Number.isSafeInteger(n)&&n>0)?capability.magicDustOptions:null;
 const dustAmounts=dustOptions?(JSON.stringify(dustOptions)==='[3,4,5]'?'3–5':dustOptions.join(' / ')):null;
 if(gold&&dustAmounts&&dust!==null&&diamonds!==null){
  const weights=capability.goldWeights,total=Array.isArray(weights)&&weights.length===capability.goldOptions.length&&weights.every(n=>Number.isFinite(n)&&n>0)?weights.reduce((a,b)=>a+b,0):null;
  const equal=total&&weights.every(n=>n===weights[0]),perGold=equal?100/weights.length:null;
  const distribution=perGold===null?'':english?` (each ${perGold}%)`:` (her biri %${perGold})`;
  odds.textContent=english?`Guaranteed gold: ${gold}${distribution}. ${dust}% chance: ${dustAmounts} magic dust. ${diamonds}% chance: 1 diamond. Independent rolls; several rewards can appear together.`:`Altın garantili: ${gold}${distribution}. %${dust} ihtimalle ${dustAmounts} büyü tozu, %${diamonds} ihtimalle 1 elmas. Bağımsız çekilişler; ödüller birlikte çıkabilir.`;
  odds.hidden=false;
 }
}
function legacyRewardCopy(r,tied,iWon){
 const english=document.documentElement.lang==='en';
 if(r.mode==='bot')return{headline:english?'TRAINING · 0 GOLD':'ANTRENMAN · 0 ALTIN',detail:english?'Computer training does not award or spend gold.':'Bilgisayara karşı altın kazanılmaz veya kaybedilmez.'};
 if(tied)return{headline:english?'DRAW · 50 GOLD REFUND':'BERABERLİK · 50 ALTIN İADESİ',detail:english?'Each player’s 50 gold entry fee is refunded.':'Her oyuncunun 50 altın giriş ücreti iade edilir.'};
 const receipt=iWon?victoryChestReceipt(r.victoryChest,r.matchId||auctionMatchKey(r)):null;
 if(receipt){
  const rewards=receipt.rewards,parts=[`${rewards.gold} ${english?'gold':'altın'}`];
  if(rewards.magicDust)parts.push(`${rewards.magicDust} ${english?'magic dust':'büyü tozu'}`);
  if(rewards.diamonds)parts.push(`${rewards.diamonds} ${english?'diamond':'elmas'}`);
  return{headline:english?'VICTORY CHEST CONFIRMED':'ZAFER SANDIĞI DOĞRULANDI',detail:(english?'Added to your wallet: ':'Cüzdanına eklendi: ')+parts.join(' · ')};
 }
 if(r.victoryChestPending||r.victoryChest||victoryChestCapability?.enabled)return iWon?{headline:english?'CHEST REWARD PENDING':'SANDIK ÖDÜLÜ DOĞRULANIYOR',detail:english?'The server is confirming your reward. No extra reward is claimed by refreshing.':'Ödül sunucuda kesinleşince gösterilecek. Yenilemek ek ödül vermez.'}:{headline:english?'WINNER RECEIVES A VICTORY CHEST':'KAZANANA ZAFER SANDIĞI',detail:english?'The chest belongs to the winning team; no victory reward for the losing team.':'Sandık kazanan takıma aittir; kaybeden takıma zafer ödülü verilmez.'};
 if(!victoryChestCapability)return{headline:english?'REWARD INFORMATION PENDING':'ÖDÜL BİLGİSİ BEKLENİYOR',detail:english?'Server reward information is not available yet.':'Sunucu ödül bilgisi henüz alınamadı.'};
 return{headline:english?(iWon?'+120 GOLD WON':'120 GOLD WINNER REWARD'):(iWon?'+120 ALTIN KAZANDIN':'+120 ALTIN ÖDÜLÜ'),detail:english?(iWon?'You won the 120 gold victory reward.':'The winning player receives 120 gold.'):(iWon?'120 altınlık zafer ödülünü kazandın.':'Kazanan oyuncuya 120 altın verilir.')};
}
function showGold(value){walletGold=Math.max(0,Number(value)||0);if(commanderProfileOpen)renderCommanderProfile();}
async function refreshGold(){if(!signedIn())return;const ticket=headerWallet.begin(login.authToken);try{const data=await post('/api/wallet',{});if(headerWallet.receive(data,ticket,{complete:true})&&Number.isSafeInteger(data.gold))showGold(data.gold)}catch(e){headerWallet.unavailable(ticket);console.warn('Wallet balance unavailable:',e.message)}}
function clearExpiredLogin(){login=null;session=null;room=null;stream?.close();localStorage.removeItem('hero-auction-login');localStorage.removeItem('hero-auction-session');showGold(0);commanderProfile=null;commanderLoaded=false;commanderProfileOpen=false;applyLogin();notify('Oturumun sona ermiş. Lütfen yeniden giriş yap.');}
async function validateLogin(){if(!signedIn())return false;try{const result=await post('/api/auth/check',{});showGold(result.gold);if(!commanderLoaded)void loadCommander();return true}catch(e){if(/giriş yap|Oturumun sona erdi|401/.test(e.message)){clearExpiredLogin();return false}notify('Sunucuya bağlanılamadı. Tekrar dene.');return false}}
function renderLobbyIdentity(){
 const active=signedIn(),bar=$('account-bar');if(!bar)return;
 bar.hidden=!active;
 if(!active){$('account-name').textContent='';$('account-meta').textContent='';return;}
 const name=window.HeroPlatform&&login.type==='guest'&&login.user?.name==='Oyuncu'?'Player':login.user?.name||uiText('Oyuncu'),provider=login.type==='crazygames'?'CrazyGames':login.type==='google'?'Google':'Misafir';
 const chosen=commanderOptions.find(c=>c.id===commanderProfile?.commanderId);
 $('account-name').textContent=name;
 $('account-meta').textContent=provider+(chosen?' · '+chosen.name+' · Sv. '+commanderAbilityStats(commanderProfile).level:'');
 $('account-status').setAttribute('aria-label',name+' · '+provider+' · Hesap menüsünü aç');
 const portrait=chosen?commanderPortrait(chosen.id):'/images/lobby-crest.svg';
 if($('account-avatar').getAttribute('src')!==portrait)$('account-avatar').src=portrait;
 if(chosen&&$('nav-commander-portrait').getAttribute('src')!==portrait)$('nav-commander-portrait').src=portrait;
}
function applyLogin(){const walletChanged=headerWallet.setLogin(login);if(walletChanged&&signedIn())void refreshGold();storefrontUI.setLogin(login);if(room)storefrontUI.close();window.dispatchEvent?.(new Event('hero:login-changed'));roomInvitesUI.setLogin(login);roomInvitesUI.setRoom(room,session?.token);friendsUI.setLogin(login);friendsUI.setRoom(room);if(!room){cancelAwardFlights();tailReveal?.cancel();tailReveal=null;cancelAuctionReveal($('stage'));}const active=signedIn();if(!room)window.HeroPlatform?.gameplay(false);if(!room)window.HeroPlatform?.setRoom(null);const wallet=$('gold-wallet');if(wallet)wallet.hidden=!active;$('login-gate').hidden=active;$('home').hidden=!active||!!room;$('game').hidden=!active||!room;$('account-status').hidden=!active;$('google-logout').hidden=true;$('account-status').setAttribute('aria-expanded','false');if(active){$('name').value=login.user?.name||'Oyuncu';$('name').readOnly=login.type==='google'||login.type==='crazygames';}renderLobbyIdentity();commanderVisibility();}
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
let restorePending=null;
function restoreGame(){
 if(webInvite?.pending){webInvite.sync();return signedIn()?validateLogin().then(()=>webInvite.sync()):Promise.resolve();}
 if(restorePending)return restorePending;
 restorePending=restoreSavedGame().finally(()=>{restorePending=null});return restorePending;
}
async function readSavedRoom(){
 let stored;try{stored=JSON.parse(localStorage.getItem('hero-auction-session')||'null')}catch{return null}
 if(!stored?.token||!stored?.code)return null;
 try{const j=await post('/api/state',stored);return {token:stored.token,room:j.room};}
 catch(e){
  if(e.message==='Oda bulunamadı.'||e.message==='Oyuncu yetkisi geçersiz.'){
   // Do not erase a different seat written while this request was pending.
   if(localStorage.getItem('hero-auction-session')===JSON.stringify(stored))localStorage.removeItem('hero-auction-session');
   return null;
  }
  throw e;
 }
}
async function restoreSavedGame(){
 const auth=login?.authToken,initialSession=session,initialRoom=room;
 if(!signedIn()||!await validateLogin()||webInvite?.pending||login?.authToken!==auth)return;
 try{
  const previous=await readSavedRoom();
  if(webInvite?.pending||login?.authToken!==auth||session!==initialSession||room!==initialRoom)return;
  if(previous)save(previous.token,previous.room);
 }catch(e){
  if(login?.authToken!==auth)return;
  if(/giriş yap|Oturumun sona erdi|401/.test(e.message))clearExpiredLogin();
  else notify('Bağlantı kurulamadı. Biraz sonra tekrar dene.');
 }
}
const homePlayTab=$('home-play-tab'),homePlayPanel=$('home-play-panel');
$('lobby-home').setAttribute('aria-label','Hero Auction · '+uiText('Ana menü'));
// Stay in this document (including CrazyGames); never reload or reset the account.
// The existing leave action owns confirmation, detach and stale-session handling.
$('lobby-home').onclick=async()=>{
 const button=$('lobby-home');
 if(button.disabled||$('leave').disabled||roomEntryPending>0||roomInvitesUI.busy||commanderBusy)return;
 button.disabled=true;
 const auth=login?.authToken;
 try{
  if(session||room){
   await $('leave').onclick();
   if(session||room||login?.authToken!==auth)return;
  }
  commanderProfileOpen=false;
  friendsUI.close();
  storefrontUI.close();
  webInvite?.cancel();
  homePlayPanel.hidden=true;
  homePlayTab.setAttribute('aria-expanded','false');
  homePlayTab.classList.remove('selected');
  $('google-logout').hidden=true;
  $('account-status').setAttribute('aria-expanded','false');
  commanderVisibility();
  window.scrollTo({top:0,behavior:'instant'});
 }finally{button.disabled=false;}
};

const homeGuidePlay=$('home-guide-play');if(homeGuidePlay)homeGuidePlay.onclick=()=>{if(homePlayPanel.hidden)homePlayTab.click();else homePlayPanel.scrollIntoView({behavior:'smooth',block:'start'});};
if(homePlayTab&&homePlayPanel){homePlayTab.onclick=()=>{storefrontUI.close();friendsUI.close();homePlayPanel.hidden=false;homePlayTab.setAttribute('aria-expanded','true');homePlayTab.classList.add('selected');homePlayPanel.scrollIntoView({behavior:'smooth',block:'start'});};const lobbyBack=$('play-lobby-back');if(lobbyBack)lobbyBack.onclick=()=>{webInvite?.cancel();homePlayPanel.hidden=true;homePlayTab.setAttribute('aria-expanded','false');homePlayTab.classList.remove('selected');homePlayTab.scrollIntoView({behavior:'smooth',block:'start'});};}
webInvite=createWebInvite({
 url:location.href,platform:!!window.HeroPlatform,
 view:state=>{if(!window.HeroPlatform)renderWebInvite(document,state);},
 identity:()=>({authToken:login?.authToken,ready:signedIn()&&commanderLoaded&&!!commanderProfile&&!commanderProfileOpen&&!room}),
 validate:validateLogin,savedRoom:readSavedRoom,
 join:code=>post('/api/join',{name:$('name').value,code}),save,
 clearUrl:()=>{const url=new URL(location.href);url.searchParams.delete('join');history.replaceState(history.state,'',url.pathname+url.search+url.hash);},
 restore:()=>restoreGame()
});
$('join-invite-button').onclick=()=>void webInvite.accept();
$('join-invite-cancel').onclick=()=>webInvite.cancel();
$('join-invite-notice-cancel').onclick=()=>webInvite.cancel();
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
// A signal only: never accept balances or receipt amounts from an event.
window.addEventListener('hero:wallet-refresh',()=>void refreshGold());

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
async function post(url,data){
 const entry=['/api/create','/api/join','/api/match','/api/bot','/api/rematch','/api/room/detach'].includes(url);
 if(entry&&(roomEntryPending||roomInvitesUI.busy))throw Error(uiText('Oda işlemi sürüyor. Lütfen bekle.'));
 if(entry)roomEntryPending++;
 const walletTicket=headerWallet.begin(login?.authToken);
 try{const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...gameIdentity(),...data})});const j=await res.json();if(!res.ok){const error=Error(j.error||'İşlem başarısız');error.status=res.status;throw error;}if(url!=='/api/wallet')headerWallet.receive(j,walletTicket,{mutation:['/api/commander/select','/api/commander/change','/api/commander/upgrade','/api/diamonds/exchange','/api/login-rewards/claim'].includes(url)});return j}
 finally{if(entry)roomEntryPending--;}
}
function save(token,r){session={token,code:r.code};localStorage.setItem('hero-auction-session',JSON.stringify(session));show(r);connect();refreshOnline()}
async function syncRoomSnapshot({force=false}={}){
 const current=session,auth=login?.authToken;if(!current)return;
 const result=await post('/api/state',current);
 if(session!==current||login?.authToken!==auth)return;
 const next=result.room;
 if(force||next?.revision!==room?.revision||next?.matchKey!==room?.matchKey||next?.phase!==room?.phase||next?.round!==room?.round||next?.chat?.length!==room?.chat?.length)show(next);
}
// Guard reconnects against stale room and account sessions.
function connect(){stream?.close();if(!session)return;
 const current=session,auth=login?.authToken,source=new EventSource(`/api/events?code=${encodeURIComponent(current.code)}&token=${encodeURIComponent(current.token)}&authToken=${encodeURIComponent(auth||'')}`);stream=source;
 source.onmessage=e=>{if(stream!==source||session!==current||login?.authToken!==auth)return;try{show(JSON.parse(e.data))}catch{}};
 source.onerror=()=>{
  if(stream!==source||source.__rechecking)return;source.__rechecking=true;
  setTimeout(async()=>{
   if(stream!==source||session!==current||login?.authToken!==auth)return;
   try{await syncRoomSnapshot();}catch(e){
    if(stream===source&&session===current&&login?.authToken===auth&&(e.message==='Oda bulunamadı.'||e.message==='Oyuncu yetkisi geçersiz.')){
     source.close();localStorage.removeItem('hero-auction-session');session=null;room=null;applyLogin();notify('Oyun odası artık mevcut değil. Yeni bir oyun oluşturabilirsin.');
    }
   }finally{source.__rechecking=false;}
  },3000);
 };
}
function cancelAwardFlights(){for(const flight of awardFlights)flight.cancel();awardFlights.clear();seenAwardFlights.clear();}
function awardDestination(seat,me){return document.querySelector('#player'+displaySeat(seat,me)+' .teams')||$('player'+displaySeat(seat,me));}
function animateWonAuctionCard(award,me,sourceSnapshot){
 const key=award.code+':'+award.round+':'+award.seat+':'+award.card.universe+':'+award.card.name;
 if(seenAwardFlights.has(key)||!sourceSnapshot)return Promise.resolve();
 seenAwardFlights.add(key);
 const flight=flyAwardCard(sourceSnapshot,awardDestination(award.seat,me),{duration:1400,reducedMotion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,label:award.seat===me?(document.documentElement.lang==='en'?'Your team':'Senin takımın'):(document.documentElement.lang==='en'?'Opponent team':'Rakip takım')});
 awardFlights.add(flight);return flight.finished.finally(()=>awardFlights.delete(flight));
}
function show(r){if(!signedIn()||!r||(session&&session.code!==r.code)||isStaleAuctionSnapshot(room,r))return;storefrontUI.close();roomInvitesUI.setRoom(r,session?.token);friendsUI.setRoom(r);if(tailReveal?.active&&r.phase==='finished'&&room?.code===r.code&&tailReveal.matchKey===auctionMatchKey(r)&&tailReveal.signature===JSON.stringify(r.final)){room=r;renderChat(r);return;}tailReveal?.cancel();tailReveal=null;const tailAwards=tailReceipts.pending(r,collectTailAwards(room,r));
 if(room?.code!==r.code||(r.phase==='auction'&&room?.phase!=='auction')||(r.phase==='auction'&&r.round<room?.round))cancelAwardFlights();
 const offeredAwards=collectOfferedAwards(room,r),offeredArt=document.querySelector('#stage .card-art');
 const deliveryCounts=r.phase==='finished'?(r.final||[]).map((p,seat)=>p.team.length-tailAwards.filter(a=>a.seat===seat).length-offeredAwards.filter(a=>a.seat===seat).length):[];
 const offeredSnapshot=offeredArt?{element:offeredArt.cloneNode(true),rect:offeredArt.getBoundingClientRect()}:null;
 cancelAuctionReveal($('stage'));$('game').classList.remove('auction-results-only','auction-delivery-active');
 // A background tab must not consume unseen receipts; visibility resumes them.
 if(document.hidden&&r.phase==='finished'&&tailAwards.length){room=r;return;}
 // Keep the auction presentation until every already-awarded card has opened.
 // Authoritative state still advances immediately; no bidding or server timers are paused.
 if(r.phase==='finished'&&(tailAwards.length||offeredAwards.length||awardFlights.size)){
  room=r;window.HeroPlatform?.setRoom(r);window.HeroPlatform?.gameplay(false);refreshGold();
  offeredAwards.forEach(award=>animateWonAuctionCard(award,r.me,offeredSnapshot));
  let deliveryController;
  const previousFlights=Promise.all([...awardFlights].map(flight=>flight.finished));
  const stage=$('stage');$('game').dataset.phase='auction';$('login-gate').hidden=true;$('home').hidden=true;$('game').hidden=false;$('room-title').textContent=r.code;
  stage.querySelectorAll('button,input').forEach(control=>control.disabled=true);
  if(offeredArt)offeredArt.style.visibility='hidden';
  const receiveCard=({card,seat})=>{
   const box=$('player'+displaySeat(seat,r.me));deliveryCounts[seat]++;
   box.querySelector('.delivery-count').textContent=deliveryCounts[seat]+' / 5';
   box.querySelector('.delivery-slot').innerHTML=`<span translate="no" class="delivered-card rarity-${esc(card.rarity||'common')}">✓ ${esc(card.name)}</span>`;
  };
  // The already-open offered card was allocated too; reflect it when its flight arrives.
  const startAfter=previousFlights.then(()=>{
   if(tailReveal!==deliveryController||!tailReveal?.active||room?.code!==r.code||room?.phase!=='finished')return;
   for(const child of [...stage.children])if(!child.classList.contains('auction-tail-sequence'))child.remove();
   $('game').classList.add('auction-delivery-active');
   for(let visual=0;visual<2;visual++){
    const seat=visual===0?r.me:1-r.me,p=r.final[seat];
    $('player'+visual).innerHTML=`<div class="name">${esc(displayPlayerName(p,r.mode==='bot'&&seat===1))}</div><div class="delivery-count">${deliveryCounts[seat]} / 5</div><div class="delivery-slot" role="status">${document.documentElement.lang==='en'?'Receiving cards':'Kartlar geliyor'}</div>`;
   }
   offeredAwards.forEach(receiveCard);
  });

  $('phase').textContent=document.documentElement.lang==='en'?'REMAINING HEROES':'KALAN KAHRAMANLAR';renderChat(r);
  tailReveal=mountTailReveal(stage,null,tailAwards,{english:document.documentElement.lang==='en',me:r.me,reducedMotion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,startAfter,resolveDestination:seat=>$('player'+displaySeat(seat,r.me)).querySelector('.delivery-slot'),onArrive:award=>{receiveCard(award);tailReceipts.received(r,[award]);},onComplete:({restoreFocus}={})=>{
   tailReceipts.received(r,tailAwards);cancelAwardFlights();tailReveal=null;show(room);
   if(restoreFocus)$('confirm-arena-entry')?.focus({preventScroll:true});
  },loadArt:async card=>{
   const response=await fetch('/api/art?universe='+encodeURIComponent(card.universe)+'&name='+encodeURIComponent(card.name));
   return response.ok?(await response.json()).url:null;
  }});deliveryController=tailReveal;tailReveal.matchKey=auctionMatchKey(r);tailReveal.signature=JSON.stringify(r.final);return;
 }
 if(r.phase==='finished')tailReceipts.received(r,tailAwards);
 window.HeroPlatform?.gameplay(r.phase==='auction');const currentCardKey=r.phase==='auction'?r.code+':'+r.round+':'+r.card?.name:null;const isNewCard=!!currentCardKey&&currentCardKey!==lastCardKey;lastCardKey=currentCardKey;const wasFinished=room?.phase==='finished'&&room?.code===r.code;const enteredAuction=r.phase==='auction'&&(room?.phase!=='auction'||room?.code!==r.code||room?.round>r.round);room=r;$('game').dataset.phase=r.phase;window.HeroPlatform?.setRoom(r);if(window.HeroPlatform)commanderVisibility();if(enteredAuction)refreshGold();if(r.phase==='finished'&&!wasFinished){refreshGold();}
 for(let i=0;i<2;i++){const seat=r.me===1?1-i:i;const p=r.players[seat];$('player'+i).className='player player-side'+(r.me===seat?' me':'')+(r.phase==='auction'&&r.turn===seat?' active-turn':'');$('player'+i).innerHTML=p?`<div class="name">${esc(displayPlayerName(p,r.mode==='bot'&&seat===1))} ${r.me===seat?'(SEN)':''}</div><div class="credit">${p.credits} <small>kalan kredi</small></div><div class="spent-credit">💸 ${20-p.credits} kredi kullanıldı</div><div class="side-team-title">🎴 KARTLAR (${p.team.length})</div><div class="teams">${p.team.map(x=>`<span class="side-hero"><span class="side-hero-name">${esc(x.name)} <small class="rarity rarity-${esc(x.rarity||'common')}">${rarityLabel(x.rarity)}</small></span><small class="side-hero-role">${esc(specialtyLabel(x))}</small><span class="side-hero-cost">${Number(x.cost)||0} <small>kredi</small></span></span>`).join('')||'Henüz karakter yok'}</div>`:'<div class="name">2. OYUNCU</div><p class="status">Katılması bekleniyor…</p>'}
 for(const award of offeredAwards)animateWonAuctionCard(award,r.me,offeredSnapshot);
 if(r.phase==='finished'&&r.final?.length===2&&r.final.every(p=>p.team?.length===5)&&session?.token){
  $('game').classList.add('auction-results-only');
  renderChat(r);$('login-gate').hidden=true;$('home').hidden=true;$('game').hidden=false;
  $('room-title').textContent=r.code;$('phase').textContent='KAHRAMAN GÜÇLERİ · ARENA ONAYI';
  const stage=$('stage');
  stage.innerHTML=`<section class="auction-summary"><h2>${document.documentElement.lang==='en'?'Auction calculation':'Açık artırma hesaplaması'}</h2>${auctionCalculationMarkup(r.final.map((p,seat)=>({...p,name:displayPlayerName(p,r.mode==='bot'&&seat===1)})),r.me,{english:document.documentElement.lang==='en'})}<button type="button" id="confirm-arena-entry" class="primary">${document.documentElement.lang==='en'?'CONFIRM AND ENTER ARENA':'ONAYLA VE ARENAYA GEÇ'}</button></section>`;
  const entryButton=stage.querySelector('#confirm-arena-entry');
  entryButton.onclick=()=>{if(tailReveal?.active)return;const params=new URLSearchParams({auctionCode:r.code,auctionToken:session.token});window.HeroPlatform?.beforeNavigate('/battle-preview.html?'+params.toString());location.assign('/battle-preview.html?'+params.toString())};
  return;
 }renderChat(r);$('login-gate').hidden=true;$('home').hidden=true;$('game').hidden=false;$('room-title').textContent=r.code;$('phase').textContent=['waiting','matching'].includes(r.phase)?'RAKİP BEKLENİYOR':r.phase==='finished'?'MAÇ TAMAMLANDI':`${worldNames[r.universe]} · KART ${r.round+1}/10`;

$('log').innerHTML=[...r.history].reverse().map(x=>`<div class="event">${esc(x)}</div>`).join('')||'<div class="event">Oyun henüz başlamadı.</div>';
const stage=$('stage');
if(['waiting','matching'].includes(r.phase)){stage.innerHTML='<div class="card-art">⌛</div><h2>ARKADAŞINI DAVET ET</h2><p class="status">Arkadaşına davet bağlantısını gönder. Bağlantıyı açtığında oda kodu hazır olacak.</p><div class="big-bid">'+esc(r.code)+'</div><div class="controls"><button class="primary" id="invite-room">📲 ARKADAŞINI DAVET ET</button></div>';$('invite-room').onclick=()=>shareInvite(r.code);return}
if(r.phase==='finished'){const [a,b]=r.final;const tied=a.score===b.score;const winnerIndex=tied?-1:(a.score>b.score?0:1);const winner=winnerIndex<0?'BERABERE':r.final[winnerIndex].name;const iWon=winnerIndex===r.me;const reward=legacyRewardCopy(r,tied,iWon);const emblem='<div class="victory-emblem" aria-hidden="true"><span class="victory-rays"></span><svg viewBox="0 0 180 180" role="presentation" focusable="false"><defs><linearGradient id="victoryGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4af4f1"/><stop offset=".5" stop-color="#bca0ff"/><stop offset="1" stop-color="#ff6ec3"/></linearGradient></defs><path d="M90 10 154 47 154 122 90 160 26 122 26 47Z" fill="#101a36" stroke="url(#victoryGradient)" stroke-width="4"/><path d="M90 26 140 55 140 113 90 143 40 113 40 55Z" fill="none" stroke="#5ceef0" stroke-opacity=".32" stroke-width="2"/><path d="M90 40 104 75 139 77 111 99 121 134 90 114 59 134 69 99 41 77 76 75Z" fill="url(#victoryGradient)" stroke="#d7faff" stroke-width="2"/><path d="M90 2v17M90 161v17M2 90h19M159 90h19" stroke="#64edf6" stroke-width="3" stroke-linecap="round"/></svg></div>';stage.innerHTML=`<section class="victory-screen"><div class="victory-kicker">✦ ARENA SONUCU ✦</div>${emblem}<div class="victory-heading">${tied?'MÜCADELE BERABERE BİTTİ':iWon?'ZAFER SENİN!':'MAÇ TAMAMLANDI'}</div><p class="victory-subtitle">${tied?'İki takım aynı güce ulaştı.':esc(winner)+' bu mücadeleyi kazandı.'}</p><div class="results victory-results"><div class="${winnerIndex===0?'victory-leader':''}"><span class="victory-player-label">${winnerIndex===0?'✦ KAZANAN':'OYUNCU 1'}</span><span class="victory-player-name">${esc(a.name)}</span><strong>${a.score}</strong><small>TOPLAM PUAN</small></div><div class="${winnerIndex===1?'victory-leader':''}"><span class="victory-player-label">${winnerIndex===1?'✦ KAZANAN':'OYUNCU 2'}</span><span class="victory-player-name">${esc(b.name)}</span><strong>${b.score}</strong><small>TOPLAM PUAN</small></div></div><div class="victory-reward ${iWon?'reward-earned':''}"><span class="reward-coin">🪙</span><div><strong>${esc(reward.headline)}</strong><small>${esc(reward.detail)}</small></div></div>${r.mode==='bot'?'<div class="victory-rank">🤖 Antrenman maçı · Lig puanı değişmez</div>':`<div class="victory-rank">🏅 LİG PUANI ${r.rankChange?.map((d,i)=>`<span>${esc(r.players[i]?.name||"Oyuncu")} <b class="${d>=0?"rank-plus":"rank-minus"}">${d>=0?"+":""}${d}</b> (${(r.rankBefore?.[i]??1000)+d})</span>`).join(" · ")||"Hesaplanıyor"}</div>`}<p class="victory-scoreline">PUAN FARKI <b>${Math.abs(a.score-b.score)}</b> <span>•</span> SERİ <b>${r.series[0]} - ${r.series[1]}</b></p><div class="final-teams victory-teams">${[a,b].map(p=>`<section class="final-team"><h3>${esc(p.name)}</h3>${p.team.map(c=>`<div class="final-hero"><span><span class="mini-hero-icon">${emojis[c.universe]||'✦'}</span>${esc(c.name)} <small class="rarity rarity-${esc(c.rarity||'common')}">${rarityLabel(c.rarity)}</small></span><b>${c.power}/100</b></div>`).join('')}<div class="final-hero"><span>Kalan kredi bonusu (${p.credits} × 10)</span><b>+${p.credits*10}</b></div><div class="final-hero total"><span>GENEL TOPLAM</span><b>${p.score}</b></div></section>`).join('')}</div><p class="status victory-rematch-note">${r.mode==='bot'?'Bilgisayara karşı hemen yeniden oynayabilirsin.':r.rematch[r.me]?'Rövanş isteğin gönderildi. Rakibin onayı bekleniyor.':r.rematch[1-r.me]?'Rakibin rövanş istiyor. Onaylarsan yeni maç başlayacak.':'Yeni maç için iki oyuncunun da onayı gerekiyor.'}</p><div class="controls victory-controls"><button class="primary" id="rematch">${r.rematch[r.me]?'ONAYIN GÖNDERİLDİ':r.rematch[1-r.me]?'RÖVANŞI KABUL ET':'⚔ AYNI RAKİPLE TEKRAR OYNA'}</button></div><div id="rematch-series" class="victory-scoreline" role="status" aria-label="Rövanş serisi" style="display:block!important;visibility:visible!important;margin:18px auto;padding:18px;border:2px solid #58dfff;border-radius:14px;background:#11233b;color:#fff;text-align:center;font-size:1.12rem;font-weight:700">🏆 RÖVANŞ SERİSİ <div style="margin-top:10px">${esc(r.players[r.me]?.name||"Sen")} &nbsp; <strong style="font-size:1.7rem">${Number(r.series?.[r.me]||0)} – ${Number(r.series?.[1-r.me]||0)}</strong> &nbsp; ${esc(r.players[1-r.me]?.name||"Rakip")}</div></div></section>`; $('rematch').disabled=!!r.rematch[r.me];$('rematch').onclick=()=>act('/api/rematch',{});return}
const card=r.card;const canBid=r.turn===r.me;const min=r.topBid+1;const max=r.players[r.me].credits;const art=`<div class="hero-art-placeholder">${emojis[card.universe]}<small>Görsel yükleniyor…</small></div>`;
const timer=`<p class="status" id="turntimer">⏱ ${Math.max(0,Math.ceil((r.deadline-Date.now())/1000))} saniye</p>`;const status=r.topBid?`En yüksek teklif: <b>${r.topBid} kredi</b> · <span translate="no">${esc(displayPlayerName(r.players[r.topSeat],r.mode==='bot'&&r.topSeat===1))}</span>`:'Henüz teklif yok';
stage.innerHTML=`<div class="auction-main"><div class="auction-hero"><div class="eyebrow">KART ${r.round+1} / 10</div><div class="auction-deck-scene rarity-frame-${esc(card.rarity||'common')}">${auctionDeckMarkup(r.round,document.documentElement.lang==='en')}<div class="auction-draw-back" aria-hidden="true"><b>✦</b></div><div class="card-art rarity-frame rarity-frame-${esc(card.rarity||'common')}">${art}</div></div><div class="card-name">${esc(card.name)}</div><span class="tag">${worldNames[card.universe]} · 🔒 GÜÇ GİZLİ</span><span class="rarity rarity-${esc(card.rarity||'common')} rarity-feature">✦ ${rarityLabel(card.rarity)}</span><span class="tag" id="auction-lane-bonuses">ÖN / ARKA SAF BONUSLARI YÜKLENİYOR…</span><div class="auction-abilities" id="auction-abilities" style="display:grid;gap:4px;margin:6px 0;font-size:.86rem;line-height:1.35"><div id="auction-active">⚔ Aktif yetenek yükleniyor…</div><div id="auction-passive">✦ Pasif yetenek yükleniyor…</div></div><p class="status hero-description" id="hero-description">${esc(document.documentElement.lang==='en'?heroDescriptionEnglish(card):card.description||"Karakter bilgisi yükleniyor…")}</p></div><div class="auction-action"><div class="auction-budget" aria-label="Kalan krediler"><div class="auction-budget-own"><small>Senin kredin</small><strong>${r.players[r.me].credits}</strong></div><div class="auction-budget-rival"><small>Rakibin kredisi</small><strong>${r.players[1-r.me].credits}</strong></div></div><p class="status">${status}</p>${timer}${canBid&&max>=min?`<div class="bid-stepper"><button id="minusbid" type="button" aria-label="Teklifi azalt">−</button><div class="big-bid" id="bidview">${min} KREDİ</div><button id="plusbid" type="button" aria-label="Teklifi artır">+</button></div><input id="bidrange" class="range" type="range" min="${min}" max="${max}" value="${min}" step="1"><div class="controls"><button class="primary" id="bidbutton">${r.topBid?'TEKLİFİ ARTIR':'AÇILIŞ TEKLİFİ VER'} →</button><button class="danger" id="passbutton">PAS</button></div>`:canBid?'<p class="status">Bütçen artırmaya yetmiyor. İhale otomatik kapanıyor.</p>':`<p class="status">⏳ Teklif sırası: <b translate="no">${esc(displayPlayerName(r.players[r.turn],r.mode==='bot'&&r.turn===1))}</b><br>Rakibin kararını bekle.</p>`}</div></div>`;
revealAuctionCard(stage,{round:r.round,newCard:isNewCard,reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches});
loadHeroInfo(card);
if(canBid&&max>=min){$('bidrange').oninput=e=>$('bidview').textContent=e.target.value+' KREDİ';$('bidbutton').onclick=()=>{playAuctionActionSound('bid');void act('/api/bid',{amount:Number($('bidrange').value)})};$('minusbid').onclick=()=>{const el=$('bidrange');el.value=Math.max(min,Number(el.value)-1);el.oninput({target:el})};$('plusbid').onclick=()=>{const el=$('bidrange');el.value=Math.min(max,Number(el.value)+1);el.oninput({target:el})};$('passbutton').onclick=()=>{playAuctionActionSound('pass');void act('/api/pass',{})}}
}
function renderChat(r){const panel=$('chat-panel');if(!panel)return;panel.hidden=r.mode==='bot'||Boolean(window.HeroPlatform?.disableChat);if(panel.hidden)return;const list=$('chat-messages');const oldCount=Number(list.dataset.count||0);const messages=r.chat||[];if(oldCount!==messages.length||list.dataset.room!==r.code){const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;list.innerHTML=messages.map(m=>`<div class="chat-line ${m.seat===r.me?'chat-mine':''}"><span class="chat-author">${esc(m.name)} · ${new Date(m.time).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span><span class="chat-text">${esc(m.message)}</span></div>`).join('')||'<p class="status">Henüz mesaj yok. Rakibine merhaba de!</p>';list.dataset.count=String(messages.length);list.dataset.room=r.code;if(nearBottom||!oldCount)list.scrollTop=list.scrollHeight;}}
let chatSending=false;
$('chat-send').onclick=async()=>{if(!session||room?.mode==='bot'||chatSending||window.HeroPlatform?.disableChat)return;const input=$('chat-input');const message=input.value.trim();if(!message)return;chatSending=true;$('chat-send').disabled=true;try{const result=await post('/api/chat',{...session,message});input.value='';show(result.room);}catch(e){notify('Sohbet mesajı gönderilemedi: '+e.message)}finally{chatSending=false;$('chat-send').disabled=false}};
// Recover game progress as well as chat when a proxy drops SSE (also in bot games).
setInterval(()=>{if(!session||!room||document.hidden)return;void syncRoomSnapshot().catch(()=>{});},4000);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){cancelAwardFlights();tailReveal?.cancel();tailReveal=null;cancelAuctionReveal($('stage'));return;}
 if(room?.phase==='finished')show(room);
 void syncRoomSnapshot().catch(()=>{});
});
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
async function act(url,extra){const current=session,auth=login?.authToken;try{const j=await post(url,{...current,...extra});if(session===current&&login?.authToken===auth)show(j.room)}catch(e){if(session===current&&login?.authToken===auth)notify(e.message)}}

$('create').onclick=async()=>{if(!await validateLogin())return;try{const j=await post('/api/create',{...gameIdentity(),name:$('name').value,universe:world});save(j.token,j.room)}catch(e){notify(e.message)}};
$('join').onclick=async()=>{if(webInvite?.pending)return;if(!await validateLogin())return;try{const j=await post('/api/join',{...gameIdentity(),name:$('name').value,code:$('roomcode').value.trim().toUpperCase()});save(j.token,j.room)}catch(e){notify(e.message)}};
$('bot').onclick=async()=>{if(!await validateLogin())return;try{const j=await post('/api/bot',{...gameIdentity(),name:$('name').value,universe:world,difficulty:$('bot-difficulty').value});save(j.token,j.room)}catch(e){notify(e.message)}};
$('match').onclick=async()=>{if(!await validateLogin())return;try{const j=await post('/api/match',{...gameIdentity(),name:$('name').value,universe:world});save(j.token,j.room)}catch(e){notify(e.message)}};
setInterval(()=>{if(room?.phase==='auction'&&room.deadline){const el=$('turntimer');if(el)el.textContent='⏱ '+Math.max(0,Math.ceil((room.deadline-Date.now())/1000))+' saniye'}},250);
const inviteSharer=createInviteSharer({origin:location.origin,navigator,notify,
 showLink:link=>window.prompt('Davet bağlantısını kopyalayıp WhatsApp sohbetine yapıştır:',link)
});
async function shareInvite(code){
 if(window.HeroPlatform){try{const link=await window.HeroPlatform.inviteLink(code);await navigator.clipboard.writeText(link);notify('Davet bağlantısı kopyalandı.')}catch{notify('Davet bağlantısı kopyalanamadı. CrazyGames davet düğmesini kullan.')}return}
 await inviteSharer.share(code);
}
if(!window.HeroPlatform){
 const copy=document.createElement('button');copy.id='copy-invite-link';copy.className='outline';copy.textContent='🔗 DAVET BAĞLANTISINI KOPYALA';
 copy.onclick=()=>{if(room)void inviteSharer.copy(room.code)};
 $('share').after(copy);
}
$('share').textContent='📲 ARKADAŞINI DAVET ET';
$('share').onclick=()=>{if(room)shareInvite(room.code)};
$('leave').onclick=async()=>{if($('leave').disabled)return;if(!confirm(uiText('Bu cihazda odadan ayrılmak istiyor musun?')))return;const leaving=session,auth=login?.authToken;$('leave').disabled=true;try{if(leaving)await post('/api/room/detach',leaving);if(session!==leaving||login?.authToken!==auth)return;window.HeroPlatform?.setRoom(null);localStorage.removeItem('hero-auction-session');stream?.close();session=null;room=null;applyLogin();refreshOnline();void roomInvitesUI.refresh(true)}catch(e){notify(e.message)}finally{$('leave').disabled=false}};

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
  if(!result)result=await post('/api/auth/guest',{name:'Player'});
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
 discardPlatformSeat();window.HeroPlatform.beforeNavigate?.('/crazygames/');location.replace('/crazygames/');
});
// End CrazyGames session bridge.

(async()=>{try{const r=await fetch('/api/info');const j=await r.json();renderLobbyEconomy(j.victoryChests);$('catalogue').textContent=`Şu anda ${j.catalogueCount} özgün kahraman hazır`;}catch{renderLobbyEconomy(null)}if(window.HeroPlatform)await startPlatform();else await restoreGame();loadPokeMap();refreshOnline()})();

async function loadHeroInfo(card){
 const key=card.universe+':'+card.name;
 if(!infoMemo.has(key)){
  try{const response=await fetch('/api/art?universe='+encodeURIComponent(card.universe)+'&name='+encodeURIComponent(card.name));if(!response.ok)throw Error('Karakter bilgisi alınamadı');infoMemo.set(key,await response.json())}
  catch{infoMemo.set(key,{url:null,description:null})}
 }
 if(!room||room.phase!=='auction'||room.card?.name!==card.name||room.card?.universe!==card.universe)return;
 const data=infoMemo.get(key);
 const desc=document.getElementById('hero-description');
 if(desc)desc.textContent=document.documentElement.lang==='en'?heroDescriptionEnglish(card):data?.description||card.description||card.name+' hakkında doğrulanmış kısa açıklama henüz eklenmedi.';

 const activeNode=document.getElementById('auction-active'),passiveNode=document.getElementById('auction-passive');
 if(activeNode)activeNode.textContent='⚔ Aktif: '+abilityImpact(data?.active,{compact:true});
 if(passiveNode)passiveNode.textContent='✦ Pasif: '+abilityImpact(data?.passive,{compact:true});
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
 if(type==='friends'){friendsUI.open();return;}
 const el=$('social-content');if(!el)return;
 el.textContent='Yükleniyor…';
 try{
  const api={profile:'/api/profile',leaders:'/api/leaderboard',friends:'/api/friends',live:'/api/spectate/list'}[type];
  const data=await post(api,{});
  if(type==='profile'){
   const p=data.profile;el.innerHTML='<h3>'+('<span translate="no">'+socialEsc(p.name)+'</span>')+' · '+socialEsc(p.tier)+'</h3><p>Lig puanı: '+p.rating+' · Galibiyet: '+p.wins+' · Mağlubiyet: '+p.losses+' · Beraberlik: '+p.draws+'</p><h4>Son 20 maç</h4>'+((data.history||[]).map(m=>'<p>'+new Date(m.at).toLocaleDateString('tr-TR')+' · '+socialEsc(m.universe)+' · '+('<span translate="no">'+socialEsc(m.participants.map(p=>p.name+' ('+p.score+')').join(' - '))+'</span>')+'</p>').join('')||'<p>Henüz maç yok.</p>');
  }else if(type==='leaders'){
   el.innerHTML='<h3>Lig sıralaması</h3>'+((data.players||[]).map((p,i)=>'<p>'+(i+1)+'. '+('<span translate="no">'+socialEsc(p.name)+'</span>')+' · '+socialEsc(p.tier)+' · '+p.rating+' puan</p>').join('')||'<p>Henüz sıralama yok.</p>');
  }else{
   el.innerHTML='<h3>Canlı maçlar</h3>'+((data.matches||[]).map(m=>'<p>'+('<span translate="no">'+socialEsc(m.players.join(' - '))+'</span>')+' · '+socialEsc(m.universe)+' · Kart '+(m.round+1)+'/10 <button class="outline watch-match" data-code="'+socialEsc(m.code)+'">İZLE</button></p>').join('')||'<p>Şu anda izlenebilir maç yok.</p>')+'<div id="watch-content"></div>';
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

window.addEventListener('pageshow',event=>{if(event.persisted)void refreshGold();if(event.persisted&&session){if(room)show(room);void syncRoomSnapshot({force:true}).catch(()=>{});}});
