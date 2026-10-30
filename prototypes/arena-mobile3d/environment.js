import * as T from 'three';
import {stoneTexture,bevelBlock,softContactTexture} from './environment-materials.js';

// Shared geometry and instanced stonework keep the arena affordable on mobile.
export function createCitadel(arena){
 const {scene}=arena,keep=value=>arena.keep(value);
 const stone=arena.mat(0xffffff,{roughness:.87,metalness:.08,map:arena.renderer.isSoftwareRenderer?null:keep(stoneTexture())}),gold=arena.mat(0xd2a34c,{roughness:.4,metalness:.7});
 const foliage=arena.mat(0xffffff,{roughness:1,metalness:0});
 const cube=keep(bevelBlock()),rock=keep(new T.IcosahedronGeometry(1,0));
 const column=keep(new T.CylinderGeometry(.19,.23,1,8));
 const stonework=[],rocks=[],trim=[],leaves=[];arena.landmarks=[];
 const part=(list,x,y,z,sx,sy,sz,color=0x6f777b,rotation=0)=>list.push({x,y,z,sx,sy,sz,color,rotation});
 function batch(geometry,material,items){
  const matrix=new T.Matrix4(),q=new T.Quaternion(),scale=new T.Vector3(),position=new T.Vector3(),up=new T.Vector3(0,1,0);
  const mesh=new T.InstancedMesh(geometry,material,items.length);
  items.forEach((p,i)=>{matrix.compose(position.set(p.x,p.y,p.z),q.setFromAxisAngle(up,p.rotation),scale.set(p.sx,p.sy,p.sz));
   if(arena.renderer.isSoftwareRenderer){const mat=keep(material.clone());mat.color.multiply(new T.Color(p.color));const individual=new T.Mesh(geometry,mat);individual.applyMatrix4(matrix);individual.userData.softwareLayer=p.y>=0?-1:-2;scene.add(individual);}
   else{mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new T.Color(p.color));}
  });if(!arena.renderer.isSoftwareRenderer){mesh.receiveShadow=true;scene.add(mesh);}
 }
 // Three readable structural layers, not a thin floating board.
 part(stonework,0,-1.16,0,10.25,.42,11.35,0x101e30);
 part(stonework,0,-.84,0,9.7,.28,10.9,0x25445b);
 part(stonework,0,-.62,0,9.25,.18,10.45,0x101b2d);
 part(stonework,0,-.34,0,8.7,.65,10,0x1d354c);
 for(const x of [-4.55,4.55])for(const z of [-4.6,-2.3,0,2.3,4.6]){
  part(stonework,x,-.46,z,.55,1.1,.66,0x355c70);
  part(trim,x,-.08,z,.6,.055,.72,0x9c8660);
 }
 for(const z of [-5.05,5.05])for(const x of [-3.8,3.8])part(stonework,x,-.48,z,.8,1.12,.6,0x355c70);
 // Large entrance monuments sit beyond the playable floor on both ends.
 for(const side of [-1,1]){
  const z=side*5.72,group=new T.Group();group.name='citadel-gate-'+side;scene.add(group);
  const material=arena.mat(0x446b79,{roughness:.82,map:stone.map,transparent:true});
  const accent=arena.mat(0xd0a455,{metalness:.6,roughness:.5,transparent:true});
  const add=(geo,mat,x,y,zz,sx=1,sy=1,sz=1)=>{const mesh=new T.Mesh(geo,mat);mesh.position.set(x,y,zz);mesh.scale.set(sx,sy,sz);group.add(mesh);return mesh;};
  for(const x of [-1.65,1.65]){
   add(cube,material,x,-.12,z,1.05,.55,1.05);
   add(cube,material,x,1.15,z,.62,2.25,.7);
   add(cube,accent,x,2.32,z,.9,.13,.94);
   add(cube,material,x,2.57,z,.74,.35,.8);
   add(cube,accent,x,.5,z,.67,.08,.76);
  }
  // Actual arch volume with a central opening; visible from either direction.
  const shape=new T.Shape(),outer=1.99,inner=1.38;
  shape.absarc(0,0,outer,0,Math.PI,false);shape.lineTo(-inner,0);shape.absarc(0,0,inner,Math.PI,0,true);shape.closePath();
  const arch=keep(new T.ExtrudeGeometry(shape,{depth:.45,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:1,steps:1,curveSegments:12}));
  add(arch,material,0,2.15,z-.225);
  add(cube,accent,0,3.98,z,.32,.4,.6);
  arena.landmarks.push({group,materials:[material,accent],side});
 }
 if(!arena.renderer.isSoftwareRenderer){const contact=keep(softContactTexture(64));
 const baseShadow=arena.mesh(new T.PlaneGeometry(16,17),keep(new T.MeshBasicMaterial({map:contact,transparent:true,opacity:.65,depthWrite:false})),0,-1.4,0);baseShadow.rotation.x=-Math.PI/2;}

 part(stonework,0,-.72,0,8.25,.24,9.55,0x253641);
 for(let r=0;r<8;r++)for(let c=0;c<6;c++){
  const shades=r<4?[0x315a73,0x39677d,0x30586c,0x426e82]:[0x3d6d65,0x49796c,0x366158,0x4a7565],shade=shades[(c*7+r*3)%4];
  part(stonework,(c-2.5)*1.36,.035,(r-3.5)*1.16,1.32,.12,1.12,shade);
 }
 for(const x of [-4.25,4.25]){part(trim,x,.12,0,.065,.03,9.65,0xffffff);for(let z=-4;z<=4;z+=.8)part(stonework,x,.18,z,.3,.32,.75,0x29485a);}
 for(const z of [-4.85,4.85]){part(trim,0,.12,z,8.5,.03,.065,0xffffff);for(let x=-3.6;x<=3.6;x+=.8)part(stonework,x,.18,z,.75,.32,.3,0x29485a);}
 for(let i=0;i<24;i++){
  const angle=i/24*Math.PI*2,x=Math.cos(angle)*4.1,z=Math.sin(angle)*4.7;
  part(rocks,x,-.85-(i%3)*.2,z,.7+(i%2)*.25,1.1+(i%3)*.18,.8,0x1d3546,angle);
  if(i%3!==1){part(leaves,x,.32,z,.32,.22,.4,[0x236b50,0x184f3b,0x4b9465][i%3]);part(leaves,x-.2,.2,z+.25,.28,.18,.3,0x184f3b);}
 }
 for(const side of [0,1]){
  const z=(side?-1:1)*4.45,color=side?0x3acbaf:0x4a9bdc;
  for(const x of [-3.75,3.75]){
   part(stonework,x,.36,z,.78,.54,.78,0x2b4b5f);part(stonework,x,.74,z,.57,.24,.57,0x476c7b);
   part(trim,x,.9,z,.65,.08,.65,0xffffff);part(stonework,x,1.25,z,.46,.62,.46,0x31576c);
   part(trim,x,1.6,z,.6,.1,.6,0xffffff);
   arena.mesh(new T.CylinderGeometry(.37,.2,.18,8),gold,x,1.75,z);
   const flame=arena.mesh(new T.IcosahedronGeometry(.2,1),keep(new T.MeshBasicMaterial({color:0xffc566})),x,2.02,z);flame.scale.y=1.6;
   arena.mesh(new T.OctahedronGeometry(.13),keep(new T.MeshBasicMaterial({color})),x,1.17,z+.24*(side?-1:1));
  }
  const mat=arena.mat(side?0x0a765c:0x164cb0,{metalness:.05,roughness:.9,side:T.DoubleSide});
  const banner=new T.Shape();banner.moveTo(-.36,.7);banner.lineTo(.36,.7);banner.lineTo(.36,-.55);banner.lineTo(0,-.78);banner.lineTo(-.36,-.55);banner.closePath();
  const cloth=arena.mesh(new T.ShapeGeometry(banner),mat,side?-2.45:2.45,2.2,z);cloth.rotation.y=side?Math.PI:0;
  part(trim,side?-2.45:2.45,2.92,z,.88,.055,.055,0xffffff);
  arena.mesh(column,gold,(side?-2.45:2.45)-.46,1.65,z).scale.y=2.7;
  const sigil=arena.mesh(new T.RingGeometry(.13,.16,6),gold,side?-2.45:2.45,2.25,z+(side?-.025:.025));sigil.rotation.z=Math.PI/6;
  for(let step=0;step<6;step++)part(stonework,0,-.12-step*.19,(side?-1:1)*(5.05+step*.32),2.5,.23,.39,0x3c6070);
 }
 const circle=arena.mesh(new T.RingGeometry(.66,.69,48),gold,0,.11,0);circle.rotation.x=-Math.PI/2;
 for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI*3/4]){const bar=arena.mesh(new T.BoxGeometry(.035,.015,1.85),gold,0,.12,0);bar.rotation.y=angle;}
 for(const x of [-2.72,0,2.72])part(trim,x,.106,0,.022,.008,9.2,0x737a70);
 batch(cube,stone,stonework);batch(rock,stone,rocks);batch(cube,gold,trim);batch(rock,foliage,leaves);
}

export function updateCitadelView(arena){
 for(const landmark of arena.landmarks||[]){
  const faded=arena.camera.position.z*landmark.side>0&&arena.camera.position.y<12&&!arena.focusKey;
  for(const material of landmark.materials){material.opacity=faded?.3:1;material.depthWrite=!faded;}
 }
}
