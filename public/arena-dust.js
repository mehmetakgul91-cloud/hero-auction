// Approved savanna v4: cosmetic-only, finite opacity/transform animation.
import {createPortraitWeatherClip} from './arena-portrait-weather.js';
export const DUST_TIMING=Object.freeze({durationMs:14000,minIntervalMs:15000,maxIntervalMs:25000});
export const DUST_ENVELOPE=Object.freeze([0,.18,.7,1]);
export const DUST_LAYERS=Object.freeze([
 Object.freeze({role:'lead',leftPct:-170,topPct:40,widthPct:170,heightPct:38,startTranslatePct:0,startTranslateYPct:0,endTranslatePct:160,endTranslateYPct:-8,rotationDeg:-1.5,peakOpacity:.30,tailOpacity:.22,durationMs:13000,delayMs:0,startScale:.90,endScale:1.12}),
 Object.freeze({role:'trailing',leftPct:-190,topPct:48,widthPct:185,heightPct:34,startTranslatePct:0,startTranslateYPct:0,endTranslatePct:160,endTranslateYPct:-10,rotationDeg:1,peakOpacity:.24,tailOpacity:.16,durationMs:6000,delayMs:3000,startScale:.78,endScale:1.20}),
 Object.freeze({role:'haze',leftPct:-200,topPct:40,widthPct:200,heightPct:40,startTranslatePct:0,startTranslateYPct:0,endTranslatePct:95,endTranslateYPct:0,rotationDeg:0,peakOpacity:.07,tailOpacity:.08,durationMs:14000,delayMs:0,startScale:.95,endScale:1.20})
]);
export const FOREGROUND_LAYERS=Object.freeze([0,1].map((index,i)=>{const source=DUST_LAYERS[index],peak=[.08,.07][i];return Object.freeze({...source,peakOpacity:peak,tailOpacity:source.tailOpacity*peak/source.peakOpacity});}));
export const DUST_TEXTURE_URL=new URL('./images/arena-themes/savanna-dust.webp',import.meta.url).href;
const mounts=new WeakMap();

// Cosmetic entropy is never taken from Math.random or any game/combat PRNG.
export function cosmeticRandom(){
 const buffer=new Uint32Array(1);
 try{if(globalThis.crypto?.getRandomValues){globalThis.crypto.getRandomValues(buffer);return buffer[0]/4294967296;}}catch{}
 return .5; // deterministic safe cadence when cryptographic entropy is unavailable
}
export function dustIntervalMs(random=cosmeticRandom){
 let value;try{value=Number(random());}catch{value=.5;}
 const unit=Number.isFinite(value)?Math.min(1,Math.max(0,value)):.5;
 return Math.round(DUST_TIMING.minIntervalMs+(DUST_TIMING.maxIntervalMs-DUST_TIMING.minIntervalMs)*unit);
}
// Pure sampler: progress is global over the 14-second event. Each finite layer
// has its own delay/duration. X/Y percentages use its OWN box width/height.
export function sampleDustLayer(layer,progress){
 const eventProgress=Math.min(1,Math.max(0,Number(progress)||0));
 const t=Math.min(1,Math.max(0,(eventProgress*DUST_TIMING.durationMs-layer.delayMs)/layer.durationMs));
 const values=[0,layer.peakOpacity,layer.tailOpacity,0];
 let segment=0;while(segment<DUST_ENVELOPE.length-2&&t>DUST_ENVELOPE[segment+1])segment++;
 const fraction=(t-DUST_ENVELOPE[segment])/(DUST_ENVELOPE[segment+1]-DUST_ENVELOPE[segment]);
 return {translatePct:layer.startTranslatePct+(layer.endTranslatePct-layer.startTranslatePct)*t,
  translateYPct:layer.startTranslateYPct+(layer.endTranslateYPct-layer.startTranslateYPct)*t,
  opacity:values[segment]+(values[segment+1]-values[segment])*fraction,
  scale:layer.startScale+(layer.endScale-layer.startScale)*t};
}

export function mountSavannaDust(root,options={}){
 if(!root?.ownerDocument&&!options.document)throw new TypeError('An arena root with a document is required');
 const existing=mounts.get(root);if(existing)return existing;
 const document=options.document||root.ownerDocument;
 const media=options.motionQuery||document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:false};
 const clock=options.clock||{setTimeout:(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimeout:id=>globalThis.clearTimeout(id)};
 const random=options.random||cosmeticRandom;
 const textureUrl=options.textureUrl||DUST_TEXTURE_URL;
 const overlay=document.createElement('div');
 overlay.className='savanna-dust';overlay.setAttribute('data-savanna-dust','');overlay.setAttribute('aria-hidden','true');overlay.hidden=true;
 overlay.style.setProperty('--dust-duration',DUST_TIMING.durationMs+'ms');
 const images=[];
 function addLayers(parent,layers){
 for(const layer of layers){
  const image=document.createElement('img');image.className='savanna-dust__layer';image.alt='';image.draggable=false;image.decoding='async';images.push(image);
  for(const [name,value] of Object.entries({left:layer.leftPct,top:layer.topPct,width:layer.widthPct,height:layer.heightPct,start:layer.startTranslatePct,end:layer.endTranslatePct,'start-y':layer.startTranslateYPct,'end-y':layer.endTranslateYPct}))image.style.setProperty('--dust-'+name,value+'%');
  image.style.setProperty('--dust-rotation',layer.rotationDeg+'deg');
  image.style.setProperty('--dust-start-scale',String(layer.startScale));image.style.setProperty('--dust-end-scale',String(layer.endScale));
  image.style.setProperty('--dust-layer-duration',layer.durationMs+'ms');image.style.setProperty('--dust-layer-delay',layer.delayMs+'ms');
  image.style.setProperty('--dust-peak',String(layer.peakOpacity));image.style.setProperty('--dust-tail',String(layer.tailOpacity));parent.append(image);
 }
 }
 addLayers(overlay,DUST_LAYERS);
 // The actual arena already establishes position:relative and isolation:isolate.
 // Negative local stacking keeps this above its background but below ALL hero UI.
 root.insertBefore(overlay,root.firstChild||null);
 let clip;try{clip=createPortraitWeatherClip(root,{document,ResizeObserver:options.ResizeObserver,MutationObserver:options.MutationObserver});}catch{clip={enabled:false,styleValue:'inset(50%)',refresh(){},dispose(){}};}
 const foreground=document.createElement('div');foreground.setAttribute('data-savanna-dust','');foreground.setAttribute('data-savanna-foreground','');foreground.setAttribute('aria-hidden','true');foreground.hidden=true;foreground.style.setProperty('clip-path',clip.styleValue);addLayers(foreground,FOREGROUND_LAYERS);root.append(foreground);
 const stopForeground=()=>{foreground.hidden=true;foreground.classList.remove('is-running');};

 let timer=null,generation=0,phase='paused',disposed=false,nextDelayMs=null,ending=false;
 // Foreground layers share this event clock; hook failures never leak it.
 const notifyStart=()=>{clip.refresh();foreground.hidden=!clip.enabled;if(clip.enabled)foreground.classList.add('is-running');try{options.onPassStart?.();}catch{}};
 const notifyEnd=()=>{stopForeground();if(ending)return;ending=true;try{options.onPassEnd?.();}catch{}finally{ending=false;}};
 const mayRun=()=>root.isConnected!==false&&!root.hidden&&!document.hidden&&!media.matches;
 const cancelTimer=()=>{generation++;if(timer!==null)clock.clearTimeout(timer);timer=null;nextDelayMs=null;};
 function schedule(delay,callback){
  cancelTimer();const ticket=generation;nextDelayMs=delay;
  timer=clock.setTimeout(()=>{if(disposed||ticket!==generation)return;timer=null;nextDelayMs=null;callback();},delay);
 }
 function pause(){cancelTimer();phase='paused';overlay.classList.remove('is-running');overlay.hidden=true;notifyEnd();}
 function beginPass(){
  if(disposed)return;if(!mayRun()){pause();return;}
  phase='playing';overlay.hidden=false;overlay.classList.add('is-running');notifyStart();
  if(disposed||!mayRun()||phase!=='playing')return;
  const interval=dustIntervalMs(random);
  schedule(DUST_TIMING.durationMs,()=>{
   if(!mayRun()){pause();return;}
   overlay.classList.remove('is-running');overlay.hidden=true;phase='waiting';notifyEnd();
   if(disposed||!mayRun()||phase!=='waiting')return;
   schedule(interval-DUST_TIMING.durationMs,beginPass);
  });
 }
 function resume(){
  if(disposed)return;
  if(!mayRun()){pause();return;}
  if(phase!=='paused')return;
  for(const image of images)if(!image.src)image.src=textureUrl;
  phase='waiting';overlay.hidden=false;schedule(dustIntervalMs(random),beginPass);
 }
 const onStateChange=()=>resume();
 document.addEventListener('visibilitychange',onStateChange);
 if(media.addEventListener)media.addEventListener('change',onStateChange);else media.addListener?.(onStateChange);
 const controller=Object.freeze({
  refresh:()=>{clip.refresh();resume();},
  state:()=>({phase,disposed,timerPending:timer!==null,nextDelayMs,layerCount:DUST_LAYERS.length}),
  dispose(){
   if(disposed)return;disposed=true;pause();phase='disposed';
   document.removeEventListener('visibilitychange',onStateChange);
   if(media.removeEventListener)media.removeEventListener('change',onStateChange);else media.removeListener?.(onStateChange);
   foreground.remove();clip.dispose();overlay.remove();mounts.delete(root);
  }
 });
 mounts.set(root,controller);resume();return controller;
}
