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
    card.append(portrait,label,bar);parent.append(card);
    entry={card,portrait,bar,fill,name:unit.name,hp:unit.hp};cards.set(unit.id,entry);
    Promise.resolve(loadArt(unit)).then(url=>{
     if(!url||!portrait.isConnected)return;
     const image=document.createElement('img');image.className='arena-portrait-image';image.alt=unit.name;image.decoding='async';
     image.onload=()=>{if(!portrait.isConnected)return;image.classList.toggle('hero-portrait-wide',image.naturalWidth>image.naturalHeight);fallback.remove();portrait.append(image);};
     image.src=url;
    }).catch(()=>{});
   }
   const {card,portrait,bar,fill}=entry,lane=unit.lane==='front'?'front':'back',laneIndex=laneIndices[lane]++;
   if(parent.children[index]!==card)parent.insertBefore(card,parent.children[index]||null);
   card.classList.toggle('frontline',lane==='front');card.classList.toggle('backline',lane==='back');card.classList.toggle('dead',unit.hp<=0);
   card.classList.toggle('cast',flash?.actorId===unit.id);card.classList.toggle('hit',flash?.targetId===unit.id);
   card.dataset.lane=lane;card.dataset.role=unit.role||'';
   card.style.gridColumn=lane==='front'?(side?'1':'2'):(side?'2':'1');card.style.gridRow=String(laneRows[lane][laneIndex]);card.style.setProperty('--arena-fitted-row',String(fittedRows[lane][laneIndex]));
   card.title=unit.name+' · '+roleNames[unit.role]+' · Can '+unit.hp+'/'+unit.maxHp;
   portrait.setAttribute('aria-label',unit.name+' - '+roleNames[unit.role]);bar.setAttribute('aria-label','Can '+unit.hp+' / '+unit.maxHp);
   fill.style.width=(unit.maxHp>0?Math.max(0,Math.min(100,100*unit.hp/unit.maxHp)):0)+'%';
   if(entry.hp>0&&unit.hp<=0)onDefeated(card);
   entry.hp=unit.hp;
  });
 }
 return {update,reset(){teams=new WeakMap();}};
}
