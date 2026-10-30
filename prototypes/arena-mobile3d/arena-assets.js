import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// One original Meshy-generated static prop, shared by two foreground instances.
// Character rigs and authoritative combat state are never touched here.
export const GUARDIAN_FILE='arena-guardian.glb';
export function inspectArenaAsset(source){
 let meshes=0,textured=0,triangles=0;const materials=new Set();
 source.scene.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;const list=Array.isArray(o.material)?o.material:[o.material];list.forEach(m=>materials.add(m));if(list.every(m=>m.map?.image?.width>0&&m.map?.image?.height>0&&m.map.colorSpace===T.SRGBColorSpace))textured++;});
 return {file:GUARDIAN_FILE,meshes,textured,triangles,materials:materials.size,instances:2};
}
export async function loadArenaAssets(load=url=>new GLTFLoader().loadAsync(url)){
 const source=await load('./assets/'+GUARDIAN_FILE).catch(()=>{throw Error(GUARDIAN_FILE+' yüklenemedi. Meshy arena varlığı yerine yer tutucu gösterilmiyor; yeniden yükle.');});
 const resources=new Set(),instances=[];source.scene.updateMatrixWorld(true);
 source.scene.traverse(o=>{if(!o.isMesh)return;if(o.isSkinnedMesh)throw Error('Arena muhafızı statik olmalı.');resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});
 const bounds=new T.Box3().setFromObject(source.scene),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 if(size.toArray().some(n=>!Number.isFinite(n)||n<=0))throw Error('Arena muhafızı ölçüleri geçersiz.');
 const scale=Math.min(2.5/size.y,1.8/size.x,1.8/size.z);
 const diagnostics=inspectArenaAsset(source);if(diagnostics.triangles>30000){resources.forEach(r=>r.dispose());throw Error('Arena muhafızı mobil üçgen bütçesini aşıyor.');}
 return {source,resources,instances,diagnostics,create(){const root=new T.Group(),offset=new T.Group(),model=source.scene.clone(true);root.name='meshy-arena-guardian';root.userData.arenaAsset=GUARDIAN_FILE;offset.add(model);offset.position.set(-center.x,-bounds.min.y,-center.z);root.add(offset);root.scale.setScalar(scale);instances.push(root);return root;},dispose(){instances.forEach(root=>root.removeFromParent());resources.forEach(r=>r.dispose());}};
}
export function attachArenaGuardians(arena,kit){
 for(const side of [-1,1]){const root=kit.create();root.position.set(side*4.8,.08,5.25);root.rotation.y=-side*.22;arena.scene.add(root);arena.environmentObjects.push(root);}
}
