// CI-only isolated static fixture. No app server, accounts, databases or public preview.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve('.artifacts/mobile3d'),out=path.resolve('.artifacts/mobile3d-browser');
await fs.mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.css':'text/css','.jpg':'image/jpeg','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file!==root&&!file.startsWith(root+path.sep))throw Error('path');const target=file===root?path.join(root,'index.html'):file;res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.end(await fs.readFile(target));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const reducedMotion of ['no-preference','reduce']){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,reducedMotion});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('#arena[data-ready="true"]',{timeout:60000});
  const diagnostics=await page.locator('#arena').getAttribute('data-models');const models=JSON.parse(diagnostics);assert.equal(models.length,2);assert(models.every(m=>m.meshes>0&&m.meshes===m.textured),'both actual skinned GLBs have decoded sRGB albedo');
  const arch=JSON.parse(await page.locator('#arena').getAttribute('data-arch'));assert.equal(arch.file,'arena-crystal-arch.glb');assert(arch.meshes>0&&arch.meshes===arch.textured&&arch.triangles<=6000);const panorama=JSON.parse(await page.locator('#arena').getAttribute('data-panorama'));assert.equal(panorama.file,'ivory-citadel-matte.jpg');assert(panorama.width>=1500&&panorama.width<=2048);
  const shadows=JSON.parse(await page.locator('#arena').getAttribute('data-shadows'));assert.equal(shadows.enabled,true);assert.equal(shadows.size,512);const floor=JSON.parse(await page.locator('#arena').getAttribute('data-floor'));assert.equal(floor.file,'ivory-floor-albedo.jpg');assert.equal(floor.width,1024);assert.equal(floor.height,1024);const arenaAsset=JSON.parse(await page.locator('#arena').getAttribute('data-arena-assets'));assert.equal(arenaAsset.file,'arena-guardian.glb');assert.equal(arenaAsset.instances,2);const facade=JSON.parse(await page.locator('#arena').getAttribute('data-facade'));assert.equal(facade.file,'arena-tribune-facade.glb');assert.equal(facade.instances,4);assert(facade.meshes>0&&facade.meshes===facade.textured&&facade.triangles<=11000,'actual Meshy facade has decoded textures and bounded triangles');assert(arenaAsset.meshes>0&&arenaAsset.meshes===arenaAsset.textured&&arenaAsset.triangles<=30000,'actual Meshy prop has decoded textures and bounded triangles');
  const canvas=page.locator('#arena');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox(),name=await page.locator('#hero-name').textContent();
  const shot=async tag=>{await page.mouse.move(0,0);return canvas.screenshot({path:path.join(out,`${reducedMotion}-${tag}.png`)});};
  const initial=await shot('cross'),initialCamera=await canvas.getAttribute('data-camera-state');
  // Labels are intentional selection controls above the canvas; start orbit on uncovered arena.
  const origin=await canvas.evaluate(c=>{const b=c.getBoundingClientRect();for(const v of [.8,.2,.65])for(const u of [.15,.5,.85]){const x=b.x+b.width*u,y=b.y+b.height*v;if(document.elementFromPoint(x,y)===c)return {x,y};}throw Error('No exposed arena input area');});
  await page.mouse.move(origin.x,origin.y);await page.mouse.down();await page.mouse.move(origin.x+70,origin.y-40,{steps:12});await page.mouse.up();
  assert(!(await shot('orbit')).equals(initial),'drag must change camera');assert.equal(await page.locator('#hero-name').textContent(),name,'drag must not select');
  await page.locator('#camera-reset').click();const reset=await shot('reset');assert.equal(await canvas.getAttribute('data-camera-state'),initialCamera,'reset restores exact view/projection matrices');
  if(!reset.equals(initial)){const difference=await page.evaluate(async({a,b})=>{const pixels=async encoded=>{const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'})),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const c=canvas.getContext('2d');c.drawImage(bitmap,0,0);const result={width:canvas.width,height:canvas.height,data:c.getImageData(0,0,canvas.width,canvas.height).data};bitmap.close();return result;};const x=await pixels(a),y=await pixels(b);if(x.width!==y.width||x.height!==y.height)return {max:255,ratio:1};let max=0,changed=0;for(let i=0;i<x.data.length;i+=4){let d=0;for(let k=0;k<4;k++)d=Math.max(d,Math.abs(x.data[i+k]-y.data[i+k]));max=Math.max(max,d);if(d)changed++;}return {max,ratio:changed/(x.width*x.height)};},{a:initial.toString('base64'),b:reset.toString('base64')});assert(difference.max<=1&&difference.ratio<=.001,'reset differs beyond tiny GPU rounding tolerance');}
  await page.mouse.move(origin.x,origin.y);await page.mouse.wheel(0,-180);await page.waitForTimeout(150);assert(!(await shot('zoom')).equals(initial),'wheel zoom');
  await page.locator('#camera-reset').click();
  const session=await context.newCDPSession(page),x=box.x+box.width*.5,y=box.y+box.height*.83;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-65,y,id:1},{x:x+65,y,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert(!(await shot('pinch')).equals(initial),'pinch zoom');assert.equal(await page.locator('#hero-name').textContent(),name,'pinch must not select');
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await page.locator('#camera-reset').click();assert((await shot('after-cancel')).equals(initial),'cancel then reset recovers');
  await canvas.focus();await page.keyboard.press('ArrowRight');assert(!(await shot('keyboard')).equals(initial),'keyboard orbit');await page.keyboard.press('Home');
  for(const tag of ['side','rear']){await page.locator('#camera').click();await shot(tag);}
  await page.locator('#tank').click();await page.locator('#closeup').click();await shot('obsidyen-textured');await page.locator('#closeup').click();
  await page.locator('#mage').click();assert.notEqual(await page.locator('#hero-name').textContent(),name,'hero UI selection');
  await page.locator('#closeup').click();await shot('closeup');await page.locator('#closeup').click();await page.locator('#camera-reset').click();
  await page.locator('#play').click();await page.waitForTimeout(1500);await page.locator('#play').click();await shot('battle');await page.locator('#reset').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await page.setViewportSize({width:844,height:390});await page.locator('#camera-reset').click();await shot('landscape');
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});await page.locator('#camera-reset').click();await canvas.focus();
   for(let i=0;i<8;i++)await page.keyboard.press('ArrowDown');
   await shot('labels-'+width+'-low');
   const labels=await page.locator('.unit-label:visible').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return {x:r.x-p.x,y:r.y-p.y,w:r.width,h:r.height,pw:p.width,ph:p.height,identity:el.getAttribute('aria-label'),selected:el.classList.contains('selected'),compact:el.classList.contains('compact')};}));
   assert.equal(labels.length,10,'all hero identity/HP controls remain available');
   for(const a of labels){assert(a.identity.includes('Can '),'accessible identity includes HP');assert(a.x>=-1&&a.y>=-1&&a.x+a.w<=a.pw+1&&a.y+a.h<=a.ph+1,'label in arena');if(a.selected)assert(!a.compact,'selected hero name remains visible');for(const b of labels)if(a!==b)assert(a.x+a.w<=b.x+.5||b.x+b.w<=a.x+.5||a.y+a.h<=b.y+.5||b.y+b.h<=a.y+.5,'visible labels must not overlap');}
   await page.locator('.unit-label:visible').last().click();await page.locator('#camera-reset').click();await shot('labels-'+width+'-selected');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'small portrait has no overflow');
  }
  // Three genuine views of the SAME loaded amphitheatre, not generated concept art.
  if(reducedMotion==='no-preference'){
   await page.setViewportSize({width:1680,height:945});
   await page.locator('#quality').selectOption('balanced');
   // Review-only DOM presentation: hide nameplates consistently; do not change gameplay UI/code.
   await page.addStyleTag({content:'#viewport{position:fixed!important;inset:0!important;width:1680px!important;height:945px!important;max-width:none!important;z-index:9999!important;background:#d6e5ea}#labels,.label-leader,#camera,#camera-reset{display:none!important}#arena{outline:none!important}.corner-caption{font-size:13px!important}'});
   await page.locator('.corner-caption').evaluate(el=>{el.innerHTML='<span>FİLDİŞİ GÖK ARENASI · GERÇEK SAHNE</span><small>AYNI GERÇEK 3D SAHNE · CPU WEBGL RENDER · FİNAL SANAT DEĞİL</small>';});
   await canvas.focus();await page.keyboard.press('Home');await shot('art-cross');
   for(let i=0;i<6;i++)await page.keyboard.press('ArrowRight');await shot('art-side');
   await page.keyboard.press('Home');await page.keyboard.press('+');await shot('art-close');
   // Separate real-GLB inspection, same material pipeline: front / side / back, not a concept image.
   await page.evaluate(async()=>{const T=await import('/vendor/three.module.js'),{loadArenaAssets}=await import('/arena-assets.js'),{RoomEnvironment}=await import('/vendor/addons/environments/RoomEnvironment.js');const canvas=document.createElement('canvas');canvas.id='guardian-qa';Object.assign(canvas.style,{position:'fixed',left:'0',top:'0',zIndex:'10001'});document.body.append(canvas);const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setSize(700,700);renderer.setClearColor(0xd6e5ea);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.outputColorSpace=T.SRGBColorSpace;const world=new T.Scene();world.add(new T.HemisphereLight(0xe6f3ff,0x9c977f,.45));const sun=new T.DirectionalLight(0xffefd6,2.65);sun.position.set(-5,12,7);world.add(sun);const generator=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=generator.fromScene(room,.04,.1,100,{size:128});world.environment=env.texture;world.environmentIntensity=.25;generator.dispose();room.dispose();const kit=await loadArenaAssets(),root=kit.create();world.add(root);const camera=new T.OrthographicCamera(-1.6,1.6,1.6,-1.6,.1,30);camera.position.set(0,1.85,4);camera.lookAt(0,1.25,0);window.__guardianQA={renderer,world,camera,root,kit,env};renderer.render(world,camera);});
   for(const [tag,yaw] of [['front',0],['side',Math.PI/2],['back',Math.PI]]){await page.evaluate(y=>{const q=window.__guardianQA;q.root.rotation.y=y;q.renderer.render(q.world,q.camera);},yaw);await page.locator('#guardian-qa').screenshot({path:path.join(out,'meshy-guardian-'+tag+'.png')});}
   await page.evaluate(async()=>{const q=window.__guardianQA,{loadTribuneFacade}=await import('/arena-assets.js');q.kit.dispose();q.kit=await loadTribuneFacade();q.root=q.kit.create();q.world.add(q.root);q.camera.left=-3.2;q.camera.right=3.2;q.camera.top=3.2;q.camera.bottom=-3.2;q.camera.updateProjectionMatrix();q.camera.position.set(0,2,6);q.camera.lookAt(0,.65,0);q.renderer.render(q.world,q.camera);});
   for(const [tag,yaw] of [['front',0],['side',Math.PI/2],['back',Math.PI]]){await page.evaluate(y=>{const q=window.__guardianQA;q.root.rotation.y=y;q.renderer.render(q.world,q.camera);},yaw);await page.locator('#guardian-qa').screenshot({path:path.join(out,'meshy-facade-'+tag+'.png')});}
   await page.evaluate(async()=>{const q=window.__guardianQA,{loadCrystalArch}=await import('/arena-assets.js');q.kit.dispose();q.kit=await loadCrystalArch();q.root=q.kit.create();q.world.add(q.root);q.camera.left=-2.1;q.camera.right=2.1;q.camera.top=2.1;q.camera.bottom=-2.1;q.camera.updateProjectionMatrix();q.camera.position.set(0,2.4,6);q.camera.lookAt(0,1.75,0);q.renderer.render(q.world,q.camera);});
   for(const [tag,yaw] of [['front',0],['side',Math.PI/2],['back',Math.PI]]){await page.evaluate(y=>{const q=window.__guardianQA;q.root.rotation.y=y;q.renderer.render(q.world,q.camera);},yaw);await page.locator('#guardian-qa').screenshot({path:path.join(out,'meshy-arch-'+tag+'.png')});}
   await page.evaluate(()=>{const q=window.__guardianQA;q.kit.dispose();q.env.dispose();q.renderer.dispose();document.querySelector('#guardian-qa').remove();delete window.__guardianQA;});
  }
  assert.deepEqual(errors,[]);
  const renderer=await canvas.evaluate(c=>{const gl=c.getContext('webgl2');if(!gl)return {mode:'software fallback'};const debug=gl.getExtension('WEBGL_debug_renderer_info');return {mode:'WebGL2',renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
  results.push({reducedMotion,renderer,checks:'drag/select separation, wheel, pinch, cancel recovery, keyboard, reset, 3 presets, hero UI, closeup, replay, resize, overflow',scope:'Headless CI only; SwiftShader is CPU software WebGL, not physical GPU or Android performance proof.'});
  await context.close();
 }
 // Failure must remain visible and retryable, never a silent mannequin.
 const failure=await browser.newPage({viewport:{width:390,height:844}});
 await failure.route('**/assets/obsidyen.glb',route=>route.fulfill({status:404,body:'fixture missing'}));
 await failure.goto(`http://127.0.0.1:${server.address().port}/`);
 await failure.waitForFunction(()=>document.querySelector('#loading').textContent.includes('obsidyen.glb yüklenemedi'));
 assert.equal(await failure.locator('#play').isDisabled(),true);assert.equal(await failure.locator('#arena').getAttribute('data-ready'),null);assert.equal(await failure.locator('#loading a').textContent(),'Yeniden yükle');
 await failure.screenshot({path:path.join(out,'missing-model-visible-retry.png')});await failure.close();
 for(const file of ['ivory-citadel-matte.jpg','arena-crystal-arch.glb']){const page=await browser.newPage({viewport:{width:390,height:844}});await page.route('**/assets/'+file,route=>route.fulfill({status:404,body:'fixture missing'}));await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(file=>document.querySelector('#loading').textContent.includes(file+' yüklenemedi'),file);assert.equal(await page.locator('#play').isDisabled(),true);assert.notEqual(await page.locator('#arena').getAttribute('data-ready'),'true');await page.close();}
 const missingFloor=await browser.newPage({viewport:{width:390,height:844}});await missingFloor.route('**/assets/ivory-floor-albedo.jpg',route=>route.fulfill({status:404,body:'fixture missing'}));await missingFloor.goto(`http://127.0.0.1:${server.address().port}/`);await missingFloor.waitForFunction(()=>document.querySelector('#loading').textContent.includes('ivory-floor-albedo.jpg yüklenemedi'));assert.equal(await missingFloor.locator('#play').isDisabled(),true);await missingFloor.close();
 const fallback=await browser.newPage({viewport:{width:390,height:844}});
 await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
 await fallback.goto(`http://127.0.0.1:${server.address().port}/`);await fallback.waitForSelector('#arena[data-ready="true"]',{timeout:60000});
 assert((await fallback.locator('#model-status').textContent()).includes('Basitleştirilmiş yazılım'));assert.equal(await fallback.locator('#benchmark').isDisabled(),true);assert.equal(JSON.parse(await fallback.locator('#arena').getAttribute('data-models')).length,2);
 await fallback.screenshot({path:path.join(out,'software-fallback-explicit.png')});await fallback.close();
 results.push({modelAssetValidation:'2 real skinned GLBs with decoded sRGB embedded albedo',failure:'404 produces named visible retry, no ready state',fallback:'explicit non-PBR software mode; benchmark disabled'});
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
