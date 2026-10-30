import * as T from 'three';
import {PreviewSoftwareRenderer} from './software.js';
import {createModelKit} from './models.js';
import {home,attackPose,primaryAction,snapshotChanges} from './replay.js';
import {bufferSize} from './metrics.js';
import {heroCombatPresentation} from './shared/hero-combat-presentation.js';

export class MobileArena {
 constructor(canvas,labels,floats,{onSelect=()=>{},reduced=false}={}){
  this.canvas=canvas;this.labels=labels;this.floats=floats;this.reduced=reduced;this.quality='mobile';this.angle=0;this.time=0;this.models=new Map();this.resources=new Set();this.projected=new T.Vector3();
  const context=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'low-power'});
  this.renderer=context?new T.WebGLRenderer({canvas,context,alpha:false,antialias:false}):new PreviewSoftwareRenderer(canvas);this.renderer.setPixelRatio(1);this.renderer.setClearColor(0x0c1420);this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
  this.scene=new T.Scene();this.scene.fog=new T.Fog(0x0c1420,22,65);this.camera=new T.OrthographicCamera(-7,7,7,-7,.1,90);
  this.scene.add(new T.HemisphereLight(0xc5e5ff,0x222138,2.7));const sun=new T.DirectionalLight(0xffe0b0,3.5);sun.position.set(-5,12,7);this.scene.add(sun);const fill=new T.DirectionalLight(0x7c8aff,1.8);fill.position.set(5,3,-6);this.scene.add(fill);
  this.kit=createModelKit();this.buildBoard();this.buildEffects();this.raycaster=new T.Raycaster();this.pointer=new T.Vector2();
  this.click=e=>{const rect=canvas.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects([...this.models.values()].map(m=>m.body),true)[0];if(hit)onSelect(hit.object.userData.key);};canvas.addEventListener('pointerup',this.click);
  this.observer=new ResizeObserver(()=>{this.resize();this.render(0,this.lastProgress||0);});this.observer.observe(canvas);this.resize();
 }
 keep(obj){this.resources.add(obj);return obj;}
 mat(color,extra={}){return this.keep(new T.MeshStandardMaterial({color,roughness:.8,metalness:.25,...extra}));}
 mesh(geo,mat,x=0,y=0,z=0){const mesh=new T.Mesh(this.keep(geo),mat);mesh.position.set(x,y,z);this.scene.add(mesh);return mesh;}
 buildBoard(){
  const stone=this.mat(0x243748),edge=this.mat(0x516173),gold=this.mat(0xb09961),ground=this.mat(0x101e2d);
  const platform=this.mesh(new T.CylinderGeometry(5.65,5.35,.5,8),edge,0,-.28);platform.rotation.y=Math.PI/8;platform.userData.softwareLayer=-4;
  const underside=this.mesh(new T.CylinderGeometry(5.42,5.65,.3,8),stone,0,-.65);underside.rotation.y=Math.PI/8;underside.userData.softwareLayer=-5;
  this.mesh(new T.BoxGeometry(7.4,.13,9),ground,0,.025).userData.softwareLayer=-3;
  const tileGeo=this.keep(new T.BoxGeometry(1.68,.045,1.44)),tileMat=this.mat(0x26394b);const tiles=new T.InstancedMesh(tileGeo,tileMat,24),matrix=new T.Matrix4();
  for(let r=0;r<6;r++)for(let c=0;c<4;c++){matrix.makeTranslation((c-1.5)*1.77,.105,(r-2.5)*1.48);tiles.setMatrixAt(r*4+c,matrix);tiles.setColorAt(r*4+c,new T.Color((r+c)%2?0x334a5c:0x243748));}if(this.renderer.isSoftwareRenderer){for(let i=0;i<24;i++){tiles.getMatrixAt(i,matrix);const mat=tileMat.clone();tiles.getColorAt(i,mat.color);this.keep(mat);const tile=new T.Mesh(tileGeo,mat);tile.applyMatrix4(matrix);tile.userData.softwareLayer=-2;this.scene.add(tile);}}else this.scene.add(tiles);
  const ringGeo=this.keep(new T.RingGeometry(.52,.55,24));
  for(const side of [0,1]){const color=side?0xe68b83:0x72d5e8,mat=this.keep(new T.MeshBasicMaterial({color,side:T.DoubleSide}));
   for(let i=0;i<5;i++){const p=home(side,i),ring=new T.Mesh(ringGeo,mat);ring.rotation.x=-Math.PI/2;ring.position.set(p.x,.15,p.z);ring.userData.softwareLayer=-1;this.scene.add(ring);}
   this.mesh(new T.BoxGeometry(6.8,.02,.025),mat,0,.14,(side?-1:1)*4.38);
   for(const x of [-4.15,4.15]){this.mesh(new T.CylinderGeometry(.28,.36,.4,6),stone,x,.06,(side?-1:1)*3.6);this.mesh(new T.CylinderGeometry(.16,.23,.68,6),edge,x,.55,(side?-1:1)*3.6);this.mesh(new T.OctahedronGeometry(.24),mat,x,1.1,(side?-1:1)*3.6);}
  }
  const emblem=this.mesh(new T.RingGeometry(.48,.5,32),gold,0,.15,0);emblem.rotation.x=-Math.PI/2;
  this.mesh(new T.BoxGeometry(.025,.025,1.2),gold,0,.16);this.mesh(new T.BoxGeometry(1.2,.025,.025),gold,0,.16);
 }
 buildEffects(){
  this.projectile=this.mesh(new T.IcosahedronGeometry(.13,1),this.keep(new T.MeshBasicMaterial({color:0xc7acff})));this.projectile.visible=false;
  this.pulses=Array.from({length:12},()=>{const mesh=this.mesh(new T.RingGeometry(.2,.26,18),this.keep(new T.MeshBasicMaterial({color:0xffd384,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide})));mesh.rotation.x=-Math.PI/2;mesh.visible=false;return {mesh,age:99,life:.65};});
  this.floatPool=Array.from({length:16},()=>{const el=document.createElement('span');el.className='damage';el.hidden=true;this.floats.append(el);return {el,age:99,life:1.1,position:new T.Vector3()};});
 }
 setTeams(teams){this.teams=teams;teams.forEach((team,side)=>team.forEach((hero,index)=>{
  const key=side+':'+hero.id;let m=this.models.get(key);
  if(!m){m=this.kit.create(hero.role);m.side=side;m.key=key;m.base=new T.Vector3(home(side,index).x,home(side,index).y,home(side,index).z);m.root.position.copy(m.base);m.root.rotation.y=side?0:Math.PI;m.rotation=m.root.rotation.y;
   m.root.traverse(obj=>obj.userData.key=key);this.scene.add(m.root);this.models.set(key,m);
   const el=document.createElement('button');el.className='unit-label '+(side?'red':'blue');el.type='button';el.setAttribute('aria-label',hero.name+' · '+(hero.lane==='front'?'Ön saf':'Arka saf'));const name=document.createElement('span');name.textContent=hero.name;const track=document.createElement('i'),bar=document.createElement('b');track.append(bar);el.append(name,track);el.onclick=()=>this.onLabelSelect?.(key);this.labels.append(el);m.label=el;m.bar=bar;
  }
  m.hero=hero;m.dead=hero.hp<=0;m.bar.style.transform='scaleX('+Math.max(0,hero.hp/hero.maxHp)+')';m.label.classList.toggle('dead',m.dead);
 }));}
 reset(teams){this.active=null;this.projectile.visible=false;this.pulses.forEach(e=>{e.age=99;e.mesh.visible=false;});this.floatPool.forEach(e=>{e.age=99;e.el.hidden=true;});this.models.forEach(m=>{m.deathAt=null;m.hitAt=null;m.body.visible=true;});this.setTeams(teams);this.render(0,0);}
 start(frame){const event=primaryAction(frame);this.active={event};if(!event||event.action==='stun-skip'||String(event.actor).startsWith('commander:'))return;
  const actor=this.models.get(event.side+':'+event.actor),friendly=/heal|shield|regen/.test(event.action),target=this.models.get((friendly?event.side:1-event.side)+':'+(event.target||event.actor));
  this.active={event,actor,target,stationary:actor?heroCombatPresentation(actor.hero).stationary:true};
 }
 end(){this.active=null;this.projectile.visible=false;}
 impact(frame){for(const c of snapshotChanges(this.teams,frame.teams)){
  const m=this.models.get(c.side+':'+c.id);if(!m)continue;const color=c.hp<0?0xffda9e:c.hp>0?0x92f5bf:0x8bdbff;
  const floating=this.floatPool.find(e=>e.age>=e.life);if(floating){floating.age=0;floating.position.copy(m.root.position);floating.position.y+=1.9;floating.el.textContent=c.hp?(c.hp<0?'−':'+')+Math.abs(c.hp):(c.shield<0?'−':'+')+Math.abs(c.shield)+' ◇';floating.el.style.color='#'+new T.Color(color).getHexString();floating.el.hidden=false;}
  const pulse=this.pulses.find(e=>e.age>=e.life);if(pulse){pulse.age=0;pulse.mesh.position.copy(m.root.position);pulse.mesh.position.y=.19;pulse.mesh.material.color.setHex(color);pulse.mesh.visible=true;}
  if(c.hp<0)m.hitAt=this.time;if(c.died)m.deathAt=this.time;
 }this.setTeams(frame.teams);}
 select(key){this.models.forEach(m=>m.label.classList.toggle('selected',m.key===key));}
 resize(){const {width,height}=this.canvas.getBoundingClientRect();if(!width||!height)return;this.width=width;this.height=height;
  const size=bufferSize(width,height,window.devicePixelRatio||1,this.quality);this.renderer.setSize(size.width,size.height,false);this.buffer=size;
  this.camera.position.set(this.angle===1?0:this.angle===2?10:8,this.angle===1?19:13,this.angle===2?8:15);this.camera.lookAt(0,.35,0);this.camera.updateMatrixWorld();
  let mx=0,my=0;for(const x of [-5.5,5.5])for(const z of [-5.3,5.3])for(const y of [0,2.3]){const p=new T.Vector3(x,y,z).applyMatrix4(this.camera.matrixWorldInverse);mx=Math.max(mx,Math.abs(p.x));my=Math.max(my,Math.abs(p.y));}
  const aspect=width/height,half=Math.max(my,mx/aspect)*1.035;this.camera.left=-half*aspect;this.camera.right=half*aspect;this.camera.top=half;this.camera.bottom=-half;this.camera.updateProjectionMatrix();
 }
 cameraNext(){this.angle=(this.angle+1)%3;this.resize();this.render(0,this.lastProgress||0);}
 setQuality(value){this.quality=value;this.resize();this.render(0,this.lastProgress||0);}
 project(position){this.projected.copy(position).project(this.camera);return {x:(this.projected.x*.5+.5)*this.width,y:(-.5*this.projected.y+.5)*this.height};}
 render(dt,p=0){this.time+=dt;this.lastProgress=p;const active=this.active;this.projectile.visible=false;
  for(const m of this.models.values()){
   m.root.position.copy(m.base);m.root.rotation.y=m.rotation;m.body.position.set(0,0,0);m.body.rotation.set(0,0,0);m.head.rotation.y=0;m.arms.forEach((a,i)=>a.rotation.set(0,0,i?-.07:.07));m.legs.forEach(l=>l.rotation.x=0);
   m.body.visible=true;
   if(m.dead){const death=Math.min(1,(this.time-(m.deathAt??-10))/.7);m.body.rotation.z=death*1.5;m.body.position.y=-death*.2;m.body.visible=death<1;}
   else {
    if(!this.reduced)m.body.position.y=Math.sin(this.time*2+m.base.x)*.018;
    if(active?.actor===m&&active.target){const target=active.target.base,dx=target.x-m.base.x,dz=target.z-m.base.z,length=Math.hypot(dx,dz),pose=attackPose(p,active.stationary,this.reduced);
     m.root.rotation.y=Math.atan2(dx,dz);m.root.position.x+=dx*Math.max(0,length-1.05)/(length||1)*pose.move;m.root.position.z+=dz*Math.max(0,length-1.05)/(length||1)*pose.move;
     m.arms[1].rotation.x=active.stationary?-Math.sin(p*Math.PI)*1.45:-pose.swing*2.1;m.arms[0].rotation.x=active.stationary?-Math.sin(p*Math.PI)*.7:-pose.swing*.25;
     if(!active.stationary&&!this.reduced&&(p<.32||p>.58)){m.legs[0].rotation.x=Math.sin(p*36)*.4;m.legs[1].rotation.x=-m.legs[0].rotation.x;}
     if(pose.projectile){this.projectile.visible=true;this.projectile.position.lerpVectors(m.base,target,pose.travel);this.projectile.position.y=1.35+Math.sin(pose.travel*Math.PI)*.35;this.projectile.rotation.y=this.time*8;}
    }
    const hit=this.time-(m.hitAt??-10);if(hit<.3&&!this.reduced)m.body.rotation.x=-Math.sin(hit/.3*Math.PI)*.15;
   }
   const pos=this.project(m.root.position.clone().add(new T.Vector3(0,2.15,0)));m.label.style.transform=`translate(${pos.x}px,${pos.y}px) translate(-50%,-100%)`;
  }
  for(const e of this.pulses){if(e.age>=e.life){e.mesh.visible=false;continue;}e.age+=dt;const t=e.age/e.life;e.mesh.scale.setScalar(1+t*3);e.mesh.material.opacity=Math.max(0,1-t)*.75;}
  for(const e of this.floatPool){if(e.age>=e.life){e.el.hidden=true;continue;}e.age+=dt;const t=e.age/e.life,pos=this.project(e.position.clone().add(new T.Vector3(0,this.reduced?0:t*.8,0)));e.el.style.transform=`translate(${pos.x}px,${pos.y}px) translate(-50%,-100%)`;e.el.style.opacity=String(Math.max(0,1-t));}
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.observer.disconnect();this.canvas.removeEventListener('pointerup',this.click);this.kit.dispose();this.resources.forEach(r=>r.dispose());this.renderer.dispose();this.labels.replaceChildren();this.floats.replaceChildren();this.models.clear();}
}
