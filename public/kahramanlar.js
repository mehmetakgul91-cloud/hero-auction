const root=document.getElementById('hero-gallery'),status=document.getElementById('gallery-status'),filters=document.getElementById('hero-filters'),search=document.getElementById('hero-search');
const categories=[['all','TÜMÜ'],['tank','🛡️ TANK'],['fighter','⚔️ SAVAŞÇI'],['assassin','🥷 SUİKASTÇI'],['energy','🔮 ENERJİ / BÜYÜCÜ'],['support','💚 DESTEK'],['legendary','🌟 EFSANEVİ'],['rare','💎 NADİR'],['advanced','🔷 GELİŞMİŞ'],['common','⚪ SIRADAN']];
const worlds={marvel:'MARVEL',dc:'DC',original:'HERO AUCTION',lotr:'YÜZÜKLERİN EFENDİSİ',pokemon:'POKÉMON'};
const roleNames={tank:'Tank',fighter:'Savaşçı',assassin:'Suikastçı',energy:'Enerji / Büyücü',support:'Destek'};
const rarityNames={common:'SIRADAN',advanced:'GELİŞMİŞ',rare:'NADİR',legendary:'EFSANEVİ',siradan:'SIRADAN',gelismis:'GELİŞMİŞ',nadir:'NADİR',efsanevi:'EFSANEVİ'};
let heroes=[],selected='all';
const shortDescriptions={tank:'Ön safta dayanıklılığıyla takımını korur.',fighter:'Yakın dövüşte güçlü saldırılarla rakibi zorlar.',assassin:'Hızlı ve delici saldırılarla kritik hedefleri avlar.',energy:'Büyü ve enerji yetenekleriyle uzaktan baskı kurar.',support:'Takımına destek sağlayarak savaşın gidişatını değiştirir.'};
const roleIntro={
 tank:'Ön safta yer alarak gelen darbeleri karşılar ve takımının savunmasını güçlendirir.',
 fighter:'Yakın dövüşte rakibe baskı kurar ve ön saftaki çatışmalarda etkili olur.',
 assassin:'Hızlı hamlelerle savunmadaki açıklıkları değerlendirir ve hedeflerine baskın yapar.',
 energy:'Arka saftan büyü ve enerji saldırılarıyla rakip düzenini bozmaya çalışır.',
 support:'Takım arkadaşlarını destekleyerek uzun süren mücadelelerde dengeyi korur.'
};
const passiveEffects={
 guard:'savunma ve hasar azaltma avantajı',
 evasion:'saldırılardan kaçınma avantajı',
 rage:'saldırı gücü avantajı',
 focus:'yetenek odağı avantajı',
 regen:'can yenileme avantajı',
 resist:'direnç avantajı',
 momentum:'savaş temposu avantajı'
};
function heroCardSummary(hero){
 const roleText=roleIntro[hero.role]||'Arenada takımının stratejisine uygun bir görev üstlenir.';
 const activeText=hero.active?.name?'Aktif yeteneği '+prettySkill(hero.active.name)+' ile savaşta özel bir hamle yapar.':'Kendi rolüne uygun hamlelerle savaşın gidişatını etkiler.';
 const passive=hero.passive;
 const passiveText=passive?.name?'Pasif yeteneği '+prettySkill(passive.name)+', '+(passiveEffects[passive.effect]||'sürekli bir savaş avantajı')+' sağlar'+(Number.isFinite(Number(passive.value))&&Number(passive.value)>0?' ('+(Number(passive.value)*100).toFixed(0)+'%)':'')+'.':'Pasif yetenek bilgisi henüz tanımlanmamıştır.';
 return roleText+' '+activeText+' '+passiveText;
}
const prettySkill=name=>String(name||'').replace(/[-_]/g,' ').replace(/\b\p{L}/gu,c=>c.toLocaleUpperCase('tr-TR'));
const fmt=n=>(n>=0?'+':'')+(n*100).toFixed(0)+'%';
function line(label,value){const el=document.createElement('div');el.className='gallery-detail-line';const a=document.createElement('span'),b=document.createElement('strong');a.textContent=label;b.textContent=value;el.append(a,b);return el}
function makeCard(hero){
 const card=document.createElement('article');card.className='gallery-card'; const rarityKey=({efsanevi:'legendary',nadir:'rare',gelismis:'advanced',siradan:'common'})[hero.rarity]||hero.rarity; if(['legendary','rare','advanced','common'].includes(rarityKey))card.classList.add('gallery-card--'+rarityKey);
 card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',hero.name+' hikâyesini oku');card.addEventListener('click',()=>openHeroStory(hero));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openHeroStory(hero)}});
 const art=document.createElement('div');art.className='gallery-art';
 const fallback=document.createElement('div');fallback.className='gallery-fallback';fallback.textContent='✦';art.append(fallback);
 if(hero.portrait){const img=document.createElement('img');img.src=hero.portrait;img.alt=hero.name;img.loading='lazy';img.onerror=()=>img.remove();art.append(img)}
 else{const img=document.createElement('img');img.alt=hero.name;img.loading='lazy';fetch('/api/art?universe='+encodeURIComponent(hero.universe)+'&name='+encodeURIComponent(hero.name)).then(r=>r.ok?r.json():null).then(data=>{if(data?.url){img.src=data.url;art.append(img)}}).catch(()=>{});img.onerror=()=>img.remove()}
 const body=document.createElement('div');body.className='gallery-card-body';
 const world=document.createElement('span');world.className='gallery-world';world.textContent=worlds[hero.universe]||hero.universe;
 const title=document.createElement('h2');title.textContent=hero.name;
 const role=document.createElement('span');role.className='gallery-role';role.textContent=roleNames[hero.role]||hero.role;
 body.append(world,title,role); const summary=document.createElement('p');summary.className='gallery-summary';summary.textContent=heroCardSummary(hero);body.append(summary);
 if(hero.rarity){const rarity=document.createElement('span');rarity.className='gallery-rarity';rarity.textContent='NADİRLİK: '+(rarityNames[hero.rarity]||hero.rarity.toLocaleUpperCase('tr-TR'));body.append(rarity)}
 const details=document.createElement('div');details.className='gallery-details';
 if(Number.isInteger(hero.power))details.append(line('Güç',hero.power+'/100'));
 if(hero.laneModifiers){details.append(line('🛡 Ön saf',fmt(Number(hero.laneModifiers.front)||0)),line('🎯 Arka saf',fmt(Number(hero.laneModifiers.back)||0)))}
 if(hero.active?.name)details.append(line('⚡ Aktif yetenek',prettySkill(hero.active.name)));
 if(hero.passive?.name)details.append(line('✦ Pasif yetenek',prettySkill(hero.passive.name)));
 if(hero.stats){const labels={attack:'Saldırı',defense:'Savunma',ability:'Yetenek',control:'Kontrol',mobility:'Hareket'};const stats=document.createElement('div');stats.className='gallery-stat-grid';for(const [key,label] of Object.entries(labels)){if(hero.stats[key]===undefined)continue;const el=document.createElement('span');el.textContent=label+' '+hero.stats[key];stats.append(el)}details.append(stats)}
 body.append(details);card.append(art,body);return card
}
function render(){
 filters.replaceChildren();for(const [id,label] of categories){const b=document.createElement('button');b.type='button';b.className='gallery-filter'+(selected===id?' selected':'');b.textContent=label;b.setAttribute('aria-pressed',String(selected===id));b.onclick=()=>{selected=id;render()};filters.append(b)}
 const q=search.value.trim().toLocaleLowerCase('tr-TR');const visible=heroes.filter(h=>(selected==='all'||h.role===selected||((rarityNames[selected]||'')&&(rarityNames[h.rarity]===rarityNames[selected])))&&h.name.toLocaleLowerCase('tr-TR').includes(q));
 root.replaceChildren();const fragment=document.createDocumentFragment();for(const h of visible)fragment.append(makeCard(h));root.append(fragment);
 status.textContent=visible.length+' kahraman gösteriliyor · Toplam '+heroes.length+' kart';if(!visible.length)status.textContent='Bu filtrede kahraman bulunamadı.'
}
search.addEventListener('input',render);
fetch('/api/heroes',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Kart kataloğu alınamadı');return r.json()}).then(data=>{heroes=Array.isArray(data.heroes)?data.heroes:[];render()}).catch(e=>{status.textContent='⚠ '+e.message;root.replaceChildren()});

function openHeroStory(hero){
 const dialog=document.getElementById('hero-story-dialog');
 document.getElementById('hero-story-title').textContent=hero.name;
 const text=document.getElementById('hero-story-text');text.replaceChildren();
 const sentences=heroStory(hero).match(/[^.!?]+[.!?]+/g)||[heroStory(hero)];
 for(let i=0;i<sentences.length;i+=4){const p=document.createElement('p');p.textContent=sentences.slice(i,i+4).join(' ').trim();text.append(p)}
 dialog.showModal();
}
document.getElementById('hero-story-close').addEventListener('click',()=>document.getElementById('hero-story-dialog').close());
document.getElementById('hero-story-dialog').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close()});
