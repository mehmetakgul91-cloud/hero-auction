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
 const ring=(rx,rz,width,y,material)=>{const g=new T.RingGeometry(1-width/rx,1,128),m=mesh(g,material,0,y,0);m.rotation.x=-Math.PI/2;m.scale.set(rx,rz,1);return m;};
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
  mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),24,.018,4,false),bronze);
 }
 // Calm, subtle central rosette. This is ornament, not gameplay grid/cells.
 ring(1.15,1.08,.014,.145,bronze);
 for(let k=0;k<4;k++){const a=k*Math.PI/2,points=[];for(let j=0;j<=20;j++){const t=j/20*Math.PI*2,r=.38*(1-Math.cos(t));points.push(new T.Vector3(Math.sin(t+a)*r,.146,Math.cos(t+a)*r));}mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),24,.011,3,true),bronze);}
 // Low front balustrade leaves every fighter readable. Ivory caps and teal insets share the scene palette.
 for(let i=0;i<15;i++){
  const a=(-.48+i/14*.96)*Math.PI,x=Math.sin(a)*6.42,z=Math.cos(a)*5.94;
  if(Math.abs(x)>4.2&&z>3.6)continue;
  const post=block(x,.22,z,.16,.68,.2,pale);post.rotation.y=a;
  if(i<14){const b=(-.48+(i+.5)/14*.96)*Math.PI,xx=Math.sin(b)*6.42,zz=Math.cos(b)*5.94;const panel=block(xx,.16,zz,1.22,.36,.12,teal);panel.rotation.y=b;const cap=block(xx,.38,zz,1.3,.09,.24,pale);cap.rotation.y=b;}
 }
 // Real sculpture support plinths: originals remain untouched; shared models attach later.
 for(const x of [-4.75,4.75]){block(x,.05,4.15,1.65,.55,1.5,ivory);block(x,.37,4.15,1.8,.13,1.65,pale);block(x,.445,4.15,1.68,.025,1.53,bronze);}
 // Open rear arch with carved layered tracery; no massive dark gate hiding the sky.
 const archZ=-5.6;
 for(const x of [-1.85,1.85]){column(x,archZ,1.7);block(x,.85,archZ,.43,1.7,.52,ivory);block(x,1.73,archZ,.65,.16,.7,pale);}
 const arch=(outer,inner,y,z,material)=>{const s=new T.Shape();s.moveTo(-outer,0);s.quadraticCurveTo(-outer*.92,1.8,0,3);s.quadraticCurveTo(outer*.92,1.8,outer,0);s.lineTo(inner,0);s.quadraticCurveTo(inner*.8,1.6,0,2.55);s.quadraticCurveTo(-inner*.8,1.6,-inner,0);s.closePath();mesh(new T.ExtrudeGeometry(s,{depth:.35,bevelEnabled:true,bevelSize:.06,bevelThickness:.04,bevelSegments:2,steps:1,curveSegments:20}),material,0,y,z);};
 arch(2.15,1.72,.9,archZ,ivory);arch(2.23,2.12,.9,archZ-.03,bronze);
 const gem=mesh(new T.OctahedronGeometry(.55,0),crystal,0,1.8,archZ+.3);gem.scale.set(.65,1.15,.65);arena.landmarks.push(gem);
 const bowl=mesh(new T.CylinderGeometry(.8,.52,.22,32),ivory,0,.3,archZ+.4);ring(.72,.72,.08,.42,bronze).position.z=archZ+.4;mesh(new T.CircleGeometry(.61,32),crystal,0,.43,archZ+.4).rotation.x=-Math.PI/2;
 // Two tall turquoise banners frame the opening, not the fight.
 for(const side of [-1,1]){const x=side*4.1,z=-7.55;column(x,z,4.9);const cloth=mesh(new T.PlaneGeometry(.9,2.75,1,1),teal,x,3.43,z+.22);const edge=block(x,4.85,z+.24,1.1,.07,.08,bronze);for(const dx of [-.39,.39])block(x+dx,3.44,z+.26,.018,2.7,.025,bronze);}
 // Small grouped planting gives an organic silhouette, deliberately low-poly and bounded.
 const leaf=arena.mat(0x537653,{roughness:1}),lightLeaf=arena.mat(0x80905a,{roughness:1});
 for(const side of [-1,1])for(const z of [-6.3,-3.5,1.7]){const x=side*(z<-5?5.4:6.75);column(x,z,1);mesh(new T.CylinderGeometry(.42,.28,.28,12),ivory,x,1.14,z);for(let j=0;j<7;j++){const a=j*2.399,r=.2+(j%2)*.13,m=mesh(new T.IcosahedronGeometry(.25,0),j%2?leaf:lightLeaf,x+Math.cos(a)*r,1.35+(j%3)*.12,z+Math.sin(a)*r);m.scale.y=.65;}}
 // Distant desaturated mountain silhouettes are atmospheric backdrop, not a fake rendered arena.
 for(let layer=0;layer<3;layer++){
  const points=[],s=new T.Shape();s.moveTo(-40,-10);for(let i=0;i<=24;i++){const x=-40+i*80/24,y=1.8+layer*.7+Math.sin(i*1.7+layer)*1.2+Math.sin(i*.43)*1.6;points.push([x,y]);}points.forEach(([x,y])=>s.lineTo(x,y));s.lineTo(40,-10);s.closePath();mesh(new T.ShapeGeometry(s),keep(new T.MeshBasicMaterial({color:[0xa9c5ce,0x91b1bb,0x7f9eaa][layer],side:T.DoubleSide})),0,0,-28+layer*4);
 }
 // Merge static architecture by material; no per-frame procedural allocation.
 if(!software){const groups=new Map();for(const o of [...scene.children])if(o.isMesh&&o!==surface&&!arena.landmarks.includes(o)){if(!groups.has(o.material))groups.set(o.material,[]);groups.get(o.material).push(o);}for(const [material,objects] of groups){if(objects.length<2)continue;const geometries=objects.map(o=>{o.updateMatrix();const g=o.geometry.clone().applyMatrix4(o.matrix);if(g.index){const flat=g.toNonIndexed();g.dispose();return flat;}return g;});const g=keep(mergeGeometries(geometries));geometries.forEach(g=>g.dispose());objects.forEach(o=>scene.remove(o));const merged=new T.Mesh(g,material);merged.receiveShadow=true;scene.add(merged);}}
 // The approved oval is 20% broader horizontally; this never scales hero meshes.
 for(const object of scene.children){if(!object.isMesh)continue;object.position.x*=1.2;object.scale.x*=1.2;}
}
export function updateCitadelView(){ /* Low foreground and open architecture stay stable while orbiting. */ }
