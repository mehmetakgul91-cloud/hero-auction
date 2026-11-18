import {MELEE_SPRITES} from './hero-melee-sprites-data.js';
import {CASTER_SPRITES} from './hero-caster-sprites-data.js';

// Reuse the painted roster's first pose. No battle state or timers live here.
export function arenaSilhouetteProfile(unit){
 return MELEE_SPRITES[unit.id] || CASTER_SPRITES[unit.id] || null;
}
export function mountArenaSilhouette({document,unit,card,portrait,fallback,side}){
 const profile=arenaSilhouetteProfile(unit);
 if(!profile)return Promise.resolve(false);
 return new Promise(resolve=>{
  const image=document.createElement('img');
  image.decoding='async';
  image.onerror=()=>resolve(false);
  image.onload=()=>{
   if(!portrait.isConnected){resolve(false);return;}
   const pose=document.createElement('span');pose.className='arena-silhouette-body';pose.setAttribute('aria-hidden','true');
   pose.style.backgroundImage=`url("${profile.src}")`;
   card.classList.add('arena-silhouette');card.dataset.team=side?'red':'blue';
   fallback.remove();portrait.append(pose);resolve(true);
  };
  image.src=profile.src;
 });
}
