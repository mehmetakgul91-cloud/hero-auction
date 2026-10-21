// Fit the active battle to the visible viewport, including mobile browser bars.
export function mountArenaViewport({window,document}){
 const arena=document.getElementById('battle-arena');
 if(!arena)return ()=>{};
 const body=document.body,root=document.documentElement,viewport=window.visualViewport;
 let active=false,frame=null;
 function sync(){
  frame=null;
  const next=body.classList.contains('arena-room')&&!arena.hidden;
  if(next!==active){
   active=next;
   body.classList.toggle('arena-fit',active);
   if(active)window.scrollTo({top:0,left:0,behavior:'instant'});
  }
  if(!active){root.style.removeProperty('--arena-viewport-height');return;}
  // Do not shrink the layout when the player deliberately pinch-zooms.
  const height=viewport&&viewport.scale===1?viewport.height:window.innerHeight;
  if(height>0)root.style.setProperty('--arena-viewport-height',Math.floor(height)+'px');
 }
 function schedule(){if(frame===null)frame=window.requestAnimationFrame(sync);}
 const observer=new window.MutationObserver(schedule);
 observer.observe(arena,{attributes:true,attributeFilter:['hidden']});
 observer.observe(body,{attributes:true,attributeFilter:['class']});
 window.addEventListener('resize',schedule);
 viewport?.addEventListener('resize',schedule);
 sync();
 return ()=>{
  observer.disconnect();
  window.removeEventListener('resize',schedule);
  viewport?.removeEventListener('resize',schedule);
  if(frame!==null)window.cancelAnimationFrame(frame);
  body.classList.remove('arena-fit');root.style.removeProperty('--arena-viewport-height');
 };
}
if(typeof window!=='undefined'&&typeof document!=='undefined')mountArenaViewport({window,document});
