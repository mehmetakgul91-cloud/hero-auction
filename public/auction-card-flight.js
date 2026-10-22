// Presentation-only card travel; destination is resolved by the caller's seat mapping.
export function awardFlightGeometry(from,to,{width,height}){
 const clamp=(n,min,max)=>Math.min(Math.max(min,max),Math.max(min,n));
 const w=Math.min(Math.max(1,from.width),Math.max(1,width-16));
 const h=Math.min(Math.max(1,from.height),Math.max(1,height-16));
 const left=clamp(from.left,8,width-w-8),top=clamp(from.top,8,height-h-8);
 const x=clamp(to.left+to.width/2,20,width-20),y=clamp(to.top+to.height/2,20,height-20);
 return {left,top,width:w,height:h,dx:x-(left+w/2),dy:y-(top+h/2),scale:Math.min(.42,Math.max(.12,Math.min(to.width/w,to.height/h)))};
}
export function flyAwardCard(sourceSnapshot,destination,{duration=1400,reducedMotion=false,label='',doc=sourceSnapshot?.element?.ownerDocument}={}){
 let resolve,animation=null,ghost=null,settled=false;
 const finished=new Promise(done=>resolve=done);
 const settle=()=>{if(settled)return;settled=true;ghost?.remove();resolve();};
 const cancel=()=>{animation?.cancel();settle();};
 const handle={cancel,finished};
 const source=sourceSnapshot?.element,view=doc?.defaultView;
 if(reducedMotion||!source||!destination||!doc?.body){settle();return handle;}
 let to=destination.getBoundingClientRect();
 if(!to.width||!to.height)to=destination.closest?.('.player-side')?.getBoundingClientRect()||to;
 const from=sourceSnapshot.rect||source.getBoundingClientRect();
 if(!from.width||!from.height||!to.width||!to.height){settle();return handle;}
 const geometry=awardFlightGeometry(from,to,{width:view?.innerWidth||doc.documentElement.clientWidth,height:view?.innerHeight||doc.documentElement.clientHeight});
 ghost=source.cloneNode(true);ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
 ghost.setAttribute('aria-hidden','true');ghost.setAttribute('translate','no');ghost.classList.add('auction-card-glide');
 Object.assign(ghost.style,{position:'fixed',left:geometry.left+'px',top:geometry.top+'px',width:geometry.width+'px',height:geometry.height+'px',margin:'0',pointerEvents:'none',zIndex:'9999',animation:'none',transformOrigin:'center',opacity:'1',visibility:'visible'});
 if(label){const badge=doc.createElement('span');badge.className='auction-flight-label';badge.textContent=label;ghost.append(badge)}
 doc.body.append(ghost);
 if(typeof ghost.animate!=='function'){settle();return handle;}
 try{
  animation=ghost.animate([
   {transform:'translate(0,0) scale(1)',opacity:1},
   {transform:`translate(${geometry.dx*.45}px,${geometry.dy*.45-18}px) scale(.8) rotate(-3deg)`,opacity:1,offset:.5},
   {transform:`translate(${geometry.dx}px,${geometry.dy}px) scale(${geometry.scale}) rotate(0deg)`,opacity:.35}
  ],{duration,easing:'cubic-bezier(.3,.1,.2,1)',fill:'forwards'});
  Promise.resolve(animation.finished).then(settle,settle);
 }catch{settle();}
 return handle;
}
