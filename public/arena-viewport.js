// Keep front/back lanes while removing unused rows from the fitted arena.
export function getArenaLaneLayout(teams){
 const counts=teams.map(team=>({front:team.filter(hero=>hero.lane==='front').length,back:team.filter(hero=>hero.lane!=='front').length}));
 const rows=Math.max(1,...counts.flatMap(lanes=>[lanes.front,lanes.back]));
 const place=count=>Array.from({length:count},(_,index)=>count===1?Math.ceil(rows/2):1+Math.round(index*(rows-1)/(count-1)));
 return {rows,teams:counts.map(lanes=>({front:place(lanes.front),back:place(lanes.back)}))};
}

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
