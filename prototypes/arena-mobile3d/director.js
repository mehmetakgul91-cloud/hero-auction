import {ARENA_WIDTH_SCALE} from './arena-layout.js';
import {primaryAction} from './shared/arena-3d-timeline.js';
import {heroCombatPresentation} from './shared/hero-combat-presentation.js';

// Presentation only. Targets, effects and resulting snapshots belong to the server.
// A different renderer or a slow phone must never select a target or roll damage.
export const PHASES=Object.freeze([
 {at:0,name:'approach'}, {at:.28,name:'windup'}, {at:.5,name:'impact'},
 {at:.62,name:'recovery'}, {at:.76,name:'return'},
]);
const clamp=n=>Math.min(1,Math.max(0,n));
const ease=n=>{const p=clamp(n);return p*p*(3-2*p);};
export function formationSlots(teams){
 const slots=new Map();
 teams.forEach((team,side)=>{
  for(const lane of ['front','back']){
   const row=team.filter(h=>h.lane===lane).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
   row.forEach((hero,i)=>slots.set(side+':'+hero.id,{x:ARENA_WIDTH_SCALE*(i-(row.length-1)/2)*Math.min(2.05,6.2/Math.max(1,row.length-1)),y:.12,z:(side?-1:1)*(lane==='front'?1.25:3.45)}));
  }
 });return slots;
}
export function planAction(frame,before,index=0){
 const event=primaryAction(frame),side=event?.side;
 const actor=before[side]?.find(h=>h.id===event?.actor);
 const commander=String(event?.actor).startsWith('commander:');
 const skipped=event?.action==='stun-skip'||(actor&&actor.hp<=0);
 const friendly=/heal|shield|regen/.test(event?.action||'');
 const targetSide=friendly?side:1-side;
 const target=before[targetSide]?.find(h=>h.id===(event?.target||event?.actor));
 const stationary=!actor||heroCombatPresentation(actor).stationary||friendly;
 const kind=commander?'commander':skipped?'skip':!event?'round':friendly?'support':stationary?'cast':'melee';
 return Object.freeze({id:index,event,kind,actorKey:actor?side+':'+actor.id:null,
  targetKey:target?targetSide+':'+target.id:null,stationary,
  moving:kind==='melee'&&!!target&&target.hp>0,
  duration:kind==='melee'?1.65:kind==='cast'?1.35:kind==='commander'?1.2:kind==='round'?.3:1,
  impactAt:.5,phases:PHASES});
}
export function sampleAction(plan,progress,{reduced=false}={}){
 const p=clamp(progress),moving=plan.moving&&!reduced;
 const travel=p<.28?ease(p/.28):p<.76?1:1-ease((p-.76)/.24);
 const phase=PHASES.findLast(item=>p>=item.at).name;
 const windup=p<.28?0:p<.44?ease((p-.28)/.16):p<.5?1-ease((p-.44)/.06):0;
 const follow=p<.44?0:p<.5?ease((p-.44)/.06):1-ease((p-.5)/.26);
 return {phase,travel:moving?travel:0,walk:moving&&(phase==='approach'||phase==='return'),windup,follow,
  projectile:plan.kind==='cast'&&!!plan.targetKey&&p>=.3&&p<.5,
  projectileProgress:clamp((p-.3)/.2)};
}
export function pathPosition(from,to,travel,side=0){
 const dx=to.x-from.x,dz=to.z-from.z,d=Math.hypot(dx,dz),reach=Math.max(0,d-1.05)/(d||1);
 const u=clamp(travel),bend=Math.sin(u*Math.PI)*.28*(side?-1:1);
 return {x:from.x+dx*reach*u+dz/(d||1)*bend,y:from.y,z:from.z+dz*reach*u-dx/(d||1)*bend};
}

export class CombatDirector{
 constructor(data,callbacks={}){
  this.data=data;this.frames=data.frames;this.callbacks=callbacks;
  this.plans=this.frames.map((frame,i)=>planAction(frame,i?this.frames[i-1].teams:data.initial,i));
  this.reset();
 }
 reset(){this.cursor=0;this.elapsed=0;this.started=false;this.impacted=false;this.phaseIndex=-1;this.playing=false;this.finished=false;}
 play(){if(!this.finished)this.playing=true;}
 pause(){this.playing=false;}
 get plan(){return this.plans[this.cursor]||null;}
 get progress(){return this.finished||!this.plan?1:this.elapsed/this.plan.duration;}
 advance(seconds){
  if(!this.playing||!Number.isFinite(seconds)||seconds<=0)return;
  while(seconds>0&&this.cursor<this.frames.length){
   const frame=this.frames[this.cursor],plan=this.plan;
   if(!this.started){this.started=true;this.callbacks.start?.(frame,this.cursor,plan);}
   const consumed=Math.min(seconds,plan.duration-this.elapsed);this.elapsed+=consumed;seconds-=consumed;
   const progress=this.elapsed/plan.duration;
   // Traverse every boundary, even after a dropped frame, in chronological order.
   while(this.phaseIndex+1<PHASES.length&&progress+1e-9>=PHASES[this.phaseIndex+1].at){
    const phase=PHASES[++this.phaseIndex];this.callbacks.phase?.(phase.name,frame,this.cursor,plan);
    if(phase.name==='impact'&&!this.impacted){this.impacted=true;this.callbacks.impact?.(frame,this.cursor,plan);}
   }
   if(this.elapsed+1e-8<plan.duration)break;
   this.callbacks.end?.(frame,this.cursor,plan);this.cursor++;this.elapsed=0;this.started=false;this.impacted=false;this.phaseIndex=-1;
  }
  if(this.cursor===this.frames.length){this.finished=true;this.playing=false;this.callbacks.finish?.();}
 }
}
