import * as T from 'three';
import {COMBAT_FLOOR} from './arena-layout.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {stoneTexture,softContactTexture,mineralFloorTexture,mineralFloorNormalTexture} from './environment-materials.js';

// Whole-scene ivory sanctuary: one oval stage, shallow seating and an open crystal arch.
// Authoritative combat never imports this presentation module.
export function createCitadel(arena){
 const keep=x=>arena.keep(x),scene=arena.scene,software=arena.renderer.isSoftwareRenderer;
 const grain=software?null:keep(stoneTexture(128));
 const ivory=arena.mat(0xf4e6ca,{roughness:.78,metalness:0,map:grain});
 const pale=arena.mat(0xfff5de,{roughness:.7,metalness:0,map:grain});
 const bronze=arena.mat(0xc49b57,{roughness:.45,metalness:.55});
 const teal=arena.mat(0x397b88,{roughness:.68,metalness:.05,map:grain});
 const blue=arena.mat(0x577a8d,{roughness:.8,map:grain});
 const crystal=arena.mat(0x42d8d2,{roughness:.16,metalness:.25,emissive:0x087a83,emissiveIntensity:.28});
 const mesh=(g,m,x=0,y=0,z=0)=>arena.mesh(g,m,x,y,z);
 const oval=(rx,rz,y,h,material)=>{const m=mesh(new T.CylinderGeometry(1,1,h,96),material,0,y,0);m.scale.set(rx,1,rz);return m;};
 const ring=(rx,rz,width,y,material)=>{const g=new T.RingGeometry(1-width/rx,1,64),m=mesh(g,material,0,y,0);m.rotation.x=-Math.PI/2;m.scale.set(rx,rz,1);return m;};
 const block=(x,y,z,w,h,d,material=ivory)=>mesh(new T.BoxGeometry(w,h,d),material,x,y,z);
 const column=(x,z,height=1.5)=>{const g=mesh(new T.CylinderGeometry(.20,.26,height,8),ivory,x,height/2-.05,z);block(x,-.03,z,.64,.18,.64,pale);block(x,height-.02,z,.65,.15,.65,pale);block(x,height+.07,z,.48,.035,.48,bronze);return g;};
 arena.architecture={name:'Ivory Sky Sanctuary',tiers:3,sections:4,materials:'ivory limestone / brushed bronze / turquoise stone',floorStyle:'continuous-oval-ivory',floorCells:1,terraceDepth:.6,aisleWidth:.85,combatFloor:COMBAT_FLOOR,bounds:{x:11.3,z:9.5,y:6.5}};
 arena.landmarks=[];
 // One load-bearing rear terrace connects all seating modules; no floating asset islands.
 const support=new T.Shape();support.absellipse(0,0,9.3,8.7,0,Math.PI,false);support.lineTo(-9.3,-.8);support.lineTo(9.3,-.8);support.closePath();const foundation=mesh(new T.ExtrudeGeometry(support,{depth:.8,bevelEnabled:true,bevelSize:.08,bevelThickness:.04,bevelSegments:1,steps:1,curveSegments:32}),ivory,0,-.9,0);foundation.rotation.x=-Math.PI/2;
 // A visibly thick oval platform, not a rectangular chess board.
 oval(6.55,6.05,-.55,.7,ivory);oval(6.48,5.98,-.17,.12,pale);
 oval(6.28,5.78,-.07,.12,blue);
 const floorMap=software?null:keep(mineralFloorTexture());
 arena.floorMaterial=arena.mat(0xfff3da,{roughness:.88,metalness:0,map:floorMap,normalMap:floorMap?keep(mineralFloorNormalTexture(floorMap)):null,normalScale:new T.Vector2(.10,.10)});
 const surface=mesh(new T.CircleGeometry(1,128),arena.floorMaterial,0,.13,0);surface.rotation.x=-Math.PI/2;surface.scale.set(5.25,5.05,1);surface.receiveShadow=true;
 // Shared normalized UVs map a single authored stone albedo; no repeated square cells.
 ring(5.3,5.1,.045,.145,bronze);ring(5.48,5.25,.025,.145,bronze);ring(6.2,5.72,.045,.01,bronze);ring(6.45,5.95,.04,.02,bronze);
 // Broad curved bronze filigree follows the perimeter rather than partitioning the arena.
 for(let i=0;i<12;i++){
  const a=i*Math.PI/6,points=[];for(let j=0;j<=24;j++){const t=j/24,theta=a+(t-.5)*.32,r=5.55+.34*Math.sin(t*Math.PI);points.push(new T.Vector3(Math.sin(theta)*r,.155,Math.cos(theta)*r*.94));}
  mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),16,.018,4,false),bronze);
 }
 // One broad shallow-relief spear motif instead of overlapping wire circles.
 const spear=new T.Shape();spear.moveTo(0,-.95);spear.quadraticCurveTo(.14,-.30,.44,0);spear.quadraticCurveTo(.14,.3,0,.95);spear.quadraticCurveTo(-.14,.30,-.44,0);spear.quadraticCurveTo(-.14,-.3,0,-.95);spear.closePath();
 const emblem=mesh(new T.ExtrudeGeometry(spear,{depth:.006,bevelEnabled:false,curveSegments:10}),bronze,0,.144,0);emblem.rotation.x=-Math.PI/2;
 const inset=mesh(new T.ShapeGeometry(spear),pale,0,.153,0);inset.rotation.x=-Math.PI/2;inset.scale.set(.74,.83,1);
 // Substantial layered masonry balustrade: base, recessed facing and chamfer-like stepped coping.
 const frontBand=(rx,rz,width,y,height,material)=>{const sh=new T.Shape();for(let i=0;i<=24;i++){const a=(-.49+i/24*.98)*Math.PI,x=Math.sin(a)*rx,z=-Math.cos(a)*rz;if(i===0)sh.moveTo(x,z);else sh.lineTo(x,z);}for(let i=24;i>=0;i--){const a=(-.49+i/24*.98)*Math.PI;sh.lineTo(Math.sin(a)*(rx-width),-Math.cos(a)*(rz-width));}sh.closePath();const m=mesh(new T.ExtrudeGeometry(sh,{depth:height,bevelEnabled:false,curveSegments:1}),material,0,y,0);m.rotation.x=-Math.PI/2;return m;};
 frontBand(6.61,6.13,.38,-.19,.22,ivory);frontBand(6.56,6.08,.28,.03,.43,ivory);frontBand(6.63,6.15,.39,.46,.08,pale);frontBand(6.59,6.11,.33,.54,.055,pale);frontBand(6.60,6.12,.34,.032,.022,bronze);
 // Recessed turquoise panels sit on the exterior masonry face, framed by stone piers.

 for(let i=0;i<15;i++){
  const a=(-.48+i/14*.96)*Math.PI,x=Math.sin(a)*6.42,z=Math.cos(a)*5.94;
  if(Math.abs(x)>4.2&&z>3.6)continue;
  const post=block(x,.22,z,.16,.68,.2,pale);post.rotation.y=a;
  if(i<14){const b=(-.48+(i+.5)/14*.96)*Math.PI,xx=Math.sin(b)*6.57,zz=Math.cos(b)*6.09;const panel=block(xx,.24,zz,1.16,.26,.035,teal);panel.rotation.y=b;const cap=block(xx,.46,zz,1.3,.07,.24,pale);cap.rotation.y=b;}
 }
 // Real sculpture support plinths: originals remain untouched; shared models attach later.
 for(const x of [-4.75,4.75]){block(x,.05,4.15,1.65,.55,1.5,ivory);block(x,.37,4.15,1.8,.13,1.65,pale);block(x,.445,4.15,1.68,.025,1.53,bronze);}
 // Slender pointed arch: separate structural ribs, inset mouldings and carved leaf tracery.
 // Open negative space matters more than a solid band; all curves are real shallow relief.
 const archStart=scene.children.length,archZ=-5.95;
 const tube=(points,radius,material,segments=28,sides=5)=>mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),Math.max(8,Math.round(segments*.58)),radius,Math.min(4,sides),false),material);
 const archPath=(side,inset=0,z=archZ)=>[[side*(1.95-inset),1.45,z],[side*(1.90-inset),2.5,z],[side*(1.38-inset*.5),3.9,z],[side*.63,4.82-inset*.4,z],[0,5.3-inset*.6,z]];
 for(const side of [-1,1]){
  const x=side*1.95;column(x,archZ,1.65);block(x,.8,archZ,.36,1.6,.48,ivory);block(x,1.66,archZ,.58,.15,.62,pale);
  tube(archPath(side),.145,ivory,40,8);tube(archPath(side,-.10,archZ+.10),.038,bronze,40,5);tube(archPath(side,.16,archZ+.12),.055,pale,40,6);
  // Repeated carved acanthus sweeps fit the curve rather than read as box ornaments.
  for(const [x0,y0,w,h] of [[1.82,2.18,.28,.5],[1.55,3.2,.32,.55],[1.1,4.08,.34,.48]]){
   tube([[side*x0,y0,archZ+.18],[side*(x0-w),y0+h*.48,archZ+.23],[side*(x0-w*.6),y0+h,archZ+.20]],.045,pale,14,5);
   tube([[side*x0,y0,archZ+.20],[side*(x0+w*.2),y0+h*.55,archZ+.20],[side*(x0-w*.6),y0+h,archZ+.22]],.021,bronze,14,4);
  }
  // Flying return rib links the monument back to the terrace, keeping a light open silhouette.
  tube([[side*1.95,.3,archZ-.2],[side*2.6,1.5,archZ-.65],[side*2.15,3.2,archZ-.3]],.095,ivory,28,6);
 }
 // Elongated jewel has a central crown, bevel rings and unequal facets; not a toy octahedron.
 const crystalGeometry=()=>{const rings=[[0,.0],[.62,.25],[1.13,.36],[1.27,.25],[2.0,0]],positions=[],indices=[],sides=6;for(const [y,r] of rings)for(let i=0;i<sides;i++){const a=i*Math.PI/3;positions.push(Math.cos(a)*r,y,Math.sin(a)*r);}for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++){const a=j*sides+i,b=j*sides+(i+1)%sides,c=a+sides,d=b+sides;indices.push(a,c,b,b,c,d);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g.toNonIndexed();};
 const gem=mesh(crystalGeometry(),crystal,0,1.72,archZ+.2);gem.material.flatShading=true;arena.landmarks.push(gem);
 const gemFrame=[[0,1.7,archZ+.2],[-.34,2.84,archZ+.2],[0,3.72,archZ+.2],[.34,2.84,archZ+.2],[0,1.7,archZ+.2]];tube(gemFrame,.019,bronze,20,4);
 const crest=mesh(crystalGeometry(),crystal,0,5.05,archZ+.12);crest.scale.set(.38,.32,.38);arena.landmarks.push(crest);
 // Stepped octagonal basin, reflective pool and narrow fountain stem ground the focal crystal.
 mesh(new T.CylinderGeometry(.95,1.05,.17,8),ivory,0,.12,archZ+.25);mesh(new T.CylinderGeometry(.86,.7,.19,24),pale,0,.3,archZ+.25);
 ring(.86,.86,.065,.405,bronze).position.z=archZ+.25;mesh(new T.CircleGeometry(.77,40),crystal,0,.41,archZ+.25).rotation.x=-Math.PI/2;
 mesh(new T.CylinderGeometry(.06,.09,.86,8),crystal,0,.87,archZ+.25);
 // Tall banners are physically bowed cloth with pointed tails and a stitched bronze border.
 const fabric=arena.mat(0x287c8c,{roughness:.94,metalness:0,side:T.DoubleSide});
 for(const side of [-1,1]){const x=side*4.1,z=-7.55;column(x,z,5.05);const sh=new T.Shape();sh.moveTo(-.5,0);sh.lineTo(.5,0);sh.lineTo(.5,-2.65);sh.lineTo(0,-3.05);sh.lineTo(-.5,-2.65);sh.closePath();const cloth=mesh(new T.ShapeGeometry(sh),fabric,x,4.9,z+.24);block(x,4.95,z+.24,1.2,.07,.08,bronze);tube([[x-.44,4.85,z+.27],[x-.44,2.32,z+.27],[x,1.92,z+.27],[x+.44,2.32,z+.27],[x+.44,4.85,z+.27]],.015,bronze,24,4);}
 // Compress monument vertically to a 3.6m total crest; floor remains the compositional focus.
 for(const o of scene.children.slice(archStart)){o.position.y*=.63;o.scale.y*=.63;}
 // Sagging silk canopies over the SIDE seating, not over combat; hem and ribs follow fabric.
 const canopy=(cx,cz)=>{const nx=14,nz=10,pos=[],uv=[],ids=[],point=(u,v)=>new T.Vector3(cx+(u-.5)*2.65,2.34+.42*Math.pow(Math.abs(u-.5)*2,1.5)+.24*Math.pow(Math.abs(v-.5)*2,2)-.18*Math.sin(u*Math.PI)*Math.sin(v*Math.PI),cz+(v-.5)*2.8);for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const p=point(i/nx,j/nz);pos.push(p.x,p.y,p.z);uv.push(i/nx,j/nz);}for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;ids.push(a,c,b,b,c,d);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ids);g.computeVertexNormals();mesh(g,fabric);for(const v of [0,1]){const edge=[];for(let j=0;j<=18;j++){const p=point(j/18,v);edge.push([p.x,p.y+.018,p.z]);}tube(edge,.027,bronze,22,5);}for(const u of [0,1]){const edge=[];for(let j=0;j<=18;j++){const p=point(u,j/18);edge.push([p.x,p.y+.018,p.z]);}tube(edge,.027,bronze,22,5);}for(const u of [0,1])for(const v of [0,1]){const p=point(u,v);column(p.x,p.z,p.y-.06);mesh(new T.SphereGeometry(.10,8,5),bronze,p.x,p.y+.12,p.z);}for(const v of [.2,.8]){const path=[];for(let j=0;j<=14;j++){const p=point(j/14,v);path.push([p.x,p.y+.015,p.z]);}tube(path,.011,pale,18,4);}};
 canopy(-7.05,-3.25);canopy(7.05,-3.25);
 // Organic foliage uses smooth clustered leaves, trailing stems and small flower heads.
 const leaf=arena.mat(0x3e643c,{roughness:1}),lightLeaf=arena.mat(0x72834c,{roughness:1}),deepLeaf=arena.mat(0x294c36,{roughness:1}),flower=arena.mat(0xf3e6c8,{roughness:.9}),pinkFlower=arena.mat(0xbda1b7,{roughness:.9}),bark=arena.mat(0x6c6046,{roughness:1});
 const leafGeo=keep(new T.SphereGeometry(1,5,3));
 const foliage=(x,y,z,sx,sy,sz,material=leaf)=>{const m=mesh(leafGeo,material,x,y,z);m.scale.set(sx,sy,sz);return m;};
 for(const side of [-1,1])for(const [z,x0] of [[-6.3,5.4],[-3.5,7.0],[1.7,6.55],[3.8,5.4]]){
  const x=side*x0;column(x,z,1.05);mesh(new T.CylinderGeometry(.43,.29,.27,16),ivory,x,1.19,z);ring(.43,.43,.025,1.33,bronze).position.set(x,1.33,z);
  for(let j=0;j<8;j++){const a=j*2.399,r=.14+(j%3)*.10;foliage(x+Math.cos(a)*r,1.39+(j%3)*.07,z+Math.sin(a)*r,.21,.14,.16,j%3?leaf:lightLeaf);}
  for(let vine=0;vine<2;vine++){const a=vine*2.399+.5,vx=x+Math.cos(a)*.34,vz=z+Math.sin(a)*.34,points=[];for(let j=0;j<=6;j++){const t=j/6;points.push([vx+Math.sin(t*5+vine)*.09,1.32-t*.95,vz+Math.cos(t*4+vine)*.08]);if(j<6)foliage(points[j][0]+(j%2?.09:-.09),points[j][1],points[j][2],.13,.055,.08,j%2?lightLeaf:leaf);}tube(points,.012,deepLeaf,10,3);}
  for(let j=0;j<3;j++){const a=j*2.3;foliage(x+Math.cos(a)*.25,1.56,z+Math.sin(a)*.25,.10,.055,.10,j%2?flower:pinkFlower);foliage(x+Math.cos(a)*.25,1.60,z+Math.sin(a)*.25,.035,.025,.035,bronze);}
 }
 // Slender cypresses have irregular tiered profiles, not broad faceted bonsai crowns.
 const cypress=(x,z,h)=>{const rings=10,sides=7,pos=[],ids=[];for(let j=0;j<=rings;j++){const t=j/rings,r=Math.sin(Math.PI*Math.pow(t,.7))*.34*(.8+.2*Math.sin(j*2.6));for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,w=1+.11*Math.sin(i*2.3+j);pos.push(x+Math.cos(a)*r*w,.15+t*h,z+Math.sin(a)*r*w);}}for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){const a=j*sides+i,b=j*sides+(i+1)%sides,c=a+sides,d=b+sides;ids.push(a,c,b,b,c,d);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(ids);g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(pos.length/3*2),2));g.computeVertexNormals();mesh(g,deepLeaf);mesh(new T.CylinderGeometry(.045,.08,.6,7),bark,x,.25,z);};
 for(const side of [-1,1])for(const [x,z,h] of [[3.0,-8.0,3.4],[5.8,-7.9,3.8],[8.1,-5.5,3.2]])cypress(side*x,z,h);
 // Atmospheric real geometry: long distant ridges, closer asymmetric cliff terraces and falls.
 // Shapes are bounded, static and unlit; they are scenery, not a screenshot of an arena.
 for(let layer=0;layer<3;layer++){const s=new T.Shape();s.moveTo(-42,-12);for(let i=0;i<=36;i++){const x=-42+i*84/36,y=3+layer*.35+Math.sin(i*1.73+layer)*1.2+Math.sin(i*.41+layer)*2;s.lineTo(x,y);}s.lineTo(42,-12);s.closePath();mesh(new T.ShapeGeometry(s),keep(new T.MeshBasicMaterial({color:[0xc5d6d8,0xabc4cb,0x8eafb8][layer],side:T.DoubleSide})),0,0,-35+layer*6);}
 const cliff=arena.mat(0x9eb5b6,{roughness:1}),cliffTop=arena.mat(0x718d74,{roughness:1}),waterfall=arena.mat(0xc2e0df,{roughness:.34,metalness:0,transparent:true,opacity:.72,side:T.DoubleSide});
 for(const side of [-1,1])for(let j=0;j<3;j++){const x=side*(10+j*3.2),z=-15-j*2.4,h=3.3+j*.9;const rock=mesh(new T.CylinderGeometry(1.9,2.5,h,7,1),cliff,x,-h/2+.8+j*.5,z);rock.rotation.y=j*.7;const top=mesh(new T.CylinderGeometry(1.94,1.9,.18,7),cliffTop,x,.85+j*.5,z);top.rotation.y=j*.7;const fall=mesh(new T.PlaneGeometry(.26,h+2,1,1),waterfall,x-side*.85,-h/2+.3,z+1.65);fall.rotation.y=side*.1;cypress(x+.3,z,.9+j*.15);}
 // Merge static architecture by material; no per-frame procedural allocation.
 if(!software){const groups=new Map();for(const o of [...scene.children])if(o.isMesh&&o!==surface&&!arena.landmarks.includes(o)){if(!groups.has(o.material))groups.set(o.material,[]);groups.get(o.material).push(o);}for(const [material,objects] of groups){if(objects.length<2)continue;const geometries=objects.map(o=>{o.updateMatrix();const g=o.geometry.clone().applyMatrix4(o.matrix);if(g.index){const flat=g.toNonIndexed();g.dispose();return flat;}return g;});const g=keep(mergeGeometries(geometries));geometries.forEach(g=>g.dispose());objects.forEach(o=>scene.remove(o));const merged=new T.Mesh(g,material);merged.receiveShadow=true;scene.add(merged);}}
 // The approved oval is 20% broader horizontally; this never scales hero meshes.
 for(const object of scene.children){if(!object.isMesh)continue;object.position.x*=1.2;object.scale.x*=1.2;}
}
export function updateCitadelView(){ /* Low foreground and open architecture stay stable while orbiting. */ }
