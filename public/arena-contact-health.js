// Display-only snapshots. Never calculate damage or delay command authority.
// Only a single attributable cast can use the latest server snapshot. A burst
// has no intermediate snapshots: settle it rather than replaying stale attacks.
export function createArenaContactHealth({render,play,clearEffects=()=>{},canAnimate=()=>true,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let version=-1,pending=null,generation=0,finished=false;
 function cancel(){
  generation++;
  if(pending?.timer!==null&&pending?.timer!==undefined)clearTimer(pending.timer);
  pending=null;
 }
 function settle(){
  const frame=pending?.frame;cancel();
  if(frame){clearEffects();render(frame);}
 }
 function reset(){cancel();version=-1;finished=false;}
 function receive(frame){
  if(!frame||!Array.isArray(frame.teams)||frame.teams.length!==2)return;
  const next=Number(frame.version);
  if(!Number.isSafeInteger(next)||next<0){settle();render(frame);return;}
  if(next<version)return;
  if(next===version){
   // Terminal metadata may arrive without a new combat version. Keep an
   // in-flight cast at contact, but never discard the final result.
   if(frame.finished&&!finished){
    finished=true;
    if(pending)pending.frame={...frame,events:pending.frame.events};else render(frame);
   }
   return;
  }
  const previous=version;version=next;finished=!!frame.finished;
  const interrupted=!!pending;
  if(interrupted){
   // The transport already acknowledged this cast. Retain its feedback when
   // a newer snapshot supersedes its travel, but never replay its damage.
   const supplied=new Set((frame.events||[]).map(e=>e.version));
   frame={...frame,events:[...(pending.frame.events||[]).filter(e=>!supplied.has(e.version)),...(frame.events||[])]};
   cancel();clearEffects();
  }
  const fresh=(frame.events||[]).filter(e=>Number.isSafeInteger(e?.version)&&e.version>previous);
  const versions=new Set(fresh.map(e=>e.version));
  const heroCast=fresh.length>0&&fresh.length<=32&&versions.size===1&&versions.has(next)&&fresh.every(e=>typeof e.actor==='string'&&!e.actor.startsWith('commander:'));
  const hasContact=fresh.some(e=>e.action==='attack'||['normal','special','splash'].includes(e.damageType));
  // First/reconnected snapshot has no known visual baseline. Never fake its travel.
  if(previous<0||next!==previous+1||interrupted||!heroCast||!hasContact||!canAnimate()){
   if(previous<0||next!==previous+1||interrupted||versions.size>1||!canAnimate())clearEffects();
   render(frame);
   // Heal/shield and skipped/delayed-turn cues retain their immediate semantics.
   if(previous>=0&&next===previous+1&&!interrupted&&heroCast&&!hasContact&&canAnimate()){try{play(fresh,()=>{})}catch{clearEffects()}}
   return;
  }
  const token=++generation;
  pending={frame,timer:null};
  const contact=()=>{
   if(token!==generation||!pending)return;
   const committed=pending.frame;cancel();render(committed,next);
  };
  let timing;
  try{timing=play(fresh,contact)}catch{clearEffects();contact();return;}
  // Missing portraits, reduced motion, or an unsupported action must not hold HP.
  if(!pending||token!==generation)return;
  if(!timing||!Number.isFinite(timing.arrival)||timing.arrival<=0){contact();return;}
  // A removed effect cannot leave old health on screen indefinitely.
  pending.timer=setTimer(()=>{if(token!==generation)return;clearEffects();contact();},Math.min(1200,timing.arrival+80));
 }
 return {receive,settle,reset,get pending(){return !!pending;}};
}
