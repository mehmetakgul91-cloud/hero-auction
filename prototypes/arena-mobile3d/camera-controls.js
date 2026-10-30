const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
// Presentation only: no replay clock, combat state or hero transforms.
export class ArenaCameraControls {
 constructor(element,{change=()=>{},select=()=>{}}={}){
  this.element=element;this.change=change;this.select=select;this.enabled=true;this.pointers=new Map();this.yaw=0;this.pitch=0;this.zoom=1;this.dragged=false;this.listeners=[];
  const on=(name,fn,options)=>{element.addEventListener(name,fn,options);this.listeners.push([name,fn,options]);};
  on('pointerdown',e=>this.down(e));on('pointermove',e=>this.move(e));on('pointerup',e=>this.up(e));on('pointercancel',e=>this.cancel(e));on('lostpointercapture',e=>this.cancel(e));
  on('wheel',e=>{if(!this.enabled||e.ctrlKey)return;e.preventDefault();this.scale(Math.exp(clamp(e.deltaY,-200,200)*.002));},{passive:false});
  on('keydown',e=>{if(!this.enabled)return;const keys={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.08],ArrowDown:[0,-.08]};if(keys[e.key]){e.preventDefault();this.orbit(...keys[e.key]);}else if(['+','=','-','0','Home'].includes(e.key)){e.preventDefault();if(e.key==='0'||e.key==='Home')this.reset();else this.scale(e.key==='-'?1.12:1/1.12);}});
 }
 orbit(yaw,pitch){this.yaw=(this.yaw+yaw)%(Math.PI*2);this.pitch=clamp(this.pitch+pitch,-.7,.7);this.change();}
 scale(factor){if(Number.isFinite(factor)&&factor>0){this.zoom=clamp(this.zoom*factor,.65,1.7);this.change();}}
 reset(){this.clear();this.yaw=0;this.pitch=0;this.zoom=1;this.change();}
 setEnabled(value){this.enabled=!!value;if(!this.enabled)this.clear();}
 clear(){for(const id of this.pointers.keys())this.element.releasePointerCapture?.(id);this.pointers.clear();this.dragged=false;}
 down(e){if(!this.enabled||e.button>0)return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});this.element.setPointerCapture?.(e.pointerId);if(this.pointers.size>1)this.dragged=true;}
 distance(){const p=[...this.pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;}
 move(e){const p=this.pointers.get(e.pointerId);if(!this.enabled||!p)return;const oldDistance=this.distance(),dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
  if(this.pointers.size===1){if(Math.hypot(p.x-p.startX,p.y-p.startY)>7)this.dragged=true;if(this.dragged)this.orbit(-dx*.007,dy*.005);}
  else if(this.pointers.size===2){const distance=this.distance();if(distance>5&&oldDistance>5)this.scale(oldDistance/distance);}
 }
 up(e){if(!this.pointers.has(e.pointerId))return;const p=this.pointers.get(e.pointerId),tap=this.enabled&&!this.dragged&&this.pointers.size===1&&Math.hypot(e.clientX-p.startX,e.clientY-p.startY)<=7;this.pointers.delete(e.pointerId);this.element.releasePointerCapture?.(e.pointerId);if(!this.pointers.size)this.dragged=false;if(tap)this.select(e);}
 cancel(e){if(!this.pointers.has(e.pointerId))return;this.pointers.delete(e.pointerId);this.dragged=this.pointers.size>0;}
 dispose(){this.clear();for(const [name,fn,options] of this.listeners)this.element.removeEventListener(name,fn,options);this.listeners=[];}
}
export function cameraOffset(offset,controls){
 const radius=Math.hypot(offset.x,offset.y,offset.z),azimuth=Math.atan2(offset.x,offset.z)+controls.yaw;
 const elevation=clamp(Math.asin(offset.y/radius)+controls.pitch,.18,1.35),ground=radius*Math.cos(elevation);
 return {x:Math.sin(azimuth)*ground,y:Math.sin(elevation)*radius,z:Math.cos(azimuth)*ground};
}
export function labelPosition(x,y,width,height,labelWidth=90,labelHeight=24){
 const half=Math.min(width/2,labelWidth/2+4);return {x:clamp(x,half,Math.max(half,width-half)),y:clamp(y,labelHeight+4,Math.max(labelHeight+4,height-4))};
}

// Stable screen-space packing. Priority identities keep their names; secondary
// units may compact to an accessible HP chip rather than overlap another label.
export function layoutLabels(items,width,height){
 const placed=[],result=new Map(),gap=3;
 const overlaps=r=>placed.some(p=>r.x<p.x+p.w+gap&&r.x+r.w+gap>p.x&&r.y<p.y+p.h+gap&&r.y+r.h+gap>p.y);
 const ordered=[...items].sort((a,b)=>(b.priority||0)-(a.priority||0)||String(a.key).localeCompare(String(b.key)));
 for(const item of ordered){let found;for(const compact of [false,true]){
   const w=compact?28:Math.min(90,width-8),h=compact?12:25;
   const offsets=compact?[0,-16,16,-32,32,-48,48]:[0,-28,28];
   for(const dy of offsets){for(const dx of (compact?[0,-16,16,-32,32]:[0,-32,32])){const r={key:item.key,x:clamp(item.x-w/2+dx,4,width-w-4),y:clamp(item.y-h+dy,58,Math.max(58,height-h-48)),w,h,compact};if(!overlaps(r)){found=r;break;}}if(found)break;}
   if(found)break;
  }
  // Ten units fit easily; deterministic compact grid is a last-resort for tightly
  // coincident projections. Identity/HP and keyboard selection remain available.
  if(!found)for(let y=58;y<height-60&&!found;y+=16)for(let x=4;x<width-32;x+=32){const r={key:item.key,x,y,w:28,h:12,compact:true};if(!overlaps(r)){found=r;break;}}
  if(found){placed.push(found);result.set(item.key,found);}
 }
 return result;
}
