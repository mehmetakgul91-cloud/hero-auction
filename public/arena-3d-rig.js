import {Quaternion,Vector3,MathUtils} from 'three';

export const OBSIDIAN_MODEL_URL='/models/obsidian-v1.glb';
const clamp=MathUtils.clamp,smooth=t=>t*t*(3-2*t);
const names={spine:'Bone_012',chest:'Bone_011',neck:'Bone_025',head:'Bone_024',weaponArm:'Bone_037',weaponElbow:'Bone_036',shieldArm:'Bone_028',shieldElbow:'Bone_027',leftHip:'Bone_017',leftKnee:'Bone_016',rightHip:'Bone_022',rightKnee:'Bone_021',cape:'Bone_033'};

// Bone_XXX names belong to this reviewed Smart Rig export, not a generic humanoid.
// Axes are converted into each parent's bind space, so rotating the whole hero
// to face a target does not change the direction of its joint articulation.
export class ObsidianMotion{
 constructor(root){
  this.root=root;root.updateMatrixWorld(true);this.bindings=new Map();
  for(const [key,name] of Object.entries(names)){
   const bone=root.getObjectByName(name);if(!bone?.isBone)throw Error('Obsidian skeleton missing '+name);
   const inverse=bone.parent.getWorldQuaternion(new Quaternion()).invert();
   this.bindings.set(key,{bone,rest:bone.quaternion.clone(),axes:[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)].map(axis=>axis.applyQuaternion(inverse))});
  }
  this.rotation=new Quaternion();this.apply({time:0});
 }
 turn(key,x=0,y=0,z=0){
  const {bone,rest,axes}=this.bindings.get(key);bone.quaternion.copy(rest);
  for(const [i,angle] of [x,y,z].entries())if(angle)bone.quaternion.premultiply(this.rotation.setFromAxisAngle(axes[i],angle));
 }
 apply({time=0,mode='idle',progress=0,reduced=false,hit=0,locomotion=false}={}){
  for(const {bone,rest} of this.bindings.values())bone.quaternion.copy(rest);
  const p=clamp(progress,0,1),breath=reduced?0:Math.sin(time*2.1);
  this.turn('chest',breath*.012);this.turn('head',0,breath*.025);this.turn('cape',breath*.025);
  if((mode==='walk'||locomotion)&&!reduced){
   const stride=Math.sin(time*10),lift=Math.cos(time*10);
   this.turn('leftHip',stride*.32);this.turn('rightHip',-stride*.32);
   this.turn('leftKnee',Math.max(0,-lift)*.38);this.turn('rightKnee',Math.max(0,lift)*.38);
   this.turn('weaponArm',-.12-stride*.16);this.turn('shieldArm',-.18+stride*.10);this.turn('chest',.04,Math.sin(time*10)*.035);
  }
  if(mode==='attack'){
   // Impact is p=.5, matching ArenaReplayClock's authoritative snapshot.
   const wind=p<.34?smooth(p/.34):p<.5?1-smooth((p-.34)/.16):0;
   const follow=p<.34?0:p<.5?smooth((p-.34)/.16):1-smooth((p-.5)/.5);
   this.turn('weaponArm',-wind*1.9-follow*.85,wind*-.18,wind*-.13);
   this.turn('weaponElbow',-wind*.4-follow*.18);
   this.turn('shieldArm',-.25-wind*.12);this.turn('shieldElbow',-.12);
   this.turn('chest',follow*.09,-wind*.18+follow*.20);this.turn('spine',follow*.06);
  }
  if(mode==='hit'||hit>0){const recoil=hit>0?hit:Math.sin(p*Math.PI);this.turn('chest',-recoil*.18);this.turn('neck',recoil*.13);this.turn('shieldArm',-recoil*.4);}
  if(mode==='death'){this.turn('leftKnee',p*.42);this.turn('rightKnee',p*.33);this.turn('weaponArm',p*.3);this.turn('head',p*.35);}
  if(mode==='victory'){this.turn('weaponArm',-1.9,0,-.2);this.turn('chest',-.04);}
 }
}

export function arenaRigState({active,model,time,progress,reduced}){
 let mode='idle',p=progress;
 if(model.dead){mode='death';p=clamp((time-(model.deathAt??-10))/.8,0,1);}
 else if(active?.actor===model&&active.target&&!active.stationary){mode='attack';}
 const elapsed=time-(model.hitAt??-10),hit=!reduced&&elapsed>=0&&elapsed<.3?Math.sin(elapsed/.3*Math.PI):0;
 return {time,mode,progress:p,reduced,hit,locomotion:mode==='attack'&&(p<.34||p>.58)};
}
