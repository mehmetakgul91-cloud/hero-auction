const $=id=>document.getElementById(id);
let session=null,room=null,stream=null,world='mixed';
let lastCardKey=null;
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

const artMemo=new Map();
const infoMemo=new Map();
const emojis={pokemon:'⚡',marvel:'🦸',dc:'🦇',lotr:'💍'};
const worldNames={pokemon:'POKÉMON',marvel:'MARVEL',dc:'DC',lotr:'YÜZÜKLERİN EFENDİSİ',mixed:'KARMA EVREN'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notify=msg=>{const t=$('toast');t.textContent=msg;t.style.display='block';setTimeout(()=>t.style.display='none',3300)};
async function post(url,data){const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await res.json();if(!res.ok)throw Error(j.error||'İşlem başarısız');return j}
function save(token,r){session={token,code:r.code};localStorage.setItem('hero-auction-session',JSON.stringify(session));show(r);connect();refreshOnline()}
function connect(){stream?.close();if(!session)return;stream=new EventSource(`/api/events?code=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`);stream.onmessage=e=>{try{show(JSON.parse(e.data))}catch{}};stream.onerror=()=>{};}
function show(r){const currentCardKey=r.phase==='auction'?r.code+':'+r.round+':'+r.card?.name:null;const isNewCard=!!currentCardKey&&currentCardKey!==lastCardKey;lastCardKey=currentCardKey;room=r;$('home').hidden=true;$('game').hidden=false;$('room-title').textContent=r.code;$('phase').textContent=['waiting','matching'].includes(r.phase)?'RAKİP BEKLENİYOR':r.phase==='finished'?'MAÇ TAMAMLANDI':`${worldNames[r.universe]} · KART ${r.round+1}/10`;
for(let i=0;i<2;i++){const p=r.players[i];$('player'+i).className='player player-side'+(r.me===i?' me':'');$('player'+i).innerHTML=p?`<div class="name">${esc(p.name)} ${r.me===i?'(SEN)':''}</div><div class="credit">${p.credits} <small>kalan kredi</small></div><div class="spent-credit">💸 ${20-p.credits} kredi kullanıldı</div><div class="side-team-title">🎴 KARTLAR (${p.team.length})</div><div class="teams">${p.team.map(x=>`<span class="side-hero"><span class="side-hero-name">${esc(x.name)}</span><span class="side-hero-cost">${Number(x.cost)||0} <small>kredi</small></span></span>`).join('')||'Henüz karakter yok'}</div>`:'<div class="name">2. OYUNCU</div><p class="status">Katılması bekleniyor…</p>'}
$('log').innerHTML=[...r.history].reverse().map(x=>`<div class="event">${esc(x)}</div>`).join('')||'<div class="event">Oyun henüz başlamadı.</div>';
const stage=$('stage');if(['waiting','matching'].includes(r.phase)){stage.innerHTML='<div class="card-art">⌛</div><h2>ARKADAŞINI DAVET ET</h2><p class="status">Arkadaşına davet bağlantısını gönder. Bağlantıyı açtığında oda kodu hazır olacak.</p><div class="big-bid">'+esc(r.code)+'</div><div class="controls"><button class="primary" id="invite-room">📲 WHATSAPP İLE DAVET ET</button></div>';$('invite-room').onclick=()=>shareInvite(r.code);return}
if(r.phase==='finished'){const [a,b]=r.final;const winner=a.score===b.score?'BERABERE':a.score>b.score?a.name:b.name;stage.innerHTML=`<div class="card-art trophy-reveal">🏆</div><h2>MAÇ SONUCU</h2><div class="results"><div>${esc(a.name)}<strong>${a.score}</strong><small>Toplam puan</small></div><div>${esc(b.name)}<strong>${b.score}</strong><small>Toplam puan</small></div></div><p class="winner">${a.score===b.score?'BERABERE!':esc(winner)+' KAZANDI!'}</p><p class="status">${Math.abs(a.score-b.score)} puan fark · Kalan her kredi için +10 bonus dahildir.</p><div class="final-teams">${[a,b].map(p=>`<section class="final-team"><h3>${esc(p.name)}</h3>${p.team.map(c=>`<div class="final-hero"><span><span class="mini-hero-icon">${emojis[c.universe]||'✦'}</span>${esc(c.name)}</span><b>${c.power}/100</b></div>`).join('')}<div class="final-hero"><span>Kalan kredi bonusu (${p.credits} × 10)</span><b>+${p.credits*10}</b></div><div class="final-hero total"><span>GENEL TOPLAM</span><b>${p.score}</b></div></section>`).join('')}</div><p class="status">Seri: ${r.series[0]} - ${r.series[1]}</p><p class="status">${r.mode==='bot'?'Bilgisayara karşı hemen yeniden oynayabilirsin.':r.rematch[r.me]?'Rövanş isteğin gönderildi. Rakibin onayı bekleniyor.':r.rematch[1-r.me]?'Rakibin rövanş istiyor. Onaylarsan yeni maç başlayacak.':'Yeni maç için iki oyuncunun da onayı gerekiyor.'}</p><div class="controls"><button class="primary" id="rematch">${r.rematch[r.me]?'ONAYIN GÖNDERİLDİ':r.rematch[1-r.me]?'RÖVANŞI KABUL ET':'AYNI RAKİPLE TEKRAR OYNA'}</button></div>`;$('rematch').disabled=!!r.rematch[r.me];$('rematch').onclick=()=>act('/api/rematch',{});return}
const card=r.card;const canBid=r.turn===r.me;const min=r.topBid+1;const max=r.players[r.me].credits;const art=`<div class="hero-art-placeholder">${emojis[card.universe]}<small>Görsel yükleniyor…</small></div>`;
const timer=`<p class="status" id="turntimer">⏱ ${Math.max(0,Math.ceil((r.deadline-Date.now())/1000))} saniye</p>`;const status=r.topBid?`En yüksek teklif: <b>${r.topBid} kredi</b> · ${esc(r.players[r.topSeat].name)}`:'Henüz teklif yok';
stage.innerHTML=`<div class="auction-main"><div class="auction-hero"><div class="eyebrow">KART ${r.round+1} / 10</div><div class="card-art ${isNewCard?'card-reveal':''}">${art}</div><div class="card-name">${esc(card.name)}</div><span class="tag">${worldNames[card.universe]} · 🔒 GÜÇ GİZLİ</span><p class="status hero-description" id="hero-description">${esc(card.description||"Karakter bilgisi yükleniyor…")}</p></div><div class="auction-action"><p class="status">${status}</p>${timer}${canBid&&max>=min?`<div class="bid-stepper"><button id="minusbid" type="button" aria-label="Teklifi azalt">−</button><div class="big-bid" id="bidview">${min} KREDİ</div><button id="plusbid" type="button" aria-label="Teklifi artır">+</button></div><input id="bidrange" class="range" type="range" min="${min}" max="${max}" value="${min}" step="1"><div class="controls"><button class="primary" id="bidbutton">${r.topBid?'TEKLİFİ ARTIR':'AÇILIŞ TEKLİFİ VER'} →</button><button class="danger" id="passbutton">PAS</button></div>`:canBid?'<p class="status">Bütçen artırmaya yetmiyor. İhale otomatik kapanıyor.</p>':`<p class="status">⏳ Teklif sırası: <b>${esc(r.players[r.turn].name)}</b><br>Rakibin kararını bekle.</p>`}</div></div>`;
loadHeroInfo(card);
if(canBid&&max>=min){$('bidrange').oninput=e=>$('bidview').textContent=e.target.value+' KREDİ';$('bidbutton').onclick=()=>act('/api/bid',{amount:Number($('bidrange').value)});$('minusbid').onclick=()=>{const el=$('bidrange');el.value=Math.max(min,Number(el.value)-1);el.oninput({target:el})};$('plusbid').onclick=()=>{const el=$('bidrange');el.value=Math.min(max,Number(el.value)+1);el.oninput({target:el})};$('passbutton').onclick=()=>act('/api/pass',{})}
}
// PokeAPI species are indexed by national Pokédex number; name mapping is loaded lazily.
let pokeMap={};async function loadPokeMap(){try{const r=await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1025');const j=await r.json();j.results.forEach((x,i)=>pokeMap[x.name.replaceAll('-',' ').toLowerCase()]=i+1);if(room)show(room)}catch{}}
function pokemonId(name){return pokeMap[name.toLowerCase()]||null}
async function act(url,extra){try{const j=await post(url,{...session,...extra});show(j.room)}catch(e){notify(e.message)}}
$('worlds').onclick=e=>{const b=e.target.closest('[data-world]');if(!b)return;world=b.dataset.world;document.querySelectorAll('[data-world]').forEach(x=>x.classList.toggle('selected',x===b))};
$('create').onclick=async()=>{try{const j=await post('/api/create',{name:$('name').value,universe:world});save(j.token,j.room)}catch(e){notify(e.message)}};
$('join').onclick=async()=>{try{const j=await post('/api/join',{name:$('name').value,code:$('roomcode').value.trim().toUpperCase()});save(j.token,j.room)}catch(e){notify(e.message)}};
$('bot').onclick=async()=>{try{const j=await post('/api/bot',{name:$('name').value,universe:world});save(j.token,j.room)}catch(e){notify(e.message)}};
$('match').onclick=async()=>{try{const j=await post('/api/match',{name:$('name').value,universe:world});save(j.token,j.room)}catch(e){notify(e.message)}};
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
$('leave').onclick=()=>{if(!confirm('Bu cihazda odadan ayrılmak istiyor musun?'))return;localStorage.removeItem('hero-auction-session');stream?.close();session=null;room=null;$('home').hidden=false;$('game').hidden=true;refreshOnline()};
(async()=>{try{const r=await fetch('/api/info');const j=await r.json();$('catalogue').textContent=`Şu anda ${j.catalogueCount} karakter hazır · Pokémon ${j.counts.pokemon} · Marvel ${j.counts.marvel} · DC ${j.counts.dc} · Yüzüklerin Efendisi ${j.counts.lotr}`;}catch{}try{session=JSON.parse(localStorage.getItem('hero-auction-session'));if(session){const j=await post('/api/state',session);show(j.room);connect()}}catch{localStorage.removeItem('hero-auction-session');session=null}loadPokeMap();refreshOnline()})();

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
