import * as T from 'three';

// Shared geometry and instanced stonework keep the arena affordable on mobile.
export function createCitadel(arena){
 const {scene}=arena,keep=value=>arena.keep(value);
 const stone=arena.mat(0xffffff,{roughness:.87,metalness:.08}),gold=arena.mat(0xb99554,{roughness:.4,metalness:.7});
 const foliage=arena.mat(0xffffff,{roughness:1,metalness:0});
 const cube=keep(new T.BoxGeometry(1,1,1)),rock=keep(new T.IcosahedronGeometry(1,0));
 const column=keep(new T.CylinderGeometry(.19,.23,1,8));
 const stonework=[],rocks=[],trim=[],leaves=[];
 const part=(list,x,y,z,sx,sy,sz,color=0x6f777b,rotation=0)=>list.push({x,y,z,sx,sy,sz,color,rotation});
 function batch(geometry,material,items){
  const matrix=new T.Matrix4(),q=new T.Quaternion(),scale=new T.Vector3(),position=new T.Vector3(),up=new T.Vector3(0,1,0);
  const mesh=new T.InstancedMesh(geometry,material,items.length);
  items.forEach((p,i)=>{matrix.compose(position.set(p.x,p.y,p.z),q.setFromAxisAngle(up,p.rotation),scale.set(p.sx,p.sy,p.sz));
   if(arena.renderer.isSoftwareRenderer){const mat=keep(material.clone());mat.color.multiply(new T.Color(p.color));const individual=new T.Mesh(geometry,mat);individual.applyMatrix4(matrix);individual.userData.softwareLayer=-2;scene.add(individual);}
   else{mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new T.Color(p.color));}
  });if(!arena.renderer.isSoftwareRenderer){mesh.receiveShadow=true;scene.add(mesh);}
 }
 part(stonework,0,-.34,0,8.7,.65,10,0x354450);
 part(stonework,0,-.72,0,8.25,.24,9.55,0x253641);
 for(let r=0;r<8;r++)for(let c=0;c<6;c++){
  const shade=[0x69787d,0x7b8585,0x606f76,0x727d7e][(c*7+r*3)%4];
  part(stonework,(c-2.5)*1.36,.035,(r-3.5)*1.16,1.32,.12,1.12,shade);
 }
 for(const x of [-4.25,4.25]){part(trim,x,.12,0,.065,.03,9.65,0xffffff);for(let z=-4;z<=4;z+=.8)part(stonework,x,.18,z,.3,.32,.75,0x58676f);}
 for(const z of [-4.85,4.85]){part(trim,0,.12,z,8.5,.03,.065,0xffffff);for(let x=-3.6;x<=3.6;x+=.8)part(stonework,x,.18,z,.75,.32,.3,0x58676f);}
 for(let i=0;i<24;i++){
  const angle=i/24*Math.PI*2,x=Math.cos(angle)*4.1,z=Math.sin(angle)*4.7;
  part(rocks,x,-.85-(i%3)*.2,z,.7+(i%2)*.25,1.1+(i%3)*.18,.8,0x344b57,angle);
  if(i%3!==1){part(leaves,x,.32,z,.32,.22,.4,[0x457359,0x355b47,0x71916b][i%3]);part(leaves,x-.2,.2,z+.25,.28,.18,.3,0x355b47);}
 }
 for(const side of [0,1]){
  const z=(side?-1:1)*4.45,color=side?0x3acbaf:0x4a9bdc;
  for(const x of [-3.75,3.75]){
   part(stonework,x,.36,z,.78,.54,.78,0x4b606a);part(stonework,x,.74,z,.57,.24,.57,0x7b8586);
   part(trim,x,.9,z,.65,.08,.65,0xffffff);part(stonework,x,1.25,z,.46,.62,.46,0x566b76);
   part(trim,x,1.6,z,.6,.1,.6,0xffffff);
   arena.mesh(new T.CylinderGeometry(.37,.2,.18,8),gold,x,1.75,z);
   const flame=arena.mesh(new T.IcosahedronGeometry(.2,1),keep(new T.MeshBasicMaterial({color:0xffc566})),x,2.02,z);flame.scale.y=1.6;
   arena.mesh(new T.OctahedronGeometry(.13),keep(new T.MeshBasicMaterial({color})),x,1.17,z+.24*(side?-1:1));
  }
  const mat=arena.mat(side?0x113f3a:0x163454,{metalness:.05,roughness:.9,side:T.DoubleSide});
  const banner=new T.Shape();banner.moveTo(-.36,.7);banner.lineTo(.36,.7);banner.lineTo(.36,-.55);banner.lineTo(0,-.78);banner.lineTo(-.36,-.55);banner.closePath();
  const cloth=arena.mesh(new T.ShapeGeometry(banner),mat,side?-2.45:2.45,2.2,z);cloth.rotation.y=side?Math.PI:0;
  part(trim,side?-2.45:2.45,2.92,z,.88,.055,.055,0xffffff);
  arena.mesh(column,gold,(side?-2.45:2.45)-.46,1.65,z).scale.y=2.7;
  const sigil=arena.mesh(new T.RingGeometry(.13,.16,6),gold,side?-2.45:2.45,2.25,z+(side?-.025:.025));sigil.rotation.z=Math.PI/6;
  for(let step=0;step<4;step++)part(stonework,0,-.12-step*.17,(side?-1:1)*(5.05+step*.28),2.2,.2,.35,0x536671);
 }
 const circle=arena.mesh(new T.RingGeometry(.66,.69,48),gold,0,.11,0);circle.rotation.x=-Math.PI/2;
 for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI*3/4]){const bar=arena.mesh(new T.BoxGeometry(.035,.015,1.85),gold,0,.12,0);bar.rotation.y=angle;}
 for(const x of [-2.72,0,2.72])part(trim,x,.106,0,.022,.008,9.2,0x737a70);
 batch(cube,stone,stonework);batch(rock,stone,rocks);batch(cube,gold,trim);batch(rock,foliage,leaves);
}
