import {COMMANDER_BRANCHES,renderCommanderSkills} from './commander-profile-view.js';

// Values are server-computed by the same engine used for the live arena.
const portraits={attack:'/images/optimized/commander-attack.bad033e5f738a797.webp',defense:'/images/optimized/commander-defense.d1127052dd9f841b.webp',magic:'/images/optimized/commander-magic.86e58333914984ea.webp',support:'/images/optimized/commander-support.d6ec4a88632b972d.webp'};
export const MATCH_COMMANDER_STATS=['attack','defense','maxHp','speed','cardPower'];
export function commanderComparison(option,baseline){
 return MATCH_COMMANDER_STATS.map(key=>({key,value:Number(option?.totals?.[key]??0),delta:Number(option?.totals?.[key]??0)-Number(baseline?.totals?.[key]??0)}));
}
export function createMatchCommanderState({matchKey,request,onChange=()=>{},onStarted=()=>{}}){
 let state={options:[],baseline:null,selected:null,locked:null,ready:[],busy:false,error:null},disposed=false,loading=false,started=false,revision=0;
 const publish=()=>{if(!disposed)onChange({...state})};
 function apply(data){
  if(disposed)return;
  if(data.matchKey!==matchKey)throw Error('MATCH_CHANGED');
  const locked=data.selection??data.commanderSelection?.profile??null;
  state={...state,...(data.options&&JSON.stringify([data.options,data.baseline])!==JSON.stringify([state.options,state.baseline])?{options:data.options,baseline:data.baseline}:{}),uncertain:false,locked,ready:data.commanderSelection?.ready??data.ready??[],selected:locked?.commanderId??state.selected,error:null};
  publish();
  if(data.started&&!started){started=true;onStarted(data)}
 }
 async function refresh(){
  if(disposed||loading||state.busy)return;loading=true;
  const current=revision;
  try{const data=await request('GET');if(current===revision)apply(data)}catch(error){if(current===revision){state.error=error.message;publish()}}finally{loading=false}
 }
 async function confirm(){
  if(disposed||state.busy||state.locked||state.uncertain||!state.selected||state.error==='MATCH_CHANGED')return;
  revision++;state.busy=true;publish();
  try{apply(await request('POST',state.selected))}catch(error){
   // A lost response may have committed. Resolve from server before allowing another choice.
   const original=error.message;
   try{apply(await request('GET'));state.error=state.locked?null:original}catch(recovery){state.error=recovery.message;state.uncertain=true}
  }finally{state.busy=false;publish()}
 }
 return {refresh,confirm,select(id){if(disposed||state.busy||state.locked||state.uncertain||state.error==='MATCH_CHANGED'||!state.options.some(option=>option.commanderId===id))return;state.selected=id;publish()},snapshot:()=>({...state}),destroy(){disposed=true},resolve(data){state.uncertain=false;apply(data)}};
}

export function mountMatchCommanderPicker({root,code,token,matchKey,english=false,onStarted,fetcher=fetch,getAuthToken=()=>JSON.parse(localStorage.getItem('hero-auction-login')||'null')?.authToken}){
 const doc=root.ownerDocument,pick=(tr,en)=>english?en:tr;
 const el=(tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node};
 const format=value=>Number(value||0).toLocaleString(english?'en-US':'tr-TR',{maximumFractionDigits:2});
 const delta=value=>(value>0?'+':'')+format(value);
 const labels={attack:pick('Saldırı','Attack'),defense:pick('Savunma','Defense'),maxHp:pick('Azami can','Max HP'),speed:pick('Toplam hız','Total speed'),cardPower:pick('Kart gücü','Card power')};
 const name=id=>{const branch=COMMANDER_BRANCHES.find(b=>b.id===id);return branch?branch.icon+' '+branch.name[english?1:0]:id};
 root.hidden=false;root.classList.add('match-commander-picker');root.setAttribute('aria-labelledby','match-commander-title');
 const title=el('h1',pick('Komutanını seç','Choose your commander'));title.id='match-commander-title';title.tabIndex=-1;
 const subtitle=el('p',pick('Diziliş tamamlandı · Bu maç için ücretsiz seçim · Seviyelerin korunur','Formation confirmed · Free choice for this match · Your levels are retained'));
 const status=el('p','', 'match-commander-status');status.setAttribute('role','status');
 const choices=el('div',undefined,'match-commander-options');choices.setAttribute('role','group');choices.setAttribute('aria-label',pick('Komutan seçenekleri','Commander options'));
 const details=el('div',undefined,'match-commander-details');details.setAttribute('aria-live','polite');
 const note=el('p',pick('Değerler, bu diziliş ve kalan kredi için gerçek başlangıç istatistikleridir; komutansız aynı takımla karşılaştırılır. Kart gücü savaş gücü puanı değildir. Aktif yetenekler, hedefler ve kullanım zamanı bu toplamların dışında savaş sonucunu etkiler.','These are actual starting stats for this formation and remaining credits, compared with the same team without a commander. Card power is not a combat strength score. Active abilities, targets and timing affect combat beyond these totals.'));
 const zeroNote=el('p',pick('Seviye 0 komutanlarda başlangıç değerleri aynı olabilir; aktif yetenekleri farklıdır.','Level 0 commanders can have identical starting stats; their active abilities differ.'));
 const confirm=el('button',pick('Komutanı onayla →','Confirm commander →'));confirm.type='button';confirm.disabled=true;
 const retry=el('button',pick('Tekrar dene','Retry'));retry.type='button';retry.hidden=true;
 const reload=el('a',pick('Güncel maçı yükle','Reload current match'));reload.href=location.href;reload.hidden=true;
 root.replaceChildren(title,subtitle,status,choices,details,note,zeroNote,confirm,retry,reload);
 let buttons=new Map(),lastOptions=null,lastDetail=null,disposed=false,timer=null;
 const statsList=(option,baseline)=>{const list=el('dl',undefined,'match-commander-stats');for(const {key,value,delta:change} of commanderComparison(option,baseline)){list.append(el('dt',labels[key]),el('dd',format(value)+' ('+delta(change)+')'))}return list};
 const state=createMatchCommanderState({matchKey,onStarted:data=>{if(!disposed){dispose();root.hidden=true;onStarted(data)}},request:async(method,commanderId)=>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try{const response=await fetcher(method==='GET'?'/api/battle-auction-commanders?'+new URLSearchParams({code,token,matchKey,matchCommanderSelection:1}):'/api/battle-auction-commander',{method,cache:'no-store',signal:controller.signal,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify({code,token,matchKey,commanderId,matchCommanderSelection:1,authToken:getAuthToken()})}:{})});const data=await response.json();if(!response.ok&&response.status===409&&['Komutan seçimi başka bir maça ait.','Maç değişti.','Açık artırma tamamlanmadı'].includes(data.error))throw Error('MATCH_CHANGED');if(!response.ok)throw Error(data.error||pick('Komutanlar yüklenemedi','Could not load commanders'));return data}finally{clearTimeout(timeout)}
 },onChange:s=>{
  if(s.options!==lastOptions){lastOptions=s.options;choices.replaceChildren();buttons=new Map();for(const option of s.options){const button=el('button',undefined,'match-commander-option');button.type='button';const portrait=el('img',undefined,'match-commander-portrait');portrait.src=portraits[option.commanderId];portrait.alt='';portrait.width=160;portrait.height=160;portrait.onerror=()=>{portrait.hidden=true};button.append(portrait,el('strong',name(option.commanderId)),el('span',pick('Seviye ','Level ')+(option.profile.levels[option.commanderId]??0)),statsList(option,s.baseline));button.onclick=()=>state.select(option.commanderId);choices.append(button);buttons.set(option.commanderId,button)}}
  for(const [id,button] of buttons){button.setAttribute('aria-pressed',String(s.selected===id));button.disabled=s.busy||!!s.locked||!!s.uncertain||s.error==='MATCH_CHANGED'}
  const option=s.options.find(o=>o.commanderId===s.selected);
  if(option!==lastDetail){lastDetail=option;details.replaceChildren();if(option){details.append(el('h2',name(option.commanderId)),statsList(option,s.baseline));const list=el('ul',undefined,'match-commander-heroes');for(const hero of option.heroes){const item=el('li');item.append(el('strong',hero.name+' · '+(hero.lane==='front'?pick('Ön saf','Front'):pick('Arka saf','Back'))));for(const key of ['attack','defense','maxHp','speed'])item.append(el('span',labels[key]+': '+format(hero[key])+' ('+delta(hero.delta?.[key])+')'));list.append(item)}details.append(el('h3',pick('Kahraman etkileri','Hero effects')),list);const skills=el('div',undefined,'match-commander-skills');renderCommanderSkills(skills,option.profile,{english,document:doc});details.append(skills)}}
  status.textContent=s.error==='MATCH_CHANGED'?pick('Maç değişti. Devam etmeden güncel maçı yükle.','The match changed. Reload the current match to continue.'):s.error?pick('Bağlantı doğrulanamadı. ','Could not verify the connection. ')+(english?'Please retry.':s.error):s.locked?pick('✓ Komutan onaylandı. Diğer oyuncunun dizilişi ve komutanı bekleniyor…','✓ Commander confirmed. Waiting for the other player’s formation and commander…')+' '+s.ready.filter(Boolean).length+'/2':s.busy?pick('Seçim kaydediliyor…','Saving choice…'):s.options.length?pick('Karşılaştırmak için bir komutan seç.','Select a commander to compare.'):pick('Başlangıç istatistikleri hesaplanıyor…','Calculating starting stats…');
  confirm.disabled=!s.selected||s.busy||!!s.locked||!!s.uncertain||s.error==='MATCH_CHANGED';confirm.textContent=s.locked?pick('✓ Seçim kilitlendi','✓ Choice locked'):pick('Komutanı onayla →','Confirm commander →');retry.hidden=!s.error||s.error==='MATCH_CHANGED';reload.hidden=s.error!=='MATCH_CHANGED';
 }});
 confirm.onclick=()=>void state.confirm();retry.onclick=()=>void state.refresh();
 function dispose(){if(disposed)return;disposed=true;state.destroy();clearInterval(timer);window.removeEventListener('pagehide',dispose);window.removeEventListener('popstate',dispose)}
 window.addEventListener('pagehide',dispose);window.addEventListener('popstate',dispose);
 void state.refresh();timer=setInterval(()=>void state.refresh(),1800);title.focus();return {destroy:dispose,state};
}
