import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import manifest from './image-asset-manifest.json' with {type:'json'};

// Verify the allowlist once at startup, not on every image request. A missing,
// modified or incorrectly named derivative must never receive immutable caching.
export function verifiedPortraitPaths(assets,readAsset=relative=>readFileSync(new URL('./public/'+relative,import.meta.url))){
 const verified=new Set();
 for(const asset of assets){
  if(!asset||typeof asset.url!=='string'||typeof asset.sha256!=='string')continue;
  const match=/^\/images\/optimized\/(?:hero-0[1-9]|commander-(?:attack|defense|magic|support))\.([a-f0-9]{16})\.webp$/.exec(asset.url);
  if(!match||!/^[a-f0-9]{64}$/.test(asset.sha256)||match[1]!==asset.sha256.slice(0,16))continue;
  try{
   const relative=asset.url.slice(1),bytes=readAsset(relative);
   if(bytes.length===asset.bytes&&createHash('sha256').update(bytes).digest('hex')===asset.sha256)verified.add(relative);
  }catch{/* Keep the default no-store policy if a deployment artifact is missing. */}
 }
 return verified;
}

export const versionedPortraitCachePaths=verifiedPortraitPaths(manifest.assets);
