(function(root){
 'use strict';
 const sourceLabels={direct_or_unknown:'Doğrudan / bilinmeyen',google_search:'Google araması (bildirilen)',invite:'Davet (bildirilen)',crazygames:'CrazyGames (doğrulanmış)',external:'Diğer dış kaynak (bildirilen)'};
 const platformLabels={web:'Web',android:'Android tarayıcı / WebView',unknown:'Bilinmiyor'};
 const deviceLabels={desktop:'Bilgisayar',mobile:'Telefon',tablet:'Tablet',unknown:'Bilinmiyor'};
 const date=value=>new Date(value).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',hour12:false});
 function csv(rows){return '\uFEFF'+rows.map(row=>row.map(value=>{
  let text=String(value??'');
  if(/^[\s\u0000-\u001f]*[=+@-]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
 }).join(';')).join('\r\n');}
 function entryValues(r){return [date(r.startedAt),r.name,r.accountId,sourceLabels[r.source]||'Bilinmiyor',platformLabels[r.platform]||'Bilinmiyor',deviceLabels[r.device]||'Bilinmiyor',r.country||'Bilinmiyor',r.city||'Bilinmiyor'];}
 const entryHeaders=['Tarih ve saat (Türkiye)','Oyuncu','Hesap ID','Giriş kaynağı','Platform','Cihaz','Yaklaşık ülke','Yaklaşık şehir'];
 function dailyRows(report){
  const map=new Map(report.days.map(r=>[r.day,r]));
  const local=new Date(new Date(report.options.until).getTime()+3*3600000).toISOString().slice(0,10);
  return Array.from({length:report.options.days},(_,i)=>{
   const day=new Date(Date.parse(local+'T00:00:00Z')-i*86400000).toISOString().slice(0,10),r=map.get(day);
   return [day,r?.sessions??'—',r?.uniqueAccounts??'—',r?.crazygamesSessions??'—',r?.reportedInviteSessions??'—',r?.googleSearchSessions??'—',r?.externalSessions??'—',r?.directSessions??'—'];
  });
 }
 const dailyHeaders=['Tarih (Türkiye)','Oturum','Tekil hesap','CrazyGames','Davet (bildirilen)','Google araması (bildirilen)','Diğer (bildirilen)','Doğrudan / bilinmeyen'];
 function create({document,request,isVerified,download}){
  const $=id=>document.getElementById(id);let generation=0,report=null,busy=false;
  const message=text=>$('daily-status').textContent=text;
  function controls(){for(const id of ['daily-export','session-export'])$(id).disabled=busy||!report; $('session-prev').disabled=busy||!report||report.options.offset===0;$('session-next').disabled=busy||!report||report.options.offset+report.entries.length>=report.total;}
  function clear(){++generation;report=null;busy=false;for(const id of ['daily-rows','session-rows','report-summary'])$(id).replaceChildren();$('daily-report').hidden=true;controls();}
  function append(parent,tag,value){const el=document.createElement(tag);el.textContent=String(value);parent.append(el);return el;}
  function tableRows(id,rows,headers){const body=$(id);body.replaceChildren();for(const values of rows){const tr=document.createElement('tr');values.forEach((value,i)=>append(tr,'td',value).setAttribute('data-label',headers[i]));body.append(tr);}}
  async function load({offset=0,accountId='',keep=false}={}){
   if(!isVerified())return;
   const token=++generation;
   const filters=keep&&report?{...report.options,offset}:{days:Number($('daily-range').value)||7,source:$('report-source').value,platform:$('report-platform').value,search:$('report-search').value,offset,accountId};
   report=null;busy=true;controls();message('Rapor yükleniyor…');for(const id of ['daily-rows','session-rows','report-summary'])$(id).replaceChildren();
   try{
    const data=await request('session-report',filters);
    if(token!==generation||!isVerified())return;
    if(!data.available){message('Ölçüm kapalı veya kayıt altyapısı kullanılamıyor. Geçmiş veri tahmin edilmez.');return;}
    report=data;tableRows('daily-rows',dailyRows(data),dailyHeaders);tableRows('session-rows',data.entries.map(entryValues),entryHeaders);
    const summary=data.summary;
    for(const [label,value]of [['Gözlenen oturum',summary?.sessions],['Tekil oyuncu hesabı',summary?.uniqueAccounts],['Ek oturum',summary?.additionalSessions],['Android oturumu',summary?.androidSessions]]){
     const card=append($('report-summary'),'div','');append(card,'strong',value??'—');append(card,'span',label);
    }
    $('session-page').textContent=data.total?`${data.options.offset+1}–${data.options.offset+data.entries.length} / ${data.total} kayıt`:'Eşleşen oturum kaydı yok.';
    message(`Son ${data.options.days} takvim günü • Türkiye saati • ${date(data.options.until)} itibarıyla. Tekil hesap dönem boyunca bir kez sayılır. Kaydı olmayan günlerde — gösterilir; sıfır giriş ile eksik ölçüm ayırt edilemez. Konum IP tahminidir; VPN/operatör nedeniyle hatalı olabilir.`);
   }catch(e){if(token===generation)message('Rapor yüklenemedi: '+e.message);}
   finally{if(token===generation){busy=false;controls();}}
  }
  async function exportEntries(){
   if(!report||busy||!isVerified())return;const token=generation,options={...report.options,export:true};busy=true;controls();
   try{const data=await request('session-report',options);if(token!==generation||!isVerified())return;if(!data.available)throw Error('Rapor kullanılamıyor.');download(csv([entryHeaders,...data.entries.map(entryValues)]),'hero-auction-girisler.csv');message(data.entries.length+' oturum CSV olarak indirildi. Saat dilimi Türkiye.');}
   catch(e){if(token===generation)message('CSV indirilemedi: '+e.message);}finally{if(token===generation){busy=false;controls();}}
  }
  $('daily-range').onchange=()=>load();$('report-source').onchange=()=>load();$('report-platform').onchange=()=>load();$('report-find').onclick=()=>load();$('report-search').addEventListener('keydown',e=>{if(e.key==='Enter')void load();});
  $('session-prev').onclick=()=>load({offset:Math.max(0,report.options.offset-report.options.limit),keep:true});$('session-next').onclick=()=>load({offset:report.options.offset+report.options.limit,keep:true});
  $('daily-export').onclick=()=>{if(report&&!busy&&isVerified())download(csv([dailyHeaders,...dailyRows(report)]),'hero-auction-gunluk-oturumlar.csv');};$('session-export').onclick=exportEntries;
  controls();return {load,clear};
 }
 root.HeroAdminReports={create,csv,entryValues,entryHeaders,dailyRows,dailyHeaders};
})(window);
