// One-way exchange presentation. Only the server policy supplies the accepted rate.
export function commanderExchangeQuote(policy,diamonds,gold,amount){
 const configured=policy?.enabled===true&&policy.available===true&&Number.isSafeInteger(policy.rate)&&policy.rate>0&&typeof policy.pricingVersion==='string'&&policy.pricingVersion.length>0;
 const count=typeof amount==='string'&&/^[1-9]\d*$/.test(amount)?Number(amount):typeof amount==='number'?amount:NaN;
 const validAmount=Number.isSafeInteger(count)&&count>0;
 const goldGranted=configured&&validAmount?count*policy.rate:null;
 const reason=!configured?'unavailable':!validAmount?'invalid_amount':!Number.isSafeInteger(diamonds)||count>diamonds?'insufficient_diamonds':!Number.isSafeInteger(goldGranted)||!Number.isSafeInteger(gold)||gold+goldGranted>2147483647?'gold_limit':null;
 return {available:configured,canExchange:reason===null,reason,diamondsToSpend:validAmount?count:null,goldGranted,expectedRate:configured?policy.rate:null,pricingVersion:configured?policy.pricingVersion:null};
}

export function renderCommanderExchange(root,{policy=null,diamonds=null,gold=0,amount='1',pending=null,busy=false,english=false,document=root.ownerDocument,onAmount=()=>{},onExchange=()=>{}}={}){
 const pick=values=>values[english?1:0],fmt=value=>value.toLocaleString(english?'en-US':'tr-TR');
 const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 root.replaceChildren();
 if(pending){
  root.append(el('p','cp-exchange-note',pick(['Önceki dönüşümün sonucu henüz doğrulanamadı. Aynı işlemi kontrol et; ikinci kez harcanmaz.','The previous exchange is not yet confirmed. Check the same request; it will not spend twice.'])));
  root.append(el('p','cp-exchange-quote',`${fmt(pending.diamondsToSpend)} ${pick(['elmas','diamonds'])} → ${fmt(pending.diamondsToSpend*pending.expectedRate)} ${pick(['altın','gold'])}`));
  const retry=el('button','cp-exchange-button',busy?pick(['KONTROL EDİLİYOR…','CHECKING…']):pick(['ÖNCEKİ İŞLEMİ KONTROL ET','CHECK PREVIOUS EXCHANGE']));retry.type='button';retry.disabled=busy;retry.onclick=()=>{if(!retry.disabled)onExchange(pending.diamondsToSpend);};root.append(retry);return;
 }
 const initial=commanderExchangeQuote(policy,diamonds,gold,amount);
 if(!initial.available){root.append(el('p','cp-exchange-note',pick(['Elmas → altın dönüşümü henüz açık değil. Bakiye veya satın alma işlemi oluşturulmaz.','Diamond → gold exchange is not available yet. No balance or purchase is created.'])));return;}
 root.append(el('p','cp-exchange-note',`1 ${pick(['elmas','diamond'])} = ${fmt(policy.rate)} ${pick(['altın','gold'])} · ${pick(['Mevcut elmas','Current diamonds'])}: ${Number.isSafeInteger(diamonds)?fmt(diamonds):'—'}`));
 const label=el('label','',pick(['Harcanacak elmas','Diamonds to spend']));label.setAttribute('for','commander-exchange-amount');
 const input=el('input','cp-exchange-input');input.id='commander-exchange-amount';input.type='number';input.inputMode='numeric';input.min='1';input.step='1';input.max=Number.isSafeInteger(diamonds)?String(diamonds):'';input.value=String(amount);input.disabled=busy;input.setAttribute('aria-describedby','commander-exchange-preview');
 const quote=el('p','cp-exchange-quote');quote.id='commander-exchange-preview';quote.setAttribute('aria-live','polite');
 const button=el('button','cp-exchange-button');button.type='button';
 function update(){
  const view=commanderExchangeQuote(policy,diamonds,gold,input.value);
  const errors={invalid_amount:pick(['Pozitif bir tam sayı gir.','Enter a positive whole number.']),insufficient_diamonds:pick(['Yeterli elmas yok.','Not enough diamonds.']),gold_limit:pick(['Bu miktar altın sınırını aşıyor.','This amount exceeds the gold limit.'])};
  quote.textContent=view.canExchange?`${fmt(view.diamondsToSpend)} ${pick(['elmas harcanır','diamonds spent'])} → ${fmt(view.goldGranted)} ${pick(['altın alınır','gold received'])}`:errors[view.reason]||pick(['Dönüşüm kullanılamıyor.','Exchange unavailable.']);
  button.textContent=busy?pick(['İŞLENİYOR…','PROCESSING…']):pick(['GÖZDEN GEÇİR VE ONAYLA','REVIEW AND CONFIRM']);button.disabled=busy||!view.canExchange;
  button.onclick=()=>{if(!button.disabled)onExchange(view.diamondsToSpend);};
 }
 input.oninput=()=>{onAmount(input.value);update();};update();
 const row=el('div','cp-exchange-row');row.append(input,button);root.append(label,row,quote,el('p','cp-exchange-note',pick(['Tek yönlüdür: altın, elmasa çevrilemez. Elmas satın alma değildir.','One-way only: gold cannot become diamonds. This is not a diamond purchase.'])));
}
