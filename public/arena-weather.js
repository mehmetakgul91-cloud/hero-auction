// Cosmetic-only binding. Match identity and selected scene are already validated
// by arena-theme.js; weather never reads or writes gameplay, wallet or combat RNG.
import {isArenaTheme,validArenaMatchKey} from './arena-theme.js';
import {mountSavannaDust} from './arena-dust.js';
import {mountForestGust} from './arena-forest-gust.js';
export function createArenaWeather({root,mounts={savanna:mountSavannaDust,ruins:mountForestGust}}={}){
 let instance=null,binding=null,disposed=false;
 function clear(){const old=instance;instance=null;binding=null;try{old?.dispose?.();}catch{/* Decoration cannot interrupt a match. */}}
 return {
  update(presentation,{active=false}={}){
   const usable=active&&!disposed&&root&&!root.hidden&&root.isConnected!==false&&isArenaTheme(presentation?.theme)&&validArenaMatchKey(presentation?.matchKey)&&root.dataset?.arenaTheme===presentation.theme;
   if(!usable){clear();return null;}
   if(binding?.matchKey===presentation.matchKey&&binding.theme===presentation.theme)return {...binding};
   clear();
   try{instance=mounts[presentation.theme]?.(root);if(instance)binding={matchKey:presentation.matchKey,theme:presentation.theme};}
   catch{clear();}
   return binding?{...binding}:null;
  },
  refresh(){try{instance?.refresh?.();}catch{clear();}},
  clear,
  state(){return binding?{...binding,mounted:!!instance}:null;},
  dispose(){if(disposed)return;disposed=true;clear();}
 };
}
