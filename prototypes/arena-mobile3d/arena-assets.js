import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Original Meshy-generated static props; instances share geometry, materials and textures.
// Character rigs and authoritative combat state are never touched here.
export const GUARDIAN_FILE='arena-guardian.glb';
export const FACADE_FILE='arena-tribune-facade.glb';
export function inspectArenaAsset(source,file=GUARDIAN_FILE,instances=2){
 let meshes=0,textured=0,triangles=0;const materials=new Set();
 source.scene.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;const list=Array.isArray(o.material)?o.material:[o.material];list.forEach(m=>materials.add(m));if(list.every(m=>m.map?.image?.width>0&&m.map?.image?.height>0&&m.map.colorSpace===T.SRGBColorSpace))textured++;});
 return {file,meshes,textured,triangles,materials:materials.size,instances};
}
const defaultLoad=url=>new GLTFLoader().loadAsync(url);
export function loadArenaAssets(load=defaultLoad){return loadStaticAsset(load,{file:GUARDIAN_FILE,width:1.8,height:2.5,depth:1.8,maxTriangles:30000,instances:2,name:'meshy-arena-guardian'});}
export function loadTribuneFacade(load=defaultLoad){return loadStaticAsset(load,{file:FACADE_FILE,width:5.4,height:1.65,depth:2.7,maxTriangles:11000,instances:4,name:'meshy-ivory-tribune'});}
async function loadStaticAsset(load,config){
 const source=await load('./assets/'+config.file).catch(()=>{throw Error(config.file+' yüklenemedi. Meshy arena varlığı yerine yer tutucu gösterilmiyor; yeniden yükle.');});
 const resources=new Set(),instances=[];let skinned=false;source.scene.updateMatrixWorld(true);
 source.scene.traverse(o=>{if(!o.isMesh)return;skinned ||= !!o.isSkinnedMesh;resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});
 const fail=message=>{resources.forEach(r=>r.dispose());throw Error(config.file+' '+message);};
 if(skinned)fail('statik olmalı.');
 const bounds=new T.Box3().setFromObject(source.scene),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 if(size.toArray().some(n=>!Number.isFinite(n)||n<=0))fail('ölçüleri geçersiz.');
 const scale=Math.min(config.height/size.y,config.width/size.x,config.depth/size.z);
 const diagnostics=inspectArenaAsset(source,config.file,config.instances);if(diagnostics.triangles>config.maxTriangles)fail('mobil üçgen bütçesini aşıyor.');
 return {source,resources,instances,diagnostics,create(){const root=new T.Group(),offset=new T.Group(),model=source.scene.clone(true);root.name=config.name;root.userData.arenaAsset=config.file;offset.add(model);offset.position.set(-center.x,-bounds.min.y,-center.z);root.add(offset);root.scale.setScalar(scale);instances.push(root);return root;},dispose(){instances.forEach(root=>root.removeFromParent());resources.forEach(r=>r.dispose());}};
}
export function attachArenaGuardians(arena,kit){
 for(const side of [-1,1]){const root=kit.create();root.position.set(side*5.7,.46,4.15);root.rotation.y=-side*.22;arena.scene.add(root);arena.environmentObjects.push(root);attachShadowProxy(arena,root);}
}

export const TRIBUNE_FACADE_PLACEMENTS=[.12,.37,.63,.88].map(f=>{const a=f*Math.PI;return {x:Math.cos(a)*7.3*1.2,y:-.08,z:-Math.sin(a)*7.3,yaw:a-Math.PI/2};});
export function attachTribuneFacades(arena,kit){
 for(const p of TRIBUNE_FACADE_PLACEMENTS){const root=kit.create();root.position.set(p.x,p.y,p.z);root.rotation.y=p.yaw;arena.scene.add(root);arena.environmentObjects.push(root);attachShadowProxy(arena,root);}
}

// Low-poly occluders keep the mobile shadow pass bounded; detailed GLBs are not drawn twice.
function attachShadowProxy(arena,root){
 if(!arena.renderer||arena.renderer.isSoftwareRenderer)return;root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
 const material=arena.shadowProxyMaterial ||= arena.keep(new T.MeshBasicMaterial({colorWrite:false,depthWrite:false}));const proxy=new T.Mesh(arena.keep(new T.BoxGeometry(size.x*.88,size.y*.92,size.z*.82)),material);proxy.position.copy(center);proxy.castShadow=true;arena.scene.add(proxy);arena.environmentObjects.push(proxy);
}
