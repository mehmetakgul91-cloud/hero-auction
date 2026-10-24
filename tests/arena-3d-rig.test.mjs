import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Vector3,Box3,Scene,OrthographicCamera} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ObsidianMotion,arenaRigState} from '../public/arena-3d-rig.js';
import {SoftwareArenaRenderer} from '../public/arena-3d-software.js';

async function loadGeometry(){
 const bytes=fs.readFileSync(new URL('../public/models/obsidian-v1.glb',import.meta.url)),length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length));
 assert.equal(bytes.readUInt32LE(8),bytes.length);
 assert.ok(bytes.length<2_000_000,'mobile model must remain under 2 MB');
 assert.equal(doc.skins[0].joints.length,52);
 assert.equal(doc.images.length,3,'base color and PBR textures are embedded');
 for(const view of doc.bufferViews)assert.ok(view.byteOffset+view.byteLength<=doc.buffers[0].byteLength);
 // Node has no image decoder. Keep the real geometry, skeleton and bind matrices.
 doc.images=[];doc.textures=[];doc.materials=[{}];doc.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+length).toString('base64');
 globalThis.ProgressEvent??=class{constructor(type,props){Object.assign(this,props);}};
 const {scene}=await new GLTFLoader().parseAsync(JSON.stringify(doc),'');
 let mesh;scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
 return {root:scene,mesh,motion:new ObsidianMotion(scene)};
}
function sample(root,mesh){root.updateMatrixWorld(true);mesh.skeleton.update();const points=[],v=new Vector3();for(let i=0;i<mesh.geometry.attributes.position.count;i+=17){mesh.getVertexPosition(i,v);assert.ok(v.toArray().every(Number.isFinite));points.push(v.clone());}return points;}

test('optimized real model skins without explosions and recovers its rest pose',async()=>{
 const {root,mesh,motion}=await loadGeometry();assert.equal(mesh.geometry.index.count/3,28000);
 motion.apply({time:0});const rest=sample(root,mesh);
 for(const mode of ['walk','attack','hit','death','victory']){
  motion.apply({mode,time:.2,progress:.34});const posed=sample(root,mesh),bounds=new Box3().setFromPoints(posed),size=bounds.getSize(new Vector3());
  assert.ok(size.length()<4,'animated surface stays near its skeleton');
  assert.ok(posed.some((v,i)=>v.distanceTo(rest[i])>.03),mode+' must articulate actual vertices');
 }
 for(let i=0;i<100;i++)motion.apply({mode:'attack',progress:i/100,time:i/100});
 motion.apply({time:0});sample(root,mesh).forEach((v,i)=>assert.ok(v.distanceTo(rest[i])<1e-6,'reset has no accumulated joint drift'));
});

test('weapon arm winds up and comes down at the authoritative impact fraction',async()=>{
 const {root,motion}=await loadGeometry(),hand=root.getObjectByName('Bone_035');
 const handAt=p=>{motion.apply({mode:'attack',progress:p,time:0});root.updateMatrixWorld(true);return hand.getWorldPosition(new Vector3());};
 const rest=handAt(0),windup=handAt(.34),hit=handAt(.5);
 assert.ok(windup.y>rest.y+.35,'weapon hand rises above its rest position');
 assert.ok(hit.y<windup.y-.2,'weapon comes down at impact');
 const model={dead:false},active={actor:model,target:{},stationary:false};
 assert.equal(arenaRigState({active,model,time:1,progress:.5}).mode,'attack');
 assert.equal(arenaRigState({active,model,time:1,progress:.2}).locomotion,true);
 assert.equal(arenaRigState({active:{...active,stationary:true},model,time:1,progress:.5}).mode,'idle');
});

test('WebGL-free renderer follows skinned limb movement rather than a static mesh',async()=>{
 const {root,motion}=await loadGeometry(),scene=new Scene(),camera=new OrthographicCamera(-1.3,1.3,1.3,-1.3,.1,10);scene.add(root);camera.position.set(2,2,4);camera.lookAt(0,.8,0);
 const context={setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){},fill(){}};
 const renderer=new SoftwareArenaRenderer({getContext:()=>context});renderer.setSize(320,440);renderer.render(scene,camera);
 const before=renderer.faces.map(f=>f.slice(1,7));motion.apply({mode:'attack',progress:.34,time:0});renderer.render(scene,camera);
 assert.ok(renderer.faces.length>500);assert.notDeepEqual(renderer.faces.map(f=>f.slice(1,7)),before);
});
