(function(root){
 'use strict';
 const date=value=>value?new Date(value).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}):'Bilinmiyor';
 const result=record=>record?.winner===-1?'Berabere':[0,1].includes(record?.winner)?(record.participants[record.winner]?.name||'Oyuncu')+' kazandı':'Sonuç kaydı yok';
 function create({document,request,isVerified,navigate}){
  const $=id=>document.getElementById(id);let generation=0,detailGeneration=0,page=null,busy=false;
  const append=(parent,tag,value)=>{const el=document.createElement(tag);el.textContent=String(value??'');parent.append(el);return el;};
  const controls=()=>{$('match-prev').disabled=busy||!page||page.offset===0;$('match-next').disabled=busy||!page?.hasMore;};
  function clear(){generation++;detailGeneration++;page=null;busy=false;$('match-rows').replaceChildren();$('match-detail').replaceChildren();$('match-detail').hidden=true;$('match-records').hidden=true;controls();}
  async function load(offset=0){
   if(!isVerified())return;const key=++generation;busy=true;$('match-records').hidden=false;controls();$('match-status').textContent='Maçlar yükleniyor…';
   try{
    const data=await request('matches',{search:$('match-search').value,days:Number($('match-range').value),offset});if(key!==generation||!isVerified())return;
    $('match-records').hidden=false;page=data.pagination;const rows=$('match-rows');rows.replaceChildren();
    for(const record of data.matches){const tr=document.createElement('tr');const values=[date(record.at),record.participants.map(p=>p.name||'Oyuncu').join(' / '),result(record),record.mode==='bot'?'Bilgisayar':'Oyuncuya karşı'];
     values.forEach((value,i)=>append(tr,'td',value).setAttribute('data-label',['Tarih','Oyuncular','Sonuç','Tür'][i]));
     const cell=append(tr,'td','');cell.setAttribute('data-label','İnceleme');const button=append(cell,'button','Maçı incele');button.type='button';button.onclick=()=>open({matchId:record.id});rows.append(tr);
    }
    $('match-status').textContent=page.total+' eşleşen maç kaydı. Tarihler Türkiye saatidir.';
    $('match-page').textContent=data.matches.length?`${page.offset+1}–${page.offset+data.matches.length} / ${page.total}`:'Eşleşen kayıt yok.';
   }catch(error){if(key===generation){page=null;$('match-rows').replaceChildren();$('match-status').textContent='Maçlar yüklenemedi: '+error.message;}}
   finally{if(key===generation){busy=false;controls();}}
  }
  function chatSection(parent,title,items,empty){
   append(parent,'h3',title);
   if(!items?.length){append(parent,'p',empty);return;}
   const list=append(parent,'ol','');list.className='match-chat';
   for(const item of items){const row=append(list,'li','');append(row,'strong',(item.name||'Oyuncu')+' · '+date(item.time));append(row,'p',item.message);}
  }
  async function open(options){
   if(!isVerified())return;const key=++detailGeneration;navigate();$('match-records').hidden=false;const panel=$('match-detail');panel.hidden=false;panel.replaceChildren();append(panel,'p','Maç ayrıntısı yükleniyor…');panel.focus();
   try{
    const data=await request('match',options);if(key!==detailGeneration||!isVerified())return;panel.replaceChildren();
    append(panel,'h3',data.record?'Maç sonucu':'Saklanan şikâyet kanıtı');append(panel,'p',result(data.record));
    if(data.record){append(panel,'p','Maç: '+data.record.id+' · '+date(data.record.at));for(const [i,player] of data.record.participants.entries())append(panel,'p',(player.name||'Oyuncu')+' · '+(player.id||'Bilgisayar')+' · Skor: '+(player.score??'—')+' · Puan değişimi: '+(data.record.rankChange[i]??'—'));}
    if(!data.detailAvailable)append(panel,'p','Bu maça ait oda ayrıntısı artık saklanmıyor. Sonuç özeti ve varsa şikâyet kanıtı gösterilir; tam tekrar kaydı yoktur.');
    if(data.reportEvidence){const proof=data.reportEvidence;append(panel,'h3','Şikâyet anındaki kanıt');append(panel,'p','Şikâyet: '+proof.reportId+' · '+date(proof.capturedAt));if(proof.kind==='friend')append(panel,'p','Arkadaş etkileşimi: '+(proof.name||proof.playerId)+'. Bu şikâyet bir maça bağlı değil.');else chatSection(panel,'Şikâyet anında saklanan oda sohbeti',proof.chat,'Şikâyet kanıtında sohbet mesajı yok.');const back=append(panel,'button','Şikâyetlere dön');back.type='button';back.onclick=()=>root.HeroAdminNavigation?.show('moderationPanel',true);}
    if(data.room){append(panel,'h3','Maça ait saklanan oda ayrıntıları');append(panel,'p',data.room.settled?'Sonuç kesinleşmiş.':'Kesinleşmiş sonuç bulunmuyor; devam eden veya sonuçlanmamış kayıt.');chatSection(panel,'Bu maç sırasında yazılan son mesajlar (en fazla 60)',data.room.chat,'Bu maç için saklanan sohbet mesajı yok.');append(panel,'h3','Son açık artırma olayları (en fazla 30)');if(data.room.events.length){const events=append(panel,'ol','');for(const event of data.room.events)append(events,'li',event);}else append(panel,'p','Saklanan açık artırma olayı yok.');}
   }catch(error){if(key===detailGeneration){panel.replaceChildren();append(panel,'p','Kayıt okunamadı: '+error.message);}}
  }
  $('match-find').onclick=()=>load();$('match-range').onchange=()=>load();$('match-search').addEventListener('keydown',event=>{if(event.key==='Enter')void load();});
  $('match-prev').onclick=()=>load(Math.max(0,page.offset-25));$('match-next').onclick=()=>load(page.offset+25);
  return {load,open,clear};
 }
 root.HeroAdminMatches={create};
})(window);
