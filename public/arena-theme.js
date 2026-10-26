// Cosmetic presentation only. Never read hero stats, seats, turns or combat RNG.
// Active pool is temporarily forest-only; retired IDs remain readable for saved rooms.
export const ARENA_THEME_IDS=Object.freeze(['ruins']);
export const ARENA_THEME_CATALOG_IDS=Object.freeze(['courtyard','savanna','fjord','ruins','space']);
export const ARENA_THEME_LABELS=Object.freeze({
 courtyard:Object.freeze({tr:'Çin esintili avlu',en:'Chinese-inspired courtyard'}),
 savanna:Object.freeze({tr:'Afrika savanası',en:'African savanna'}),
 fjord:Object.freeze({tr:'Viking taş arenası',en:'Viking stone arena'}),
 ruins:Object.freeze({tr:'Orman harabeleri',en:'Forest ruins'}),
 space:Object.freeze({tr:'Uzay platformu',en:'Space platform'})
});
export const isArenaTheme=value=>typeof value==='string'&&ARENA_THEME_IDS.includes(value);
export const validArenaMatchKey=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u0020\u007f]/.test(value);

// Backward compatibility for old rooms/servers. Both seats hash the same public
// match identity; no client token, orientation, clock, storage or random call.
export function fallbackArenaTheme(matchKey){
 const key=validArenaMatchKey(matchKey)?matchKey:'legacy-preview';
 let hash=2166136261;
 for(let index=0;index<key.length;index++){hash^=key.charCodeAt(index);hash=Math.imul(hash,16777619);}
 return ARENA_THEME_IDS[(hash>>>0)%ARENA_THEME_IDS.length];
}
export function validatedArenaPresentation(value,expectedMatchKey){
 if(!validArenaMatchKey(expectedMatchKey))return null;
 if(value===undefined||value===null)return {version:1,matchKey:expectedMatchKey,theme:fallbackArenaTheme(expectedMatchKey)};
 if(value.version!==1||value.matchKey!==expectedMatchKey||!ARENA_THEME_CATALOG_IDS.includes(value.theme))return null;
 return {version:1,matchKey:expectedMatchKey,theme:isArenaTheme(value.theme)?value.theme:fallbackArenaTheme(expectedMatchKey)};
}
// One current binding, not an accumulating match cache. Repeated snapshots and
// orientation/formation changes never rewrite the arena or restart any effects.
export function createArenaThemePresentation({element,language='tr'}={}){
 let current=null;
 return {
  apply(value,expectedMatchKey){
   const next=validatedArenaPresentation(value,expectedMatchKey);
   if(!next||!element)return null;
   if(current?.matchKey===next.matchKey)return {...current};
   current=next;
   element.dataset.arenaTheme=next.theme;
   element.setAttribute('aria-label',`${language==='en'?'Battle arena':'Savaş arenası'} · ${ARENA_THEME_LABELS[next.theme][language==='en'?'en':'tr']}`);
   return {...current};
  },
  current(){return current?{...current}:null;}
 };
}
