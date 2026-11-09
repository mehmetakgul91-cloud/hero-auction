// Read-only aggregate viewer. Authentication remains in the existing admin client.
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
function validReport(r,days){
 return r?.available===true&&r.source==='google_ads_api'&&r.customerId==='8386605798'&&r.campaignId==='24441908595'&&r.currency==='TRY'&&r.timeZone==='Europe/Istanbul'&&r.days===days&&validDay(r.period?.start)&&validDay(r.period?.end)&&(Date.parse(r.period.end)-Date.parse(r.period.start))/86400000+1===days&&Number.isSafeInteger(r.impressions)&&r.impressions>=0&&Number.isSafeInteger(r.clicks)&&r.clicks>=0&&typeof r.costMicros==='string'&&/^\d{1,16}$/.test(r.costMicros)&&Number.isSafeInteger(Number(r.costMicros))&&typeof r.fetchedAt==='string'&&Number.isFinite(Date.parse(r.fetchedAt))&&typeof r.stale==='boolean';
}
export function mountAdminAds({document:doc,request,isVerified=()=>false}={}){
 if(!doc||typeof request!=='function')return null;
 const make=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 let panel=doc.getElementById('admin-ads-panel');const owned=!panel;
 if(!panel){panel=make('section');panel.id='admin-ads-panel';panel.className='panel';(doc.querySelector('main')||doc.body).append(panel);}panel.hidden=true;
 const title=make('h2','Google Ads reklam raporu'),description=make('p','Hero Auction · TR Uygulama İçi Test. Google Ads verileri, oyun içi kampanya ve ilk maç ölçümünden ayrıdır. Google dönüşümü veya doğrulanmış oyuncu edinimi olarak yorumlanmaz.');
 const controls=make('div');controls.className='admin-ads-controls';const label=make('label','Rapor dönemi '),select=make('select');select.id='admin-ads-days';select.setAttribute('aria-label','Google Ads rapor dönemi');
 for(const days of [1,7,30]){const option=make('option',days===1?'Bugün':'Son '+days+' gün');option.value=String(days);select.append(option);}select.value='7';label.append(select);
 const button=make('button','Raporu getir');button.type='button';button.id='admin-ads-load';controls.append(label,button);
 const status=make('p');status.id='admin-ads-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const result=make('div');result.id='admin-ads-results';
 const note=make('p','Medya harcaması reklam etkileşim maliyetidir. Vergi, ek ücret ve fatura düzeltmelerini kapsamayabilir; toplam fatura veya kalan bütçe değildir. Rapor 15 dakika önbelleklenir, anlık değildir.');note.className='admin-ads-note';
 panel.append(title,description,controls,status,result,note);
 let generation=0,busy=false,destroyed=false;
 function clear(){generation++;busy=false;panel.hidden=true;button.disabled=select.disabled=false;result.replaceChildren();status.textContent='';}
 async function load(){
  if(destroyed||busy)return;if(!isVerified()){clear();return;}
  const days=Number(select.value);if(![1,7,30].includes(days)){status.textContent='1, 7 veya 30 günlük dönem seçin.';return;}
  const run=++generation;busy=true;panel.hidden=false;button.disabled=select.disabled=true;result.replaceChildren();status.textContent='Google Ads raporu yükleniyor…';
  try{
   const r=await request('google-ads-report',{days});if(run!==generation||destroyed||!isVerified())return;
   if(r?.available===false){status.textContent=r.reason==='not_connected'?'Google Ads bağlı değil. Gösterim, tıklama ve harcama henüz bilinmiyor.':'Google Ads raporu şu anda alınamıyor. Eksik veriler sıfır olarak gösterilmez.';return;}
   if(!validReport(r,days))throw Error('Invalid report');
   const money=n=>(n/1000000).toLocaleString('tr-TR',{style:'currency',currency:r.currency,minimumFractionDigits:2,maximumFractionDigits:4});
   const values=[['Gösterim',r.impressions.toLocaleString('tr-TR')],['Tıklama',r.clicks.toLocaleString('tr-TR')],['Medya harcaması',money(Number(r.costMicros))],['Ortalama TBM',r.clicks?money(Number(r.costMicros)/r.clicks):'Tıklama yok · hesaplanamaz']];
   for(const [name,value]of values){const card=make('div');card.className='admin-ads-metric';card.append(make('span',name),make('strong',value));result.append(card);}
   status.textContent=(r.stale?'Güncelleme başarısız: son alınan veri gösteriliyor. ':'Rapor alındı. ')+r.period.start+' – '+r.period.end+' (dahil) · TRY · Türkiye saati. Son güncelleme: '+new Date(r.fetchedAt).toLocaleString('tr-TR',{timeZone:r.timeZone})+'.';
  }catch{if(run===generation&&!destroyed&&isVerified()){result.replaceChildren();status.textContent='Rapor alınamadı veya doğrulanamadı. Oturumu ve bağlantıyı kontrol edip tekrar deneyin.';}}
  finally{if(run===generation){busy=false;button.disabled=select.disabled=false;if(!isVerified())clear();}}
 }
 button.addEventListener('click',load);
 return {load,clear,destroy(){destroyed=true;clear();button.removeEventListener('click',load);if(owned)panel.remove();}};
}
