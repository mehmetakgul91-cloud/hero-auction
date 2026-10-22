// Presentation-only card travel; destination is resolved by the caller's seat mapping.
export function awardFlightGeometry(from,to,{width,height}){
 const clamp=(n,min,max)=>Math.min(Math.max(min,max),Math.max(min,n));
 const w=Math.min(Math.max(1,from.width),Math.max(1,width-16));
 const h=Math.min(Math.max(1,from.height),Math.max(1,height-16));
 const left=clamp(from.left,8,width-w-8),top=clamp(from.top,8,height-h-8);
 const x=to.left+to.width/2,y=to.top+to.height/2;
 return {left,top,width:w,height:h,dx:x-(left+w/2),dy:y-(top+h/2),scale:Math.max(0,Math.min(1,Math.max(0,to.width-8)/w,Math.max(0,to.height-8)/h))};
}
export function flyAwardCard(sourceSnapshot,destination,{duration=1400,reducedMotion=false,label='',doc=sourceSnapshot?.element?.ownerDocument}={}){
 let resolve,animation=null,pulse=null,ghost=null,settled=false;
 const finished=new Promise(done=>resolve=done);
 const settle=(arrived=false)=>{if(settled)return;settled=true;
  if(arrived&&typeof destination?.animate==='function'){
   try{pulse=destination.animate([{boxShadow:'0 0 0 0 #8be9ff00'},{boxShadow:'0 0 0 3px #8be9ffcc, 0 0 18px #62d6ff99',offset:.4},{boxShadow:'0 0 0 0 #8be9ff00'}],{duration:420,easing:'ease-out'});Promise.resolve(pulse.finished).catch(()=>{});}catch{}
  }
  ghost?.remove();resolve({arrived});
 };
 const cancel=()=>{animation?.cancel();pulse?.cancel();settle(false);};
 const handle={cancel,finished};
 const source=sourceSnapshot?.element,view=doc?.defaultView;
 if(reducedMotion||!source||!destination||!doc?.body){settle();return handle;}
 if(typeof destination==='function')destination=destination();
 if(!destination){settle();return handle;}
 const to=destination.getBoundingClientRect();
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
   {transform:`translate(${geometry.dx}px,${geometry.dy}px) scale(${geometry.scale}) rotate(0deg)`,opacity:1}
  ],{duration,easing:'cubic-bezier(.3,.1,.2,1)',fill:'forwards'});
  Promise.resolve(animation.finished).then(()=>settle(destination.isConnected!==false),()=>settle(false));
 }catch{settle();}
 return handle;
}
