// Presentation only: the same renderer-owned heroes and 60-track lane rows.
// Keep the approved raster proportional, with its cliff below a mapped stone floor.
export const VIKING_LAYOUT=Object.freeze({
 referenceWidth:378,referenceHeight:530,minWidth:288,minHeight:530,
 artWidth:1024,artHeight:1536,artTop:-18.5,
 cardWidth:84,cardHeight:90,portraitSize:64,gridTop:6.5,gridHeight:465,
 centers:Object.freeze([62,147,231,316]),
 safeFloor:Object.freeze([70,55,970,1370]),mistSourceY:1440
});
const mounts=new WeakMap();
const PREFIX='--arena-viking-';
const MARKER='data-viking-layout';
export function computeVikingLayout(width,height){
 width=Number(width);height=Number(height);
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<VIKING_LAYOUT.minWidth||height<=0)return null;
 const stageHeight=Math.max(VIKING_LAYOUT.minHeight,height);
 const artWidth=Math.max(378,Math.min(width,stageHeight*378/530));
 const scale=artWidth/378,panelWidth=Math.min(width,artWidth),panelLeft=(width-panelWidth)/2;
 const sceneTop=(stageHeight-530*scale)/2;
 const art={left:(width-artWidth)/2,top:sceneTop-18.5*scale,width:artWidth,height:artWidth*1.5};
 const artScale=artWidth/1024;
 const floor={left:Math.max(0,art.left+70*artScale),top:Math.max(0,art.top+55*artScale),right:Math.min(width,art.left+970*artScale),bottom:Math.min(stageHeight,art.top+1370*artScale)};
 const centers=VIKING_LAYOUT.centers.map(x=>panelLeft+x*panelWidth/378);
 const cardWidth=Math.min(84,84*panelWidth/378),teamWidth=centers[1]-centers[0]+cardWidth;
 return Object.freeze({width,height:stageHeight,art:Object.freeze(art),floor:Object.freeze(floor),centers:Object.freeze(centers),
  cardWidth,cardHeight:90,portraitSize:64,gridTop:sceneTop+6.5*scale,gridHeight:465*scale,
  teamWidth,columnGap:centers[1]-centers[0]-cardWidth,blueLeft:centers[0]-cardWidth/2,redLeft:centers[2]-cardWidth/2,
  // The floor edge is irregular; use the lower cliff-face strip, not the safe-floor bound.
  mistTop:Math.min(stageHeight,Math.max(0,art.top+VIKING_LAYOUT.mistSourceY*artScale))});
}
function properties(layout){
 return {
  'art-left':layout.art.left,'art-top':layout.art.top,'art-width':layout.art.width,'art-height':layout.art.height,
  'floor-left':layout.floor.left,'floor-top':layout.floor.top,'floor-right':layout.floor.right,'floor-bottom':layout.floor.bottom,
  'mist-top':layout.mistTop,'grid-top':layout.gridTop,'grid-height':layout.gridHeight,
  'blue-left':layout.blueLeft,'red-left':layout.redLeft,'team-width':layout.teamWidth,'column-gap':layout.columnGap,'card-width':layout.cardWidth
 };
}
export function mountVikingLayout(root,options={}){
 if(!root?.style)throw new TypeError('An arena root is required');
 const existing=mounts.get(root);if(existing)return existing;
 const originalMarker=root.getAttribute(MARKER),saved=new Map(),applied=new Map();
 let disposed=false,layout=null,observer=null;
 function restore(){
  for(const [key,value]of applied){
   if(root.style.getPropertyValue(key)!==value)continue;
   const previous=saved.get(key);if(previous?.value)root.style.setProperty(key,previous.value,previous.priority);else root.style.removeProperty(key);
  }
  applied.clear();saved.clear();layout=null;
  if(root.getAttribute(MARKER)==='ready'){if(originalMarker===null)root.removeAttribute(MARKER);else root.setAttribute(MARKER,originalMarker);}
 }
 function refresh(){
  if(disposed)return;
  if(root.dataset?.arenaTheme!=='fjord'||root.hidden||root.isConnected===false){restore();return;}
  // The scoped marker enables a 530px minimum grid track before measuring.
  if(root.getAttribute(MARKER)!=='ready')root.setAttribute(MARKER,'ready');
  let next;
  try{next=computeVikingLayout(root.clientWidth,root.clientHeight);}catch{restore();return;}
  if(!next){restore();return;}
  for(const [name,number]of Object.entries(properties(next))){
   const key=PREFIX+name,value=Number(number.toFixed(6))+'px';
   if(!saved.has(key))saved.set(key,{value:root.style.getPropertyValue(key),priority:root.style.getPropertyPriority?.(key)||''});
   if(root.style.getPropertyValue(key)!==value)root.style.setProperty(key,value);
   applied.set(key,value);
  }
  layout=next;
 }
 const Resize=options.ResizeObserver||root.ownerDocument?.defaultView?.ResizeObserver;
 if(Resize){try{observer=new Resize(refresh);observer.observe(root);}catch{try{observer?.disconnect();}catch{}observer=null;}}
 const controller=Object.freeze({refresh,state:()=>({active:layout!==null,disposed,layout}),dispose(){
  if(disposed)return;disposed=true;try{observer?.disconnect();}catch{}restore();mounts.delete(root);
 }});
 mounts.set(root,controller);refresh();return controller;
}
