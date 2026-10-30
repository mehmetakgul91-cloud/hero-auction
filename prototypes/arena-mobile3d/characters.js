import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';

const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
export const CHARACTER_FILES={tank:'obsidyen.glb',mage:'morvan.glb'};
export function inspectCharacterTextures(sources){return Object.entries(sources).map(([type,source])=>{let meshes=0,textured=0;source.scene.traverse(o=>{if(o.isSkinnedMesh){meshes++;const materials=Array.isArray(o.material)?o.material:[o.material];if(materials.every(m=>m.map?.image?.width>0&&m.map?.image?.height>0&&m.map.colorSpace===T.SRGBColorSpace))textured++;}});return {type,file:CHARACTER_FILES[type],meshes,textured};});}
// In-place animation: the authoritative action director owns arena translation.
export function inPlaceClip(clip,origin){
 const copy=clip.clone();
 for(const track of copy.tracks)if(/Hips\.position$/.test(track.name)){
  const x=origin?.x??track.values[0],z=origin?.z??track.values[2],dy=origin?origin.y-track.values[1]:0;
  for(let i=0;i<track.values.length;i+=3){track.values[i]=x;track.values[i+1]+=dy;track.values[i+2]=z;}
 }
 return copy.optimize();
}
export class CharacterMotion{
 constructor(model,clips,type){
  this.model=model;this.mixer=new T.AnimationMixer(model);this.type=type;
  this.clips=Object.fromEntries(clips.map(c=>[c.name,inPlaceClip(c,model.getObjectByName('mixamorigHips')?.position)]));
  // Meshy's cloth chains are not retargeted by its humanoid clips. Keep the
  // collar attachment while preserving the cape's hanging bind orientation.
  this.cape=model.getObjectByName(type==='tank'?'Bone_025':'Bone_046');
  model.updateMatrixWorld(true);this.capeBind=this.cape?model.getWorldQuaternion(new T.Quaternion()).invert().multiply(this.cape.getWorldQuaternion(new T.Quaternion())):null;
  this.parentQ=new T.Quaternion();this.modelQ=new T.Quaternion();
  const readyTracks=[];
  for(const [suffix,axis,angle] of [['LeftArm','z',-.38],['RightArm','z',.38],['LeftForeArm','x',-.18],['RightForeArm','x',-.18]]){
   const bone=model.getObjectByName('mixamorig'+suffix);if(!bone)continue;
   const localAxis=new T.Vector3(axis==='x'?1:0,0,axis==='z'?1:0).applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).invert());
   const q=new T.Quaternion().setFromAxisAngle(localAxis,angle).multiply(bone.quaternion);
   readyTracks.push(new T.QuaternionKeyframeTrack(bone.name+'.quaternion',[0,2],[...q.toArray(),...q.toArray()]));
  }
  this.clips.Ready=new T.AnimationClip('Ready',2,readyTracks);
  const names=Object.keys(this.clips),find=pattern=>names.find(n=>pattern.test(n));
  this.names={idle:'Ready',walk:find(/^Walking$/i),attack:find(/hammer|soell|spell/i),hit:find(/hit.reaction/i)};
  this.actions={};for(const [key,name] of Object.entries(this.names))if(name){const action=this.mixer.clipAction(this.clips[name]);action.play();action.enabled=true;action.setEffectiveWeight(0);this.actions[key]=action;}
  if(!this.actions.walk||!this.actions.attack)throw Error('Karakterin yürüyüş veya saldırı klibi eksik.');
 }
 sample(time,{progress=0,pose=null,hitAge=99,reduced=false}={}){
  for(const action of Object.values(this.actions))action.setEffectiveWeight(0);
  const walk=pose?.walk&&!reduced?1:0;
  const attack=pose?smooth((progress-.23)/.07)*(1-smooth((progress-.66)/.12)):0;
  const hit=this.actions.hit&&hitAge<.4&&!reduced?Math.sin(clamp(hitAge/.4)*Math.PI)*.65:0;
  const idle=this.actions.idle||this.actions.walk;
  idle.time=this.actions.idle?(reduced?0:time%idle.getClip().duration):.12;
  idle.setEffectiveWeight((1-walk)*(1-attack)*(1-hit));
  if(walk){const a=this.actions.walk;a.time=time%a.getClip().duration;a.setEffectiveWeight((1-attack)*(1-hit));}
  if(attack){const a=this.actions.attack;
   // Contact is sampled at 50% of the clip at the director's impact boundary.
   const contact=.5,t=progress<=.5?clamp((progress-.28)/.22)*contact:contact+clamp((progress-.5)/.26)*(1-contact);
   a.time=Math.min(a.getClip().duration-.001,t*a.getClip().duration);a.setEffectiveWeight(attack*(1-hit));}
  if(hit){const a=this.actions.hit;a.time=clamp(hitAge/.4)*(a.getClip().duration-.001);a.setEffectiveWeight(hit);}
  this.mixer.update(0);
  if(this.cape){this.model.updateMatrixWorld(true);this.cape.quaternion.copy(this.cape.parent.getWorldQuaternion(this.parentQ).invert()).multiply(this.model.getWorldQuaternion(this.modelQ)).multiply(this.capeBind);}
 }
 dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);}
}

export async function loadCharacterKit(load=url=>new GLTFLoader().loadAsync(url)){
 const entries=await Promise.all(Object.entries(CHARACTER_FILES).map(async([type,file])=>[type,await load('./assets/'+file).catch(()=>{throw Error(file+' yüklenemedi. Bağlantını kontrol edip yeniden yükle.');})]));
 const sources=Object.fromEntries(entries),resources=new Set(),instances=[];
 for(const source of Object.values(sources))source.scene.traverse(o=>{if(o.isMesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);m.roughness=Math.max(.45,m.roughness);m.metalness=Math.min(.7,m.metalness);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}}});
 const keep=o=>(resources.add(o),o);
 const gold=keep(new T.MeshStandardMaterial({color:0xc7a65b,metalness:.7,roughness:.35})),steel=keep(new T.MeshStandardMaterial({color:0x69778c,metalness:.65,roughness:.4})),blue=keep(new T.MeshStandardMaterial({color:0x1e3261,metalness:.4,roughness:.5})),dark=keep(new T.MeshStandardMaterial({color:0x222434,roughness:.7})),glow=keep(new T.MeshStandardMaterial({color:0x70e8a7,emissive:0x36cf80,emissiveIntensity:1.5,roughness:.25}));
 function mesh(parent,geo,mat,pos=[0,0,0]){const m=new T.Mesh(keep(geo),mat);m.position.set(...pos);parent.add(m);return m;}
 function props(model,type){
  model.updateMatrixWorld(true);
  function anchor(suffix){let bone;model.traverse(o=>{if(o.isBone&&o.name.replace(':','')==='mixamorig'+suffix)bone=o;});if(!bone)throw Error('Eksik el kemiği: '+suffix);const g=new T.Group();g.position.y=.08;g.quaternion.copy(bone.getWorldQuaternion(new T.Quaternion()).invert());bone.add(g);return g;}
  const right=anchor('RightHand');right.scale.setScalar(type==='tank'?.8:.75);
  mesh(right,new T.CylinderGeometry(.026,.032,type==='tank'?1:1.85,8),dark,[0,type==='tank'?.15:.5,0]);
  if(type==='tank'){
   mesh(right,new T.BoxGeometry(.64,.29,.31),steel,[0,.62,0]);mesh(right,new T.BoxGeometry(.12,.32,.34),gold,[0,.62,0]);
   for(const x of [-.3,.3]){mesh(right,new T.BoxGeometry(.12,.34,.35),gold,[x,.62,0]);mesh(right,new T.ConeGeometry(.15,.18,4),steel,[x,.88,0]);}
   mesh(right,new T.SphereGeometry(.06,8,5),gold,[0,-.34,0]);
   const left=anchor('LeftHand');const outline=new T.Shape();outline.moveTo(-.33,.38);outline.lineTo(.33,.38);outline.lineTo(.34,-.13);outline.lineTo(0,-.48);outline.lineTo(-.34,-.13);outline.closePath();
   mesh(left,new T.ExtrudeGeometry(outline,{depth:.06,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.025,bevelThickness:.02}),gold,[0,0,.12]);const inset=mesh(left,new T.ExtrudeGeometry(outline,{depth:.025,bevelEnabled:false}),blue,[0,0,.21]);inset.scale.set(.83,.83,1);
   mesh(left,new T.OctahedronGeometry(.13),gold,[0,.03,.26]);
  }else{
   mesh(right,new T.CylinderGeometry(.065,.04,.16,8),gold,[0,1.37,0]);mesh(right,new T.OctahedronGeometry(.18,1),glow,[0,1.64,0]);
   for(const x of [-.15,.15]){const p=mesh(right,new T.ConeGeometry(.06,.51,6),gold,[x,1.58,0]);p.rotation.z=x>0?-.32:.32;}
   for(const y of [-.25,.1,.65,1.12])mesh(right,new T.TorusGeometry(.045,.015,4,8),gold,[0,y,0]).rotation.x=Math.PI/2;
  }
 }
 return {create(role){
  const type=role==='tank'?'tank':'mage',source=sources[type],root=new T.Group(),body=new T.Group(),model=clone(source.scene);root.add(body);body.add(model);
  const box=new T.Box3().setFromObject(model),height=box.max.y-box.min.y,scale=1.85/height;model.scale.multiplyScalar(scale);model.position.set(-(box.max.x+box.min.x)*scale/2,.18-box.min.y*scale,-(box.max.z+box.min.z)*scale/2);
  model.traverse(o=>{if(o.isSkinnedMesh)o.frustumCulled=false;});const motion=new CharacterMotion(model,source.animations,type);motion.sample(0);props(model,type);const value={root,body,model,motion,type};instances.push(value);return value;
 },dispose(){for(const m of instances){m.motion.dispose();m.model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});}for(const r of resources)r.dispose();},sources,resources};
}
