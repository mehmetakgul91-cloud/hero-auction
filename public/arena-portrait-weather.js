// Cosmetic clipping only. No combat state, per-frame work, or input interception.
const NS='http://www.w3.org/2000/svg';
const PROTECTED='.arena-hero-label,.hp,.arena-shield,button,a,input,select,textarea,[role="button"]';
let sequence=0;
function intersect(a,b){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;}
function subtract(a,b){const hit=intersect(a,b);if(!hit)return[a];return[
 {x:a.x,y:a.y,width:a.width,height:hit.y-a.y},
 {x:a.x,y:hit.y+hit.height,width:a.width,height:a.y+a.height-hit.y-hit.height},
 {x:a.x,y:hit.y,width:hit.x-a.x,height:hit.height},
 {x:hit.x+hit.width,y:hit.y,width:a.x+a.width-hit.x-hit.width,height:hit.height}
].filter(r=>r.width>0&&r.height>0);}
function hidden(node){return node.hidden||node.closest?.('[hidden]')||node.isConnected===false||(node.getClientRects&&node.getClientRects().length===0);}
export function portraitWeatherRects(root){
 const bounds=root.getBoundingClientRect();
 if(!Number.isFinite(bounds.width)||!Number.isFinite(bounds.height)||bounds.width<=0||bounds.height<=0||hidden(root))return[];
 const sx=root.offsetWidth>0?bounds.width/root.offsetWidth:1,sy=root.offsetHeight>0?bounds.height/root.offsetHeight:1;
 const originX=root.clientLeft||0,originY=root.clientTop||0;
 const area={x:0,y:0,width:Math.max(0,bounds.width/sx-2*originX),height:Math.max(0,bounds.height/sy-2*originY)};
 const local=node=>{const r=node.getBoundingClientRect();return{x:(r.left-bounds.left)/sx-originX,y:(r.top-bounds.top)/sy-originY,width:r.width/sx,height:r.height/sy};};
 const portraits=[...root.querySelectorAll('.arena-portrait')],protectedNodes=[...root.querySelectorAll(PROTECTED)];
 // A malformed/unexpected DOM must remove the foreground, not paint the field.
 if(portraits.length>32||protectedNodes.length>160)return[];
 const protectedRects=protectedNodes.filter(n=>!hidden(n)).map(local).filter(r=>Object.values(r).every(Number.isFinite)&&r.width>0&&r.height>0);
 const result=[];
 for(const node of portraits){
  if(hidden(node))continue;
  const r=local(node);if(!Object.values(r).every(Number.isFinite))continue;
  const safe=intersect({x:r.x+3,y:r.y+3,width:r.width-6,height:r.height-8},area);if(!safe)continue;
  let parts=[safe];for(const protectedRect of protectedRects){parts=parts.flatMap(part=>subtract(part,protectedRect));if(parts.length>32)return[];}
  result.push(...parts.map(part=>({...part,rx:Math.min(5,part.width/2,part.height/2)})));
  if(result.length>128)return[];
 }
 return result;
}
export function createPortraitWeatherClip(root,options={}){
 const document=options.document||root?.ownerDocument;
 if(!root||!document?.createElementNS)throw new TypeError('An arena root and SVG-capable document are required');
 const clipId='arena-weather-portraits-'+(++sequence);
 // A missing/throwing capability check must never expose an unmasked foreground.
 let enabled=false;
 try{enabled=document.defaultView?.CSS?.supports?.('clip-path',`url(#${clipId})`)===true;}catch{}
 if(!enabled)return Object.freeze({clipId,styleValue:'inset(50%)',enabled:false,refresh(){},dispose(){}});
 const svg=document.createElementNS(NS,'svg'),defs=document.createElementNS(NS,'defs'),clip=document.createElementNS(NS,'clipPath');
 for(const [k,v]of Object.entries({width:'0',height:'0','aria-hidden':'true',focusable:'false','data-arena-weather-clip':''}))svg.setAttribute(k,v);
 // Inline geometry must not participate in the arena grid, including before CSS loads.
 svg.style.setProperty('position','absolute');svg.style.setProperty('pointer-events','none');svg.style.setProperty('overflow','hidden');
 clip.setAttribute('id',clipId);clip.setAttribute('clipPathUnits','userSpaceOnUse');defs.append(clip);svg.append(defs);root.append(svg);
 let disposed=false,refreshing=false,lastGeometry='',observed=new Set();
 const motion=new Map();
 const Resize=options.ResizeObserver||document.defaultView?.ResizeObserver;
 const Mutation=options.MutationObserver||document.defaultView?.MutationObserver;
 let resize=null,mutation=null;
 const heroTarget=target=>target?.closest?.('.arena-hero')&&root.contains(target);
 function moving(){
  for(const [target]of motion)if(target.isConnected===false||!root.contains(target))motion.delete(target);
  if(typeof root.getAnimations==='function'){
   try{return root.getAnimations({subtree:true}).some(animation=>['running','pending'].includes(animation.playState)&&heroTarget(animation.effect?.target));}catch{}
  }
  return motion.size>0;
 }
 function clear(){if(lastGeometry!==''||clip.children.length){clip.replaceChildren();lastGeometry='';}}
 function refresh(){
  if(disposed||refreshing)return;refreshing=true;
  try{
   const current=new Set(root.querySelectorAll('.arena-portrait'));
   if(resize){for(const node of observed)if(!current.has(node)){resize.unobserve?.(node);}for(const node of current)if(!observed.has(node))resize.observe(node);}
   observed=current;
   if(!enabled||moving()){clear();return;}
   const rects=portraitWeatherRects(root),signature=JSON.stringify(rects);
   if(signature===lastGeometry)return;
   const nodes=rects.map(rect=>{const node=document.createElementNS(NS,'rect');for(const[k,v]of Object.entries(rect))node.setAttribute(k,String(v));return node;});
   clip.replaceChildren(...nodes);lastGeometry=signature;
  }catch{clear();}finally{refreshing=false;}
 }
 function onMotion(event){
  if(!heroTarget(event.target))return;
  const key=(event.type.startsWith('animation')?'a:':'t:')+(event.animationName||event.propertyName||'');
  const started=event.type==='animationstart'||event.type==='transitionrun';
  if(started){let keys=motion.get(event.target);if(!keys){keys=new Set();motion.set(event.target,keys);}keys.add(key);clear();}
  else{const keys=motion.get(event.target);keys?.delete(key);if(!keys?.size)motion.delete(event.target);refresh();}
 }
 const events=['animationstart','animationend','animationcancel','transitionrun','transitionend','transitioncancel'];
 for(const event of events)root.addEventListener(event,onMotion);
 if(Resize){try{resize=new Resize(refresh);resize.observe(root);}catch{resize?.disconnect?.();resize=null;}}
 if(Mutation){try{mutation=new Mutation(records=>{if(records.some(record=>!svg.contains(record.target)&&([...(record.addedNodes||[]),...(record.removedNodes||[])].some(node=>node.matches?.(`.arena-hero,.arena-portrait,${PROTECTED}`)||node.querySelector?.(`.arena-hero,.arena-portrait,${PROTECTED}`))||record.target.closest?.('.arena-hero,.arena-portrait'))))refresh();});mutation.observe(root,{childList:true,subtree:true});}catch{mutation?.disconnect?.();mutation=null;}}
 refresh();
 return Object.freeze({clipId,styleValue:`url(#${clipId})`,enabled,refresh,dispose(){if(disposed)return;disposed=true;resize?.disconnect();mutation?.disconnect();for(const event of events)root.removeEventListener(event,onMotion);observed.clear();motion.clear();svg.remove();}});
}
