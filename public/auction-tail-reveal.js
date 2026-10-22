// Cosmetic only. Inputs come from already-awarded authoritative final teams.
export function collectTailAwards(previous,next){
 if(previous?.code!==next?.code||previous?.phase!=='auction'||next?.phase!=='finished')return [];
 const offered=previous.card;
 return (next.final||[]).flatMap((player,seat)=>{
  const known=new Set((previous.players?.[seat]?.team||[]).map(card=>card.universe+':'+card.name));
  return (player.team||[]).filter(card=>!known.has(card.universe+':'+card.name)&&!(card.name===offered?.name&&card.universe===offered?.universe))
   .map(card=>({card:{...card},seat}));
 });
}
export function createTailQueue({show,finish,schedule=setTimeout,unschedule=clearTimeout,duration=1900}){
 let timer=null,items=[],index=0,generation=0,active=false;
 function stop(){generation++;if(timer!==null)unschedule(timer);timer=null;items=[];active=false;}
 function complete(){stop();finish(true);}
 return {
  get active(){return active},
  start(next,{reducedMotion=false}={}){
   stop();items=next.slice();index=0;
   if(reducedMotion||!items.length){finish(true);return;}
   active=true;const current=generation;
   const advance=()=>{if(current!==generation)return;if(index>=items.length){complete();return;}
    show(items[index],index,items.length);index++;timer=schedule(advance,duration);
   };advance();
  },
  skip:complete,
  cancel(){stop();finish(false);}
 };
}
export function mountTailReveal(root,button,items,{english=false,me=0,reducedMotion=false,loadArt,onComplete}={}){
 const doc=root.ownerDocument;
 const panel=doc.createElement('section');panel.className='auction-tail-sequence';panel.setAttribute('translate','no');
 const heading=doc.createElement('p');heading.className='auction-tail-progress';heading.setAttribute('role','status');
 const holder=doc.createElement('div');holder.className='auction-tail-holder';
 const skip=doc.createElement('button');skip.type='button';skip.className='outline';skip.textContent=english?'Show all cards':'Tüm kartları göster';
 panel.append(heading,holder,skip);root.prepend(panel);root.classList.add('auction-tail-playing');if(button)button.disabled=true;
 const cleanup=(completed)=>{const restoreFocus=doc.activeElement===skip;panel.remove();root.classList.remove('auction-tail-playing');if(button)button.disabled=false;if(restoreFocus&&button?.isConnected)button.focus();if(completed)onComplete?.();};
 const queue=createTailQueue({finish:cleanup,show:({card,seat},index,total)=>{
  heading.textContent=(seat===me?(english?'Your team':'Senin takımın'):(english?'Opponent team':'Rakip takım'))+' · '+(index+1)+' / '+total;
  const scene=doc.createElement('div');scene.className='auction-deck-scene auction-drawing auction-final-draw rarity-frame-'+(['common','advanced','rare','legendary'].includes(card.rarity)?card.rarity:'common');
  const backs=doc.createElement('div');backs.className='auction-deck-backs';backs.setAttribute('aria-hidden','true');
  for(let n=0;n<Math.min(3,total-index-1);n++){const back=doc.createElement('span');back.className='auction-deck-back';back.style.setProperty('--deck-layer',String(n+1));back.textContent='✦';backs.append(back)}
  const art=doc.createElement('div');art.className='card-art rarity-frame';art.textContent='✦';
  const name=doc.createElement('strong');name.className='auction-tail-name';name.textContent=card.name;art.append(name);
  const cover=doc.createElement('div');cover.className='auction-draw-back';cover.setAttribute('aria-hidden','true');cover.textContent='✦';
  scene.append(backs,art,cover);holder.replaceChildren(scene);
  // Late artwork can only update its own connected card, never the next reveal.
  if(loadArt)Promise.resolve(loadArt(card)).then(url=>{if(!url||!art.isConnected)return;const img=doc.createElement('img');img.alt='';img.src=url;img.onerror=()=>img.remove();art.prepend(img)}).catch(()=>{});
 }});
 skip.onclick=()=>queue.skip();queue.start(items,{reducedMotion});
 return queue;
}
