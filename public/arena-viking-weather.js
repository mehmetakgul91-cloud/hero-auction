// Approved Viking snow reference: libfile_a26c07e6b2c88191bc8a53758ba6b6c9 v1.
// Cosmetic-only sheets, not particle emitters; the approved painting never moves.
import {createPortraitWeatherClip} from './arena-portrait-weather.js';
export const VIKING_WEATHER_TIMING=Object.freeze({durationMs:8000,initialDelayMs:1200,minIntervalMs:20000,maxIntervalMs:30000});
export const VIKING_SNOW_LAYERS=Object.freeze([
 Object.freeze({role:'far',texture:'far',dx:160,dy:140,durationMs:8000,delayMs:0,opacity:.70}),
 Object.freeze({role:'middle',texture:'middle',dx:280,dy:220,durationMs:8000,delayMs:0,opacity:.78}),
 Object.freeze({role:'near',texture:'near',dx:420,dy:300,durationMs:8000,delayMs:0,opacity:.82}),
 Object.freeze({role:'gust-a',texture:'gust',dx:430,dy:130,durationMs:2300,delayMs:1600,opacity:.73}),
 Object.freeze({role:'gust-b',texture:'gust',dx:430,dy:130,durationMs:2300,delayMs:5000,opacity:.73})
]);
export const VIKING_FOREGROUND_INDICES=Object.freeze([2,3,4]);
export const VIKING_POWDER_LAYERS=Object.freeze([
 Object.freeze({y:57,durationMs:2900,delayMs:1400,opacity:.30}),
 Object.freeze({y:43,durationMs:2800,delayMs:1900,opacity:.22}),
 Object.freeze({y:60,durationMs:2900,delayMs:4900,opacity:.28}),
 Object.freeze({y:40,durationMs:2600,delayMs:5400,opacity:.20})
]);
export const VIKING_TEXTURE_URLS=Object.freeze(Object.fromEntries(['far','middle','near','gust'].map(key=>[key,new URL('./images/arena-themes/viking-snow-'+key+'.svg',import.meta.url).href])));
const mounts=new WeakMap();
function cosmeticRandom(){try{const bytes=new Uint32Array(1);globalThis.crypto.getRandomValues(bytes);return bytes[0]/4294967296;}catch{return .5;}}
export function vikingWeatherInterval(random=cosmeticRandom){
 let value;try{value=Number(random());}catch{value=.5;}
 const unit=Number.isFinite(value)?Math.max(0,Math.min(1,value)):.5;
 return Math.round(VIKING_WEATHER_TIMING.minIntervalMs+unit*(VIKING_WEATHER_TIMING.maxIntervalMs-VIKING_WEATHER_TIMING.minIntervalMs));
}
export function mountVikingWeather(root,options={}){
 const document=options.document||root?.ownerDocument;
 if(!root||!document)throw new TypeError('An arena root and document are required');
 const existing=mounts.get(root);if(existing)return existing;
 const media=options.motionQuery||document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:false};
 const clock=options.clock||{setTimeout:(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimeout:id=>globalThis.clearTimeout(id)};
 const random=options.random||cosmeticRandom,textureUrls=options.textureUrls||VIKING_TEXTURE_URLS;
 let clip;try{clip=(options.createClip||createPortraitWeatherClip)(root,{document,ResizeObserver:options.ResizeObserver,MutationObserver:options.MutationObserver});}catch{}
 if(!clip)clip={enabled:false,styleValue:'inset(100%)',refresh(){},dispose(){}};
 const background=document.createElement('div'),foreground=document.createElement('div');
 for(const [plane,node]of [['background',background],['foreground',foreground]]){node.setAttribute('data-viking-weather',plane);node.setAttribute('aria-hidden','true');node.hidden=true;}
 foreground.style.setProperty('clip-path',clip.styleValue||'inset(100%)');
 const sheets=[];
 function addSnow(parent,spec,front){
  const node=document.createElement('span');node.className='viking-weather__snow';node.setAttribute('data-viking-snow',spec.role);
  for(const [name,value]of Object.entries({dx:spec.dx,dy:spec.dy}))node.style.setProperty('--snow-'+name,value+'px');
  node.style.setProperty('--snow-duration',spec.durationMs+'ms');node.style.setProperty('--snow-delay',spec.delayMs+'ms');node.style.setProperty('--snow-opacity',String(front?.50:spec.opacity));
  parent.append(node);sheets.push({node,spec});
 }
 for(const spec of VIKING_SNOW_LAYERS)addSnow(background,spec,false);
 for(const index of VIKING_FOREGROUND_INDICES)addSnow(foreground,VIKING_SNOW_LAYERS[index],true);
 const powder=document.createElement('div');powder.className='viking-weather__ground';
 for(const spec of VIKING_POWDER_LAYERS){const node=document.createElement('span');node.className='viking-weather__powder';
  node.style.setProperty('--powder-y',spec.y+'%');node.style.setProperty('--powder-duration',spec.durationMs+'ms');node.style.setProperty('--powder-delay',spec.delayMs+'ms');node.style.setProperty('--powder-opacity',String(spec.opacity));powder.append(node);}
 const mist=document.createElement('div');mist.className='viking-weather__cliff';
 for(let index=0;index<2;index++){const node=document.createElement('span');node.className='viking-weather__mist';node.setAttribute('data-mist-layer',String(index));mist.append(node);}
 background.append(powder);background.append(mist);root.insertBefore(background,root.firstChild||null);root.append(foreground);
 let disposed=false,phase='paused',timer=null,generation=0,nextDelayMs=null,assetsLoaded=false,started=false;
 const mayRun=()=>!disposed&&!root.hidden&&!root.closest?.('[hidden]')&&!document.hidden&&!media.matches&&root.isConnected!==false;
 function measure(){
  if(disposed)return false;
  try{const bounds=root.getBoundingClientRect?.(),width=Number(root.clientWidth)||Number(bounds?.width)||0,height=Number(root.clientHeight)||Number(bounds?.height)||0;
   if(!(width>0&&height>0)||root.getClientRects?.().length===0)return false;
   clip.refresh();return true;
  }catch{return false;}
 }
 function cancel(){generation++;if(timer!==null)clock.clearTimeout(timer);timer=null;nextDelayMs=null;}
 function hide(){for(const node of [background,foreground]){node.hidden=true;node.classList.remove('is-running');}}
 function pause(){cancel();hide();phase='paused';}
 function schedule(delay,fn){cancel();const ticket=generation;nextDelayMs=delay;timer=clock.setTimeout(()=>{if(disposed||ticket!==generation)return;timer=null;nextDelayMs=null;fn();},delay);}
 function begin(){
  if(!mayRun()||!measure()){pause();return;}
  if(!assetsLoaded){for(const {node,spec}of sheets)node.style.setProperty('background-image',`url("${textureUrls[spec.texture]}")`);assetsLoaded=true;}
  started=true;phase='playing';background.hidden=false;background.classList.add('is-running');
  // Only safe portrait interiors, never names, health, shields or controls.
  foreground.hidden=clip.enabled!==true;if(!foreground.hidden)foreground.classList.add('is-running');
  const interval=vikingWeatherInterval(random);
  schedule(VIKING_WEATHER_TIMING.durationMs,()=>{
   if(!mayRun()){pause();return;}
   hide();phase='waiting';schedule(interval-VIKING_WEATHER_TIMING.durationMs,begin);
  });
 }
 function resume(){if(disposed)return;if(!mayRun()||!measure()){pause();return;}if(phase!=='paused')return;phase='waiting';schedule(started?vikingWeatherInterval(random):VIKING_WEATHER_TIMING.initialDelayMs,begin);}
 function refresh(){if(disposed)return;if(!mayRun()||!measure()){pause();return;}resume();}
 const Observer=options.ResizeObserver||document.defaultView?.ResizeObserver;let observer=null;
 if(Observer){try{observer=new Observer(refresh);observer.observe(root);}catch{try{observer?.disconnect();}catch{}observer=null;}}
 document.addEventListener('visibilitychange',resume);
 if(media.addEventListener)media.addEventListener('change',resume);else media.addListener?.(resume);
 const controller=Object.freeze({refresh,state:()=>({phase,disposed,timerPending:timer!==null,nextDelayMs,snowSheetCount:sheets.length,powderCount:4,mistCount:2}),dispose(){
  if(disposed)return;disposed=true;pause();phase='disposed';try{observer?.disconnect();}catch{}try{clip.dispose();}catch{}
  document.removeEventListener('visibilitychange',resume);if(media.removeEventListener)media.removeEventListener('change',resume);else media.removeListener?.(resume);
  background.remove();foreground.remove();mounts.delete(root);
 }});
 mounts.set(root,controller);resume();return controller;
}
