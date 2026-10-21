import {heroStoryParagraphs} from '/hero-stories.js?v=connected-lore-20261021';
import {abilityImpact} from '/hero-ability-text.js?v=short-effects-20261021';
const $=id=>document.getElementById(id);
const root=$('hero-gallery'),status=$('gallery-status'),filters=$('hero-filters'),search=$('hero-search'),roleFilter=$('hero-role'),reset=$('gallery-reset');
const roleNames={tank:'Tank',fighter:'Savaşçı',assassin:'Suikastçı',energy:'Büyücü',support:'Destek'};
const rarities=[['all','Hepsi'],['legendary','Efsanevi'],['rare','Nadir'],['advanced','Gelişmiş'],['common','Sıradan']];
const rarityNames=Object.fromEntries(rarities),rarityAliases={efsanevi:'legendary',nadir:'rare',gelismis:'advanced',siradan:'common'};
const rarityKey=hero=>rarityAliases[hero.rarity]||hero.rarity||'common';
const normalize=value=>String(value||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
let heroes=[],selectedRarity='all',loaded=false;
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
function makePortrait(hero){
 const art=el('div','gallery-art'),fallback=el('span','gallery-fallback','✦');fallback.setAttribute('aria-hidden','true');art.append(fallback);
 const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';
 img.onload=()=>art.classList.toggle('gallery-art--wide',img.naturalWidth>img.naturalHeight);
 img.onerror=()=>img.remove();
 if(hero.portrait){img.src=hero.portrait;art.append(img)}
 else fetch('/api/art?universe='+encodeURIComponent(hero.universe)+'&name='+encodeURIComponent(hero.name)).then(r=>r.ok?r.json():null).then(data=>{if(data?.url){img.src=data.url;art.append(img)}}).catch(()=>{});
 return art;
}
function makeCard(hero){
 const rarity=rarityKey(hero),card=el('article','gallery-card gallery-card--'+rarity);
 card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',hero.name+' detaylarını gör');card.setAttribute('aria-haspopup','dialog');
 card.addEventListener('click',()=>openHeroStory(hero));card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openHeroStory(hero)}});
 const art=makePortrait(hero),power=el('div','gallery-power');power.setAttribute('aria-label','Güç '+hero.power+' / 100');power.append(el('small','','GÜÇ'),el('strong','',hero.power));art.append(power);
 const body=el('div','gallery-card-body');body.append(el('span','gallery-rarity',rarityNames[rarity]),el('h2','',hero.name),el('span','gallery-role',roleNames[hero.role]||hero.role));
 const skills=el('div','gallery-skills');
 for(const [label,ability] of [['Aktif',hero.active],['Pasif',hero.passive]]){const row=el('div','gallery-skill'),effect=abilityImpact(ability);row.append(el('small','',label),el('strong','',effect));row.title=label+': '+effect;skills.append(row)}
 const link=el('div','gallery-card-link','İncele');link.append(el('span','','↗'));link.setAttribute('aria-hidden','true');
 body.append(skills,link);card.append(art,body);return card;
}
for(const [id,label] of rarities){
 const button=el('button','gallery-filter',label);button.type='button';button.dataset.rarity=id;button.setAttribute('aria-pressed',String(id==='all'));
 button.addEventListener('click',()=>{selectedRarity=id;render()});filters.append(button);
}
function render(){
 for(const button of filters.children)button.setAttribute('aria-pressed',String(button.dataset.rarity===selectedRarity));
 const query=normalize(search.value.trim());
 const visible=heroes.filter(hero=>(roleFilter.value==='all'||hero.role===roleFilter.value)&&(selectedRarity==='all'||rarityKey(hero)===selectedRarity)&&normalize(hero.name).includes(query));
 root.replaceChildren();const fragment=document.createDocumentFragment();for(const hero of visible)fragment.append(makeCard(hero));root.append(fragment);
 reset.hidden=!(query||selectedRarity!=='all'||roleFilter.value!=='all');
 $('gallery-empty').hidden=!loaded||visible.length>0;
 if(loaded)status.textContent=visible.length===heroes.length?heroes.length+' kahraman · Detaylar için karta dokun.':visible.length+' / '+heroes.length+' kahraman';
}
search.addEventListener('input',render);roleFilter.addEventListener('change',render);
reset.addEventListener('click',()=>{selectedRarity='all';roleFilter.value='all';search.value='';render();search.focus()});
async function loadHeroes(){
 loaded=false;root.setAttribute('aria-busy','true');$('gallery-retry').hidden=true;$('gallery-empty').hidden=true;status.textContent='Kahramanlar yükleniyor…';
 try{
  const response=await fetch('/api/heroes',{cache:'no-store'});if(!response.ok)throw Error('Kart kataloğu alınamadı');
  const data=await response.json();heroes=Array.isArray(data.heroes)?data.heroes:[];loaded=true;
  $('gallery-total').textContent=heroes.length+' kahraman';render();
 }catch{status.textContent='Kahramanlar yüklenemedi. Tekrar deneyebilirsin.';root.replaceChildren();$('gallery-retry').hidden=false}
 finally{root.setAttribute('aria-busy','false')}
}
$('gallery-retry').addEventListener('click',loadHeroes);void loadHeroes();

const dialog=$('hero-story-dialog'),tabs=[$('hero-skills-tab'),$('hero-lore-tab')];
function selectTab(index){
 tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1});
 $('hero-detail-skills').hidden=index!==0;$('hero-story-text').hidden=index!==1;$('hero-detail-scroll').scrollTop=0;
}
tabs.forEach((tab,index)=>{
 tab.addEventListener('click',()=>selectTab(index));
 tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:1-index;selectTab(next);tabs[next].focus()});
});
function openHeroStory(hero){
 const rarity=rarityKey(hero);dialog.className='hero-story-dialog gallery-card--'+rarity;
 $('hero-story-title').textContent=hero.name;$('hero-detail-rarity').textContent=rarityNames[rarity];$('hero-detail-role').textContent=roleNames[hero.role]||hero.role;$('hero-detail-power').textContent=hero.power;
 const portrait=makePortrait(hero);portrait.classList.add('hero-detail-portrait');$('hero-detail-portrait').replaceChildren(portrait);
 const skills=$('hero-detail-skills');skills.replaceChildren();
 for(const [kind,label,ability,icon] of [['active','Aktif yetenek',hero.active,'ϟ'],['passive','Pasif yetenek',hero.passive,'✦']]){
  const box=el('div','hero-ability-box hero-ability-box--'+kind),symbol=el('span','hero-ability-icon',icon);symbol.setAttribute('aria-hidden','true');
  const body=el('div');body.append(el('small','',label),el('h3','',abilityImpact(ability)));
  box.append(symbol,body);skills.append(box);
 }
 if(hero.laneModifiers){
  skills.append(el('h3','hero-detail-section-title','Saf bonusları'));
  const lanes=el('div','hero-lanes');
  for(const [key,label] of [['front','Ön saf'],['back','Arka saf']]){const value=Number(hero.laneModifiers[key])||0,row=el('div','hero-lane');row.append(el('span','',label),el('strong',value>=0?'positive':'negative',(value>=0?'+':'−')+Math.round(Math.abs(value)*100)+'%'));lanes.append(row)}
  skills.append(lanes);
 }
 if(hero.stats){
  const stats=el('details','hero-stat-list');stats.append(el('summary','','Özellik puanları'));
  for(const [key,label] of Object.entries({attack:'Saldırı',defense:'Savunma',ability:'Yetenek',control:'Kontrol',mobility:'Hareket'})){
   const value=Number(hero.stats[key]);if(!Number.isFinite(value))continue;
   const row=el('div','hero-stat-row'),track=el('div','hero-stat-track'),bar=el('span');bar.style.width=Math.max(0,Math.min(100,value))+'%';track.setAttribute('aria-hidden','true');track.append(bar);row.append(el('span','',label),track,el('strong','',value));stats.append(row);
  }
  skills.append(stats);
 }
 const story=$('hero-story-text');story.replaceChildren();for(const paragraph of heroStoryParagraphs(hero))story.append(el('p','',paragraph));
 selectTab(0);dialog.showModal();
}
$('hero-story-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close()}});
