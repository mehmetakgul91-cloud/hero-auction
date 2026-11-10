import {validateFormation} from './preparation-formation.js';
import {renderCommanderSkills} from './commander-profile-view.js';

const copy=value=>structuredClone(value);
const roleField={tank:'defense',fighter:'attack',assassin:'attack',energy:'attack',support:'maxHp'};
const roleBranch={tank:'defense',fighter:'attack',assassin:'attack',energy:'magic',support:'support'};
const portraits={attack:'/images/optimized/commander-attack.bad033e5f738a797.webp',defense:'/images/optimized/commander-defense.d1127052dd9f841b.webp',magic:'/images/optimized/commander-magic.86e58333914984ea.webp',support:'/images/optimized/commander-support.d6ec4a88632b972d.webp'};

// This controller never calculates battle stats. Every before/after value comes
// from the server's live preparation engine for this exact local formation.
export function createCombinedPreparationState({matchKey,team,preparation,request,saveDraft=()=>{},beforeConfirm=()=>{},onLocked=()=>{},onChange=()=>{},onStarted=()=>{}}){
 if(!validateFormation(preparation,team))throw Error('Invalid preparation');
 let state={formation:copy(preparation),formationLocked:!!preparation.ready,options:[],baseline:null,selected:null,locked:null,ready:[],busy:false,previewPending:true,error:null,uncertain:false,required:false};
 let disposed=false,started=false,revision=0,loading=false,refreshAgain=false;
 const publish=()=>{if(!disposed)onChange({...state})};
 const blocked=()=>disposed||state.busy||!!state.locked||state.uncertain||state.error==='MATCH_CHANGED';
 function apply(data){
  if(disposed)return;
  if(data.matchKey!==matchKey)throw Error('MATCH_CHANGED');
  const locked=data.selection??data.commanderSelection?.profile??null;
  if(data.preparation&&(data.preparation.ready||locked)){
   if(!validateFormation(data.preparation,team))throw Error('Invalid preparation');
   state.formation=copy(data.preparation);state.formationLocked=!!data.preparation.ready;
  }
  if(data.options){state.options=data.options;state.baseline=data.baseline;}
  state.locked=locked;state.selected=locked?.commanderId??state.selected;
  state.ready=data.commanderSelection?.ready??data.ready??[];
  state.error=null;state.uncertain=false;state.previewPending=false;
  if(locked)onLocked(copy(state.formation));
  publish();
  if(data.started&&!started){started=true;onStarted(data);}
 }
 async function refresh(){
  if(disposed||state.busy)return;
  if(loading){refreshAgain=true;return;}
  loading=true;publish();const current=revision,formation=copy(state.formation);
  try{const data=await request('preview',{formation});if(current===revision)apply(data);}
  catch(error){if(current===revision&&!disposed){state.error=error.message;state.previewPending=false;publish();}}
  finally{loading=false;if(refreshAgain&&!disposed){refreshAgain=false;void refresh();}}
 }
 async function confirm(){
  if(blocked())return;
  if(!state.selected){state.required=true;publish();return;}
  if(state.previewPending||state.error||!state.options.some(o=>o.commanderId===state.selected))return;
  revision++;state.busy=true;publish();
  const formation=copy(state.formation),commanderId=state.selected;
  try{await beforeConfirm();if(disposed)return;apply(await request('confirm',{formation,commanderId}));}
  catch(error){
   if(disposed)return;
   const original=error.message;
   // A lost response may have locked both choices. Reconcile before allowing
   // another commander or lane change; never blindly repeat the write.
   try{apply(await request('preview',{formation}));if(!state.locked)state.error=original;}
   catch(recovery){state.error=recovery.message;state.uncertain=true;}
  }finally{state.busy=false;publish();}
 }
 return {refresh,confirm,snapshot:()=>copy(state),
  select(id){if(blocked()||!state.options.some(o=>o.commanderId===id))return;state.selected=id;state.required=false;publish();},
  move(slot,lane){
   if(blocked()||state.formationLocked||!Number.isInteger(slot)||slot<0||slot>=5||!['front','back'].includes(lane)||state.formation.lanes[slot]===lane)return;
   state.formation={...state.formation,lanes:[...state.formation.lanes]};state.formation.lanes[slot]=lane;
   revision++;state.previewPending=true;state.error=null;state.baseline=null;state.options=[];publish();
   void Promise.resolve(saveDraft(copy(state.formation))).catch(()=>{});void refresh();
  },destroy(){disposed=true;revision++;},resolve:apply};
}

export function mountCombinedPreparation({root,code,token,matchKey,team,preparation,english=false,draft,getPortrait=async()=>null,onStarted,fetcher=fetch,getAuthToken=()=>JSON.parse(localStorage.getItem('hero-auction-login')||'null')?.authToken}){
 const doc=root.ownerDocument,pick=(tr,en)=>english?en:tr;
 const el=(tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
 const fmt=n=>Number(n??0).toLocaleString(english?'en-US':'tr-TR',{maximumFractionDigits:2}),delta=n=>(n>0?'+':'')+fmt(n);
 const names={attack:pick('Saldırı','Attack'),defense:pick('Savunma','Defense'),magic:pick('Büyücü','Mage'),support:pick('Şifacı','Healer')};
 const labels={attack:pick('Saldırı','Attack'),defense:pick('Savunma','Defense'),maxHp:pick('Can','HP'),speed:pick('Hız','Speed')};
 root.hidden=false;root.className='combined-preparation';root.setAttribute('aria-labelledby','combined-preparation-title');
 const header=el('header',undefined,'combined-header'),heading=el('div');heading.append(el('small','HERO AUCTION'));
 const title=el('h1',pick('Diziliş ve komutan','Formation & commander'));title.id='combined-preparation-title';title.tabIndex=-1;heading.append(title);header.append(heading,el('span',pick('Açık artırma bitti','Auction complete')));
 const panel=el('section',undefined,'combined-panel'),content=el('div',undefined,'combined-content'),formationSection=el('section'),formationHeading=el('div',undefined,'combined-section-title');formationHeading.append(el('h2',pick('Dizilişin','Your formation')),el('span',pick('Otomatik yerleştirildi','Placed automatically')));formationSection.append(formationHeading);
 const rows={};for(const lane of ['front','back']){formationSection.append(el('div',lane==='front'?pick('Ön saf','Front'):pick('Arka saf','Back'),'combined-lane-label'));rows[lane]=el('div',undefined,'combined-row');rows[lane].dataset.lane=lane;formationSection.append(rows[lane]);}
 const commanderSection=el('section',undefined,'combined-commanders'),commanderHeading=el('div',undefined,'combined-section-title');commanderHeading.append(el('h2',pick('Komutanını seç','Choose commander')),el('span',pick('Ücretsiz','Free')));
 const choices=el('div',undefined,'combined-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label',pick('Komutan seçenekleri','Commander options'));
 const note=el('p',undefined,'combined-commander-note');note.setAttribute('role','status');commanderSection.append(commanderHeading,choices,note);content.append(formationSection,commanderSection);
 const summary=el('section',undefined,'combined-summary');summary.setAttribute('aria-live','polite');
 const details=el('details',undefined,'combined-details'),disclosure=el('summary',pick('Güç ayrıntıları','Stat details')),detailContent=el('div');details.append(disclosure,detailContent);
 panel.append(content,summary,details);
 const footer=el('div',undefined,'combined-footer'),status=el('p',undefined,'combined-status');status.setAttribute('role','status');
 const confirm=el('button',pick('Hazırım · Arenaya geç →','Ready · Enter arena →'),'combined-ready');confirm.type='button';
 const retry=el('button',pick('Tekrar dene','Retry'),'combined-retry');retry.type='button';retry.hidden=true;
 const reload=el('a',pick('Güncel maçı yükle','Reload current match'));reload.href=location.href;reload.hidden=true;
 footer.append(status,confirm,retry,reload);root.replaceChildren(header,panel,footer);
 let disposed=false,timer=null,buttons=new Map(),lastBoard='',lastDetails='',lastChoices='';
 const portraitUrls=new Map(),portraitRequests=new Map();
 function portrait(index,node){
  const fallback=el('span',team[index].name.slice(0,1),'combined-portrait-fallback');node.append(fallback);
  const display=url=>{if(disposed||!url||!node.isConnected)return;const img=el('img',undefined,'combined-portrait');img.alt='';img.onload=()=>{if(node.isConnected){fallback.remove();node.prepend(img);}};img.src=url;};
  if(portraitUrls.has(index)){display(portraitUrls.get(index));return;}
  if(!portraitRequests.has(index))portraitRequests.set(index,Promise.resolve(getPortrait(index)).catch(()=>null).then(url=>{portraitUrls.set(index,url);return url;}));
  void portraitRequests.get(index).then(display);
 }
 const controller=createCombinedPreparationState({matchKey,team,preparation,saveDraft:f=>draft?.save(f),beforeConfirm:()=>draft?.flush(),onLocked:()=>draft?.clear(),onStarted:data=>{if(!disposed){dispose();root.hidden=true;onStarted(data);}},request:async(kind,payload)=>{
  const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),8000);
  try{const response=await fetcher(kind==='preview'?'/api/battle-auction-commanders':'/api/battle-auction-commander',{method:'POST',cache:'no-store',signal:abort.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({code,token,matchKey,matchCommanderSelection:1,...payload,...(kind==='confirm'?{authToken:getAuthToken()}: {})})});const data=await response.json();if(!response.ok&&response.status===409&&['Komutan seçimi başka bir maça ait.','Diziliş başka bir maça ait.','Maç değişti.','Açık artırma tamamlanmadı'].includes(data.error))throw Error('MATCH_CHANGED');if(!response.ok)throw Error(data.error||pick('Hazırlık doğrulanamadı.','Could not verify preparation.'));return data;}finally{clearTimeout(timeout);}
 },onChange:s=>{
  const focusedMove=root.contains(doc.activeElement)&&doc.activeElement?.classList.contains('combined-move')?doc.activeElement.dataset.slot:null;
  const unavailable=s.previewPending||!!s.error,option=s.options.find(o=>o.commanderId===s.selected),current=option||s.baseline;
  const frozen=s.busy||!!s.locked||s.uncertain||s.error==='MATCH_CHANGED';
  const boardKey=JSON.stringify([s.formation,s.formationLocked,current,s.baseline,s.selected,unavailable,frozen]);
  if(boardKey!==lastBoard){lastBoard=boardKey;for(const row of Object.values(rows))row.replaceChildren();
   for(const [slot,index]of s.formation.positions.entries()){
    const hero=team[index],lane=s.formation.lanes[slot],unit=current?.heroes.find(h=>h.id===hero.id),base=s.baseline?.heroes.find(h=>h.id===hero.id),field=roleField[hero.role];
    const card=el('article',undefined,'combined-hero');card.dataset.heroId=hero.id;card.classList.toggle('combined-specialty',s.selected===roleBranch[hero.role]);
    const imageBox=el('div',undefined,'combined-portrait-box');card.append(imageBox,el('strong',hero.name,'combined-hero-name'));
    const effect=el('span',undefined,'combined-hero-effect');
    if(unavailable||!unit||!base)effect.textContent=pick('Hesaplanıyor…','Calculating…');
    else if(option){const values=el('span');values.append(el('span',fmt(base[field])+' → '),el('b',fmt(unit[field])));effect.append(values,el('span',delta(unit[field]-base[field])+' '+labels[field],'combined-delta'));}
    else effect.textContent=labels[field]+' '+fmt(unit[field]);
    const move=el('button',lane==='front'?pick('↓ Arka','↓ Back'):pick('↑ Ön','↑ Front'),'combined-move');move.type='button';move.dataset.slot=slot;move.disabled=frozen||s.formationLocked;move.setAttribute('aria-label',hero.name+' · '+(lane==='front'?pick('Arka safa taşı','Move to back'):pick('Ön safa taşı','Move to front')));move.onclick=()=>{controller.move(slot,lane==='front'?'back':'front');root.querySelector('.combined-move[data-slot="'+slot+'"]')?.focus({preventScroll:true});};
    card.append(effect,move);rows[lane].append(card);portrait(index,imageBox);
   }
   for(const row of Object.values(rows))if(!row.children.length)row.append(el('span',pick('Bu safta kahraman yok','No heroes in this row'),'combined-empty'));
  }
  if(focusedMove!==null)root.querySelector('.combined-move[data-slot="'+focusedMove+'"]')?.focus({preventScroll:true});
  const choiceKey=JSON.stringify(s.options.map(o=>[o.commanderId,o.profile.levels]));
  // Keep choices present during a lane refresh; only values are unavailable.
  if(s.options.length&&choiceKey!==lastChoices){lastChoices=choiceKey;choices.replaceChildren();buttons=new Map();for(const option of s.options){const id=option.commanderId,button=el('button',undefined,'combined-choice'),img=el('img');button.type='button';img.src=portraits[id];img.alt='';img.onerror=()=>{img.hidden=true;};button.append(img,el('strong',names[id]));button.setAttribute('aria-label',names[id]+' · '+pick('Seviye ','Level ')+(option.profile.levels[id]??0));button.onclick=()=>{controller.select(id);buttons.get(id)?.focus({preventScroll:true});};choices.append(button);buttons.set(id,button);}}
  for(const [id,button]of buttons){button.setAttribute('aria-pressed',String(s.selected===id));button.disabled=frozen||unavailable;}
  note.classList.toggle('combined-required',!s.selected);
  note.textContent=!s.selected?pick('Komutan seçilmeden devam edilemez.','Choose a commander before continuing.'):option?names[s.selected]+' · '+pick('Sv. ','Lv. ')+option.profile.levels[s.selected]:pick('Değerler yenileniyor…','Updating stats…');
  summary.replaceChildren(el('small',pick('KOMUTAN KATKISI','COMMANDER BONUS')));
  if(unavailable)summary.append(el('span',s.error?pick('Değerler doğrulanamadı','Could not verify stats'):pick('Hesaplanıyor…','Calculating…')));
  else if(option){const line=el('div',undefined,'combined-stat-deltas');for(const field of ['attack','defense','maxHp'])line.append(el('span',delta(option.totals[field]-s.baseline.totals[field])+' '+labels[field]));summary.append(line,el('small',pick('Aynı dizilişin komutansız hâline göre','Compared with this formation without a commander')));}
  else summary.append(el('span',pick('Komutan seçilmedi','No commander selected')));
  const detailKey=JSON.stringify([current,s.baseline,unavailable]);
  if(detailKey!==lastDetails){lastDetails=detailKey;detailContent.replaceChildren();if(!unavailable&&current){const totals=el('div',undefined,'combined-totals');for(const key of ['attack','defense','maxHp','speed'])totals.append(el('span',labels[key]+': '+fmt(s.baseline.totals[key])+' → '+fmt(current.totals[key])));detailContent.append(totals,el('p',pick('Başlangıç değerleri; saf, kredi, komutan ve savaş başı pasifleri dahildir. Yeşil farklar komutansız aynı dizilişe göredir.','Starting stats include formation, credits, commander and starting passives. Changes compare with this formation without a commander.')));const list=el('ul');for(const hero of current.heroes){const base=s.baseline.heroes.find(h=>h.id===hero.id),item=el('li');item.append(el('strong',hero.name));for(const key of ['attack','defense','maxHp','speed'])item.append(el('span',labels[key]+': '+fmt(base[key])+' → '+fmt(hero[key])));list.append(item);}detailContent.append(list);if(option){detailContent.append(el('p',pick('Ana dal en fazla 40, yan dallar 20 etkin seviyedir. Kayıtlı seviyeler korunur. Aktif yetenekler bu başlangıç değerlerine dahil değildir.','The main branch has up to 40 effective levels, other branches 20. Earned levels are retained. Active abilities are not included in starting stats.')));const skills=el('div',undefined,'combined-skills');renderCommanderSkills(skills,option.profile,{english,document:doc});detailContent.append(skills);}}}
  status.textContent=s.error==='MATCH_CHANGED'?pick('Maç değişti. Güncel maçı yükle.','The match changed. Reload the current match.'):s.error?pick('Bağlantı doğrulanamadı. Tekrar dene.','Could not verify the connection. Please retry.'):s.uncertain?pick('Onay sonucu doğrulanıyor.','Verifying confirmation.'):s.locked?pick('✓ Hazırsın. Diğer oyuncu bekleniyor…','✓ Ready. Waiting for the other player…')+' '+s.ready.filter(Boolean).length+'/2':s.busy?pick('Diziliş ve komutan onaylanıyor…','Confirming formation and commander…'):s.formationLocked?pick('Dizilişin onaylı. Komutanını seç.','Your formation is locked. Choose your commander.'):'';
  status.hidden=!status.textContent;confirm.disabled=frozen||unavailable;confirm.setAttribute('aria-disabled',String(!s.selected||frozen||unavailable));confirm.textContent=s.locked?pick('✓ Hazırsın','✓ Ready'):pick('Hazırım · Arenaya geç →','Ready · Enter arena →');retry.hidden=!s.error||s.error==='MATCH_CHANGED';reload.hidden=s.error!=='MATCH_CHANGED';
 }});
 confirm.onclick=()=>void controller.confirm();retry.onclick=()=>void controller.refresh();
 function dispose(){if(disposed)return;disposed=true;controller.destroy();clearInterval(timer);window.removeEventListener('pagehide',dispose);window.removeEventListener('popstate',dispose);}
 window.addEventListener('pagehide',dispose);window.addEventListener('popstate',dispose);
 void controller.refresh();timer=setInterval(()=>void controller.refresh(),1800);title.focus({preventScroll:true});return {destroy:dispose,state:controller};
}
