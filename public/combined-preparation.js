import {validateFormation,swapSameLaneHeroes,preparationCenterSlot} from './preparation-formation.js';
import {renderCommanderSkills} from './commander-profile-view.js';

const copy=value=>structuredClone(value);
const roleField={tank:'defense',fighter:'attack',assassin:'attack',energy:'attack',support:'healingRate'};
const roleBranch={tank:'defense',fighter:'attack',assassin:'attack',energy:'magic',support:'support'};
const portraits={attack:'/images/optimized/commander-attack.bad033e5f738a797.webp',defense:'/images/optimized/commander-defense.d1127052dd9f841b.webp',magic:'/images/optimized/commander-magic.86e58333914984ea.webp',support:'/images/optimized/commander-support.d6ec4a88632b972d.webp'};

// This controller never calculates battle stats. Every before/after value comes
// from the server's live preparation engine for this exact local formation.
export function createCombinedPreparationState({matchKey,team,preparation,request,saveDraft=()=>{},beforeConfirm=()=>{},onLocked=()=>{},onChange=()=>{},onStarted=()=>{}}){
 if(!validateFormation(preparation,team))throw Error('Invalid preparation');
 let state={formation:copy(preparation),formationLocked:!!preparation.ready,options:[],baseline:null,selected:null,selectedHeroSlot:null,locked:null,ready:[],busy:false,previewPending:true,error:null,uncertain:false,required:false};
 let disposed=false,started=false,revision=0,loading=false,refreshAgain=false;
 const publish=()=>{if(!disposed)onChange({...state})};
 const blocked=()=>disposed||state.busy||!!state.locked||state.uncertain||state.error==='MATCH_CHANGED';
 function apply(data){
  if(disposed)return;
  if(data.matchKey!==matchKey)throw Error('MATCH_CHANGED');
  const locked=data.selection??data.commanderSelection?.profile??null;
  if(data.preparation&&(data.preparation.ready||locked)){
   if(!validateFormation(data.preparation,team))throw Error('Invalid preparation');
   state.formation=copy(data.preparation);state.formationLocked=!!data.preparation.ready;state.selectedHeroSlot=null;
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
  revision++;state.busy=true;state.selectedHeroSlot=null;publish();
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
 function editFormation(formation){
  state.formation=formation;state.selectedHeroSlot=null;
  revision++;state.previewPending=true;state.error=null;state.baseline=null;state.options=[];publish();
  void Promise.resolve(saveDraft(copy(state.formation))).catch(()=>{});void refresh();
 }
 return {refresh,confirm,snapshot:()=>copy(state),
  select(id){if(blocked()||!state.options.some(o=>o.commanderId===id))return;state.selected=id;state.required=false;publish();},
  move(slot,lane){
   if(blocked()||state.formationLocked||!Number.isInteger(slot)||slot<0||slot>=5||!['front','back'].includes(lane)||state.formation.lanes[slot]===lane)return;
   const formation={...state.formation,lanes:[...state.formation.lanes]};formation.lanes[slot]=lane;editFormation(formation);
  },
  selectHero(slot){
   if(blocked()||state.formationLocked||!Number.isInteger(slot)||slot<0||slot>=5||state.formation.lanes.filter(lane=>lane===state.formation.lanes[slot]).length<2)return;
   const first=state.selectedHeroSlot;
   if(first===slot){state.selectedHeroSlot=null;publish();return;}
   if(first===null||state.formation.lanes[first]!==state.formation.lanes[slot]){state.selectedHeroSlot=slot;publish();return;}
   const next=swapSameLaneHeroes(state.formation,team,first,slot);if(next)editFormation(next);
  },destroy(){disposed=true;revision++;},resolve:apply};
}

export function mountCombinedPreparation({root,code,token,matchKey,team,preparation,english=false,draft,getPortrait=async()=>null,onStarted,fetcher=fetch,getAuthToken=()=>JSON.parse(localStorage.getItem('hero-auction-login')||'null')?.authToken}){
 const doc=root.ownerDocument,pick=(tr,en)=>english?en:tr;
 const el=(tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
 const fmt=n=>Number(n??0).toLocaleString(english?'en-US':'tr-TR',{maximumFractionDigits:2}),delta=n=>(n>0?'+':'')+fmt(n);
 const names={attack:pick('Saldırı','Attack'),defense:pick('Savunma','Defense'),magic:pick('Büyücü','Mage'),support:pick('Şifacı','Healer')};
 const roleNames={tank:pick('Tank','Tank'),fighter:pick('Savaşçı','Fighter'),assassin:pick('Suikastçı','Assassin'),energy:pick('Büyücü','Mage'),support:pick('Destek','Support')};
 const labels={attack:pick('Saldırı','Attack'),defense:pick('Savunma','Defense'),maxHp:pick('Can','HP'),speed:pick('Hız','Speed'),healingRate:pick('Şifa oranı (%)','Healing rate (%)'),healingPower:pick('Şifa gücü','Healing power')};
 root.hidden=false;root.className='combined-preparation';root.setAttribute('aria-labelledby','combined-preparation-title');
 const header=el('header',undefined,'combined-header'),heading=el('div');heading.append(el('small','HERO AUCTION'));
 const title=el('h1',pick('Diziliş ve komutan','Formation & commander'));title.id='combined-preparation-title';title.tabIndex=-1;heading.append(title);header.append(heading,el('span',pick('Açık artırma bitti','Auction complete')));
 const panel=el('section',undefined,'combined-panel'),content=el('div',undefined,'combined-content'),formationSection=el('section'),formationHeading=el('div',undefined,'combined-section-title');formationHeading.append(el('h2',pick('Dizilişin','Your formation')),el('span',pick('5 kahraman','5 heroes')));formationSection.append(formationHeading);
 const formationNote=el('p',undefined,'combined-formation-note');formationNote.setAttribute('role','status');formationSection.append(formationNote);
 const rows={},laneCounts={};for(const lane of ['front','back']){const section=el('section',undefined,'combined-lane');section.dataset.lane=lane;formationSection.append(section);const label=el('div',undefined,'combined-lane-label');label.append(el('span',lane==='front'?pick('Ön saf','Front'):pick('Arka saf','Back')));laneCounts[lane]=el('small');label.append(laneCounts[lane]);section.append(label);rows[lane]=el('div',undefined,'combined-row');rows[lane].dataset.lane=lane;section.append(rows[lane]);}
 const positionHelp=el('details',undefined,'combined-position-help'),positionHelpSummary=el('summary',pick('Yerleşim ve merkez savunması','Positioning and center defense')),centerHelp=el('p',pick('Yer değiştirmek için aynı saftaki iki kahramana sırayla dokun. Yalnızca 2 ön + 3 arka dizilişinde arka safın ortasındaki kahraman savaş başında kalıcı %15 savunma kazanır. Normal şekilde hedef alınabilir; diğer kahramanların ölümü bonusu kaldırmaz.','Tap two heroes in the same row to swap them. Only a 2-front + 3-back formation grants its rear-center hero a permanent 15% starting defense bonus. It can be targeted normally; allied deaths do not remove the bonus.'));centerHelp.id='combined-center-help';positionHelp.append(positionHelpSummary,centerHelp);formationSection.append(positionHelp);
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
  const active=root.contains(doc.activeElement)?doc.activeElement:null;
  const focusClass=active?.classList.contains('combined-move')?'combined-move':active?.classList.contains('combined-hero-pick')?'combined-hero-pick':null;
  const focusedHero=focusClass?active.dataset.heroId:null;
  const unavailable=s.previewPending||!!s.error,option=s.options.find(o=>o.commanderId===s.selected),current=option||s.baseline;
  const frozen=s.busy||!!s.locked||s.uncertain||s.error==='MATCH_CHANGED',centerSlot=preparationCenterSlot(s.formation);
  const boardKey=JSON.stringify([s.formation,s.formationLocked,current,s.baseline,s.selected,s.selectedHeroSlot,unavailable,frozen]);
  if(boardKey!==lastBoard){lastBoard=boardKey;for(const row of Object.values(rows))row.replaceChildren();
   for(const [slot,index]of s.formation.positions.entries()){
    const hero=team[index],lane=s.formation.lanes[slot],unit=current?.heroes.find(h=>h.id===hero.id),base=s.baseline?.heroes.find(h=>h.id===hero.id),field=roleField[hero.role];
    const card=el('article',undefined,'combined-hero');card.dataset.heroId=hero.id;card.classList.toggle('combined-specialty',s.selected===roleBranch[hero.role]);card.classList.toggle('combined-swap-selected',s.selectedHeroSlot===slot);
    const canSwap=s.formation.lanes.filter(value=>value===lane).length>1;
    const pickHero=el('button',undefined,'combined-hero-pick');pickHero.type='button';pickHero.dataset.slot=slot;pickHero.dataset.heroId=hero.id;pickHero.disabled=frozen||s.formationLocked||!canSwap;pickHero.setAttribute('aria-pressed',String(s.selectedHeroSlot===slot));pickHero.setAttribute('aria-label',hero.name+' · '+(lane==='front'?pick('Ön saf','Front'):pick('Arka saf','Back'))+' · '+(!canSwap?pick('Bu safta tek kahraman','Only hero in this row'):s.selectedHeroSlot===slot?pick('Seçildi. Seçimi kaldır','Selected. Clear selection'):pick('Yer değiştirmek için seç','Select to swap'))+(slot===centerSlot?' · '+pick('Merkez: +%15 savunma','Center: +15% defense'):''));
    const imageBox=el('div',undefined,'combined-portrait-box');pickHero.append(imageBox,el('span',roleNames[hero.role],'combined-hero-role'),el('strong',hero.name,'combined-hero-name'));
    if(slot===centerSlot){const badge=el('span',pick('+%15 savunma','+15% defense'),'combined-center-badge');pickHero.append(badge);pickHero.setAttribute('aria-describedby',centerHelp.id);}
    pickHero.onclick=()=>{controller.selectHero(slot);root.querySelector('.combined-hero-pick[data-hero-id="'+hero.id+'"]')?.focus({preventScroll:true});};
    const effect=el('span',undefined,'combined-hero-effect');effect.append(el('span',labels[field],'combined-effect-label'));
    if(unavailable||!unit||!base)effect.append(el('span',pick('Hesaplanıyor…','Calculating…'),'combined-effect-pending'));
    else if(option){const values=el('span',undefined,'combined-effect-values');values.append(el('span',fmt(base[field])+' → '),el('b',fmt(unit[field])));effect.append(values,el('span',delta(unit[field]-base[field]),'combined-delta'));effect.setAttribute('aria-label',labels[field]+': '+fmt(base[field])+' → '+fmt(unit[field])+'; '+pick('Komutan katkısı ','Commander bonus ')+delta(unit[field]-base[field]));}
    else effect.append(el('b',fmt(unit[field]),'combined-effect-values'));
    const move=el('button',lane==='front'?pick('↓ Arkaya çek','↓ Move back'):pick('↑ Öne çek','↑ Move forward'),'combined-move');move.type='button';move.dataset.slot=slot;move.dataset.heroId=hero.id;move.disabled=frozen||s.formationLocked;move.setAttribute('aria-label',hero.name+' · '+(lane==='front'?pick('Arkaya çek','Move back'):pick('Öne çek','Move forward')));move.onclick=()=>{controller.move(slot,lane==='front'?'back':'front');root.querySelector('.combined-move[data-hero-id="'+hero.id+'"]')?.focus({preventScroll:true});};
    card.append(pickHero,effect,move);rows[lane].append(card);portrait(index,imageBox);
   }
   for(const [lane,row]of Object.entries(rows)){const count=row.children.length;row.dataset.count=String(count);laneCounts[lane].textContent=count+' '+pick('kahraman','heroes');if(!count)row.append(el('span',pick('Bu safta kahraman yok','No heroes in this row'),'combined-empty'));}
  }
  const picked=s.selectedHeroSlot===null?null:team[s.formation.positions[s.selectedHeroSlot]];
  formationNote.textContent=s.locked||s.formationLocked?pick('Diziliş kilitlendi.','Formation locked.'):s.busy?pick('Diziliş onaylanıyor…','Confirming formation…'):s.uncertain?pick('Onay sonucu doğrulanıyor…','Verifying confirmation…'):s.error==='MATCH_CHANGED'?pick('Maç değişti. Güncel maçı yükle.','The match changed. Reload the current match.'):picked?picked.name+' · '+pick('Aynı saftaki başka kahramana dokun.','Tap another hero in the same row.'):pick('Yer değiştirmek için aynı saftaki iki kahramana dokun.','Tap two heroes in the same row to swap them.');
  if(focusedHero!==null)root.querySelector('.'+focusClass+'[data-hero-id="'+focusedHero+'"]')?.focus({preventScroll:true});
  const choiceKey=JSON.stringify(s.options.map(o=>[o.commanderId,o.profile.levels]));
  // Keep choices present during a lane refresh; only values are unavailable.
  if(s.options.length&&choiceKey!==lastChoices){lastChoices=choiceKey;choices.replaceChildren();buttons=new Map();for(const option of s.options){const id=option.commanderId,button=el('button',undefined,'combined-choice'),img=el('img');button.type='button';img.src=portraits[id];img.alt='';img.onerror=()=>{img.hidden=true;};button.append(img,el('strong',names[id]));button.setAttribute('aria-label',names[id]+' · '+pick('Seviye ','Level ')+(option.profile.levels[id]??0));button.onclick=()=>{controller.select(id);buttons.get(id)?.focus({preventScroll:true});};choices.append(button);buttons.set(id,button);}}
  for(const [id,button]of buttons){button.setAttribute('aria-pressed',String(s.selected===id));button.disabled=frozen||unavailable;}
  note.classList.toggle('combined-required',!s.selected);
  note.textContent=!s.selected?pick('Komutan seçilmeden devam edilemez.','Choose a commander before continuing.'):option?names[s.selected]+' · '+pick('Sv. ','Lv. ')+option.profile.levels[s.selected]:pick('Değerler yenileniyor…','Updating stats…');
  summary.replaceChildren(el('small',pick('KOMUTAN KATKISI','COMMANDER BONUS')));
  if(unavailable)summary.append(el('span',s.error?pick('Değerler doğrulanamadı','Could not verify stats'):pick('Hesaplanıyor…','Calculating…')));
  else if(option){const line=el('div',undefined,'combined-stat-deltas');for(const field of ['attack','defense','healingPower'])line.append(el('span',delta(option.totals[field]-s.baseline.totals[field])+' '+labels[field]));summary.append(line,el('small',pick('Aynı dizilişin komutansız hâline göre','Compared with this formation without a commander')));}
  else summary.append(el('span',pick('Komutan seçilmedi','No commander selected')));
  const detailKey=JSON.stringify([current,s.baseline,unavailable]);
  if(detailKey!==lastDetails){lastDetails=detailKey;detailContent.replaceChildren();if(!unavailable&&current){const totals=el('div',undefined,'combined-totals');for(const key of ['attack','defense','maxHp','speed','healingPower'])totals.append(el('span',labels[key]+': '+fmt(s.baseline.totals[key])+' → '+fmt(current.totals[key])));detailContent.append(totals,el('p',pick('Başlangıç değerleri; saf, kredi, komutan ve savaş başı pasifleri dahildir. Yeşil farklar komutansız aynı dizilişe göredir.','Starting stats include formation, credits, commander and starting passives. Changes compare with this formation without a commander.')));const list=el('ul');for(const hero of current.heroes){const base=s.baseline.heroes.find(h=>h.id===hero.id),item=el('li');item.append(el('strong',hero.name));for(const key of ['attack','defense','maxHp','speed','healingPower'])item.append(el('span',labels[key]+': '+fmt(base[key])+' → '+fmt(hero[key])));list.append(item);}detailContent.append(list);if(option){detailContent.append(el('p',pick('Yalnız seçilen komutanın kendi kahraman türlerine geliştirme bonusu uygulanır (en fazla 40 seviye). Diğer dalların seviyeleri korunur; o komutan seçilene kadar bonus vermez. Şifa gücü, eksik can sınırı öncesi tek şifanın miktarıdır. Şifa bonusu orana yüzde puanı ekler; saldırıyı değiştirmez. Komutanın aktif yetenekleri bu başlangıç değerlerine dahil değildir.','Only the selected commander grants upgrade bonuses to its matching hero roles (up to 40 levels). Other branch levels are retained but grant no bonus until their commander is selected. Healing power is one heal before the missing-health limit. The healing bonus adds percentage points to its rate without changing attack. Commander active abilities are not included in starting stats.')));const skills=el('div',undefined,'combined-skills');renderCommanderSkills(skills,option.profile,{english,document:doc});detailContent.append(skills);}}}
  status.textContent=s.error==='MATCH_CHANGED'?pick('Maç değişti. Güncel maçı yükle.','The match changed. Reload the current match.'):s.error?pick('Bağlantı doğrulanamadı. Tekrar dene.','Could not verify the connection. Please retry.'):s.uncertain?pick('Onay sonucu doğrulanıyor.','Verifying confirmation.'):s.locked?pick('✓ Hazırsın. Diğer oyuncu bekleniyor…','✓ Ready. Waiting for the other player…')+' '+s.ready.filter(Boolean).length+'/2':s.busy?pick('Diziliş ve komutan onaylanıyor…','Confirming formation and commander…'):s.formationLocked?pick('Dizilişin onaylı. Komutanını seç.','Your formation is locked. Choose your commander.'):'';
  status.hidden=!status.textContent;confirm.disabled=frozen||unavailable;confirm.setAttribute('aria-disabled',String(!s.selected||frozen||unavailable));confirm.textContent=s.locked?pick('✓ Hazırsın','✓ Ready'):pick('Hazırım · Arenaya geç →','Ready · Enter arena →');retry.hidden=!s.error||s.error==='MATCH_CHANGED';reload.hidden=s.error!=='MATCH_CHANGED';
 }});
 confirm.onclick=()=>void controller.confirm();retry.onclick=()=>void controller.refresh();
 function dispose(){if(disposed)return;disposed=true;controller.destroy();clearInterval(timer);window.removeEventListener('pagehide',dispose);window.removeEventListener('popstate',dispose);}
 window.addEventListener('pagehide',dispose);window.addEventListener('popstate',dispose);
 void controller.refresh();timer=setInterval(()=>void controller.refresh(),1800);title.focus({preventScroll:true});return {destroy:dispose,state:controller};
}
