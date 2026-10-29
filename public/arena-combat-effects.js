// Cosmetic only: classify committed events, never infer damage from a role/name.
import {heroCombatPresentation} from './hero-combat-presentation.js';
const lightningCasters=new Set(['original:expansion-01']);
const lightningSpecials=new Set(['original:14','original:expansion-29']);
export function combatEffectKind(event={},hero={}){
 if(event.action==='heal'||event.action==='passive-heal')return 'heal';
 if(['shield','tank-front-shield','tank-self-shield','thorns-shield'].includes(event.action))return 'shield';
 if(!['normal','special','splash'].includes(event.damageType)&&event.action!=='attack')return null;
 if(lightningCasters.has(hero.id)||(event.damageType==='special'&&lightningSpecials.has(hero.id)))return 'lightning';
 const presentation=heroCombatPresentation(hero);
 if(presentation.projectile==='arrow')return 'arrow';
 if(presentation.stationary&&presentation.projectile==='magic')return 'magic';
 return 'strike';
}
// A frame can contain the same hero ID on both teams. Resolve the committed side.
export function combatEffectActors(document,event,kind){
 const id=event.actorId??event.actor,targetId=event.targetId??event.target;
 const all=[...document.querySelectorAll('.hero')];
 const side=event.side===0||event.side===1?event.side:null;
 const find=(heroId,teamSide)=>{
  const pool=teamSide===null?all:[...(document.getElementById(teamSide===0?'team-a':'team-b')?.querySelectorAll('.hero')||[])];
  const matches=pool.filter(el=>el.dataset.heroId===heroId);
  // Older passive logs omit side. Omit ambiguous decoration rather than mark
  // the opponent's identical hero; the authoritative HP/log still renders.
  return matches.length===1?matches[0]:undefined;
 };
 const actor=find(id,side),friendly=kind==='heal'||kind==='shield';
 return {actor,target:targetId?find(targetId,side===null?null:friendly?side:1-side):friendly?actor:null};
}

// Each resource owns its cleanup, including interrupted/repeated frames. Oldest
// decorative resources are evicted under bursts; no battle event is dropped.
export function createCombatEffects({document,maxResources=80,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const resources=new Set(),classOwners=new WeakMap();
 function own(cleanup,ms){
  let timer,done=false;
  const release=()=>{if(done)return;done=true;clearTimer(timer);resources.delete(release);cleanup()};
  resources.add(release);timer=setTimer(release,ms);
  while(resources.size>maxResources)resources.values().next().value();
  return release;
 }
 function node(element,host,ms){host.append(element);own(()=>element.remove(),ms);return element;}
 function animate(element,frames,options){
  const animation=element?.animate?.(frames,options);
  if(animation)own(()=>animation.cancel(),options.duration+50);
 }
 function mark(element,names,ms){
  let owners=classOwners.get(element);if(!owners){owners=new Map();classOwners.set(element,owners)}
  for(const name of names){const token={};owners.set(name,token);element.classList.add(name);own(()=>{if(owners.get(name)===token){element.classList.remove(name);owners.delete(name)}},ms)}
 }
 function clear(){for(const release of [...resources])release();}
 function accent(target,kind,{cast=false,splash=false,ms=650}={}){
  const portrait=target?.querySelector('.arena-portrait')||target;if(!portrait)return;
  const effect=document.createElement('span');effect.className='combat-fx fx-'+kind+(cast?' fx-cast':'')+(splash?' fx-splash':'');
  effect.setAttribute('aria-hidden','true');effect.style.setProperty('--fx-duration',ms+'ms');
  // Three deterministic sparks, no animation-frame loop or per-particle timers.
  for(let i=0;i<3;i++){const spark=document.createElement('i');spark.style.setProperty('--spark',i);effect.append(spark)}
  node(effect,portrait,ms+60);
 }
 function beam(actor,target,kind,ms){
  const ar=actor.getBoundingClientRect(),tr=target.getBoundingClientRect();
  const x=ar.left+ar.width/2,y=ar.top+ar.height*.4,dx=tr.left+tr.width/2-x,dy=tr.top+tr.height*.4-y;
  const effect=document.createElement('span');effect.className='combat-beam beam-'+kind;effect.setAttribute('aria-hidden','true');
  effect.style.left=x+'px';effect.style.top=y+'px';effect.style.width=Math.hypot(dx,dy)+'px';effect.style.rotate=Math.atan2(dy,dx)+'rad';effect.style.setProperty('--fx-duration',ms+'ms');
  node(effect,document.body,ms+60);
 }
 return {node,animate,mark,clear,accent,beam,get size(){return resources.size}};
}
