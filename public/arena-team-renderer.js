import {applyHeroRarity} from './hero-rarity.js';
// Shield is always taken from the server snapshot, never inferred from damage text.
// Uncapped shields use HP as a visual reference, not as a gameplay maximum.
export function arenaShieldMeter(unit){
 const current=Number.isFinite(Number(unit.shield))?Math.max(0,Number(unit.shield)):0;
 const capped=Number.isFinite(unit.shieldCap)&&unit.shieldCap>=0;
 const reference=capped?unit.shieldCap:Math.max(1,Number.isFinite(Number(unit.maxHp))?Number(unit.maxHp):0,current);
 return {current,reference,percent:reference>0?Math.min(100,100*current/reference):0,
  label:unit.shieldKnown===false?'Kalkan bilgisi bekleniyor':'Kalkan '+current+(capped?' / '+reference:' · ölçek: '+reference+' can')};
}
// Keep decoded portraits and running animations alive between server snapshots.
// Each team owns its cards: the same hero ID can exist on both sides.
export function createArenaTeamRenderer({document,loadArt,onDefeated=()=>{}}){
 let teams=new WeakMap();
 function update(parent,units,{side,rows,laneRows,fittedRows,flash,roleNames}){
  let cards=teams.get(parent);
  if(!cards){cards=new Map();teams.set(parent,cards);parent.replaceChildren();}
  const ids=new Set(units.map(unit=>unit.id));
  for(const [id,entry] of cards)if(!ids.has(id)){entry.card.remove();cards.delete(id);}
  parent.style.setProperty('--arena-row-count',String(rows));
  const laneIndices={front:0,back:0};
  units.forEach((unit,index)=>{
   let entry=cards.get(unit.id);
   if(entry&&entry.name!==unit.name){entry.card.remove();cards.delete(unit.id);entry=null;}
   if(!entry){
    const card=document.createElement('article');card.dataset.heroId=unit.id;card.className='hero arena-hero';
    const portrait=document.createElement('div');portrait.className='arena-portrait';portrait.setAttribute('role','img');
    const fallback=document.createElement('span');fallback.className='portrait-fallback';fallback.textContent=unit.name.slice(0,1);portrait.append(fallback);
    const label=document.createElement('span');label.className='arena-hero-label';label.textContent=unit.name;
    const bar=document.createElement('div');bar.className='hp';const fill=document.createElement('span');bar.append(fill);
    const shieldBar=document.createElement('div');shieldBar.className='arena-shield';shieldBar.setAttribute('role','meter');shieldBar.setAttribute('aria-valuemin','0');
    const shieldFill=document.createElement('span');shieldBar.append(shieldFill);
    card.append(portrait,label,bar,shieldBar);parent.append(card);
    entry={card,portrait,bar,fill,shieldBar,shieldFill,name:unit.name,hp:unit.hp};cards.set(unit.id,entry);
    Promise.resolve(loadArt(unit)).then(url=>{
     if(!url||!portrait.isConnected)return;
     const image=document.createElement('img');image.className='arena-portrait-image';image.alt=unit.name;image.decoding='async';
     image.onload=()=>{if(!portrait.isConnected)return;image.classList.toggle('hero-portrait-wide',image.naturalWidth>image.naturalHeight);fallback.remove();portrait.append(image);};
     image.src=url;
    }).catch(()=>{});
   }
   const {card,portrait,bar,fill,shieldBar,shieldFill}=entry,lane=unit.lane==='front'?'front':'back',laneIndex=laneIndices[lane]++;
   if(parent.children[index]!==card)parent.insertBefore(card,parent.children[index]||null);
   card.classList.toggle('frontline',lane==='front');card.classList.toggle('backline',lane==='back');card.classList.toggle('dead',unit.hp<=0);
   card.classList.toggle('cast',flash?.actorId===unit.id);card.classList.toggle('hit',flash?.targetId===unit.id);
   card.dataset.lane=lane;card.dataset.role=unit.role||'';
   card.style.gridColumn=lane==='front'?(side?'1':'2'):(side?'2':'1');card.style.gridRow=String(laneRows[lane][laneIndex]);card.style.setProperty('--arena-fitted-row',String(fittedRows[lane][laneIndex]));
   const rarityLabel=applyHeroRarity(document,portrait,unit);
   card.title=unit.name+' · '+rarityLabel+' · '+roleNames[unit.role]+(unit.hp<=0?(document.documentElement?.lang==='en'?' · Defeated':' · Yenildi'):'')+' · Can '+unit.hp+'/'+unit.maxHp;
   portrait.setAttribute('aria-label',unit.name+' · '+rarityLabel+' · '+roleNames[unit.role]+(unit.hp<=0?(document.documentElement?.lang==='en'?' · Defeated':' · Yenildi'):''));bar.setAttribute('aria-label','Can '+unit.hp+' / '+unit.maxHp);
   fill.style.width=(unit.maxHp>0?Math.max(0,Math.min(100,100*unit.hp/unit.maxHp)):0)+'%';
   const shield=arenaShieldMeter(unit);
   shieldFill.style.width=(unit.shieldKnown===false?0:shield.percent)+'%';shieldBar.title=shield.label;
   shieldBar.setAttribute('aria-label',unit.name+' · Kalkan');
   if(unit.shieldKnown===false)shieldBar.removeAttribute('aria-valuenow');else shieldBar.setAttribute('aria-valuenow',String(shield.current));
   shieldBar.setAttribute('aria-valuemax',String(Math.max(shield.current,shield.reference,1)));shieldBar.setAttribute('aria-valuetext',shield.label);
   card.title+=' · '+shield.label;
   if(entry.hp>0&&unit.hp<=0)onDefeated(card);
   entry.hp=unit.hp;
  });
 }
 return {update,reset(){teams=new WeakMap();}};
}
