// Approved dense-snow concept: libfile_0fdc4bab2b248191978cc0cf1444d3ee.
// Bounded cosmetic sheets, not per-flake DOM; the accepted cliff-free art never moves.
import {createPortraitWeatherClip} from './arena-portrait-weather.js';
export const VIKING_WEATHER_TIMING=Object.freeze({durationMs:12000,initialDelayMs:500,minIntervalMs:13000,maxIntervalMs:16000});
export const VIKING_SNOW_LAYERS=Object.freeze([
 Object.freeze({role:'far',texture:'far',dx:50,dy:150,durationMs:12000,delayMs:0,opacity:.70}),
 Object.freeze({role:'middle',texture:'middle',dx:110,dy:270,durationMs:12000,delayMs:0,opacity:.80}),
 Object.freeze({role:'near',texture:'near',dx:210,dy:420,durationMs:12000,delayMs:0,opacity:.85}),
 Object.freeze({role:'gust-a',texture:'gust',dx:260,dy:160,durationMs:3200,delayMs:2200,opacity:.60}),
 Object.freeze({role:'gust-b',texture:'gust',dx:260,dy:160,durationMs:3200,delayMs:7600,opacity:.60})
]);
export const VIKING_FOREGROUND_INDICES=Object.freeze([2,3,4]);
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
  node.style.setProperty('--snow-duration',spec.durationMs+'ms');node.style.setProperty('--snow-delay',spec.delayMs+'ms');node.style.setProperty('--snow-opacity',String(front?.45:spec.opacity));
  parent.append(node);sheets.push({node,spec});
 }
 for(const spec of VIKING_SNOW_LAYERS)addSnow(background,spec,false);
 for(const index of VIKING_FOREGROUND_INDICES)addSnow(foreground,VIKING_SNOW_LAYERS[index],true);
 root.insertBefore(background,root.firstChild||null);root.append(foreground);
 let disposed=false,phase='paused',timer=null,generation=0,nextDelayMs=null,assetsLoaded=false,started=false;
 const mayRun=()=>!disposed&&root.dataset?.arenaTheme==='fjord'&&!root.hidden&&!root.closest?.('[hidden]')&&!document.hidden&&!media.matches&&root.isConnected!==false;
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
 const controller=Object.freeze({refresh,state:()=>({phase,disposed,timerPending:timer!==null,nextDelayMs,snowSheetCount:sheets.length}),dispose(){
  if(disposed)return;disposed=true;pause();phase='disposed';try{observer?.disconnect();}catch{}try{clip.dispose();}catch{}
  document.removeEventListener('visibilitychange',resume);if(media.removeEventListener)media.removeEventListener('change',resume);else media.removeListener?.(resume);
  background.remove();foreground.remove();mounts.delete(root);
 }});
 mounts.set(root,controller);resume();return controller;
}
