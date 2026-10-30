import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const target=path.resolve(process.argv[2]||path.join(root,'.artifacts/mobile3d'));
// The caller owns the output directory; do not remove unrelated files.
fs.mkdirSync(target,{recursive:true});
for(const file of fs.readdirSync(path.join(root,'prototypes/arena-mobile3d')))fs.cpSync(path.join(root,'prototypes/arena-mobile3d',file),path.join(target,file),{recursive:true});
for(const sub of ['vendor','shared'])fs.mkdirSync(path.join(target,sub),{recursive:true});
for(const file of ['three.module.js','three.core.js'])fs.copyFileSync(path.join(root,'node_modules/three/build',file),path.join(target,'vendor',file));
fs.copyFileSync(path.join(root,'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'),path.join(target,'vendor/BufferGeometryUtils.js'));
fs.copyFileSync(path.join(root,'node_modules/three/LICENSE'),path.join(target,'vendor/THREE-LICENSE.txt'));
for(const file of ['loaders/GLTFLoader.js','utils/BufferGeometryUtils.js','utils/SkeletonUtils.js','environments/RoomEnvironment.js']){const dest=path.join(target,'vendor/addons',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,'node_modules/three/examples/jsm',file),dest);}
for(const file of ['arena-3d-timeline.js','hero-combat-presentation.js','arena-3d-software.js'])fs.copyFileSync(path.join(root,'public',file),path.join(target,'shared',file));
const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name!=='build-info.json'){const bytes=fs.readFileSync(full);files.push({path:path.relative(target,full),rawBytes:bytes.length,gzipBytes:gzipSync(bytes,{level:9}).length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}walk(target);
const totals=files.reduce((sum,f)=>({rawBytes:sum.rawBytes+f.rawBytes,gzipBytes:sum.gzipBytes+f.gzipBytes}),{rawBytes:0,gzipBytes:0});
const vendor=files.filter(f=>f.path.startsWith('vendor/')).reduce((sum,f)=>sum+f.gzipBytes,0);
const info={schema:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'}).trim(),threeVersion:JSON.parse(fs.readFileSync(path.join(root,'node_modules/three/package.json'))).version,modelAssets:'Two skinned Meshy heroes plus one original static Meshy arena guardian, shared by two instances; embedded mobile textures',totals,incrementalWithoutSharedThreeGzipBytes:totals.gzipBytes-vendor,limits:{rawBytes:15000000,gzipBytes:9000000},measurementNote:'Sum of per-file gzip level 9 sizes; excludes this metadata. Not an APK/AAB, HTTP transfer or installed-size measurement.',files};
fs.writeFileSync(path.join(target,'build-info.json'),JSON.stringify(info,null,2));
if(totals.rawBytes>info.limits.rawBytes||totals.gzipBytes>info.limits.gzipBytes)throw Error('Prototype size budget exceeded');
console.log(JSON.stringify({target,totals,incrementalWithoutSharedThreeGzipBytes:info.incrementalWithoutSharedThreeGzipBytes,threeVersion:info.threeVersion}));
