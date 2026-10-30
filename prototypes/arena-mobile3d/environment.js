import * as T from 'three';
import {ARENA_WIDTH_SCALE,COMBAT_FLOOR} from './arena-layout.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {stoneTexture,bevelBlock,softContactTexture} from './environment-materials.js';

// Authored amphitheatre: broad architectural masses, a calm combat floor and one royal focal gate.
// Shared instanced masonry; no downloaded art, real-time shadows or post-processing.
export function createCitadel(arena){
 const keep=value=>arena.keep(value),scene=arena.scene,software=arena.renderer.isSoftwareRenderer,environmentStart=scene.children.length;
 const grain=software?null:keep(stoneTexture(64));
 const stone=arena.mat(0xffffff,{roughness:.88,metalness:.03,map:grain});
 const gold=arena.mat(0xa96b35,{roughness:.43,metalness:.62});
 const dark=arena.mat(0x141b24,{roughness:.9,metalness:.05,map:grain});
 const seat=arena.mat(0x303641,{roughness:.9,map:grain});
 const pale=arena.mat(0x3e444b,{roughness:.84,metalness:.04,map:grain});
 const cloth=arena.mat(0x9b203c,{roughness:1,metalness:0,side:T.DoubleSide});
 const alternateCloth=arena.mat(0x087b78,{roughness:1,metalness:0,side:T.DoubleSide});
 const cube=keep(bevelBlock()),items=[];
 const block=(x,y,z,sx,sy,sz,color=0x577781,rotation=0)=>items.push({x,y,z,sx,sy,sz,color,rotation});
 const mesh=(geo,mat,x=0,y=0,z=0)=>arena.mesh(geo,mat,x,y,z);
 arena.landmarks=[];arena.architecture={name:'Crown Amphitheatre',tiers:4,sections:10,materials:'stone / bronze / teal cloth',terraceDepth:1.12,aisleWidth:.7,combatFloor:COMBAT_FLOOR,widthScale:ARENA_WIDTH_SCALE,bounds:{x:11.4*ARENA_WIDTH_SCALE,z:11.4,y:8}};
 // Octagonal foundation, exposed lower retaining wall and continuous promenade.
 for(const [r,h,y,color] of [[11.25,.45,-1.55,0x10141d],[11,.8,-.95,0x1e2530],[11.15,.18,-.48,0x30353c]]){
  const base=mesh(new T.CylinderGeometry(r,r+.18,h,12),arena.mat(color,{roughness:.94,map:grain}),0,y,0);base.rotation.y=Math.PI/12;
 }
 block(0,-.16,0,8.75,.5,10.1,0x141c26);
 // Large limestone slabs and fine bronze seams: the floor reads as one authored surface, not a checkerboard.
 for(let r=0;r<8;r++)for(let c=0;c<6;c++)block((c-2.5)*1.36,.105,(r-3.5)*1.16,1.345,.12,1.145,[0xa47a52,0xb1875b,0x9b7251,0xad8056][(r*3+c)%4]);
 const flat=(geometry,material,y=.175)=>{const o=mesh(geometry,material,0,y,0);o.rotation.x=-Math.PI/2;return o;};
 for(const r of [1.38,1.5,3.42,3.5])flat(new T.RingGeometry(r,r+.035,80),gold);
 // Eight substantial compass petals, alternating slate and bronze inlay.
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4,shape=new T.Shape();shape.moveTo(0,.34);shape.lineTo(.25,1.35);shape.lineTo(0,2.95);shape.lineTo(-.25,1.35);shape.closePath();
  const petal=flat(new T.ShapeGeometry(shape),i%2?dark:gold,.181);petal.rotation.z=a;
 }
 flat(new T.CircleGeometry(.44,8),dark,.184);flat(new T.RingGeometry(.35,.4,8),gold,.186);
 for(const x of [-4.14,4.14]){block(x,.2,0,.18,.14,9.65,0x18212b);block(x,.28,0,.04,.025,9.65,0xad713b);}
 for(const z of [-4.7,4.7]){block(0,.2,z,8.4,.14,.18,0x18212b);block(0,.28,z,8.4,.025,.04,0xad713b);}
 // Rhythmic corner medallions, not scattered decorations.
 for(const x of [-3.45,3.45])for(const z of [-3.92,3.92]){const o=flat(new T.RingGeometry(.25,.33,4),gold,.185);o.position.x=x;o.position.z=z;o.rotation.z=Math.PI/4;}
 // Four rising terraces in ten wedge-shaped seating bays, separated by radial stair aisles.
 // Angles open toward the foreground; architecture frames rather than covers the battle.
 const start=-.10*Math.PI,end=1.10*Math.PI,bays=10,span=(end-start)/bays;
 function wedge(inner,outer,a,b,y,height,material){
  const shape=new T.Shape();shape.absarc(0,0,outer,a,b,false);shape.absarc(0,0,inner,b,a,true);shape.closePath();
  const g=new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1,curveSegments:5});
  const m=mesh(g,material,0,y,0);m.rotation.x=-Math.PI/2;return m;
 }
 for(let bay=0;bay<bays;bay++){
  const a=start+bay*span+.06,b=start+(bay+1)*span-.06;
  for(let tier=0;tier<4;tier++){
   const r=6.05+tier*1.16,y=.08+tier*.55;
   wedge(r,r+1.12,a,b,y,.5,tier%2?pale:seat);
   wedge(r+.96,r+1.12,a,b,y+.5,.32,dark);
   wedge(r+.96,r+1.13,a,b,y+.82,.045,gold);
  }
  // Deep rear arcade supports and capitals establish architectural scale.
  const aMid=(a+b)/2,x=Math.cos(aMid)*10.78,z=-Math.sin(aMid)*10.78;
  block(x,1.4,z,.58,3.6,.65,0x252d38,-aMid);
  block(x,3.3,z,.9,.23,.86,0x46505c,-aMid);
  block(x,3.48,z,.72,.12,.72,0xad713b,-aMid);
 }
 for(let aisle=0;aisle<=bays;aisle++){
  const a=start+aisle*span;
  // Positive yaw aligns local X with (cos(a), -sin(a)); solid risers meet the foundation.
  for(let step=0;step<13;step++){const r=6.1+step*.375,top=.18+step*.184;block(Math.cos(a)*r,(top-.45)/2,-Math.sin(a)*r,.4,top+.45,.7,0x44494e,a);}
 }
 // Continuous rear parapet with a light coping, broken by the ceremonial gate.
 wedge(10.78,11.05,start,end,2.65,.75,dark);wedge(10.73,11.1,start,end,3.4,.15,pale);
 // The royal gate: stepped towers, recessed dark portal, heavy jambs and a sculpted crown.
 // A solid opening is authored with two piers and an extruded arch (not a painted rectangle).
 const gateZ=-9.8;
 for(const x of [-2.1,2.1]){
  block(x,1.95,gateZ,1.4,4.8,1.6,0x27323f);
  block(x,4.48,gateZ,1.7,.3,1.9,0x46505a);
  block(x,5.03,gateZ,1.05,.8,1.2,0x1c2732);
  block(x,5.52,gateZ,1.35,.17,1.5,0xae753d);
  const roof=mesh(new T.ConeGeometry(.88,1.35,4),dark,x,6.25,gateZ);roof.rotation.y=Math.PI/4;
  mesh(new T.OctahedronGeometry(.22),gold,x,7.08,gateZ);
  for(const zz of [gateZ-.82,gateZ+.82])block(x,2.2,zz,.4,2.5,.09,0x141b26);
 }
 const archShape=new T.Shape();archShape.absarc(0,0,2,0,Math.PI,false);archShape.lineTo(-1.28,0);archShape.absarc(0,0,1.28,Math.PI,0,true);archShape.closePath();
 mesh(new T.ExtrudeGeometry(archShape,{depth:1.2,bevelEnabled:true,bevelSize:.08,bevelThickness:.08,bevelSegments:1,steps:1,curveSegments:16}),pale,0,3.1,gateZ-.6);
 for(const x of [-1.64,1.64])block(x,1.5,gateZ,.72,3.2,1.2,0x3e444b);
 block(0,5.02,gateZ,1.1,.45,1.55,0xad713b);
 const crest=mesh(new T.OctahedronGeometry(.56),gold,0,5.68,gateZ);crest.scale.set(.8,1.35,.4);
 // Recessed doorway stays visibly dark, with a bronze portcullis behind the arch.
 block(0,1.65,gateZ-.62,2.5,3.3,.12,0x090f17);
 for(let i=-4;i<=4;i++)block(i*.25,1.65,gateZ-.5,.045,3.25,.06,0x976330);
 for(const y of [.5,1.4,2.3])block(0,y,gateZ-.45,2.5,.045,.07,0x976330);
 // Long hanging standards create broad, readable color masses.
 for(const x of [-4.7,4.7]){
  block(x,2.7,-8.7,.2,5.6,.2,0xa7763c);block(x,5.35,-8.7,1.65,.1,.1,0xa7763c);
  const s=new T.Shape();s.moveTo(-.65,0);s.lineTo(.65,0);s.lineTo(.65,-2.5);s.lineTo(0,-3);s.lineTo(-.65,-2.5);s.closePath();
  mesh(new T.ShapeGeometry(s),x<0?cloth:alternateCloth,x,5.25,-8.66);
  const sigil=mesh(new T.RingGeometry(.25,.32,4),gold,x,4.15,-8.62);sigil.rotation.z=Math.PI/4;
 }
 // Foreground ceremonial stair and two restrained guardians. No high front wall blocks combat.
 for(let i=0;i<7;i++)block(0,-.02-i*.2,5.08+i*.48,4.3,.24,.56,0x655744);
 for(const x of [-3.6,3.6]){
  block(x,.2,5.45,1.2,.55,1.2,0x1d2835);block(x,.72,5.45,.86,.5,.86,0x414b55);
  mesh(new T.CylinderGeometry(.55,.35,.28,8),gold,x,1.15,5.45);
  const crystal=mesh(new T.OctahedronGeometry(.3),arena.mat(0x73cbd4,{emissive:0x1d747e,emissiveIntensity:.3,roughness:.3}),x,1.68,5.45);crystal.scale.y=1.65;
 }
 // A single instanced draw for masonry; full resource lifecycle retained.
 const transforms=new T.Matrix4(),q=new T.Quaternion(),position=new T.Vector3(),scale=new T.Vector3(),up=new T.Vector3(0,1,0),batch=new T.InstancedMesh(cube,stone,items.length);
 items.forEach((p,i)=>{transforms.compose(position.set(p.x,p.y,p.z),q.setFromAxisAngle(up,p.rotation),scale.set(p.sx,p.sy,p.sz));if(software){const material=keep(stone.clone());material.color.setHex(p.color);const m=new T.Mesh(cube,material);m.applyMatrix4(transforms);m.userData.softwareLayer=p.y>=0?-1:-2;scene.add(m);}else{batch.setMatrixAt(i,transforms);batch.setColorAt(i,new T.Color(p.color));}});
 if(!software){scene.add(batch);
  // Merge repeated static terraces by material, preserving shadows/normals and mobile draw budget.
  const groups=new Map();for(const o of [...scene.children])if(o.isMesh&&!o.isInstancedMesh){if(!groups.has(o.material))groups.set(o.material,[]);groups.get(o.material).push(o);}
  for(const [material,objects] of groups){if(objects.length<2)continue;const geometries=objects.map(o=>{o.updateMatrix();const g=o.geometry.clone().applyMatrix4(o.matrix);if(g.index){const flat=g.toNonIndexed();g.dispose();return flat;}return g;});const merged=keep(mergeGeometries(geometries));geometries.forEach(g=>g.dispose());objects.forEach(o=>scene.remove(o));scene.add(new T.Mesh(merged,material));}
 }
 if(!software){const shadow=mesh(new T.PlaneGeometry(25,25),keep(new T.MeshBasicMaterial({map:keep(softContactTexture(64)),transparent:true,opacity:.7,depthWrite:false})),0,-1.9,0);shadow.rotation.x=-Math.PI/2;}
 // Widen only authored architecture and its positions; character rigs are added later and never scaled.
 for(const object of scene.children.slice(environmentStart)){object.position.x*=ARENA_WIDTH_SCALE;object.scale.x*=ARENA_WIDTH_SCALE;}
}
export function updateCitadelView(){ /* Open foreground and a recessed floor avoid camera-dependent disappearing architecture. */ }
