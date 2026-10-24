export function frameDuration(frame){
 if(frame.events.some(e=>String(e.actor).startsWith('commander:')))return 1.2;
 return frame.events.some(e=>e.actor)?1.15:.3;
}

// Playback consumes immutable server snapshots. It never calculates combat damage.
export class ArenaReplayClock{
 constructor(frames,callbacks={}){this.frames=frames;this.callbacks=callbacks;this.reset();}
 reset(){this.cursor=0;this.elapsed=0;this.started=false;this.impacted=false;this.playing=false;this.finished=false;}
 play(){if(!this.finished)this.playing=true;}
 pause(){this.playing=false;}
 get progress(){return this.finished?1:this.elapsed/frameDuration(this.frames[this.cursor]);}
 advance(seconds){
  if(!this.playing||!Number.isFinite(seconds)||seconds<=0)return;
  while(seconds>0&&this.cursor<this.frames.length){
   const frame=this.frames[this.cursor],duration=frameDuration(frame);
   if(!this.started){this.started=true;this.callbacks.start?.(frame,this.cursor);}
   const consumed=Math.min(seconds,duration-this.elapsed);this.elapsed+=consumed;seconds-=consumed;
   if(!this.impacted&&this.elapsed>=duration*.5){this.impacted=true;this.callbacks.impact?.(frame,this.cursor);}
   if(this.elapsed+1e-8<duration)break;
   this.callbacks.end?.(frame,this.cursor);this.cursor++;this.elapsed=0;this.started=false;this.impacted=false;
  }
  if(this.cursor===this.frames.length){this.finished=true;this.playing=false;this.callbacks.finish?.();}
 }
}

export function primaryAction(frame){
 return frame.events.find(e=>String(e.actor).startsWith('commander:'))||
  frame.events.find(e=>e.action==='attack'||['normal','special'].includes(e.damageType))||
  frame.events.find(e=>e.action==='heal')||frame.events.find(e=>e.actor)||null;
}

export function snapshotChanges(before,after){
 return after.flatMap((team,side)=>team.flatMap(hero=>{
  const prior=before[side].find(h=>h.id===hero.id);if(!prior)return [];
  const hp=hero.hp-prior.hp,shield=(hero.shield||0)-(prior.shield||0);
  return hp||shield?[{side,id:hero.id,hp,shield,died:prior.hp>0&&hero.hp===0}]:[];
 }));
}
