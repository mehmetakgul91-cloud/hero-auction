import {appendHeroImpactArt} from './hero-impact-art.js';
import {createCombatEffects} from './arena-combat-effects.js';
import {heroCombatPresentation} from './hero-combat-presentation.js';
// Visual identity only. Formation roles and server combat rules are untouched.
export function heroAttackSignature(hero,kind){
 if(['heal','shield','lightning'].includes(kind))return kind;
 if(heroCombatPresentation(hero).projectile==='arrow')return 'arrow';
 if(kind==='magic')return 'magic';
 if(hero.role==='tank')return 'hammer';
 if(hero.role==='assassin')return 'dagger';
 if(['support','healer'].includes(hero.role))return 'light';
 return 'blade';
}
export function heroAttackTiming(time=850,{self=false,special=false,settled=false}={}){
 // Shared 1400/1900ms beats leave a deliberate source/travel phase followed
 // by contact and a fading tail. Presentation never changes battle calculations.
 const scale=Math.max(.8,Math.min(1.15,(Number(time)||850)/850));
 const charge=self||settled?0:Math.round((special?360:240)*scale);
 const travel=self||settled?0:Math.round((special?480:360)*scale);
 const impact=Math.round((special?1060:800)*scale);
 return {charge,travel,arrival:charge+travel,impact,total:charge+travel+impact};
}
// No FIFO: start committed decoration immediately. Old clients and network
// bursts remain bounded by whole-cast eviction, without delaying server state.
// A newer death/removal cancels that target's obsolete travel, never HP/logs.
export function createHeroAttackPlayer({document,clock=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout,maxCasts=4}={}){
 const casts=new Map();let serial=0;
 function clear(){for(const records of casts.values())for(const r of records)r.effects.clear();casts.clear();}
 function prune(){
  for(const [key,records] of casts){
   for(const r of records)if(clock()>=r.until||r.actor.isConnected===false||r.target.isConnected===false||(!!r.actor.classList?.contains('dead')!==r.deadActor||!!r.target.classList?.contains('dead')!==r.deadTarget))r.effects.clear();
   const live=records.filter(r=>r.effects.size>0);
   if(live.length)casts.set(key,live);else casts.delete(key);
  }
 }
 function play(options){
  prune();
  const {actor,target}=options;if(!actor||!target)return;
  const key=options.castKey??++serial;
  if(!casts.has(key))casts.set(key,[]);
  while(casts.size>maxCasts){const oldest=casts.keys().next().value;for(const r of casts.get(oldest))r.effects.clear();casts.delete(oldest);}
  const records=casts.get(key);
  if(records.length>=32)return; // A malformed decorative group cannot grow forever.
  const settled=!!(actor.classList?.contains('dead')||target.classList?.contains('dead'));
  const effects=createCombatEffects({document,maxResources:3,setTimer,clearTimer});
  const timing=playHeroAttack({...options,document,effects,settled});
  if(timing)records.push({actor,target,effects,deadActor:!!actor.classList?.contains('dead'),deadTarget:!!target.classList?.contains('dead'),until:clock()+timing.total+80});
  return timing;
 }
 return {play,prune,clear,get remaining(){prune();return Math.max(0,...[...casts.values()].flat().map(r=>r.until-clock()));},get size(){prune();return casts.size;}};
}
// All nodes use the shared bounded owner; cancellation removes delayed CSS too.
// Fixed, portrait-sized transparent overlays escape portrait/board clipping but
// never cover HP bars with a filled panel. Damage labels retain their higher layer.
export function playHeroAttack({document,effects,actor,target,hero,kind,special=false,splash=false,settled=false,time=850}){
 if(!actor||!target)return;
 const signature=heroAttackSignature(hero,kind);
 const rect=el=>(el.querySelector('.arena-portrait')||el).getBoundingClientRect();
 const a=rect(actor),b=rect(target),from={x:a.left+a.width/2,y:a.top+a.height/2},to={x:b.left+b.width/2,y:b.top+b.height/2};
 if(!a.width||!b.width)return;
 const timing=heroAttackTiming(time,{special:special||splash,self:actor===target,settled});
 const angle=Math.atan2(to.y-from.y,to.x-from.x);
 function make(phase,point,ms,delay=0){
  const node=document.createElement('span');
  node.className=`hero-fx hero-fx-${phase} signature-${signature}${special?' is-special':''}${splash?' is-splash':''}`;
  node.setAttribute('aria-hidden','true');
  const contact=phase==='impact'&&!['heal','shield'].includes(signature);
  const size=contact?Math.max(44,Math.min(84,b.width*(special?1.12:1.02))):Math.max(56,Math.min(special?112:94,(phase==='cast'?a.width:b.width)*(special?1.4:1.2)));
  if(contact)node.className+=' hero-contact';
  for(const [key,value] of Object.entries({'--hero-size':size+'px','--hero-ms':ms+'ms','--hero-delay':delay+'ms','--hero-angle':angle+'rad','--hero-dx':(to.x-from.x)+'px','--hero-dy':(to.y-from.y)+'px'}))node.style.setProperty(key,value);
  node.style.left=point.x+'px';node.style.top=point.y+'px';
  if(!contact||!appendHeroImpactArt(document,node,signature,special)){
   for(let i=0;i<4;i++){const part=document.createElement('i');part.style.setProperty('--part',i);node.append(part)}
  }
  effects.node(node,document.body,delay+ms+80);return node;
 }
 if(!splash&&!settled&&actor!==target){
  make('cast',from,timing.charge);
  make('flight',from,timing.travel,timing.charge);
 }
 make('impact',to,timing.impact,timing.arrival);
 return {signature,...timing};
}
