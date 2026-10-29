// UI consent only. The server owns prices, admission and all wallet mutations.
export const BOT_TERMS_VERSION='bot-fixed-v1';
const approved={easy:{level:15,gold:100,magicDust:0},medium:{level:25,gold:125,magicDust:2},hard:{level:40,gold:175,magicDust:5}};
export function botTerms(capability,difficulty){
 const rule=approved[difficulty],value=capability?.difficulties?.[difficulty];
 if(!rule||capability?.version!==BOT_TERMS_VERSION||capability?.entryGold!==50||!value||Object.keys(rule).some(key=>value[key]!==rule[key]))return null;
 return {difficulty,...rule,entryGold:50};
}
export function botTermsCopy(terms,english=false){
 const label=english?{easy:'Easy',medium:'Medium',hard:'Hard'}:{easy:'Kolay',medium:'Orta',hard:'Zor'};
 return english?`${label[terms.difficulty]} · Commander level ${terms.level}\nEntry: 50 gold for THIS game.\nWin: ${terms.gold} gold${terms.magicDust?' + '+terms.magicDust+' magic dust':''}, automatically credited in a fixed chest. No diamonds.\nLoss: no reward. Draw or verified server failure: 50 gold refunded. Quitting or disconnecting does not qualify for a refund. League points do not change.\nPay 50 gold and start?`:
 `${label[terms.difficulty]} · Komutan seviyesi ${terms.level}\nGiriş: yalnız BU maç için 50 altın.\nGalibiyet: ${terms.gold} altın${terms.magicDust?' + '+terms.magicDust+' büyü tozu':''}, sabit sandıkla otomatik eklenir. Elmas yok.\nYenilgi: ödül yok. Beraberlik veya doğrulanmış sunucu hatası: 50 altın iade. Oyundan çıkma veya bağlantı kopması iade sebebi değildir. Lig puanı değişmez.\n50 altın ödeyip başlatılsın mı?`;
}
export function createBotEntryConsent({fetch=globalThis.fetch,confirm=globalThis.confirm,storage=globalThis.sessionStorage,uuid=()=>globalThis.crypto.randomUUID(),english=()=>globalThis.document?.documentElement.lang==='en'}={}){
 let busy=false;
 const prefix='hero-auction-bot-entry';
 const key=scope=>prefix+':'+scope;
 return {
  async request(scope,difficulty){
   if(busy)return null;busy=true;
   try{
    const response=await fetch('/api/info',{cache:'no-store'}),info=await response.json();
    const terms=botTerms(info.botEconomy,difficulty);
    if(!response.ok||info.botEconomy?.available!==true||!terms)throw Error(english()?'Paid computer matches are unavailable; a durable wallet is required.':'Ücretli bilgisayar maçları kullanılamıyor; kalıcı cüzdan altyapısı gerekli.');
    if(!confirm(botTermsCopy(terms,english())))return null;
    // Persist only a request identifier, never approval. Every retry asks again.
    let prior;try{prior=JSON.parse(storage.getItem(key(scope))||'null')}catch{throw Error(english()?'Cannot verify the earlier entry request. No new charge was sent.':'Önceki giriş isteği doğrulanamadı. Yeni ücret isteği gönderilmedi.')}
    if(prior&&(!approved[prior.difficulty]||typeof prior.requestId!=='string'||!prior.requestId))throw Error(english()?'Entry recovery record is invalid. No new charge was sent.':'Giriş kurtarma kaydı geçersiz. Yeni ücret isteği gönderilmedi.');
    if(prior&&prior.difficulty!==difficulty)throw Error(english()?'Retry the earlier entry difficulty first: '+prior.difficulty:'Önce önceki giriş isteğini aynı zorlukta yeniden dene: '+prior.difficulty);
    const requestId=prior?prior.requestId:uuid();
    storage.setItem(key(scope),JSON.stringify({difficulty,requestId}));
    return {difficulty,botTermsVersion:BOT_TERMS_VERSION,requestId};
   }finally{busy=false}
  },
  complete(scope){try{storage.removeItem(key(scope))}catch{}}
 };
}

// Refund/loss status is based on the committed receipt, never the visual score.
export function botSettlementCopy(value,matchId,english=false){
 if(!value||value.matchId!==matchId||value.configVersion!==BOT_TERMS_VERSION||value.receiptId!==matchId)return null;
 const reward=value.rewards;
 if(!reward||reward.diamonds!==0||reward.magicDust!==0)return null;
 if(['tie','server_failure'].includes(value.outcome)&&reward.gold===50)return english?'50 gold entry fee refunded. No victory reward.':'50 altın giriş ücreti iade edildi. Galibiyet ödülü yok.';
 if(value.outcome==='loss'&&reward.gold===0)return english?'No victory reward. The 50 gold entry fee is not refunded.':'Galibiyet ödülü yok. 50 altın giriş ücreti iade edilmez.';
 return null;
}
