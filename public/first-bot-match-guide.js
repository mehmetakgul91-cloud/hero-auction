// Non-blocking help for the explicitly started first Easy bot match only.
// Never touches clocks, bids, formation or commander commands.
const KEY='hero-auction-first-bot-match-v1:';
export function recordFirstBotMatch(storage,account,room){
 if(!account||room?.mode!=='bot'||room.difficulty!=='easy'||!room.code||!room.matchKey)return;
 try{storage.setItem(KEY+account,JSON.stringify({code:room.code,matchKey:room.matchKey}));}catch{}
}
export function readFirstBotMatch(storage,account){try{const value=JSON.parse(storage.getItem(KEY+account)||'null');return value&&typeof value.code==='string'&&typeof value.matchKey==='string'?value:null;}catch{return null;}}
export function isFirstBotMatch(storage,account,code,matchKey){const value=readFirstBotMatch(storage,account);return !!(account&&value&&!value.dismissed&&value.code===code&&value.matchKey===matchKey);}
const copy={tr:{auction:'Sıra sendeyken Teklif ver veya Pas geç. Rolü ve yeteneği oku; 20 kredinle 5 kahraman toplayacaksın.',review:'Kartların tamamlandı. Takımını inceleyip hesaplamaya, ardından arena hazırlığına geç.',formation:'Ön safta dayanıklı kahramanlar, arka safta okçu, büyücü ve şifacılar daha etkilidir. Ön / arka saf düğmeleriyle kontrol et, sonra Hazırım’a bas.',battle:'Savaş otomatik ilerler. Komutanın enerjisi dolunca hazır beceriye dokun. Hedef seçimi açılırsa kahramanı seçip onayla.'},en:{auction:'On your turn, Bid or Pass. Read each role and ability; recruit 5 heroes with 20 credits.',review:'Your cards are ready. Review your team, continue to the calculation, then arena preparation.',formation:'Durable heroes belong in front; archers, mages and healers work best in back. Check Front / Back, then press Ready.',battle:'Battle is automatic. When commander energy fills, tap a ready ability. If targeting opens, choose a hero and confirm.'}};
function lesson(doc,storage,account,key,english){
 const box=doc.createElement('aside');box.className='first-bot-lesson';box.setAttribute('aria-label',english?'First match tip':'İlk maç ipucu');
 const text=doc.createElement('p');text.textContent=copy[english?'en':'tr'][key];const close=doc.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',english?'Hide first match tips':'İlk maç ipuçlarını gizle');
 close.onclick=()=>{const value=readFirstBotMatch(storage,account);if(value)try{storage.setItem(KEY+account,JSON.stringify({...value,dismissed:true}));}catch{}for(const hint of doc.querySelectorAll('.first-bot-lesson'))hint.remove();};box.append(text,close);return box;
}
export function createAuctionLesson({document:doc,storage,getAccount,english=()=>false}){
 let box=null,last='';
 return {update(room){const account=getAccount(),valid=room?.mode==='bot'&&isFirstBotMatch(storage,account,room.code,room.matchKey),key=room?.phase==='auction'?'auction':room?.phase==='finished'?'review':null;
  const identity=account+':'+room?.matchKey+':'+key+':'+english();
  if(!valid||!key){box?.remove();box=null;last='';return;}
  if(identity===last&&box?.isConnected)return;
  box?.remove();box=lesson(doc,storage,account,key,english());box.id='first-bot-auction-tip';doc.getElementById('game').prepend(box);last=identity;
 }};
}
export function mountBattleLesson({document:doc,storage,location:loc,window:win}){
 if(loc.pathname.startsWith('/crazygames/'))return;
 const params=new URLSearchParams(loc.search),code=params.get('auctionCode'),matchKey=params.get('auctionMatchKey');
 let account;try{account=JSON.parse(storage.getItem('hero-auction-login')||'null')?.user?.sub;}catch{}
 if(!isFirstBotMatch(storage,account,code,matchKey))return;
 const formation=doc.querySelector('.formation'),arena=doc.getElementById('battle-arena'),summary=doc.getElementById('battle-summary');if(!formation||!arena)return;
 const english=doc.documentElement.lang==='en';let prep=lesson(doc,storage,account,'formation',english),battle=lesson(doc,storage,account,'battle',english);prep.id='first-bot-formation-tip';battle.id='first-bot-battle-tip';formation.prepend(prep);arena.prepend(battle);
 const sync=()=>{let current;try{current=JSON.parse(storage.getItem('hero-auction-login')||'null')?.user?.sub;}catch{}
  const active=current===account&&isFirstBotMatch(storage,account,code,matchKey);prep.hidden=!active;battle.hidden=!active||!!(summary&&!summary.hidden);
 };
 const observer=new MutationObserver(sync);observer.observe(summary||arena,{attributes:true,attributeFilter:['hidden']});win.addEventListener('storage',sync);win.addEventListener('hero:login-changed',sync);sync();
 return()=>{observer.disconnect();win.removeEventListener('storage',sync);win.removeEventListener('hero:login-changed',sync);prep.remove();battle.remove();};
}
if(typeof document!=='undefined'&&location.pathname.endsWith('/battle-preview.html')){let storage;try{storage=window.localStorage;}catch{}if(storage)mountBattleLesson({document,storage,location,window});}
