// One-off, reproducible mobile geometry pass. Source GLB is kept outside the repo.
import fs from 'node:fs';
import {MeshoptSimplifier} from '../node_modules/three/examples/jsm/libs/meshopt_simplifier.module.js';
const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw Error('Usage: node tools/prepare-obsidian-model.mjs source.glb output.glb');
const file=fs.readFileSync(source),length=file.readUInt32LE(12),doc=JSON.parse(file.subarray(20,20+length)),bin=file.subarray(28+length);
const dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array};
function read(index){const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],C=types[a.componentType];const bytes=bin.subarray((v.byteOffset||0)+(a.byteOffset||0),(v.byteOffset||0)+(a.byteOffset||0)+a.count*dims[a.type]*C.BYTES_PER_ELEMENT);return new C(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));}
const p=doc.meshes[0].primitives[0],position=read(p.attributes.POSITION),uv=read(p.attributes.TEXCOORD_0),normal=read(p.attributes.NORMAL),indices=read(p.indices);
const attributes=new Float32Array(position.length/3*5);
for(let i=0;i<position.length/3;i++)attributes.set([uv[i*2],uv[i*2+1],normal[i*3],normal[i*3+1],normal[i*3+2]],i*5);
await MeshoptSimplifier.ready;
const [simplified,error]=MeshoptSimplifier.simplifyWithAttributes(indices,position,3,attributes,5,[.2,.2,.02,.02,.02],null,28000*3,.007);
const [remap,count]=MeshoptSimplifier.compactMesh(simplified),kept=new Uint32Array(count);
for(let i=0;i<remap.length;i++)if(remap[i]<count)kept[remap[i]]=i;
const originals=new Map(Object.values(p.attributes).map(i=>[i,read(i)]));
const oldViews=doc.bufferViews;doc.bufferViews=[];const chunks=[];let offset=0;
function append(data){const bytes=Buffer.from(data.buffer,data.byteOffset,data.byteLength),index=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);const pad=(4-bytes.length%4)%4;if(pad)chunks.push(Buffer.alloc(pad));offset+=bytes.length+pad;return index;}
for(const index of Object.values(p.attributes)){const a=doc.accessors[index],values=originals.get(index),dim=dims[a.type],result=new values.constructor(count*dim);for(let i=0;i<count;i++)result.set(values.subarray(kept[i]*dim,(kept[i]+1)*dim),i*dim);a.bufferView=append(result);a.byteOffset=0;a.count=count;}
const indexAccessor=doc.accessors[p.indices],smallIndices=count<65536?new Uint16Array(simplified):simplified;
indexAccessor.bufferView=append(smallIndices);indexAccessor.byteOffset=0;indexAccessor.count=smallIndices.length;indexAccessor.componentType=count<65536?5123:5125;delete indexAccessor.min;delete indexAccessor.max;
// Restore source bufferViews temporarily for non-geometry accessor reads.
const outputViews=doc.bufferViews;doc.bufferViews=oldViews;const inverse=read(doc.skins[0].inverseBindMatrices);doc.bufferViews=outputViews;
doc.accessors[doc.skins[0].inverseBindMatrices].bufferView=append(inverse);
for(const image of doc.images){const view=oldViews[image.bufferView];image.bufferView=append(bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));}
doc.buffers=[{byteLength:offset}];doc.asset.copyright='Generated with Meshy; CC BY 4.0. See obsidian-NOTICE.txt.';
doc.asset.extras={source:'Meshy 6 Lite + Smart Rig',mobileTriangles:smallIndices.length/3,simplificationError:error};
const json=Buffer.from(JSON.stringify(doc)),padding=Buffer.alloc((4-json.length%4)%4,32),body=Buffer.concat(chunks),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+padding.length+body.length,8);header.writeUInt32LE(json.length+padding.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(body.length,0);binHeader.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(destination,Buffer.concat([header,json,padding,binHeader,body]));console.log(JSON.stringify({trianglesBefore:indices.length/3,trianglesAfter:simplified.length/3,vertices:count,error}));
