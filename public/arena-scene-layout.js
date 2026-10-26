// Presentation only. Preserve every edge of the approved 2:3 painting instead
// of cropping it to the card field. Logical front/back lanes remain unchanged.
export const ARENA_SCENE_LAYOUT=Object.freeze({
 artWidth:1024,artHeight:1536,minWidth:256,minFieldWidth:348,
 cardWidth:84,cardHeight:90,portraitSize:64,maxGridHeight:465
});
const mounts=new WeakMap(),PREFIX='--arena-scene-',MARKER='data-arena-scene-layout';
const supported=theme=>theme==='ruins'||theme==='savanna';
export function computeArenaSceneLayout(width,height){
 width=Number(width);height=Number(height);
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<ARENA_SCENE_LAYOUT.minWidth||height<=18)return null;
 const scale=Math.min(width/1024,height/1536),artWidth=1024*scale,artHeight=1536*scale;
 const art={left:(width-artWidth)/2,top:(height-artHeight)/2,width:artWidth,height:artHeight};
 // On short screens, retain readable column widths in the side margins.
 // Do not enlarge/crop the art, impose a minimum height, or wrap logical lanes.
 const fieldWidth=Math.min(width,Math.max(artWidth,ARENA_SCENE_LAYOUT.minFieldWidth));
 const fieldLeft=(width-fieldWidth)/2,pitch=fieldWidth/4,cardWidth=Math.min(84,pitch-3);
 const centers=[0,1,2,3].map(i=>fieldLeft+(i+.5)*pitch);
 // Match the least-padded existing short-viewport field (height-12). The normal
 // field was height-18; using the larger budget cannot shrink its compact cards.
 // Keep the accepted 530px composition capped at the same 465px lane field.
 const gridHeight=Math.min(465,height-12),gridTop=(height-gridHeight)/2;
 return Object.freeze({width,height,art:Object.freeze(art),centers:Object.freeze(centers),
  fieldWidth,fieldLeft,cardWidth,cardHeight:90,portraitSize:64,gridTop,gridHeight,
  teamWidth:pitch+cardWidth,columnGap:pitch-cardWidth,
  blueLeft:centers[0]-cardWidth/2,redLeft:centers[2]-cardWidth/2});
}
function properties(l){return {
 'art-left':l.art.left,'art-top':l.art.top,'art-width':l.art.width,'art-height':l.art.height,
 'grid-top':l.gridTop,'grid-height':l.gridHeight,'blue-left':l.blueLeft,'red-left':l.redLeft,
 'team-width':l.teamWidth,'column-gap':l.columnGap,'card-width':l.cardWidth
};}
export function mountArenaSceneLayout(root,options={}){
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
  if(!supported(root.dataset?.arenaTheme)||root.hidden||root.isConnected===false){restore();return;}
  // Resolve the scoped border/padding before measuring, in this same task.
  if(root.getAttribute(MARKER)!=='ready')root.setAttribute(MARKER,'ready');
  let next;try{next=computeArenaSceneLayout(root.clientWidth,root.clientHeight);}catch{restore();return;}
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
