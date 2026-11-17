import {IDLE_SPRITES} from './hero-idle-sprites-data.js';
import {animateArenaIdle} from './arena-idle-animation.js';
import {MELEE_SPRITES} from './hero-melee-sprites-data.js';
import {CASTER_SPRITES} from './hero-caster-sprites-data.js';

// Dedicated idle sheets; existing attack profiles remain the fallback.
export function arenaSilhouetteProfile(unit){
 return IDLE_SPRITES[unit.id] || MELEE_SPRITES[unit.id] || CASTER_SPRITES[unit.id] || null;
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
   fallback.remove();portrait.append(pose);
   if(profile.anchors)animateArenaIdle({document,body:pose,card,image,anchors:profile.anchors,phase:(side?2:0)+String(unit.id).length*.413});
   resolve(true);
  };
  image.src=profile.src;
 });
}
