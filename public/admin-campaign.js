// Owner-only aggregate reader. The injected request uses existing admin auth.
// No account rows, export, feature enabling, gameplay writes or currency actions.
const fields=[
 ['authenticated','Kampanyalı yeni hesap'],
 ['intro_viewed','Öğretici görüldü · istemci bildirimi'],
 ['intro_completed','İlk maç butonuna basıldı · istemci bildirimi'],
 ['intro_skipped','Anlatım atlandı · istemci bildirimi'],
 ['first_bot_started','İlk ücretsiz kolay bot · sunucu kabulü'],
 ['first_bot_completed','Tamamlandı · kalıcı sunucu sonucu'],
 ['forfeited','Terk / hükmen sonuç'],['server_failures','Sunucu hatası'],
 ['idle_cancelled','Hareketsizlik iptali'],['pending','Henüz kesin sonuç yok'],['other_terminal','Diğer sonlandırma']
];
const validId=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9_-]{0,47}$/.test(value);
export function mountAdminCampaign({document:doc,request,isVerified=()=>false,now=()=>new Date()}={}){
 if(!doc||typeof request!=='function')return null;
 const make=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 let panel=doc.getElementById('admin-campaign-panel');const owned=!panel;
 if(!panel){panel=make('section');panel.id='admin-campaign-panel';panel.className='panel';(doc.querySelector('main')||doc.body).append(panel);}
 panel.hidden=true;
 const title=make('h2','Kampanya ve ilk maç özeti'),description=make('p','Yalnız izinli kampanyalardan gelen yeni hesapların toplu sayıları. Kampanya kaynağı ve öğretici adımları istemci bildirimidir; bot başlangıcı ve tamamlanması kalıcı sunucu kayıtlarıdır. Organik trafik ve geçmiş eksik kayıtlar tahmin edilmez.');
 const label=make('label','Atıf dönemi '),select=make('select');select.id='admin-campaign-days';select.setAttribute('aria-label','Kampanya raporu dönemi');
 for(const days of [1,7,30]){const option=make('option','Son '+days+' gün');option.value=String(days);select.append(option);}select.value='7';label.append(select);
 const button=make('button','Raporu getir');button.type='button';button.id='admin-campaign-load';
 const status=make('p');status.id='admin-campaign-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const result=make('div');result.id='admin-campaign-results';
 panel.append(title,description,label,button,status,result);
 let generation=0,busy=false,destroyed=false;
 function clear(){generation++;busy=false;panel.hidden=true;button.disabled=false;select.disabled=false;result.replaceChildren();status.textContent='';}
 async function load(){
  if(destroyed||busy)return;
  if(!isVerified()){clear();return;}
  const days=Number(select.value);if(![1,7,30].includes(days)){status.textContent='1, 7 veya 30 günlük dönem seçin.';return;}
  const run=++generation;busy=true;panel.hidden=false;button.disabled=select.disabled=true;result.replaceChildren();status.textContent='Toplu kampanya raporu yükleniyor…';
  try{
   const response=await request('campaign-funnel',{days});
   if(run!==generation||destroyed||!isVerified())return;
   if(response?.enabled===false||response?.available===false){status.textContent='Kampanya ölçümü kapalı, yapılandırılmamış veya kullanılamıyor.';return;}
   if(response?.days!==days||response?.retentionDays!==30||response?.attributionProvenance!=='client_reported'||response?.introProvenance!=='client_reported'||response?.matchProvenance!=='durable_server_records'||!Array.isArray(response.campaigns)||response.campaigns.length>20||response.campaigns.some(row=>!validId(row?.campaignId)||fields.some(([key])=>!Number.isSafeInteger(row[key])||row[key]<0)))throw Error('Kampanya raporu doğrulanamadı.');
   for(const row of response.campaigns){
    const card=make('article'),name=make('h3',row.campaignId),list=make('dl');card.append(name,list);
    for(const [key,label] of fields)list.append(make('dt',label),make('dd',String(row[key])));
    result.append(card);
   }
   const received=now();const date=received instanceof Date&&Number.isFinite(received.getTime())?received.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}):'Bilinmiyor';
   status.textContent=(response.campaigns.length?'Rapor alındı.':'Bu atıf döneminde kampanya kaydı yok.')+' Son '+days+' günün atıf kohortu; kayıt saklama süresi 30 gün. Görüntülenme zamanı (bu cihaz, Türkiye saati): '+date+'. İstemci adımları doğrulanmış oyun sonucu değildir; oranlar hesaplanmaz.';
  }catch(error){if(run===generation&&!destroyed&&isVerified()){result.replaceChildren();status.textContent=error?.status===503?'Kampanya ölçümü kapalı, yapılandırılmamış veya kullanılamıyor.':'Rapor alınamadı. Yönetici oturumunu ve bağlantıyı kontrol edip tekrar deneyin.';}}
  finally{if(run===generation){busy=false;button.disabled=select.disabled=false;if(!isVerified())clear();}}
 }
 button.addEventListener('click',load);
 return {load,clear,destroy(){destroyed=true;clear();button.removeEventListener('click',load);if(owned)panel.remove();}};
}
