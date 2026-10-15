const $=id=>document.getElementById(id);
let session=null,room=null,stream=null,world='mixed';
let lastCardKey=null;
const googleClientId='742640702245-3e3t9m7t29fbqlkubpcqtso63l8v8bv6.apps.googleusercontent.com';
let login=null;try{login=JSON.parse(localStorage.getItem('hero-auction-login')||'null')}catch{}
const signedIn=()=>!!login?.authToken;
let walletGold=0;
function showGold(value){walletGold=Math.max(0,Number(value)||0);const el=$('gold-balance');if(el)el.textContent=walletGold.toLocaleString('tr-TR');}
async function refreshGold(){if(!signedIn())return;try{const data=await post('/api/wallet',{});showGold(data.gold)}catch(e){console.warn('Gold balance unavailable:',e.message)}}
function clearExpiredLogin(){login=null;session=null;room=null;stream?.close();localStorage.removeItem('hero-auction-login');localStorage.removeItem('hero-auction-session');showGold(0);applyLogin();notify('Oturumun sona ermiş. Lütfen yeniden giriş yap.');}
async function validateLogin(){if(!signedIn())return false;try{const result=await post('/api/auth/check',{});showGold(result.gold);return true}catch(e){if(/giriş yap|Oturumun sona erdi|401/.test(e.message)){clearExpiredLogin();return false}notify('Sunucuya bağlanılamadı. Tekrar dene.');return false}}
function applyLogin(){const active=signedIn();const wallet=$('gold-wallet');if(wallet)wallet.hidden=!active;$('login-gate').hidden=active;$('home').hidden=!active||!!room;$('game').hidden=!active||!room;if(active){$('name').value=login.user?.name||'Oyuncu';$('name').readOnly=login.type==='google';$('account-status').textContent=(login.type==='google'?'Google: ':'Misafir: ')+(login.user?.name||'Oyuncu');}else{$('account-status').textContent='';}}
async function enterGuest(){try{const name=$('guest-name').value.trim()||'Oyuncu';const result=await post('/api/auth/guest',{name});login={type:'guest',user:result.user,authToken:result.authToken};localStorage.setItem('hero-auction-login',JSON.stringify(login));showGold(result.gold);applyLogin();restoreGame()}catch(e){notify(e.message)}}
$('guest-login').onclick=enterGuest;
$('google-logout').onclick=()=>{login=null;localStorage.removeItem('hero-auction-login');localStorage.removeItem('hero-auction-session');session=null;room=null;stream?.close();showGold(0);window.google?.accounts?.id?.disableAutoSelect();applyLogin()};
window.heroGoogleCallback=async response=>{try{const result=await post('/api/auth/google',{credential:response.credential});login={type:'google',user:result.user,authToken:result.authToken};localStorage.setItem('hero-auction-login',JSON.stringify(login));showGold(result.gold);applyLogin();restoreGame();notify('Google hesabınla giriş yaptın.')}catch(e){notify(e.message)}};
function initGoogle(attempt=0){if(!window.google?.accounts?.id){if(attempt<40)setTimeout(()=>initGoogle(attempt+1),500);return}window.google.accounts.id.initialize({client_id:googleClientId,callback:window.heroGoogleCallback});window.google.accounts.id.renderButton($('google-login'),{theme:'filled_black',size:'large',shape:'rectangular',text:'continue_with',logo_alignment:'left',width:400})}
function gameIdentity(){return signedIn()?{authToken:login.authToken}:{}}
async function restoreGame(){if(!signedIn()||!await validateLogin())return;try{session=JSON.parse(localStorage.getItem('hero-auction-session'));if(session){const j=await post('/api/state',{...session,...gameIdentity()});show(j.room);connect()}}catch(e){if(e.message.includes('giriş yap')||e.message.includes('Oturumun sona erdi')){login=null;localStorage.removeItem('hero-auction-login');localStorage.removeItem('hero-auction-session');session=null;room=null;applyLogin();notify('Oturum süren doldu. Yeniden giriş yap.')}else if(e.message==='Oda bulunamadı.'||e.message==='Oyuncu yetkisi geçersiz.'){localStorage.removeItem('hero-auction-session');session=null;room=null;applyLogin();notify('Önceki oda artık mevcut değil. Yeni bir maç oluşturabilirsin.')}else{notify('Bağlantı kurulamadı. Biraz sonra tekrar dene.')}}}
applyLogin();initGoogle();

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
const emojis={pokemon:'⚡',marvel:'🦸',dc:'🦇',lotr:'💍'};
const rarityNames={common:'SIRADAN',advanced:'GELİŞMİŞ',rare:'NADİR',legendary:'EFSANEVİ'};
const rarityLabel=r=>rarityNames[r]||'SIRADAN';
const worldNames={pokemon:'POKÉMON',marvel:'MARVEL',dc:'DC',lotr:'YÜZÜKLERİN EFENDİSİ',mixed:'KARMA EVREN'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notify=msg=>{const t=$('toast');t.textContent=msg;t.style.display='block';setTimeout(()=>t.style.display='none',3300)};
async function post(url,data){const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...gameIdentity(),...data})});const j=await res.json();if(!res.ok)throw Error(j.error||'İşlem başarısız');return j}
function save(token,r){session={token,code:r.code};localStorage.setItem('hero-auction-session',JSON.stringify(session));show(r);connect();refreshOnline()}
function connect(){stream?.close();if(!session)return;stream=new EventSource(`/api/events?code=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}&authToken=${encodeURIComponent(login?.authToken||'')}`);stream.onmessage=e=>{try{show(JSON.parse(e.data))}catch{}};stream.onerror=()=>{if(session&&!stream?.__rechecking){stream.__rechecking=true;setTimeout(async()=>{if(!session)return;try{await post('/api/state',session)}catch(e){if(e.message==='Oda bulunamadı.'||e.message==='Oyuncu yetkisi geçersiz.'){stream?.close();localStorage.removeItem('hero-auction-session');session=null;room=null;applyLogin();notify('Oyun odası artık mevcut değil. Yeni bir oyun oluşturabilirsin.')}}if(stream)stream.__rechecking=false},3000)}};}
function show(r){if(!signedIn())return;const currentCardKey=r.phase==='auction'?r.code+':'+r.round+':'+r.card?.name:null;const isNewCard=!!currentCardKey&&currentCardKey!==lastCardKey;lastCardKey=currentCardKey;const wasFinished=room?.phase==='finished'&&room?.code===r.code;const enteredAuction=r.phase==='auction'&&(room?.phase!=='auction'||room?.code!==r.code||room?.round>r.round);room=r;if(enteredAuction)refreshGold();if(r.phase==='finished'&&!wasFinished){refreshGold();}renderChat(r);$('login-gate').hidden=true;$('home').hidden=true;$('game').hidden=false;$('room-title').textContent=r.code;$('phase').textContent=['waiting','matching'].includes(r.phase)?'RAKİP BEKLENİYOR':r.phase==='finished'?'MAÇ TAMAMLANDI':`${worldNames[r.universe]} · KART ${r.round+1}/10`;
for(let i=0;i<2;i++){const p=r.players[i];$('player'+i).className='player player-side'+(r.me===i?' me':'');$('player'+i).innerHTML=p?`<div class="name">${esc(p.name)} ${r.me===i?'(SEN)':''}</div><div class="credit">${p.credits} <small>kalan kredi</small></div><div class="spent-credit">💸 ${20-p.credits} kredi kullanıldı</div><div class="side-team-title">🎴 KARTLAR (${p.team.length})</div><div class="teams">${p.team.map(x=>`<span class="side-hero"><span class="side-hero-name">${esc(x.name)} <small class="rarity rarity-${esc(x.rarity||'common')}">${rarityLabel(x.rarity)}</small></span><span class="side-hero-cost">${Number(x.cost)||0} <small>kredi</small></span></span>`).join('')||'Henüz karakter yok'}</div>`:'<div class="name">2. OYUNCU</div><p class="status">Katılması bekleniyor…</p>'}
$('log').innerHTML=[...r.history].reverse().map(x=>`<div class="event">${esc(x)}</div>`).join('')||'<div class="event">Oyun henüz başlamadı.</div>';
const stage=$('stage');if(['waiting','matching'].includes(r.phase)){stage.innerHTML='<div class="card-art">⌛</div><h2>ARKADAŞINI DAVET ET</h2><p class="status">Arkadaşına davet bağlantısını gönder. Bağlantıyı açtığında oda kodu hazır olacak.</p><div class="big-bid">'+esc(r.code)+'</div><div class="controls"><button class="primary" id="invite-room">📲 WHATSAPP İLE DAVET ET</button></div>';$('invite-room').onclick=()=>shareInvite(r.code);return}
if(r.phase==='finished'){const [a,b]=r.final;const tied=a.score===b.score;const winnerIndex=tied?-1:(a.score>b.score?0:1);const winner=winnerIndex<0?'BERABERE':r.final[winnerIndex].name;const iWon=winnerIndex===r.me;const emblem='<div class="victory-emblem" aria-hidden="true"><span class="victory-rays"></span><svg viewBox="0 0 180 180" role="presentation" focusable="false"><defs><linearGradient id="victoryGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4af4f1"/><stop offset=".5" stop-color="#bca0ff"/><stop offset="1" stop-color="#ff6ec3"/></linearGradient></defs><path d="M90 10 154 47 154 122 90 160 26 122 26 47Z" fill="#101a36" stroke="url(#victoryGradient)" stroke-width="4"/><path d="M90 26 140 55 140 113 90 143 40 113 40 55Z" fill="none" stroke="#5ceef0" stroke-opacity=".32" stroke-width="2"/><path d="M90 40 104 75 139 77 111 99 121 134 90 114 59 134 69 99 41 77 76 75Z" fill="url(#victoryGradient)" stroke="#d7faff" stroke-width="2"/><path d="M90 2v17M90 161v17M2 90h19M159 90h19" stroke="#64edf6" stroke-width="3" stroke-linecap="round"/></svg></div>';stage.innerHTML=`<section class="victory-screen"><div class="victory-kicker">✦ ARENA SONUCU ✦</div>${emblem}<div class="victory-heading">${tied?'MÜCADELE BERABERE BİTTİ':iWon?'ZAFER SENİN!':'MAÇ TAMAMLANDI'}</div><p class="victory-subtitle">${tied?'İki takım aynı güce ulaştı.':esc(winner)+' bu mücadeleyi kazandı.'}</p><div class="results victory-results"><div class="${winnerIndex===0?'victory-leader':''}"><span class="victory-player-label">${winnerIndex===0?'✦ KAZANAN':'OYUNCU 1'}</span><span class="victory-player-name">${esc(a.name)}</span><strong>${a.score}</strong><small>TOPLAM PUAN</small></div><div class="${winnerIndex===1?'victory-leader':''}"><span class="victory-player-label">${winnerIndex===1?'✦ KAZANAN':'OYUNCU 2'}</span><span class="victory-player-name">${esc(b.name)}</span><strong>${b.score}</strong><small>TOPLAM PUAN</small></div></div><div class="victory-reward ${iWon?'reward-earned':''}"><span class="reward-coin">🪙</span><div><strong>${tied?'BERABERLİK':iWon?'+100 ALTIN KAZANDIN':'+100 ALTIN ÖDÜLÜ'}</strong><small>${tied?'Bu maçta altın ödülü verilmedi.':iWon?'100 altınlık ödül havuzunu kazandın.':'100 altınlık ödül havuzu kazanana verilir.'}</small></div></div><p class="victory-scoreline">PUAN FARKI <b>${Math.abs(a.score-b.score)}</b> <span>•</span> SERİ <b>${r.series[0]} - ${r.series[1]}</b></p><div class="final-teams victory-teams">${[a,b].map(p=>`<section class="final-team"><h3>${esc(p.name)}</h3>${p.team.map(c=>`<div class="final-hero"><span><span class="mini-hero-icon">${emojis[c.universe]||'✦'}</span>${esc(c.name)} <small class="rarity rarity-${esc(c.rarity||'common')}">${rarityLabel(c.rarity)}</small></span><b>${c.power}/100</b></div>`).join('')}<div class="final-hero"><span>Kalan kredi bonusu (${p.credits} × 10)</span><b>+${p.credits*10}</b></div><div class="final-hero total"><span>GENEL TOPLAM</span><b>${p.score}</b></div></section>`).join('')}</div><p class="status victory-rematch-note">${r.mode==='bot'?'Bilgisayara karşı hemen yeniden oynayabilirsin.':r.rematch[r.me]?'Rövanş isteğin gönderildi. Rakibin onayı bekleniyor.':r.rematch[1-r.me]?'Rakibin rövanş istiyor. Onaylarsan yeni maç başlayacak.':'Yeni maç için iki oyuncunun da onayı gerekiyor.'}</p><div class="controls victory-controls"><button class="primary" id="rematch">${r.rematch[r.me]?'ONAYIN GÖNDERİLDİ':r.rematch[1-r.me]?'RÖVANŞI KABUL ET':'⚔ AYNI RAKİPLE TEKRAR OYNA'}</button></div></section>`;$('rematch').disabled=!!r.rematch[r.me];$('rematch').onclick=()=>act('/api/rematch',{});return}
const card=r.card;const canBid=r.turn===r.me;const min=r.topBid+1;const max=r.players[r.me].credits;const art=`<div class="hero-art-placeholder">${emojis[card.universe]}<small>Görsel yükleniyor…</small></div>`;
const timer=`<p class="status" id="turntimer">⏱ ${Math.max(0,Math.ceil((r.deadline-Date.now())/1000))} saniye</p>`;const status=r.topBid?`En yüksek teklif: <b>${r.topBid} kredi</b> · ${esc(r.players[r.topSeat].name)}`:'Henüz teklif yok';
stage.innerHTML=`<div class="auction-main"><div class="auction-hero"><div class="eyebrow">KART ${r.round+1} / 10</div><div class="card-art rarity-frame rarity-frame-${esc(card.rarity||'common')} ${isNewCard?'card-reveal':''}">${art}</div><div class="card-name">${esc(card.name)}</div><span class="tag">${worldNames[card.universe]} · 🔒 GÜÇ GİZLİ</span><span class="rarity rarity-${esc(card.rarity||'common')} rarity-feature">✦ ${rarityLabel(card.rarity)}</span><p class="status hero-description" id="hero-description">${esc(card.description||"Karakter bilgisi yükleniyor…")}</p></div><div class="auction-action"><p class="status">${status}</p>${timer}${canBid&&max>=min?`<div class="bid-stepper"><button id="minusbid" type="button" aria-label="Teklifi azalt">−</button><div class="big-bid" id="bidview">${min} KREDİ</div><button id="plusbid" type="button" aria-label="Teklifi artır">+</button></div><input id="bidrange" class="range" type="range" min="${min}" max="${max}" value="${min}" step="1"><div class="controls"><button class="primary" id="bidbutton">${r.topBid?'TEKLİFİ ARTIR':'AÇILIŞ TEKLİFİ VER'} →</button><button class="danger" id="passbutton">PAS</button></div>`:canBid?'<p class="status">Bütçen artırmaya yetmiyor. İhale otomatik kapanıyor.</p>':`<p class="status">⏳ Teklif sırası: <b>${esc(r.players[r.turn].name)}</b><br>Rakibin kararını bekle.</p>`}</div></div>`;
loadHeroInfo(card);
if(canBid&&max>=min){$('bidrange').oninput=e=>$('bidview').textContent=e.target.value+' KREDİ';$('bidbutton').onclick=()=>act('/api/bid',{amount:Number($('bidrange').value)});$('minusbid').onclick=()=>{const el=$('bidrange');el.value=Math.max(min,Number(el.value)-1);el.oninput({target:el})};$('plusbid').onclick=()=>{const el=$('bidrange');el.value=Math.min(max,Number(el.value)+1);el.oninput({target:el})};$('passbutton').onclick=()=>act('/api/pass',{})}
}
function renderChat(r){const panel=$('chat-panel');if(!panel)return;panel.hidden=r.mode==='bot';if(panel.hidden)return;const list=$('chat-messages');const oldCount=Number(list.dataset.count||0);const messages=r.chat||[];if(oldCount!==messages.length||list.dataset.room!==r.code){const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;list.innerHTML=messages.map(m=>`<div class="chat-line ${m.seat===r.me?'chat-mine':''}"><span class="chat-author">${esc(m.name)} · ${new Date(m.time).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span><span class="chat-text">${esc(m.message)}</span></div>`).join('')||'<p class="status">Henüz mesaj yok. Rakibine merhaba de!</p>';list.dataset.count=String(messages.length);list.dataset.room=r.code;if(nearBottom||!oldCount)list.scrollTop=list.scrollHeight;}}
let chatSending=false;
$('chat-send').onclick=async()=>{if(!session||room?.mode==='bot'||chatSending)return;const input=$('chat-input');const message=input.value.trim();if(!message)return;chatSending=true;$('chat-send').disabled=true;try{const result=await post('/api/chat',{...session,message});input.value='';show(result.room);}catch(e){notify('Sohbet mesajı gönderilemedi: '+e.message)}finally{chatSending=false;$('chat-send').disabled=false}};
// Keep chat synchronized even when a proxy interrupts the live event stream.
setInterval(async()=>{if(!session||!room||room.mode==='bot'||document.hidden)return;try{const result=await post('/api/state',session);if(result.room?.chat?.length!==room.chat?.length||result.room?.code!==room.code)show(result.room)}catch{}},4000);
$('chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chat-send').click()}});
// PokeAPI species are indexed by national Pokédex number; name mapping is loaded lazily.
let pokeMap={};async function loadPokeMap(){try{const r=await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1025');const j=await r.json();j.results.forEach((x,i)=>pokeMap[x.name.replaceAll('-',' ').toLowerCase()]=i+1);if(room)show(room)}catch{}}
function pokemonId(name){return pokeMap[name.toLowerCase()]||null}
async function act(url,extra){try{const j=await post(url,{...session,...extra});show(j.room)}catch(e){notify(e.message)}}
$('worlds').onclick=e=>{const b=e.target.closest('[data-world]');if(!b)return;world=b.dataset.world;document.querySelectorAll('[data-world]').forEach(x=>x.classList.toggle('selected',x===b))};
$('create').onclick=async()=>{if(!await validateLogin())return;try{const j=await post('/api/create',{...gameIdentity(),name:$('name').value,universe:world});save(j.token,j.room)}catch(e){notify(e.message)}};
$('join').onclick=async()=>{if(!await validateLogin())return;try{const j=await post('/api/join',{...gameIdentity(),name:$('name').value,code:$('roomcode').value.trim().toUpperCase()});save(j.token,j.room)}catch(e){notify(e.message)}};
$('bot').onclick=async()=>{if(!await validateLogin())return;try{const j=await post('/api/bot',{...gameIdentity(),name:$('name').value,universe:world});save(j.token,j.room)}catch(e){notify(e.message)}};
$('match').onclick=async()=>{if(!await validateLogin())return;try{const j=await post('/api/match',{...gameIdentity(),name:$('name').value,universe:world});save(j.token,j.room)}catch(e){notify(e.message)}};
setInterval(()=>{if(room?.phase==='auction'&&room.deadline){const el=$('turntimer');if(el)el.textContent='⏱ '+Math.max(0,Math.ceil((room.deadline-Date.now())/1000))+' saniye'}},250);
function inviteUrl(code){const u=new URL('/',location.origin);u.searchParams.set('join',code);return u.toString()}
function shareInvite(code){
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
$('leave').onclick=()=>{if(!confirm('Bu cihazda odadan ayrılmak istiyor musun?'))return;localStorage.removeItem('hero-auction-session');stream?.close();session=null;room=null;applyLogin();refreshOnline()};
(async()=>{try{const r=await fetch('/api/info');const j=await r.json();$('catalogue').textContent=`Şu anda ${j.catalogueCount} karakter hazır · Pokémon ${j.counts.pokemon} · Marvel ${j.counts.marvel} · DC ${j.counts.dc} · Yüzüklerin Efendisi ${j.counts.lotr}`;}catch{}await restoreGame();loadPokeMap();refreshOnline()})();

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
 const target=document.querySelector('#stage .card-art');if(!target)return;
 if(data?.url){
  target.innerHTML='';const img=document.createElement('img');img.src=data.url;img.alt=card.name;
  img.onerror=()=>{target.innerHTML='<div class="hero-art-placeholder">'+emojis[card.universe]+'<small>Görsel yüklenemedi</small></div>'};
  target.append(img);
  if(data.source){const link=document.createElement('a');link.href=data.source;link.target='_blank';link.rel='noopener noreferrer';link.className='art-credit';link.textContent='Görsel kaynağı';target.append(link)}
 }else{
  target.innerHTML='<div class="hero-art-placeholder">'+emojis[card.universe]+'<small>Doğrulanmış görsel yok</small></div>';
 }
}
