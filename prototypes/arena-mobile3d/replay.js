// Reuse the production prototype's time-based snapshot clock, with an empty-safe wrapper.
import {ArenaReplayClock,primaryAction,snapshotChanges} from './shared/arena-3d-timeline.js';
export {primaryAction,snapshotChanges};
export class Replay extends ArenaReplayClock{
 constructor(data,callbacks={}){super(data.frames,callbacks);this.data=data;}
 get progress(){return this.frames.length?super.progress:1;}
}
export function home(side,index){return {x:index<2?(index===0?-1.15:1.15):(index-3)*2.05,y:.12,z:(side?-1:1)*(index<2?1.25:3.45)};}
export function attackPose(progress,stationary,reduced=false){
 const p=Math.min(1,Math.max(0,progress)),ease=t=>t*t*(3-2*t);
 const move=stationary||reduced?0:p<.32?ease(p/.32):p<.58?1:1-ease((p-.58)/.42);
 const swing=Math.sin(Math.min(1,Math.max(0,(p-.24)/.36))*Math.PI);
 return {move,swing,projectile:stationary&&p>=.18&&p<.5,travel:Math.min(1,Math.max(0,(p-.18)/.32))};
}
