import * as T from 'three';
import {ARENA_WIDTH_SCALE} from './arena-layout.js';
import {ArenaCameraControls,cameraOffset,layoutLabels} from './camera-controls.js';
import {PreviewSoftwareRenderer} from './software.js';
import {loadCharacterKit,inspectCharacterTextures} from './characters.js';
import {home,primaryAction,snapshotChanges} from './replay.js';
import {formationSlots,planAction,sampleAction,pathPosition} from './director.js';
import {bufferSize} from './metrics.js';
import {createCitadel,updateCitadelView} from './environment.js';
import {softContactTexture} from './environment-materials.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

export class MobileArena {
 constructor(canvas,labels,floats,{onSelect=()=>{},reduced=false}={}){
  this.canvas=canvas;this.labels=labels;this.floats=floats;this.reduced=reduced;this.quality='mobile';this.angle=0;this.time=0;this.models=new Map();this.resources=new Set();this.projected=new T.Vector3();
  const context=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'low-power'});
  this.renderer=context?new T.WebGLRenderer({canvas,context,alpha:false,antialias:false}):new PreviewSoftwareRenderer(canvas);this.renderer.setPixelRatio(1);this.renderer.setClearColor(0x0c1420);this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.9;this.renderer.outputColorSpace=T.SRGBColorSpace;
  this.scene=new T.Scene();this.scene.fog=new T.Fog(0x0c1420,22,65);this.camera=new T.OrthographicCamera(-7,7,7,-7,.1,90);
  this.scene.add(new T.HemisphereLight(0xb9d8f0,0x11192b,1.05));const sun=new T.DirectionalLight(0xffd5a0,1.8);sun.position.set(-5,12,7);this.scene.add(sun);this.sun=sun;const fill=new T.DirectionalLight(0x548fde,.65);fill.position.set(5,3,-6);this.scene.add(fill);
  if(!this.renderer.isSoftwareRenderer){const generator=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();const environment=this.keep(generator.fromScene(room,.04,.1,100,{size:128}));this.scene.environment=environment.texture;this.scene.environmentIntensity=.6;room.dispose();generator.dispose();}
  const before=this.scene.children.length;createCitadel(this);this.environmentObjects=this.scene.children.slice(before);this.plinth=this.mesh(new T.CylinderGeometry(.72,.8,.18,40),this.mat(0x273546),0,.06,0);this.plinth.visible=false;this.contactTexture=this.keep(softContactTexture());this.buildEffects();this.raycaster=new T.Raycaster();this.pointer=new T.Vector2();
  this.click=e=>{const rect=canvas.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects([...this.models.values()].filter(m=>m.root.visible&&m.body.visible&&!m.dead).map(m=>m.body),true)[0];if(hit)onSelect(hit.object.userData.key);};this.controls=new ArenaCameraControls(canvas,{select:this.click,change:()=>{this.resize();this.render(0,this.lastProgress||0);}});
  this.observer=new ResizeObserver(()=>{this.resize();this.render(0,this.lastProgress||0);});this.observer.observe(canvas);this.resize();
 }
 async load(){this.kit=await loadCharacterKit();this.modelDiagnostics=inspectCharacterTextures(this.kit.sources);if(this.modelDiagnostics.some(m=>!m.meshes||m.textured!==m.meshes))throw Error('3D model dokuları çözülemedi. Boş model gösterilmiyor; yeniden yüklemeyi dene.');}
 keep(obj){this.resources.add(obj);return obj;}
 mat(color,extra={}){return this.keep(new T.MeshStandardMaterial({color,roughness:.8,metalness:.25,...extra}));}
 mesh(geo,mat,x=0,y=0,z=0){const mesh=new T.Mesh(this.keep(geo),mat);mesh.position.set(x,y,z);this.scene.add(mesh);return mesh;}

 buildEffects(){
  this.projectile=this.mesh(new T.IcosahedronGeometry(.13,1),this.keep(new T.MeshBasicMaterial({color:0xc7acff})));this.projectile.visible=false;
  this.pulses=Array.from({length:12},()=>{const mesh=this.mesh(new T.RingGeometry(.2,.26,18),this.keep(new T.MeshBasicMaterial({color:0xffd384,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide})));mesh.rotation.x=-Math.PI/2;mesh.visible=false;return {mesh,age:99,life:.65};});
  this.floatPool=Array.from({length:16},()=>{const el=document.createElement('span');el.className='damage';el.hidden=true;this.floats.append(el);return {el,age:99,life:1.1,position:new T.Vector3()};});
 }
 setTeams(teams){this.teams=teams;const slots=formationSlots(teams);teams.forEach((team,side)=>team.forEach((hero,index)=>{
  const key=side+':'+hero.id;let m=this.models.get(key);
  if(!m){m=this.kit.create(hero.role);m.side=side;m.key=key;const slot=slots.get(key)||home(side,index);m.base=new T.Vector3(slot.x,slot.y,slot.z);m.root.position.copy(m.base);m.root.rotation.y=side?0:Math.PI;m.rotation=m.root.rotation.y;
   m.root.traverse(obj=>obj.userData.key=key);this.scene.add(m.root);this.models.set(key,m);
   const disk=new T.Mesh(this.keep(this.renderer.isSoftwareRenderer?new T.CircleGeometry(.46,24):new T.PlaneGeometry(1.35,1.35)),this.keep(new T.MeshBasicMaterial({map:this.renderer.isSoftwareRenderer?null:this.contactTexture,color:0x05090d,transparent:true,opacity:.55,depthWrite:false})));disk.rotation.x=-Math.PI/2;disk.position.y=.15;m.root.add(disk);
   const ring=new T.Mesh(this.keep(new T.RingGeometry(.48,.51,24)),this.keep(new T.MeshBasicMaterial({color:side?0xe88866:0x59b9f2,transparent:true,opacity:.8,depthWrite:false})));ring.rotation.x=-Math.PI/2;ring.position.y=.155;m.root.add(ring);
   const el=document.createElement('button');el.className='unit-label '+(side?'red':'blue');el.type='button';el.setAttribute('aria-label',hero.name+' · '+(hero.lane==='front'?'Ön saf':'Arka saf'));const name=document.createElement('span');name.textContent=hero.name;const track=document.createElement('i'),bar=document.createElement('b');track.append(bar);el.append(name,track);el.onclick=()=>this.onLabelSelect?.(key);const leader=document.createElement('div');leader.className='label-leader '+(side?'red':'blue');leader.setAttribute('aria-hidden','true');this.labels.append(leader,el);m.leader=leader;m.label=el;m.bar=bar;
  }
  m.hero=hero;m.dead=hero.hp<=0;m.label.setAttribute('aria-label',hero.name+' · Can '+hero.hp+' / '+hero.maxHp);m.bar.style.transform='scaleX('+Math.max(0,hero.hp/hero.maxHp)+')';m.label.classList.toggle('dead',m.dead);
 }));}
 reset(teams){this.active=null;this.projectile.visible=false;this.pulses.forEach(e=>{e.age=99;e.mesh.visible=false;});this.floatPool.forEach(e=>{e.age=99;e.el.hidden=true;});this.models.forEach(m=>{m.deathAt=null;m.hitAt=null;m.body.visible=true;});this.setTeams(teams);this.render(0,0);}
 start(frame,plan=planAction(frame,this.teams)){
  const event=primaryAction(frame),actor=this.models.get(plan.actorKey),target=this.models.get(plan.targetKey);
  this.active={event,plan,actor,target,stationary:plan.stationary};
 }

 end(){this.active=null;this.projectile.visible=false;}
 impact(frame){for(const c of snapshotChanges(this.teams,frame.teams)){
  const m=this.models.get(c.side+':'+c.id);if(!m)continue;const color=c.hp<0?0xffda9e:c.hp>0?0x92f5bf:0x8bdbff;
  const floating=this.floatPool.find(e=>e.age>=e.life);if(floating){floating.age=0;floating.position.copy(m.root.position);floating.position.y+=1.9;floating.el.textContent=c.hp?(c.hp<0?'−':'+')+Math.abs(c.hp):(c.shield<0?'−':'+')+Math.abs(c.shield)+' ◇';floating.el.style.color='#'+new T.Color(color).getHexString();floating.el.hidden=false;}
  const pulse=this.pulses.find(e=>e.age>=e.life);if(pulse){pulse.age=0;pulse.mesh.position.copy(m.root.position);pulse.mesh.position.y=.19;pulse.mesh.material.color.setHex(color);pulse.mesh.visible=true;}
  if(c.hp<0)m.hitAt=this.time;if(c.died)m.deathAt=this.time;
 }this.setTeams(frame.teams);}
 focus(key){if(key&&!this.focusKey){this.focusSavedView={angle:this.angle,yaw:this.controls.yaw,pitch:this.controls.pitch,zoom:this.controls.zoom};this.angle=0;this.controls.clear();this.controls.yaw=0;this.controls.pitch=0;this.controls.zoom=1;}else if(!key&&this.focusKey&&this.focusSavedView){this.angle=this.focusSavedView.angle;Object.assign(this.controls,{yaw:this.focusSavedView.yaw,pitch:this.focusSavedView.pitch,zoom:this.focusSavedView.zoom});this.focusSavedView=null;}this.focusKey=key;this.environmentObjects.forEach(o=>o.visible=!key);this.plinth.visible=!!key;if(key){this.plinth.position.copy(this.models.get(key).base);this.plinth.position.y=.06;}this.resize();this.render(0,this.lastProgress||0);}
 select(key){this.selectedKey=key;if(this.focusKey)this.focus(key);this.models.forEach(m=>m.label.classList.toggle('selected',m.key===key));this.render(0,this.lastProgress||0);}
 resize(){const {width,height}=this.canvas.getBoundingClientRect();if(!width||!height)return;this.width=width;this.height=height;
  const size=bufferSize(width,height,window.devicePixelRatio||1,this.quality);this.renderer.setSize(size.width,size.height,false);this.buffer=size;
  if(this.focusKey){const m=this.models.get(this.focusKey),center=m.base.clone().add(new T.Vector3(0,1.15,0)),a=m.rotation+(this.angle===2?Math.PI:this.angle===1?-1.2:.55);const o=cameraOffset({x:Math.sin(a)*5,y:1.4,z:Math.cos(a)*5},this.controls);this.camera.position.copy(center).add(new T.Vector3(o.x,o.y,o.z));this.camera.lookAt(center);this.camera.updateMatrixWorld();const half=1.65*this.controls.zoom,aspect=width/height;this.camera.left=-half*aspect;this.camera.right=half*aspect;this.camera.top=half;this.camera.bottom=-half;this.camera.updateProjectionMatrix();return;}
  const o=cameraOffset({x:this.angle===1?0:this.angle===2?10:8,y:this.angle===1?19:13,z:this.angle===2?8:15},this.controls);this.camera.position.set(o.x,o.y,o.z);this.camera.lookAt(0,.35,0);this.camera.updateMatrixWorld();
  let mx=0,my=0;for(const x of [-11.5*ARENA_WIDTH_SCALE,11.5*ARENA_WIDTH_SCALE])for(const z of [-11.5,8.5])for(const y of [-1.9,7.5]){const p=new T.Vector3(x,y,z).applyMatrix4(this.camera.matrixWorldInverse);mx=Math.max(mx,Math.abs(p.x));my=Math.max(my,Math.abs(p.y));}
  const aspect=width/height,half=Math.max(my,mx/aspect)*1.035*this.controls.zoom;this.camera.left=-half*aspect;this.camera.right=half*aspect;this.camera.top=half;this.camera.bottom=-half;this.camera.updateProjectionMatrix();
 }
 cameraNext(){this.angle=(this.angle+1)%3;this.controls.reset();}
 resetCamera(){this.angle=0;this.controls.reset();}
 setQuality(value){this.quality=value;this.resize();this.render(0,this.lastProgress||0);}
 project(position){this.projected.copy(position).project(this.camera);return {x:(this.projected.x*.5+.5)*this.width,y:(-.5*this.projected.y+.5)*this.height};}
 render(dt,p=0){
  // The near monument fades at low viewing angles instead of hiding combat.
  updateCitadelView(this);
  this.time+=dt;this.lastProgress=p;const active=this.active,labelItems=[];this.projectile.visible=false;
  for(const m of this.models.values()){
   m.root.position.copy(m.base);m.root.rotation.y=m.rotation;m.body.position.set(0,0,0);m.body.rotation.set(0,0,0);let motionPose=null;
   m.root.visible=!this.focusKey||this.focusKey===m.key;m.label.hidden=!!this.focusKey;
   m.body.visible=true;
   if(m.dead&&!this.focusKey){const death=Math.min(1,(this.time-(m.deathAt??-10))/.7);m.body.rotation.z=death*1.5;m.body.position.y=-death*.2;m.body.visible=death<1;}
   else {
    if(!this.reduced)m.body.position.y=Math.sin(this.time*2+m.base.x)*.018;
    if(active?.actor===m&&active.target&&['melee','cast','support'].includes(active.plan.kind)){
     const target=active.target.base,dx=target.x-m.base.x,dz=target.z-m.base.z;
     const pose=sampleAction(active.plan,p,{reduced:this.reduced}),position=pathPosition(m.base,target,pose.travel,m.side);
     m.root.rotation.y=Math.atan2(dx,dz);m.root.position.set(position.x,position.y,position.z);
     motionPose=pose;
     if(pose.projectile){this.projectile.visible=true;this.projectile.position.lerpVectors(m.base,target,pose.projectileProgress);this.projectile.position.y=1.35+Math.sin(pose.projectileProgress*Math.PI)*.35;this.projectile.rotation.y=this.time*8;}
    }

    const hit=this.time-(m.hitAt??-10);if(hit<.3&&!this.reduced)m.body.rotation.x=-Math.sin(hit/.3*Math.PI)*.15;
   }
   m.motion.sample(this.time,{progress:p,pose:motionPose,hitAge:this.time-(m.hitAt??-10),reduced:this.reduced});
   const raw=this.project(m.root.position.clone().add(new T.Vector3(0,2.15,0)));
   m.labelAnchor=raw;m.label.hidden=!!this.focusKey||raw.x<0||raw.x>this.width||raw.y<0||raw.y>this.height;m.leader.hidden=m.label.hidden;
   if(!m.label.hidden)labelItems.push({key:m.key,x:raw.x,y:raw.y,priority:m.key===this.selectedKey?4:active?.target===m?3:active?.actor===m?2:m.dead?0:1});
  }
  for(const [key,pos] of layoutLabels(labelItems,this.width,this.height)){const m=this.models.get(key);m.label.classList.toggle('compact',pos.compact);m.label.style.width=pos.w+'px';m.label.style.height=pos.h+'px';m.label.style.transform=`translate(${pos.x}px,${pos.y}px)`;m.label.title=m.hero.name+' · '+m.hero.hp+'/'+m.hero.maxHp;const a=m.labelAnchor,x=Math.max(pos.x,Math.min(pos.x+pos.w,a.x)),y=Math.max(pos.y,Math.min(pos.y+pos.h,a.y)),dx=x-a.x,dy=y-a.y;m.leader.style.width=Math.hypot(dx,dy)+'px';m.leader.style.transform=`translate(${a.x}px,${a.y}px) rotate(${Math.atan2(dy,dx)}rad)`;}
  for(const e of this.pulses){if(e.age>=e.life){e.mesh.visible=false;continue;}e.age+=dt;const t=e.age/e.life;e.mesh.scale.setScalar(1+t*3);e.mesh.material.opacity=Math.max(0,1-t)*.75;}
  for(const e of this.floatPool){if(e.age>=e.life){e.el.hidden=true;continue;}e.age+=dt;const t=e.age/e.life,pos=this.project(e.position.clone().add(new T.Vector3(0,this.reduced?0:t*.8,0)));e.el.style.transform=`translate(${pos.x}px,${pos.y}px) translate(-50%,-100%)`;e.el.style.opacity=String(Math.max(0,1-t));}
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.observer.disconnect();this.controls.dispose();this.kit?.dispose();this.resources.forEach(r=>r.dispose());this.renderer.dispose();this.labels.replaceChildren();this.floats.replaceChildren();this.models.clear();}
}
