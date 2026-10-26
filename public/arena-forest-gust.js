// Cosmetic forest wind only: a bounded reusable set, never gameplay randomness.
import {createPortraitWeatherClip} from './arena-portrait-weather.js';
export const FOREST_GUST_TIMING=Object.freeze({durationMs:7000,minIntervalMs:20000,maxIntervalMs:30000});
export const FOREST_LEAVES=Object.freeze([
 Object.freeze({startX:-8,startY:15,midX:48,midY:38,endX:110,endY:65,size:17,startRotation:-35,midRotation:135,endRotation:325,durationMs:6500,delayMs:0,opacity:.65}),
 Object.freeze({startX:-12,startY:68,midX:45,midY:51,endX:108,endY:27,size:14,startRotation:90,midRotation:-70,endRotation:-225,durationMs:5900,delayMs:400,opacity:.58}),
 Object.freeze({startX:-10,startY:42,midX:54,midY:62,endX:111,endY:82,size:20,startRotation:-90,midRotation:85,endRotation:245,durationMs:6100,delayMs:650,opacity:.68}),
 Object.freeze({startX:-7,startY:88,midX:46,midY:68,endX:109,endY:50,size:12,startRotation:35,midRotation:-100,endRotation:-270,durationMs:5600,delayMs:1100,opacity:.52})
]);
export const FOREST_FOREGROUND_INDICES=Object.freeze([0,2]);
const mounts=new WeakMap();
function cosmeticRandom(){
 try{const bytes=new Uint32Array(1);globalThis.crypto.getRandomValues(bytes);return bytes[0]/4294967296;}catch{return .5;}
}
export function forestGustInterval(random=cosmeticRandom){
 let value;try{value=Number(random());}catch{value=.5;}
 const unit=Number.isFinite(value)?Math.max(0,Math.min(1,value)):.5;
 return Math.round(FOREST_GUST_TIMING.minIntervalMs+unit*(FOREST_GUST_TIMING.maxIntervalMs-FOREST_GUST_TIMING.minIntervalMs));
}
export function mountForestGust(root,options={}){
 const document=options.document||root?.ownerDocument;
 if(!root||!document)throw new TypeError('An arena root and document are required');
 const existing=mounts.get(root);if(existing)return existing;
 const media=options.motionQuery||document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:false};
 const clock=options.clock||{setTimeout:(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimeout:id=>globalThis.clearTimeout(id)};
 const random=options.random||cosmeticRandom;
 const leafUrl=options.leafUrl||new URL('./images/arena-themes/forest-leaf.svg',import.meta.url).href;
 const createClip=options.createClip||createPortraitWeatherClip;
 let clip;try{clip=createClip(root,{document,ResizeObserver:options.ResizeObserver,MutationObserver:options.MutationObserver});}catch{}
 if(!clip)clip={enabled:false,styleValue:'inset(100%)',refresh(){},dispose(){}};
 const background=document.createElement('div'),foreground=document.createElement('div');
 for(const [plane,node]of [['background',background],['foreground',foreground]]){
  node.setAttribute('data-forest-gust',plane);node.setAttribute('aria-hidden','true');node.hidden=true;
 }
 foreground.style.setProperty('clip-path',clip.styleValue);
 const leaves=[];
 function addLeaf(parent,spec,isForeground){
  const image=document.createElement('img');image.className='forest-gust__leaf';image.alt='';image.draggable=false;image.decoding='async';
  image.style.setProperty('--leaf-size',spec.size+'px');image.style.setProperty('--leaf-duration',spec.durationMs+'ms');image.style.setProperty('--leaf-delay',spec.delayMs+'ms');
  image.style.setProperty('--leaf-opacity',String(isForeground ? .48 : spec.opacity));
  for(const position of ['start','mid','end'])image.style.setProperty('--leaf-'+position+'-rotation',spec[position+'Rotation']+'deg');
  parent.append(image);leaves.push({image,spec});
 }
 for(const spec of FOREST_LEAVES)addLeaf(background,spec,false);
 for(const index of FOREST_FOREGROUND_INDICES)addLeaf(foreground,FOREST_LEAVES[index],true);
 for(const kind of ['light','shadow']){const patch=document.createElement('span');patch.className='forest-gust__'+kind;background.append(patch);}
 root.insertBefore(background,root.firstChild||null);root.append(foreground);
 let disposed=false,phase='paused',timer=null,generation=0,nextDelayMs=null,assetsLoaded=false;
 const mayRun=()=>!disposed&&!document.hidden&&!media.matches&&root.isConnected!==false;
 function measure(){
  if(disposed)return false;
  try{const bounds=root.getBoundingClientRect?.();
  const width=Number(root.clientWidth)||Number(bounds?.width)||0,height=Number(root.clientHeight)||Number(bounds?.height)||0;
  if(!(width>0&&height>0))return false;
  for(const {image,spec}of leaves)for(const position of ['start','mid','end']){
   image.style.setProperty('--leaf-'+position+'-x',width*spec[position+'X']/100+'px');
   image.style.setProperty('--leaf-'+position+'-y',height*spec[position+'Y']/100+'px');
  }
  clip.refresh();return true;}catch{return false;}
 }
 function cancel(){generation++;if(timer!==null)clock.clearTimeout(timer);timer=null;nextDelayMs=null;}
 function hide(){for(const node of [background,foreground]){node.hidden=true;node.classList.remove('is-running');}}
 function pause(){cancel();hide();phase='paused';}
 function schedule(delay,fn){cancel();const ticket=generation;nextDelayMs=delay;timer=clock.setTimeout(()=>{if(disposed||ticket!==generation)return;timer=null;nextDelayMs=null;fn();},delay);}
 function begin(){
  if(!mayRun()||!measure()){pause();return;}
  if(!assetsLoaded){for(const {image}of leaves)image.src=leafUrl;assetsLoaded=true;}
  phase='playing';background.hidden=false;background.classList.add('is-running');
  // Unsupported clipping must never turn the portrait overlay into a HUD veil.
  foreground.hidden=clip.enabled!==true;if(!foreground.hidden)foreground.classList.add('is-running');
  const interval=forestGustInterval(random);
  schedule(FOREST_GUST_TIMING.durationMs,()=>{
   if(!mayRun()){pause();return;}
   hide();phase='waiting';schedule(interval-FOREST_GUST_TIMING.durationMs,begin);
  });
 }
 function resume(){if(disposed)return;if(!mayRun()||!measure()){pause();return;}if(phase!=='paused')return;phase='waiting';schedule(forestGustInterval(random),begin);}
 function refresh(){if(disposed)return;if(!measure()){pause();return;}resume();}
 const Observer=options.ResizeObserver||document.defaultView?.ResizeObserver;
 let observer=null;
 if(Observer){try{observer=new Observer(refresh);observer.observe(root);}catch{try{observer?.disconnect();}catch{}observer=null;}}
 document.addEventListener('visibilitychange',resume);
 if(media.addEventListener)media.addEventListener('change',resume);else media.addListener?.(resume);
 const controller=Object.freeze({refresh,state:()=>({phase,disposed,timerPending:timer!==null,nextDelayMs,leafCount:leaves.length,lightPatchCount:2}),dispose(){
  if(disposed)return;disposed=true;pause();phase='disposed';try{observer?.disconnect();}catch{}try{clip.dispose();}catch{}
  document.removeEventListener('visibilitychange',resume);
  if(media.removeEventListener)media.removeEventListener('change',resume);else media.removeListener?.(resume);
  background.remove();foreground.remove();mounts.delete(root);
 }});
 mounts.set(root,controller);resume();return controller;
}
