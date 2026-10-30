import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Box3,Raycaster,Vector3,Scene,OrthographicCamera} from 'three';
import {battleOutcome} from '../battle-result.js';
import {generateMobileReplay,compactReplay,IDS} from '../tools/generate-mobile3d-replay.mjs';
import {heroCombatPresentation} from '../public/hero-combat-presentation.js';
execFileSync(process.execPath,['tools/build-arena-mobile3d.mjs'],{cwd:new URL('..',import.meta.url)});
const {loadCharacterKit}=await import('../.artifacts/mobile3d/characters.js');
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
async function testModelLoad(url){
 const bytes=fs.readFileSync(new URL('../prototypes/arena-mobile3d/'+url,import.meta.url)),size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+size));
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
 assert.equal(doc.skins.length,1);assert.ok(doc.skins[0].joints.length<100);assert.ok(doc.images.every(i=>i.bufferView!==undefined));
 assert.ok(doc.asset.extras.mobile3d.textures.every(t=>Math.max(...t.to)<=1024));
 doc.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+size).toString('base64');
 // Node has no image decoder. Only omit materials; geometry, skin and clips are the shipping bytes.
 doc.materials=doc.materials.map(()=>({}));delete doc.images;delete doc.textures;
 globalThis.ProgressEvent??=class{};return new GLTFLoader().parseAsync(JSON.stringify(doc),'');
}
const {Replay,attackPose,home}=await import('../.artifacts/mobile3d/replay.js');
const {FrameMetrics,bufferSize,assess}=await import('../.artifacts/mobile3d/metrics.js');
const {PreviewSoftwareRenderer}=await import('../.artifacts/mobile3d/software.js');
const {CombatDirector,formationSlots,planAction,sampleAction,pathPosition,PHASES}=await import('../.artifacts/mobile3d/director.js');
const fixture=JSON.parse(fs.readFileSync(new URL('../prototypes/arena-mobile3d/replay.json',import.meta.url)));
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;};

test('director crosses every animation phase once and preserves server snapshots at all frame rates',()=>{
 const data=deepFreeze(structuredClone(fixture));
 for(const dt of [1/120,1/60,1/30,1/15,.9,600]){
  const phases=[],impacts=[],sequence=[];let state=data.initial;
  const director=new CombatDirector(data,{phase(name,frame,index){phases.push([index,name]);sequence.push(name);},impact(frame,index){impacts.push(index);state=frame.teams;sequence.push('snapshot');}});
  director.play();let steps=0;while(!director.finished&&steps++<30000)director.advance(dt);
  assert.equal(director.finished,true);assert.deepEqual(impacts,data.frames.map((_,i)=>i));assert.deepEqual(state,data.frames.at(-1).teams);
  for(let i=0;i<data.frames.length;i++)assert.deepEqual(phases.filter(p=>p[0]===i).map(p=>p[1]),PHASES.map(p=>p.name));
  for(let i=0;i<sequence.length;i++)if(sequence[i]==='snapshot')assert.equal(sequence[i-1],'impact');
 }
 assert.deepEqual(data,fixture);
});

test('formation follows authoritative lane and slot even when team array is reordered',()=>{
 const initial=structuredClone(fixture.initial),expected=formationSlots(initial);
 for(const team of initial)team.reverse();assert.deepEqual(formationSlots(initial),expected);
 const hero=initial[0][0];hero.lane='front';const moved=formationSlots(initial).get('0:'+hero.id);assert.equal(moved.x,-1.5);
});

test('wider visual formation preserves hero scale, combat plans and target contact',()=>{
 const slots=formationSlots(fixture.initial);for(const team of fixture.initial)for(const hero of team){const side=fixture.initial.indexOf(team),p=slots.get(side+':'+hero.id);assert.ok(Math.abs(p.x)<10.5/2-.6);assert.ok(Math.abs(p.z)<10.1/2-.6);assert.ok(((Math.abs(p.x)+.46)/6.3)**2+((Math.abs(p.z)+.46)/5.05)**2<1,'whole hero contact footprint stays on oval stone');}
 const row=fixture.initial[0].filter(h=>h.lane==='back').sort((a,b)=>a.position-b.position);
 assert.ok(Math.abs(slots.get('0:'+row[1].id).z-slots.get('0:'+row[0].id).z-2.46)<1e-9);
 for(const [i,frame] of fixture.frames.entries()){const plan=planAction(frame,i?fixture.frames[i-1].teams:fixture.initial,i);if(!plan.actorKey||!plan.targetKey)continue;const from=slots.get(plan.actorKey),to=slots.get(plan.targetKey);if(plan.moving){const end=pathPosition(from,to,1);assert.ok(Math.abs(Math.hypot(end.x-to.x,end.z-to.z)-1.05)<1e-8);assert.deepEqual(pathPosition(from,to,0),from);}if(plan.kind==='cast'){assert.equal(sampleAction(plan,.5).projectileProgress,1);assert.equal(plan.duration,1.35);}if(plan.kind==='melee')assert.equal(plan.duration,1.65);}
});

test('movement contacts the chosen target, returns home and never creates a second combat calculation',()=>{
 for(const [index,frame] of fixture.frames.entries()){
  const plan=planAction(frame,index?fixture.frames[index-1].teams:fixture.initial,index);
  if(!['melee','cast'].includes(plan.kind))continue;
  assert.equal(plan.event.target,primaryActionForTest(frame).target);
  const from={x:-1,y:.12,z:3},to={x:1,y:.12,z:-2};
  const initial=sampleAction(plan,0),impact=sampleAction(plan,.5),end=sampleAction(plan,1);
  assert.deepEqual(pathPosition(from,to,initial.travel),from);
  assert.deepEqual(pathPosition(from,to,end.travel),from);
  if(plan.moving){const contact=pathPosition(from,to,impact.travel);assert.ok(Math.abs(Math.hypot(contact.x-to.x,contact.z-to.z)-1.05)<1e-8);}
  else for(const p of [0,.2,.5,.8,1])assert.equal(sampleAction(plan,p).travel,0);
  for(const p of [0,.2,.5,.8,1])assert.equal(sampleAction(plan,p,{reduced:true}).travel,0);
  if(plan.kind==='cast'){assert.equal(sampleAction(plan,.499).projectile,!!plan.targetKey);assert.equal(impact.projectile,false);}
 }
 function primaryActionForTest(frame){return planAction(frame,fixture.initial).event;}
});

test('stun skip never approaches or launches a projectile; pause and reset cannot repeat an impact',()=>{
 const h=fixture.initial[0][0],frame={teams:fixture.initial,events:[{actor:h.id,side:0,target:fixture.initial[1][0].id,action:'stun-skip'}]};
 const plan=planAction(frame,fixture.initial);assert.equal(plan.kind,'skip');
 for(const p of [0,.3,.5,.8,1]){assert.equal(sampleAction(plan,p).travel,0);assert.equal(sampleAction(plan,p).projectile,false);}
 let hits=0;const director=new CombatDirector(fixture,{impact(){hits++;}});director.play();director.advance(.1);director.pause();director.advance(1000);assert.equal(hits,0);
 director.play();director.advance(1000);assert.equal(hits,fixture.frames.length);director.advance(1000);assert.equal(hits,fixture.frames.length);
 director.reset();director.play();director.advance(1000);assert.equal(hits,fixture.frames.length*2);
});

test('offline generator invokes existing 5v5 engine with unchanged roles, lanes and commander effects',()=>{
 const full=generateMobileReplay(),data=compactReplay(full);
 assert.equal(data.source,'unchanged-live-engine');assert.deepEqual(data.initial.map(t=>t.map(h=>h.id)),IDS);
 for(const team of data.initial){assert.deepEqual(team.map(h=>h.role),['tank','tank','energy','energy','energy']);assert.deepEqual(team.map(h=>h.lane),['front','front','back','back','back']);}
 assert.equal(data.winner,battleOutcome(full.frames.at(-1).teams).winner);
 for(let i=0;i<data.frames.length;i++)assert.deepEqual(data.frames[i].teams.flat().map(h=>[h.hp,h.maxHp,h.shield]),full.frames[i].teams.flat().map(h=>[h.hp,h.maxHp,h.shield]));
 assert.ok(data.frames.some(f=>f.events.some(e=>e.action.startsWith('commander-defense'))));
 assert.ok(data.frames.some(f=>f.events.some(e=>e.action.startsWith('commander-support'))));
});

test('offline generator waits for a wounded living ally across critical-hit extremes',()=>{
 const original=Math.random;
 try{for(const value of [0,.25,.5,.75,.999999]){
  Math.random=()=>value;const data=generateMobileReplay();
  assert.ok(data.frames.length);assert.equal(data.winner,battleOutcome(data.frames.at(-1).teams).winner);
  const heals=data.frames.flatMap(f=>f.events).filter(e=>e.action==='commander-support-normal');
  assert.equal(heals.length,1);assert.ok(heals.every(e=>e.value>0));
 }}finally{Math.random=original;}
});

test('fixed replay reaches exact final HP, shields and winner at 15/30/60/120 FPS without mutating combat input',()=>{
 const input=deepFreeze(structuredClone(fixture));
 for(const fps of [15,30,60,120]){const hits=[];let state=input.initial;const replay=new Replay(input,{impact(frame,index){hits.push(index);state=frame.teams;}});replay.play();let steps=0;while(!replay.finished&&steps++<24000)replay.advance(1/fps);
  assert.equal(replay.finished,true);assert.deepEqual(hits,input.frames.map((_,i)=>i));assert.deepEqual(state,input.frames.at(-1).teams);assert.equal(battleOutcome(state).winner,input.winner);
 }
 assert.deepEqual(input,fixture);
});

test('pause/background-sized gap, resume, repeated reset and huge slow frame cannot double-apply impacts',()=>{
 let hits=0;const replay=new Replay(fixture,{impact(){hits++;}});replay.play();replay.advance(.3);replay.pause();const p=replay.progress;replay.advance(600);assert.equal(replay.progress,p);assert.equal(hits,0);
 replay.play();replay.advance(600);assert.equal(hits,fixture.frames.length);assert.equal(replay.finished,true);replay.advance(20);assert.equal(hits,fixture.frames.length);
 for(let i=0;i<5;i++){replay.reset();replay.play();replay.advance(600);}assert.equal(hits,fixture.frames.length*6);
});

test('front tank approaches and returns; ranged stays at its original rear position including low frame rates',()=>{
 assert.ok(Math.abs(home(0,0).z)<Math.abs(home(0,2).z));assert.equal(home(0,0).z,-home(1,0).z);
 assert.equal(attackPose(0,false).move,0);assert.equal(attackPose(.5,false).move,1);assert.equal(attackPose(1,false).move,0);
 for(const p of [0,.15,.3,.5,.75,1]){assert.equal(attackPose(p,true).move,0);assert.equal(attackPose(p,false,true).move,0);}
 assert.equal(attackPose(.499,true).projectile,true);assert.equal(attackPose(.5,true).projectile,false);
 for(const h of fixture.initial.flat())assert.equal(heroCombatPresentation(h).stationary,h.role==='energy');
});

test('shipping GLBs have valid skins, mobile textures, independent skeletons and bounded animated geometry',async()=>{
 const kit=await loadCharacterKit(testModelLoad),models=fixture.initial.flat().map(h=>kit.create(h.role));
 const geometry=new Set(),skeletons=new Set();let triangles=0,draws=0;
 for(const model of models){model.root.traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;geometry.add(o.geometry);}if(o.isSkinnedMesh)skeletons.add(o.skeleton);});}
 assert.equal(skeletons.size,10);assert.ok(triangles<400000);assert.ok(draws<180);
 for(const type of ['tank','mage']){
  const m=models.find(m=>m.type===type),bone=m.model.getObjectByName('mixamorigRightHand');m.root.updateMatrixWorld(true);const start=bone.getWorldPosition(new Vector3());
  for(const p of [0,.2,.3,.5,.65,.8,1]){m.motion.sample(p,{progress:p,pose:{walk:p<.28},hitAge:99});m.root.updateMatrixWorld(true);m.model.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();const size=o.boundingBox.getSize(new Vector3());assert.ok(size.toArray().every(Number.isFinite));assert.ok(size.x<3&&size.y<3&&size.z<3);}});}
  m.motion.sample(.5,{progress:.5,pose:{walk:false}});m.root.updateMatrixWorld(true);assert.ok(bone.getWorldPosition(new Vector3()).distanceTo(start)>.05);
  const hips=m.model.getObjectByName('mixamorigHips'),x=hips.position.x,z=hips.position.z;m.motion.sample(.9,{progress:.9,pose:{walk:true}});assert.ok(Math.abs(hips.position.x-x)<1e-6&&Math.abs(hips.position.z-z)<1e-6);
 }
 const resourceCount=kit.resources.size;let disposed=0;for(const r of kit.resources)r.addEventListener('dispose',()=>disposed++);kit.dispose();assert.equal(disposed,resourceCount);
});

test('software fallback projects skinned shipping geometry and never reports GPU performance',async()=>{
 let filled=0;const context={setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){filled++;},stroke(){}};
 const renderer=new PreviewSoftwareRenderer({getContext:()=>context}),kit=await loadCharacterKit(testModelLoad),scene=new Scene(),camera=new OrthographicCamera(-2,2,2,-2,.1,50);camera.position.set(2,3,5);camera.lookAt(0,1,0);scene.add(kit.create('tank').root);renderer.setSize(400,400);renderer.render(scene,camera);
 assert.ok(filled>1000);assert.equal(renderer.isSoftwareRenderer,true);assert.equal(renderer.info,undefined);kit.dispose();renderer.dispose();
});

test('mobile render buffer stays bounded on high-DPR, landscape and very large displays',()=>{
 for(const [w,h,dpr] of [[390,844,3],[844,390,3],[360,800,4],[2048,1536,2],[9000,9000,4]]){
  const mobile=bufferSize(w,h,dpr,'mobile'),balanced=bufferSize(w,h,dpr,'balanced');assert.ok(mobile.width*mobile.height<=900000);assert.ok(mobile.width<=w&&mobile.height<=h);assert.ok(balanced.width*balanced.height<=1600000);assert.ok(balanced.ratio<=1.5);
 }
});

test('frame budget flags stutter, incomplete samples and invalidated runs; bounded samples do not hide overflow',()=>{
 const metrics=new FrameMetrics(),info={render:{calls:100,triangles:10000},memory:{geometries:20,textures:0}};
 for(let i=0;i<1800;i++)metrics.add(1000/60,info);let result=metrics.result();assert.ok(Math.abs(result.fps-60)<1e-8);assert.equal(assess(result),'pass');assert.equal(assess(result,{valid:false}),'incomplete');assert.equal(assess(new FrameMetrics().result()),'incomplete');
 for(let i=0;i<200;i++)metrics.add(100,info);assert.equal(assess(metrics.result()),'review');
 metrics.reset();for(let i=0;i<18001;i++)metrics.add(16,info);assert.equal(metrics.samples.length,18000);assert.equal(assess(metrics.result()),'incomplete');
});

test('frozen replay and self-contained production-independent bundle fit the Android asset budget',()=>{
 const info=JSON.parse(fs.readFileSync(new URL('../.artifacts/mobile3d/build-info.json',import.meta.url)));
 assert.equal(info.threeVersion,'0.186.1');assert.ok(info.totals.rawBytes<15000000);assert.ok(info.totals.gzipBytes<9000000);assert.ok(info.incrementalWithoutSharedThreeGzipBytes<8500000);
 assert.ok(info.files.every(f=>!/(server|commander-live|battle-engine)/.test(f.path)));
 const built=JSON.parse(fs.readFileSync(new URL('../.artifacts/mobile3d/replay.json',import.meta.url)));assert.deepEqual(built,fixture);assert.equal(fixture.engineSourceCommit,'7714fe314ab4e923a9a5dea00d7242217d2b7fa0');
});

test('repeated scene replays keep pools bounded and teardown releases shared geometry and observers',async()=>{
 const originals=Object.fromEntries(['document','window','ResizeObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let disconnected=0,removed=0;
 const element=()=>({style:{},classList:{toggle(){}},append(){},replaceChildren(){},setAttribute(){}});
 const context={setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};
 try{
  globalThis.document={createElement:element};globalThis.window={devicePixelRatio:3};globalThis.ResizeObserver=class {observe(){}disconnect(){disconnected++;}};
  const canvas={getContext:type=>type==='webgl2'?null:context,getBoundingClientRect:()=>({width:390,height:440,left:0,top:0}),addEventListener(){},removeEventListener(){removed++;}};
  const {MobileArena}=await import('../.artifacts/mobile3d/scene.js');let picked=null;const scene=new MobileArena(canvas,element(),element(),{onSelect:key=>picked=key});scene.kit=await loadCharacterKit(testModelLoad);scene.setTeams(fixture.initial);let architectureTriangles=0;for(const o of scene.environmentObjects)o.traverse(n=>{if(n.isMesh)architectureTriangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;});assert.ok(architectureTriangles+310286+15564*2+8933*4+4726<400000,'complete architecture and all shared asset instances stay below 400k triangles');
  // Each architectural foot has a connected terrace below it, including side-camera silhouettes.
  scene.scene.updateMatrixWorld(true);const support=scene.scene.getObjectByName('connected-terrace');assert.ok(support);for(const side of [-1,1])for(const [x,z] of [[1.6,-5.95],[4.92,-7.55],[3.6,-8],[6.96,-6.5],[8.76,-4.5],[9.66,-4.05],[9.66,-2.45]]){const ray=new Raycaster(new Vector3(side*x,1,z),new Vector3(0,-1,0));assert.ok(ray.intersectObject(support).length,'architecture footprint has grounded rear/side terrace');}
  // Default is battle-focused: floor spans most of the viewport, lineup remains inside it.
  scene.resetCamera();const corners=[[-6.3,-5.05],[-6.3,5.05],[6.3,-5.05],[6.3,5.05]].map(([x,z])=>scene.project(new Vector3(x,0,z)));const coverage=(Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)))/scene.width;assert.ok(coverage>.75&&coverage<1,'combat floor dominates width without cropping');for(const m of scene.models.values()){const p=scene.project(m.base.clone().add(new Vector3(0,1.2,0)));assert.ok(p.x>0&&p.x<scene.width&&p.y>0&&p.y<scene.height,'full lineup stays inside combat framing');}
  canvas.getBoundingClientRect=()=>({width:1680,height:945,left:0,top:0});scene.resize();const crystal=scene.project(scene.landmarks[0].position),left=scene.project(new Vector3(-6.3,.13,0)),right=scene.project(new Vector3(6.3,.13,0));assert.ok(crystal.y>10&&crystal.y<945*.3,'rear crystal remains visible in approved wide composition');assert.ok((right.x-left.x)/1680>.57,'oval stage retains majority width while rear architecture is fully framed');const crest=scene.project(new Vector3(0,3.65,-5.6));assert.ok(crest.y>12,'full architectural crest has safe top margin');canvas.getBoundingClientRect=()=>({width:390,height:440,left:0,top:0});scene.resize();
  scene.angle=2;scene.controls.yaw=.4;scene.controls.zoom=1.3;scene.focus([...scene.models.keys()][0]);assert.equal(scene.angle,0);assert.equal(scene.controls.yaw,0);assert.equal(scene.controls.zoom,1);scene.focus(null);assert.equal(scene.angle,2);assert.equal(scene.controls.yaw,.4);assert.equal(scene.controls.zoom,1.3);
  // Real GLB picking uses the relocated model's world position; hidden focus peers cannot steal a tap.
  for(const m of [...scene.models.values()].slice(0,2)){assert.deepEqual(m.root.scale.toArray(),[1,1,1]);scene.focus(m.key);scene.render(0,0);scene.scene.updateMatrixWorld(true);picked=null;const center=scene.project(m.base.clone().add(new Vector3(0,1.15,0)));for(const dy of [0,-8,8,-16,16]){scene.click({clientX:center.x,clientY:center.y+dy});if(picked)break;}assert.equal(picked,m.key);scene.focus(null);}
  const resources=scene.resources.size;const geometryCount=scene.kit.resources.size;
  for(let i=0;i<3;i++){scene.reset(fixture.initial);for(const frame of fixture.frames){scene.start(frame);scene.impact(frame);scene.end();}}
  // Inspectors expose copies only; final death and impact effects fully settle in one bounded render.
  const diagnostics=scene.inspectCombat(),first=[...scene.models.values()][0];diagnostics.units[0].hp=-999;diagnostics.units[0].position[0]=999;assert.notEqual(first.hero.hp,-999);assert.notEqual(first.root.position.x,999);
  scene.render(1.2,1);assert.ok([...scene.models.values()].filter(m=>m.dead).every(m=>!m.body.visible));assert.equal(scene.inspectCombat().effects.floats,0);assert.equal(scene.inspectCombat().effects.pulses,0);
  scene.reset(fixture.initial);assert.ok(scene.inspectCombat().units.every(m=>m.hp>0&&!m.dead&&m.visible));
  assert.equal(scene.models.size,10);assert.equal(scene.floatPool.length,16);assert.equal(scene.pulses.length,12);assert.equal(scene.resources.size,resources);assert.equal(scene.kit.resources.size,geometryCount);
  let disposed=0;for(const geometry of scene.kit.resources)geometry.addEventListener('dispose',()=>disposed++);scene.dispose();assert.equal(disposed,geometryCount);assert.equal(disconnected,1);assert.equal(removed,7);assert.equal(scene.models.size,0);
 }finally{for(const [key,value] of Object.entries(originals)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});

test('model loading errors identify the missing asset instead of silently substituting a placeholder',async()=>{
 await assert.rejects(()=>loadCharacterKit(async()=>{throw Error('404');}),/obsidyen.glb yüklenemedi/);
});

test('shipping Meshy guardian is a genuine static textured GLB within combined scene budget',async()=>{
 const {loadArenaAssets}=await import('../.artifacts/mobile3d/arena-assets.js');const bytes=fs.readFileSync(new URL('../prototypes/arena-mobile3d/assets/arena-guardian.glb',import.meta.url)),n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n));assert.equal(bytes.readUInt32LE(8),bytes.length);assert.equal(doc.skins?.length||0,0);assert.equal(doc.animations?.length||0,0);assert.equal(doc.materials.length,1);assert.equal(doc.images.length,3);assert.ok(doc.images.every(i=>i.bufferView!==undefined));assert.ok(doc.asset.extras.mobile3d.textures.every(t=>Math.max(...t.to)<=1024));assert.ok(bytes.length<1800000);
 doc.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+n).toString('base64');doc.materials=doc.materials.map(()=>({}));delete doc.images;delete doc.textures;globalThis.ProgressEvent??=class{};const kit=await loadArenaAssets(()=>new GLTFLoader().parseAsync(JSON.stringify(doc),''));assert.equal(kit.diagnostics.triangles,15564);assert.equal(kit.diagnostics.meshes,1);assert.ok(310286+40000+kit.diagnostics.triangles*2<400000,'ten real heroes + conservative environment budget + two guardians');const a=kit.create(),b=kit.create();assert.notEqual(a,b);const bounds=new Box3().setFromObject(a);assert.ok(bounds.getSize(new Vector3()).y<=2.50001);kit.dispose();
});


test('shipping Meshy facade remains a single shared static asset within the full arena budget',async()=>{
 const {loadTribuneFacade,attachTribuneFacades}=await import('../.artifacts/mobile3d/arena-assets.js');const bytes=fs.readFileSync(new URL('../prototypes/arena-mobile3d/assets/arena-tribune-facade.glb',import.meta.url)),n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n));assert.equal(bytes.readUInt32LE(8),bytes.length);assert.equal(doc.skins?.length||0,0);assert.equal(doc.animations?.length||0,0);assert.equal(doc.materials.length,1);assert.equal(doc.images.length,3);assert.ok(doc.asset.extras.mobile3d.textures.every(t=>Math.max(...t.to)<=512));assert.ok(bytes.length<800000);
 doc.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+n).toString('base64');doc.materials=doc.materials.map(()=>({}));delete doc.images;delete doc.textures;globalThis.ProgressEvent??=class{};const kit=await loadTribuneFacade(()=>new GLTFLoader().parseAsync(JSON.stringify(doc),''));assert.equal(kit.diagnostics.triangles,8933);assert.ok(310286+12000+15564*2+8933*4<400000);const T=await import('three'),arena={scene:new T.Scene(),environmentObjects:[]};attachTribuneFacades(arena,kit);assert.equal(kit.instances.length,4);for(const root of kit.instances){const box=new Box3().setFromObject(root);assert.ok(box.max.y<1.60);const center=box.getCenter(new Vector3());assert.ok(Math.abs(center.x)>5.25||Math.abs(center.z)>5.05,'facades stay outside the combat floor');}kit.dispose();assert.equal(arena.scene.children.length,0);
});

test('carved ivory arch ships real open static geometry within mobile bounds',async()=>{
 const {loadCrystalArch,attachCrystalArch}=await import('../.artifacts/mobile3d/arena-assets.js');const bytes=fs.readFileSync(new URL('../prototypes/arena-mobile3d/assets/arena-crystal-arch.glb',import.meta.url)),n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n));assert.ok(bytes.length<800000);assert.equal(doc.skins?.length||0,0);assert.equal(doc.animations?.length||0,0);assert.equal(doc.materials.length,1);assert.equal(doc.images.length,3);assert.ok(doc.asset.extras.mobile3d.textures.every(t=>Math.max(...t.to)<=1024));doc.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+n).toString('base64');doc.materials=doc.materials.map(()=>({}));delete doc.images;delete doc.textures;globalThis.ProgressEvent??=class{};const kit=await loadCrystalArch(()=>new GLTFLoader().parseAsync(JSON.stringify(doc),''));assert.equal(kit.diagnostics.triangles,4726);const T=await import('three'),arena={scene:new T.Scene(),environmentObjects:[],renderer:{isSoftwareRenderer:false}};attachCrystalArch(arena,kit);const box=new Box3().setFromObject(kit.instances[0]);assert.ok(box.max.y<=3.62001);assert.ok(box.getSize(new Vector3()).x<=3.40001);assert.ok(box.min.z< -5.7);kit.dispose();assert.equal(arena.scene.children.length,0);
});
