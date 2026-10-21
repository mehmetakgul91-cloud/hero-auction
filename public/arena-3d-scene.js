import * as T from 'three';
import {createHeroModel,createBoard,homePosition} from './arena-3d-models.js';
import {primaryAction,snapshotChanges} from './arena-3d-timeline.js';
import {SoftwareArenaRenderer} from './arena-3d-software.js';
import {heroCombatPresentation,stationaryArenaAction} from './hero-combat-presentation.js';

const ease=t=>t*t*(3-2*t),clamp=T.MathUtils.clamp;
export class Arena3dScene{
 constructor(canvas,labelLayer,floatLayer,onSelect){
  this.canvas=canvas;this.labelLayer=labelLayer;this.floatLayer=floatLayer;this.onSelect=onSelect;
  this.models=new Map();this.effects=[];this.time=0;this.angle=0;this.economy=false;this.active=null;this.winner=null;
  this.reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer=context?new T.WebGLRenderer({canvas,context,antialias:true,alpha:false}):new SoftwareArenaRenderer(canvas);
  if(this.renderer.isSoftwareRenderer)this.economy=true;
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  this.renderer.setClearColor(0x0a1420);this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
  this.scene=new T.Scene();this.scene.fog=new T.Fog(0x0a1420,30,70);
  this.camera=new T.OrthographicCamera(-6,6,6,-6,.1,100);
  this.scene.add(new T.HemisphereLight(0xc1dcf5,0x263748,2));
  this.sun=new T.DirectionalLight(0xffe1b3,3.1);this.sun.position.set(-5,12,8);this.sun.castShadow=true;
  Object.assign(this.sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.5,far:35});
  this.sun.shadow.mapSize.set(1024,1024);this.sun.shadow.bias=-.002;this.sun.shadow.normalBias=.03;this.scene.add(this.sun);
  const fill=new T.DirectionalLight(0x77a9f1,1.4);fill.position.set(6,5,-7);this.scene.add(fill);
  createBoard(this.scene);
  this.raycaster=new T.Raycaster();this.pointer=new T.Vector2();
  this.click=event=>{
   const rect=canvas.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
   this.raycaster.setFromCamera(this.pointer,this.camera);
   const hit=this.raycaster.intersectObjects([...this.models.values()].map(m=>m.root),true).find(h=>h.object.userData.heroKey);
   if(hit)this.onSelect(hit.object.userData.heroKey);
  };
  canvas.addEventListener('pointerup',this.click);
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas.parentElement);
  this.resize();
 }
 resize(){
  const {width,height}=this.canvas.parentElement.getBoundingClientRect();if(!width||!height)return;
  this.width=width;this.height=height;this.renderer.setSize(width,height,false);
  this.mobile=width<680;this.renderer.shadowMap.enabled=!this.mobile&&!this.economy;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.camera.position.set(this.angle?0:6,14,18);this.camera.lookAt(0,.55,0);this.camera.updateMatrixWorld();
  let mx=0,my=0;for(const x of [-4.6,4.6])for(const z of [-5,5])for(const y of [0,2.2]){
   const p=new T.Vector3(x,y,z).applyMatrix4(this.camera.matrixWorldInverse);mx=Math.max(mx,Math.abs(p.x));my=Math.max(my,Math.abs(p.y));
  }
  const aspect=width/height,half=Math.max(my*(this.mobile?1.15:1.03),mx/aspect*1.03);
  this.camera.left=-half*aspect;this.camera.right=half*aspect;this.camera.top=half*(this.mobile?.9:1);this.camera.bottom=-half*(this.mobile?1.1:1);this.camera.updateProjectionMatrix();
 }
 setEconomy(value){this.economy=value;this.renderer.setPixelRatio(value?1:Math.min(window.devicePixelRatio||1,1.5));this.resize();}
 changeCamera(){this.angle=1-this.angle;this.resize();}
 setTeams(teams){
  if(!this.models.size)teams.forEach((team,side)=>team.forEach((hero,index)=>{
   const model=createHeroModel(hero,side);model.base.copy(homePosition(side,index));model.root.position.copy(model.base);model.root.rotation.y=model.baseRotation;
   this.scene.add(model.root);this.models.set(model.key,model);
   const label=document.createElement('div');label.className='hero-label'+(side?' red':'');
   const name=document.createElement('span');name.textContent=hero.name.split(' ')[0];const track=document.createElement('div');track.className='health-track';const fill=document.createElement('i');fill.className='health-fill';track.append(fill);label.append(name,track);this.labelLayer.append(label);model.label=label;model.fill=fill;
  }));
  this.teams=teams;this.models.forEach(model=>{
   model.hero=teams[model.side].find(h=>h.id===model.hero.id);model.dead=model.hero.hp<=0;model.label.classList.toggle('dead',model.dead);
   model.fill.style.transform=`scaleX(${Math.max(0,model.hero.hp/model.hero.maxHp)})`;
   model.bubble.visible=model.hero.shield>0&&!model.dead;
  });
 }
 reset(teams){
  this.active=null;this.effects.forEach(e=>this.removeEffect(e));this.effects=[];this.floatLayer.replaceChildren();
  this.models.forEach(m=>{m.deathAt=null;m.body.visible=true;m.body.rotation.set(0,0,0);m.body.scale.setScalar(1);m.root.position.copy(m.base);m.root.rotation.y=m.baseRotation;});
  this.setTeams(teams);
 }
 select(key){this.selected=key;this.models.forEach(m=>{m.selectRing.visible=m.key===key;m.label.classList.toggle('selected',m.key===key);});}
 startFrame(frame){
  const action=primaryAction(frame);this.active={frame,action,prior:this.teams};
  if(!action)return;
  const actor=this.models.get(action.side+':'+action.actor);
  const heal=action.action==='heal'||action.action==='passive-heal';
  const targetSide=heal||action.action==='shield'?action.side:1-action.side;
  const target=this.models.get(targetSide+':'+(action.target||action.actor));
  this.active.actor=actor;this.active.target=target;this.active.heal=heal;
  this.active.stationary=actor?stationaryArenaAction(actor.hero,action):true;
  if(actor&&target&&this.active.stationary){
   const kind=heroCombatPresentation(actor.hero).projectile;
   const projectile=new T.Mesh(kind==='arrow'&&!heal?new T.ConeGeometry(.055,.6,6):new T.IcosahedronGeometry(.13,1),new T.MeshBasicMaterial({color:heal?0x8affc0:kind==='arrow'?0xc1f797:kind==='light'?0xf4d58b:0xc4a0ff}));
   projectile.userData.arrow=kind==='arrow'&&!heal;
   projectile.visible=false;this.scene.add(projectile);this.active.projectile=projectile;
  }
 }
 finishFrame(){
  const p=this.active?.projectile;if(p){this.scene.remove(p);p.geometry.dispose();p.material.dispose();}
  this.active=null;
 }
 impact(frame){
  const changes=snapshotChanges(this.teams,frame.teams);
  for(const change of changes){
   const m=this.models.get(change.side+':'+change.id);if(!m)continue;
   const color=change.hp<0?0xffce83:change.hp>0?0x82f2b5:0x85dff9;
   if(change.hp)this.float(m,(change.hp>0?'+':'−')+Math.abs(change.hp),change.hp>0?'ŞİFA':'',color);
   else if(change.shield>0)this.float(m,'+'+change.shield,'KALKAN',color);
   this.pulse(m.root.position,color,change.hp>0||change.shield>0);
   if(change.hp<0){m.hitAt=this.time;this.sparks(m.root.position,color,6);}
   if(change.died){m.deathAt=this.time;this.soul(m);}
  }
  const commander=frame.events.some(e=>String(e.actor).startsWith('commander:'));
  if(commander)changes.forEach(c=>{const m=this.models.get(c.side+':'+c.id);if(m)this.beam(m.root.position,c.hp>0?0x80eeb7:0x87d3ff);});
  this.setTeams(frame.teams);
 }
 float(model,text,caption,color){
  const el=document.createElement('div');el.className='floating-value';el.style.color='#'+new T.Color(color).getHexString();el.textContent=text;
  if(caption){const small=document.createElement('small');small.textContent=caption;el.append(small);}
  this.floatLayer.append(el);const start=model.root.position.clone();start.y+=1.9;
  this.effects.push({age:0,life:1.2,el,update:t=>{const p=start.clone();p.y+=t*1.1;const s=this.project(p);el.style.left=s.x+'px';el.style.top=s.y+'px';el.style.opacity=String(1-Math.max(0,(t-.6)/.4));}});
 }
 pulse(position,color,upward=false){
  const mesh=new T.Mesh(new T.RingGeometry(.18,.23,32),new T.MeshBasicMaterial({color,transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.copy(position);mesh.position.y=.18;this.scene.add(mesh);
  this.effects.push({age:0,life:upward?1.1:.65,mesh,update:t=>{mesh.scale.setScalar(1+t*4);mesh.material.opacity=(1-t)*.8;if(upward)mesh.position.y=.18+t*.75;}});
 }
 sparks(position,color,count){
  for(let i=0;i<count;i++){
   const mesh=new T.Mesh(new T.IcosahedronGeometry(.045,0),new T.MeshBasicMaterial({color,transparent:true,opacity:1}));const angle=i/count*Math.PI*2;
   mesh.position.copy(position);this.scene.add(mesh);
   this.effects.push({age:0,life:.65,mesh,update:t=>{mesh.position.set(position.x+Math.cos(angle)*t*.7,position.y+1+t*.6-t*t,position.z+Math.sin(angle)*t*.7);mesh.material.opacity=1-t;mesh.rotation.y=t*8;}});
  }
 }
 soul(model){
  const mesh=new T.Mesh(new T.OctahedronGeometry(.16),new T.MeshBasicMaterial({color:0xc5e6f4,transparent:true,opacity:.8,depthWrite:false}));
  const pos=model.root.position.clone();this.scene.add(mesh);
  this.effects.push({age:0,life:1.8,mesh,update:t=>{mesh.position.set(pos.x,pos.y+.9+t*2,pos.z);mesh.scale.set(.8*(1-t),1.5,.8*(1-t));mesh.rotation.y=t*5;mesh.material.opacity=(1-t)*.8;}});
 }
 beam(position,color){
  const mesh=new T.Mesh(new T.CylinderGeometry(.12,.4,4,12,1,true),new T.MeshBasicMaterial({color,transparent:true,opacity:.25,side:T.DoubleSide,depthWrite:false}));
  mesh.position.copy(position);mesh.position.y=2;this.scene.add(mesh);
  this.effects.push({age:0,life:1.2,mesh,update:t=>{mesh.material.opacity=Math.sin(t*Math.PI)*.25;mesh.scale.x=mesh.scale.z=1-t*.6;}});
 }
 project(point){const p=point.clone().project(this.camera);return {x:(p.x*.5+.5)*this.width,y:(-.5*p.y+.5)*this.height};}
 removeEffect(e){if(e.el)e.el.remove();if(e.mesh){this.scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();}}
 render(dt,progress=0,advance=true){
  if(advance)this.time+=dt;
  const {active}=this,p=clamp(progress,0,1);
  this.models.forEach((m,i)=>{
   const phase=this.time*1.8+m.base.x,motion=this.reduced?0:Math.sin(phase);
   m.root.position.copy(m.base);m.root.rotation.y=m.baseRotation;m.body.position.set(0,motion*.025,0);m.body.rotation.set(0,0,0);m.body.scale.setScalar(1);
   m.arms.forEach((arm,index)=>{arm.rotation.set(Math.sin(phase+index)*.035,0,index?-.07:.07);});m.legs.forEach(leg=>leg.rotation.x=0);m.head.rotation.y=Math.sin(phase*.4)*.07;m.cape.rotation.x=-.1+motion*.025;
   if(m.aura){m.aura.rotation.y=this.time;m.aura.scale.setScalar(1+motion*.1);}
   if(m.bubble.visible){m.bubble.rotation.y=this.time*.25;m.bubble.material.opacity=.11+Math.sin(this.time*2)*.025;}
   if(m.selectRing.visible)m.selectRing.scale.setScalar(1+Math.sin(this.time*2)*.035);
   if(m.dead){
    const death=clamp((this.time-(m.deathAt??-10))/.8,0,1);m.body.rotation.z=death*1.5;m.body.position.y=-death*.25;m.body.scale.setScalar(1-death*.35);m.body.visible=death<1;return;
   }
   m.body.visible=true;
   if(active?.actor===m&&active.target){
    const target=active.target.base,dx=target.x-m.base.x,dz=target.z-m.base.z;
    m.root.rotation.y=Math.atan2(dx,dz);
    const ranged=active.stationary;
    if(ranged){
     m.arms[1].rotation.x=-Math.sin(p*Math.PI)*1.3;m.arms[0].rotation.x=-Math.sin(p*Math.PI)*.65;
     if(active.projectile){const travel=clamp((p-.17)/.33,0,1);active.projectile.visible=p>=.17&&p<.5;active.projectile.position.lerpVectors(m.base,active.target.base,travel);active.projectile.position.y=1.4+Math.sin(travel*Math.PI)*.6;if(active.projectile.userData.arrow)active.projectile.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(dx,0,dz).normalize());else active.projectile.rotation.y=this.time*4;}
    }else{
     const move=this.reduced?0:p<.34?ease(p/.34):p<.58?1:1-ease((p-.58)/.42);
     const length=Math.hypot(dx,dz),distance=Math.max(0,length-1.1),ratio=length?distance/length:0;
     m.root.position.x+=dx*ratio*move;m.root.position.z+=dz*ratio*move;
     if(m.hero.role==='assassin'){m.root.position.x+=Math.sin(move*Math.PI)*.45;m.body.position.y+=Math.sin(move*Math.PI)*.16;}
     if(!this.reduced&&(p<.34||p>.58)){m.legs[0].rotation.x=Math.sin(p*35)*.4;m.legs[1].rotation.x=-m.legs[0].rotation.x;}
     const swing=Math.sin(clamp((p-.22)/.38,0,1)*Math.PI);m.arms[1].rotation.x=-swing*2.1;m.body.rotation.y=-swing*.3;
     if(m.hero.role==='assassin')m.arms[0].rotation.x=-swing*1.8;
     if(m.shield)m.arms[0].rotation.x=-swing*.35;
    }
   }
   if(!active&&this.winner===m.side){m.arms[1].rotation.x=-1.7;m.arms[1].rotation.z=-.35;m.body.position.y+=Math.abs(motion)*.04;}
   const hit=this.time-(m.hitAt??-10);if(!this.reduced&&hit>=0&&hit<.3){m.body.position.z-=Math.sin(hit/.3*Math.PI)*.13;m.body.rotation.x=-Math.sin(hit/.3*Math.PI)*.18;}
  });
  for(const e of [...this.effects]){if(advance)e.age+=dt;const t=clamp(e.age/e.life,0,1);e.update(t);if(t>=1){this.removeEffect(e);this.effects.splice(this.effects.indexOf(e),1);}}
  this.models.forEach(m=>{const pos=m.root.position.clone();pos.y+=2.1;const p=this.project(pos);m.label.style.transform=`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;});
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.observer.disconnect();this.canvas.removeEventListener('pointerup',this.click);this.renderer.setAnimationLoop(null);this.finishFrame();this.effects.forEach(e=>this.removeEffect(e));this.renderer.dispose();}
}
