import {flyAwardCard} from './auction-card-flight.js?v=every-player-20261024';
// Cosmetic only. Inputs come from already-awarded authoritative final teams.
export function collectTailAwards(previous,next){
 // The server records hidden allocations in deck order. Both seats receive the
 // same manifest, including after reconnect when no previous snapshot exists.
 if(next?.phase==='finished'&&Array.isArray(next.tailAwards))return next.tailAwards.map(award=>({...award,card:{...award.card}}));
 if(previous?.code!==next?.code||previous?.phase!=='auction'||next?.phase!=='finished')return [];
 const offered=previous.card;
 return (next.final||[]).flatMap((player,seat)=>{
  const known=new Set((previous.players?.[seat]?.team||[]).map(card=>card.universe+':'+card.name));
  return (player.team||[]).filter(card=>!known.has(card.universe+':'+card.name)&&!(card.name===offered?.name&&card.universe===offered?.universe))
   .map(card=>({card:{...card},seat}));
 });
}
export function createTailQueue({show,arrive,onArrive,finish,schedule=setTimeout,unschedule=clearTimeout,duration=1800,arrivalDuration=550}){
 let timer=null,flight=null,items=[],index=0,generation=0,active=false;
 function stop(){generation++;if(timer!==null)unschedule(timer);timer=null;flight?.cancel?.();flight=null;items=[];active=false;}
 function complete(){stop();finish(true);}
 return {
  get active(){return active},
  start(next,{reducedMotion=false,startAfter}={}){
   stop();items=next.slice();index=0;
   if(reducedMotion||(!items.length&&!startAfter)){finish(true);return;}
   active=true;const current=generation;
   const advance=()=>{if(current!==generation)return;if(index>=items.length){complete();return;}
    const item=items[index],position=index++;show(item,position,items.length);
    timer=schedule(()=>{
     timer=null;if(current!==generation)return;
     if(!arrive){advance();return;}
     try{flight=arrive(item,position,items.length);}catch{advance();return;}
     Promise.resolve(flight?.finished).catch(()=>{}).then(result=>{if(current!==generation)return;flight=null;if(result?.arrived===true){try{onArrive?.(item);}catch{}timer=schedule(()=>{timer=null;if(current===generation)advance();},arrivalDuration);}else advance();});
    },duration);
   };if(startAfter)Promise.resolve(startAfter).catch(()=>{}).then(()=>{if(current===generation)advance();});else advance();
  },
  skip:complete,
  cancel(){stop();finish(false);}
 };
}
export function mountTailReveal(root,button,items,{english=false,me=0,reducedMotion=false,loadArt,onComplete,onArrive,onReview,reviewItems=items,resolveDestination,startAfter}={}){
 const doc=root.ownerDocument;
 const panel=doc.createElement('section');panel.className='auction-tail-sequence';panel.setAttribute('translate','no');
 const heading=doc.createElement('p');heading.className='auction-tail-progress';heading.setAttribute('role','status');heading.textContent=english?'Card moving to team':'Kart takımına gidiyor';
 const holder=doc.createElement('div');holder.className='auction-tail-holder';holder.hidden=true;
 const skip=doc.createElement('button');skip.type='button';skip.className='outline';skip.textContent=english?'Show all cards':'Tüm kartları göster';
 const proceed=doc.createElement('button');proceed.type='button';proceed.className='primary';proceed.hidden=true;proceed.textContent=english?'CONTINUE TO CALCULATION':'HESAPLAMAYA GEÇ';
 panel.append(heading,holder,skip,proceed);root.prepend(panel);root.classList.add('auction-tail-playing');if(button)button.disabled=true;
 let activeArt=null,activeScene=null,drawTimer=null,reviewTimer=null,open=true,reviewing=false,reviewReady=false;
 const settleDraw=()=>{if(drawTimer!==null)clearTimeout(drawTimer);drawTimer=null;activeScene?.classList.remove('auction-drawing','auction-final-draw');};
 const cleanup=(completed)=>{if(!open)return;open=false;settleDraw();if(reviewTimer!==null)clearTimeout(reviewTimer);reviewTimer=null;const restoreFocus=doc.activeElement===skip||doc.activeElement===proceed;panel.remove();root.classList.remove('auction-tail-playing');if(button)button.disabled=false;if(restoreFocus&&button?.isConnected)button.focus();if(completed)onComplete?.({restoreFocus});};
 const values=card=>(english?'Base power: ':'Temel güç: ')+(Number.isFinite(card.power)?card.power:'—')+' / 100 · '+(english?'Cost: ':'Alım bedeli: ')+(Number.isFinite(card.cost)?card.cost:'—')+(english?' credits':' kredi');
 const loadImage=(card,host)=>{if(loadArt)Promise.resolve(loadArt(card)).then(url=>{if(!url||!host.isConnected)return;const img=doc.createElement('img');img.alt='';img.src=url;img.onerror=()=>img.remove();host.prepend(img)}).catch(()=>{});};
 const showReview=()=>{
  if(!open||reviewing)return;
  if(!reviewItems.length){cleanup(true);return;}
  reviewing=true;settleDraw();panel.classList.add('auction-tail-review');holder.hidden=false;
  heading.textContent=english?'All remaining cards revealed':'Kalan kartların tümü açıldı';
  const list=doc.createElement('div');list.className='auction-tail-review-list';
  for(const {card,seat} of reviewItems){
   const row=doc.createElement('article');row.className='auction-tail-review-card';
   const portrait=doc.createElement('div');portrait.className='auction-tail-review-portrait rarity-frame rarity-frame-'+(['common','advanced','rare','legendary'].includes(card.rarity)?card.rarity:'common');
   const text=doc.createElement('div'),owner=doc.createElement('small'),name=doc.createElement('strong'),stats=doc.createElement('span');
   owner.textContent=seat===me?(english?'Your team':'Senin takımın'):(english?'Opponent team':'Rakip takım');name.textContent=card.name;stats.textContent=values(card);text.append(owner,name,stats);row.append(portrait,text);list.append(row);loadImage(card,portrait);
  }
  const focusProceed=doc.activeElement===skip;
  holder.replaceChildren(list);skip.hidden=true;proceed.hidden=false;proceed.disabled=true;
  // A double-click on Show all must not activate the new button underneath it.
  reviewTimer=setTimeout(()=>{reviewTimer=null;if(!open)return;reviewReady=true;proceed.disabled=false;if(focusProceed&&(doc.activeElement===skip||doc.activeElement===doc.body))proceed.focus?.({preventScroll:true});},500);
  onReview?.();
 };
 const queue=createTailQueue({finish:completed=>completed?showReview():cleanup(false),onArrive,duration:reducedMotion?700:1800,arrivalDuration:reducedMotion?200:550,arrive:({seat})=>{
  // Reduced motion still opens every card, but never translates/scales the art.
  if(reducedMotion)return {finished:Promise.resolve({arrived:true}),cancel(){}};
  if(!activeArt?.isConnected)return null;
  settleDraw();
  const snapshot={element:activeArt,rect:activeArt.getBoundingClientRect()};
  const flight=flyAwardCard(snapshot,resolveDestination?.(seat),{duration:1400,doc,label:seat===me?(english?'Your team':'Senin takımın'):(english?'Opponent team':'Rakip takım')});
  // The detached visual travels; do not leave a duplicate face in the center.
  activeArt.style.visibility='hidden';activeScene?.classList.remove('auction-final-draw');
  return flight;
 },show:({card,seat},index,total)=>{
  if(drawTimer!==null)clearTimeout(drawTimer);
  holder.hidden=false;heading.textContent=(seat===me?(english?'Your team':'Senin takımın'):(english?'Opponent team':'Rakip takım'))+' · '+(index+1)+' / '+total;
  const scene=doc.createElement('div');scene.className='auction-deck-scene auction-drawing auction-final-draw rarity-frame-'+(['common','advanced','rare','legendary'].includes(card.rarity)?card.rarity:'common');
  const backs=doc.createElement('div');backs.className='auction-deck-backs';backs.setAttribute('aria-hidden','true');
  for(let n=0;n<Math.min(3,total-index-1);n++){const back=doc.createElement('span');back.className='auction-deck-back';back.style.setProperty('--deck-layer',String(n+1));back.textContent='✦';backs.append(back)}
  const art=doc.createElement('div');art.className='card-art rarity-frame rarity-frame-'+(['common','advanced','rare','legendary'].includes(card.rarity)?card.rarity:'common');art.textContent='✦';
  const name=doc.createElement('strong');name.className='auction-tail-name';name.textContent=card.name;art.append(name);
  const stats=doc.createElement('small');stats.className='auction-tail-values';stats.textContent=values(card);art.append(stats);
  const cover=doc.createElement('div');cover.className='auction-draw-back';cover.setAttribute('aria-hidden','true');cover.textContent='✦';
  scene.append(backs,art,cover);holder.replaceChildren(scene);activeArt=art;activeScene=scene;
  // CSS/compositor timelines can remain on rotateY(-90deg) even while JS timers
  // run. End the one-second flip explicitly, leaving an 800ms readable face.
  // Otherwise the zero-width edge-on card silently skips its receipt flight.
  if(reducedMotion)settleDraw();else drawTimer=setTimeout(settleDraw,1000);
  // Late artwork can only update its own connected card, never the next reveal.
  loadImage(card,art);
 }});
 // Keep the presentation active in the review step: polling must not replace it.
 // The first click reveals all cards, and only a separate click confirms review.
 skip.onclick=()=>{if(open&&!reviewing)queue.skip();};proceed.onclick=event=>{if(open&&reviewing&&reviewReady&&!(event?.detail>1))cleanup(true);};proceed.onkeydown=event=>{if(event.repeat&&(event.key==='Enter'||event.key===' '))event.preventDefault();};queue.start(items,{startAfter});
 return {get active(){return open},get reviewing(){return reviewing},cancel(){queue.cancel();},skip(){if(open&&!reviewing)queue.skip();}};
}
