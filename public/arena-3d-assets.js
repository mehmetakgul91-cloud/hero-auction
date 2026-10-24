import {GLTFLoader} from '/vendor/three-0.186.1/addons/loaders/GLTFLoader.js';
import {ObsidianMotion,OBSIDIAN_MODEL_URL} from './arena-3d-rig.js';

export async function loadObsidian(){
 const gltf=await new GLTFLoader().loadAsync(OBSIDIAN_MODEL_URL),root=gltf.scene;
 root.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;object.frustumCulled=false;if(object.material){object.material.roughness=Math.max(.65,object.material.roughness);object.material.metalness=Math.min(.55,object.material.metalness);}}});
 const motion=new ObsidianMotion(root);
 return {root,motion};
}

export async function attachObsidian(model){
 const asset=await loadObsidian();
 model.armor.visible=false;model.body.add(asset.root);asset.root.scale.setScalar(1.12);
 asset.root.traverse(object=>{object.userData.heroKey=model.key;});
 model.rig=asset.motion;model.assetRoot=asset.root;
 return asset;
}
