// One presentation clock for the currently mounted heroes; no gameplay timers.
const jobs=new Set();let request=null,last=0,lastPaint=0,time=0,hooked=false;
export function idleFrameAt(t){const seq=[0,1,2,3,4,5,4,3,2,1],n=((t*2.8)%10+10)%10,i=Math.floor(n);return {a:seq[i],b:seq[(i+1)%10],mix:Math.max(0,(n-i-.78)/.22)};}
export function paintIdle(context,image,anchors,t,size=320){
 const frame=idleFrameAt(t),w=image.width/3,h=image.height/2;
 context.clearRect(0,0,size,size);
 for(const [f,alpha] of [[frame.a,1-frame.mix],[frame.b,frame.mix]]){
  if(!alpha)continue;const anchor=anchors[f];context.globalAlpha=alpha;
  context.drawImage(image,(f%3)*w,Math.floor(f/3)*h,w,h,(.5-anchor.x/w)*size,(.98-anchor.y/h)*size,size,size);
 }context.globalAlpha=1;
}
function tick(now){request=null;if(document.hidden){last=0;return;}const delta=last?Math.min(.06,(now-last)/1000):0;last=now;time+=delta;
 if(now-lastPaint<32){if(jobs.size)request=requestAnimationFrame(tick);return;}lastPaint=now;
 for(const job of jobs){if(!job.body.isConnected){jobs.delete(job);continue;}if(job.card.classList.contains('dead')||job.card.classList.contains('silhouette-performing'))continue;try{paintIdle(job.ctx,job.image,job.anchors,time+job.phase);}catch{jobs.delete(job);}}
 if(jobs.size)request=requestAnimationFrame(tick);
}
function start(){if(request===null&&jobs.size&&!document.hidden&&typeof requestAnimationFrame==='function')request=requestAnimationFrame(tick);}
export function animateArenaIdle({document:doc,body,card,image,anchors,phase=0}){
 const canvas=doc.createElement('canvas'),ctx=canvas.getContext?.('2d');if(!ctx)return false;
 canvas.width=canvas.height=320;canvas.setAttribute('aria-hidden','true');body.style.backgroundImage='none';body.append(canvas);
 paintIdle(ctx,image,anchors,0);
 if(doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return true;
 const job={body,card,image,anchors,phase,ctx};jobs.add(job);
 if(!hooked&&typeof window!=='undefined'){
  hooked=true;document.addEventListener('visibilitychange',()=>{if(document.hidden){if(request!==null)cancelAnimationFrame(request);request=null;last=0;}else start();});
  window.addEventListener('pagehide',()=>{if(request!==null)cancelAnimationFrame(request);request=null;last=0;});
  window.addEventListener('pageshow',start);
 }
 start();return true;
}
