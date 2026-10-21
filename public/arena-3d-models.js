import * as T from 'three';

const geometries=new Map(),materials=new Map();
const geo=(key,make)=>{if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);};
export function material(color,metalness=.35,emissive=false){
 const key=[color,metalness,emissive].join(':');
 if(!materials.has(key))materials.set(key,emissive?new T.MeshBasicMaterial({color}):new T.MeshStandardMaterial({color,roughness:.55,metalness,flatShading:true}));
 return materials.get(key);
}
function mesh(parent,geometry,mat,x=0,y=0,z=0){const m=new T.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function box(parent,w,h,d,mat,x=0,y=0,z=0){return mesh(parent,geo('b'+[w,h,d],()=>new T.BoxGeometry(w,h,d)),mat,x,y,z);}
export function orb(parent,r,mat,x=0,y=0,z=0,detail=1){return mesh(parent,geo('i'+r+':'+detail,()=>new T.IcosahedronGeometry(r,detail)),mat,x,y,z);}
export function cylinder(parent,top,bottom,height,mat,x=0,y=0,z=0,sides=8){return mesh(parent,geo('c'+[top,bottom,height,sides],()=>new T.CylinderGeometry(top,bottom,height,sides)),mat,x,y,z);}
export function ring(parent,r,width,mat,x=0,y=0,z=0){const m=mesh(parent,geo('r'+[r,width],()=>new T.TorusGeometry(r,width,4,32)),mat,x,y,z);m.rotation.x=Math.PI/2;return m;}
function group(parent,x=0,y=0,z=0){const g=new T.Group();g.position.set(x,y,z);parent.add(g);return g;}
function shapeMesh(parent,points,depth,mat,x=0,y=0,z=0){
 const shape=new T.Shape();points.forEach(([px,py],i)=>i?shape.lineTo(px,py):shape.moveTo(px,py));shape.closePath();
 return mesh(parent,geo('s'+JSON.stringify(points)+depth,()=>new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.025,bevelThickness:.025})),mat,x,y,z);
}
function blade(parent,length,mat,trim,x=0,y=0,z=0){
 const g=group(parent,x,y,z);
 box(g,.045,.2,.06,trim,0,.02);box(g,.29,.055,.075,trim,0,.13);
 shapeMesh(g,[[-.065,.16],[-.065,length-.16],[0,length],[.065,length-.16],[.065,.16]],.035,mat,0,0,-.02);
 box(g,.015,length-.28,.045,trim,0,(length-.28)/2+.17,.025);
 return g;
}

export function createHeroModel(hero,side){
 const root=new T.Group(),body=group(root),armor=group(body);
 const role=hero.role;
 const steel=material(side?0xa5a3af:0x839bad,.73),dark=material(0x172336,.25),gold=material(0xc3a267,.7),skin=material(0xd5b991,.05),leather=material(0x29233a,.05);
 const accents={tank:0x304b69,fighter:0x863e38,assassin:0x42316b,energy:0x544077,support:0x367668};
 const cloth=material(accents[role]||accents.fighter,.08),light=material(role==='support'?0x80f0ba:role==='energy'?0xc2a0ff:0x8ee5fc,.1,true);
 const boot=material(0x18202e,.4),ivory=material(0xe2d5b6,.35);
 const breadth=role==='tank'?1.22:role==='assassin'?.87:1;
 cylinder(root,.55,.59,.09,material(0x273647,.65),0,.04,0,20);
 const teamRing=ring(root,.53,.025,material(side?0xf57691:0x63d7e9,0,true),0,.1);
 const selectRing=ring(root,.62,.025,material(0xf3d395,0,true),0,.09);selectRing.visible=false;
 const legs=[-1,1].map(sign=>{
  const leg=group(armor,sign*.16,.67,0);
  cylinder(leg,.105,.09,.45,dark,0,-.18);
  box(leg,.23,.24,.28,steel,0,-.34,.04);
  box(leg,.25,.16,.34,boot,0,-.48,.07);
  return leg;
 });
 const torso=cylinder(armor,.31,.22,.57,role==='support'?ivory:steel,0,1.05,0,6);torso.scale.x=breadth;
 cylinder(armor,.25,.29,.25,cloth,0,.71,0,8);
 box(armor,.55*breadth,.08,.36,gold,0,.79,.025);
 shapeMesh(armor,[[-.22,0],[-.25,.33],[0,.42],[.25,.33],[.22,0],[0,-.12]],.065,cloth,0,.91,.18);
 orb(armor,.075,light,0,1.18,.28,0);
 // Separate shoulder pivots drive the swing, brace and spell gestures.
 const arms=[-1,1].map(sign=>{
  const arm=group(armor,sign*.34*breadth,1.28,0);
  orb(arm,role==='tank'?.22:.165,steel,0,0,0,0);
  cylinder(arm,.09,.08,.31,cloth,0,-.2);
  cylinder(arm,.115,.085,.22,steel,0,-.43);
  orb(arm,.09,role==='energy'||role==='support'?skin:boot,0,-.58,0,0);
  return arm;
 });
 const head=group(armor,0,1.54,0);
 orb(head,.2,role==='support'?skin:steel,0,0,0,1);
 if(role==='tank'||role==='fighter'){
  box(head,.35,.115,.1,dark,0,0,.16);
  box(head,.3,.025,.11,light,0,.015,.18);
  box(head,.055,.25,.09,gold,0,.015,.2);
  box(head,.39,.045,.34,gold,0,.14,0);
  if(role==='tank')for(const s of [-1,1]){const horn=cylinder(head,0,.07,.3,gold,s*.21,.2,0,5);horn.rotation.z=-s*.6;}
  else{const crest=box(head,.05,.22,.35,cloth,0,.23,-.06);crest.rotation.x=-.2;}
 }
 if(role==='assassin'||role==='energy'){
  const hood=orb(head,.235,cloth,0,.03,-.055);hood.scale.set(1,1.18,1);
  box(head,.25,.21,.06,dark,0,-.015,.18);
  for(const s of [-1,1])box(head,.055,.026,.04,light,s*.065,.02,.22);
 }
 if(role==='support'){
  const hair=orb(head,.216,gold,0,.06,-.045);hair.scale.z=.85;
  box(head,.19,.2,.09,skin,0,-.02,.15);
  for(const s of [-1,1]){const leaf=cylinder(head,0,.055,.2,gold,s*.11,.24,0,4);leaf.rotation.z=-s*.35;}
  orb(head,.055,light,0,.2,.15,0);
 }
 const cape=shapeMesh(armor,[[-.27,1.29],[-.37,.55],[0,.4],[.37,.55],[.27,1.29]],.03,cloth,0,0,-.25);
 cape.rotation.x=-.1;
 let shield=null,aura=null;
 if(role==='tank'){
  shield=group(arms[0],-.08,-.4,.1);
  shapeMesh(shield,[[-.3,.35],[-.34,-.08],[0,-.48],[.34,-.08],[.3,.35],[0,.47]],.09,gold,0,0,0);
  shapeMesh(shield,[[-.24,.29],[-.27,-.06],[0,-.38],[.27,-.06],[.24,.29],[0,.38]],.06,cloth,0,0,.1);
  box(shield,.045,.55,.05,light,0,0,.19);box(shield,.35,.04,.05,light,0,.08,.19);
  const hammer=group(arms[1],0,-.55,0);cylinder(hammer,.035,.035,.8,leather,0,.3);box(hammer,.5,.28,.27,steel,0,.69);box(hammer,.07,.3,.29,gold,0,.69);
 }
 if(role==='fighter'){
  blade(arms[1],1.04,steel,gold,0,-.6,.04);
  box(arms[0],.22,.36,.16,steel,0,-.38,.1);
 }
 if(role==='assassin'){
  for(const [i,s] of [-1,1].entries()){const knife=blade(arms[i],.56,steel,gold,0,-.58,.06);knife.rotation.z=s*.35;}
  cylinder(armor,.23,.43,.42,cloth,0,.6,0,7);
  box(head,.33,.08,.1,cloth,0,-.12,.2);
 }
 if(role==='energy'||role==='support'){
  cylinder(armor,.2,.41,.7,cloth,0,.61,0,10);
  cylinder(armor,.405,.425,.06,gold,0,.28,0,10);
  const staff=group(arms[1],.04,-.55,0);
  cylinder(staff,.032,.032,1.75,gold,0,.25);
  const crest=ring(staff,.17,.035,gold,0,1.07);crest.rotation.x=0;
  aura=orb(staff,.125,light,0,1.08,0,1);
  if(role==='energy'){
   cylinder(head,0,.24,.48,cloth,0,.4,0,7);
   cylinder(head,.29,.29,.04,gold,0,.18,0,12);
   for(const s of [-1,1]){const crystal=orb(armor,.1,light,s*.46,1.55,-.13,0);crystal.scale.y=1.6;}
  }else{
   for(const s of [-1,1]){
    const wing=shapeMesh(armor,[[0,0],[s*.49,.22],[s*.35,.62],[s*.13,.33]],.025,ivory,s*.12,1.04,-.27);wing.rotation.y=-s*.3;
   }
  }
 }
 const bubble=new T.Mesh(geo('bubble',()=>new T.SphereGeometry(.73,14,10)),new T.MeshBasicMaterial({color:0x80dbf4,wireframe:true,transparent:true,opacity:.15,depthWrite:false}));bubble.position.y=.95;bubble.scale.y=1.3;bubble.visible=false;root.add(bubble);
 const key=side+':'+hero.id;root.traverse(obj=>{obj.userData.heroKey=key;});
 return {root,body,armor,head,arms,legs,cape,shield,aura,bubble,teamRing,selectRing,hero,side,key,base:new T.Vector3(),baseRotation:side?0:Math.PI,deathAt:null,dead:false};
}

export function createBoard(scene){
 const board=new T.Group();scene.add(board);
 const basalt=material(0x172535,.4),edge=material(0x384656,.6),gold=material(0x9c855c,.7);
 box(board,8.5,.45,9.3,basalt,0,-.28);box(board,8.7,.12,9.5,edge,0,-.5);box(board,8.3,.12,9.1,gold,0,-.045);
 for(let row=0;row<6;row++)for(let col=0;col<6;col++){
  const tile=box(board,1.33,.11,1.46,material((col+row)%2?0x243544:0x2b3e4e,.35),(col-2.5)*1.35,.035,(row-2.5)*1.48);
  tile.receiveShadow=true;tile.castShadow=false;
 }
 for(const side of [-1,1]){
  box(board,8.1,.025,.035,material(side<0?0xda6c89:0x62c6db,0,true),0,.11,side*4.48);
  for(const x of [-1,1]){
   cylinder(board,.31,.39,.28,edge,x*4.03,.18,side*4.35,8);
   cylinder(board,.21,.28,.48,basalt,x*4.03,.55,side*4.35,6);
   const crystal=orb(board,.22,material(side<0?0xf18ca3:0x79dcf0,0,true),x*4.03,.97,side*4.35,0);crystal.scale.y=1.7;
   ring(board,.29,.03,gold,x*4.03,.77,side*4.35);
  }
 }
 for(let i=0;i<7;i++)box(board,.28,.021,.035,gold,(i-3)*.72,.12,0);
 const central=ring(board,.48,.02,gold,0,.12,0);central.scale.set(1,1,1);
 box(board,.035,.025,.6,gold,0,.125);box(board,.6,.025,.035,gold,0,.125);
 const floor=new T.Mesh(new T.PlaneGeometry(200,200),material(0x09111b,.05));floor.rotation.x=-Math.PI/2;floor.position.y=-.62;floor.receiveShadow=true;scene.add(floor);
 return board;
}

export function homePosition(side,index){
 const front=index<2,dir=side?-1:1;
 return new T.Vector3(front?(index===0?-1.45:1.45):(index-3)*2.65,.13,dir*(front?1.05:3.3));
}
