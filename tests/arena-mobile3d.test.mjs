import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Box3,Vector3,Scene,OrthographicCamera} from 'three';
import {battleOutcome} from '../battle-result.js';
import {generateMobileReplay,compactReplay,IDS} from '../tools/generate-mobile3d-replay.mjs';
import {heroCombatPresentation} from '../public/hero-combat-presentation.js';
execFileSync(process.execPath,['tools/build-arena-mobile3d.mjs'],{cwd:new URL('..',import.meta.url)});
const {createModelKit}=await import('../.artifacts/mobile3d/models.js');
const {Replay,attackPose,home}=await import('../.artifacts/mobile3d/replay.js');
const {FrameMetrics,bufferSize,assess}=await import('../.artifacts/mobile3d/metrics.js');
const {PreviewSoftwareRenderer}=await import('../.artifacts/mobile3d/software.js');
const fixture=JSON.parse(fs.readFileSync(new URL('../prototypes/arena-mobile3d/replay.json',import.meta.url)));
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;};

test('offline generator invokes existing 5v5 engine with unchanged roles, lanes and commander effects',()=>{
 const full=generateMobileReplay(),data=compactReplay(full);
 assert.equal(data.source,'unchanged-live-engine');assert.deepEqual(data.initial.map(t=>t.map(h=>h.id)),IDS);
 for(const team of data.initial){assert.deepEqual(team.map(h=>h.role),['tank','tank','energy','energy','energy']);assert.deepEqual(team.map(h=>h.lane),['front','front','back','back','back']);}
 assert.equal(data.winner,battleOutcome(full.frames.at(-1).teams).winner);
 for(let i=0;i<data.frames.length;i++)assert.deepEqual(data.frames[i].teams.flat().map(h=>[h.hp,h.maxHp,h.shield]),full.frames[i].teams.flat().map(h=>[h.hp,h.maxHp,h.shield]));
 assert.ok(data.frames.some(f=>f.events.some(e=>e.action.startsWith('commander-defense'))));
 assert.ok(data.frames.some(f=>f.events.some(e=>e.action.startsWith('commander-support'))));
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

test('two full-body models have articulated limbs, distinct silhouettes and shared bounded geometry',()=>{
 const kit=createModelKit(),geometries=new Set();let triangles=0,meshes=0;
 for(const [i,hero] of fixture.initial.flat().entries()){
  const model=kit.create(hero.role),bounds=new Box3().setFromObject(model.body),size=bounds.getSize(new Vector3());assert.ok(size.y>1.6&&size.y<2.6);assert.ok(size.x<1.8);assert.equal(model.arms.length,2);assert.equal(model.legs.length,2);
  model.root.traverse(o=>{if(o.isMesh){meshes++;geometries.add(o.geometry);triangles+=o.geometry.attributes.position.count/3;assert.equal(o.material,kit.material);assert.ok(o.geometry.attributes.color);}});
  const before=new Box3().setFromObject(model.body);model.arms[1].rotation.x=-1.5;assert.notDeepEqual(new Box3().setFromObject(model.body),before);
 }
 assert.equal(meshes,60);assert.ok(triangles<15000);assert.ok(geometries.size<=10);
 const size=kit.geometries.size;for(let i=0;i<100;i++)kit.create(i%2?'tank':'energy');assert.equal(kit.geometries.size,size);kit.dispose();
});

test('visual-only software fallback renders vertex-coloured full models without claiming GPU metrics',()=>{
 let filled=0;const colors=new Set();const context={setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){filled++;colors.add(this.fillStyle);},stroke(){}};
 const renderer=new PreviewSoftwareRenderer({getContext:()=>context}),kit=createModelKit(),scene=new Scene(),camera=new OrthographicCamera(-2,2,2,-2,.1,50);camera.position.set(2,3,5);camera.lookAt(0,1,0);scene.add(kit.create('tank').root);renderer.setSize(400,400);renderer.render(scene,camera);
 assert.ok(filled>100);assert.ok(colors.size>8);assert.equal(renderer.isSoftwareRenderer,true);assert.equal(renderer.info,undefined);kit.dispose();renderer.dispose();
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
 assert.equal(info.threeVersion,'0.186.1');assert.ok(info.totals.rawBytes<3000000);assert.ok(info.totals.gzipBytes<650000);assert.ok(info.incrementalWithoutSharedThreeGzipBytes<100000);
 assert.ok(info.files.every(f=>!/(server|commander-live|battle-engine|\.glb|\.png|\.jpg)/.test(f.path)));
 const built=JSON.parse(fs.readFileSync(new URL('../.artifacts/mobile3d/replay.json',import.meta.url)));assert.deepEqual(built,fixture);assert.equal(fixture.engineSourceCommit,'7714fe314ab4e923a9a5dea00d7242217d2b7fa0');
});

test('repeated scene replays keep pools bounded and teardown releases shared geometry and observers',async()=>{
 const originals=Object.fromEntries(['document','window','ResizeObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let disconnected=0,removed=0;
 const element=()=>({style:{},classList:{toggle(){}},append(){},replaceChildren(){},setAttribute(){}});
 const context={setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};
 try{
  globalThis.document={createElement:element};globalThis.window={devicePixelRatio:3};globalThis.ResizeObserver=class {observe(){}disconnect(){disconnected++;}};
  const canvas={getContext:type=>type==='webgl2'?null:context,getBoundingClientRect:()=>({width:390,height:440,left:0,top:0}),addEventListener(){},removeEventListener(){removed++;}};
  const {MobileArena}=await import('../.artifacts/mobile3d/scene.js');const scene=new MobileArena(canvas,element(),element());scene.setTeams(fixture.initial);
  const resources=scene.resources.size;const geometryCount=scene.kit.geometries.size;
  for(let i=0;i<20;i++){scene.reset(fixture.initial);for(const frame of fixture.frames){scene.start(frame);scene.impact(frame);scene.end();}}
  assert.equal(scene.models.size,10);assert.equal(scene.floatPool.length,16);assert.equal(scene.pulses.length,12);assert.equal(scene.resources.size,resources);assert.equal(scene.kit.geometries.size,geometryCount);
  let disposed=0;for(const geometry of scene.kit.geometries)geometry.addEventListener('dispose',()=>disposed++);scene.dispose();assert.equal(disposed,geometryCount);assert.equal(disconnected,1);assert.equal(removed,1);assert.equal(scene.models.size,0);
 }finally{for(const [key,value] of Object.entries(originals)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
