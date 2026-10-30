// CI-only isolated static fixture. No app server, accounts, databases or public preview.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve('.artifacts/mobile3d'),out=path.resolve('.artifacts/mobile3d-browser');
await fs.mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.css':'text/css'};
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file!==root&&!file.startsWith(root+path.sep))throw Error('path');const target=file===root?path.join(root,'index.html'):file;res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.end(await fs.readFile(target));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const reducedMotion of ['no-preference','reduce']){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,reducedMotion});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('#arena[data-ready="true"]',{timeout:60000});
  const canvas=page.locator('#arena'),box=await canvas.boundingBox(),name=await page.locator('#hero-name').textContent();
  const shot=async tag=>canvas.screenshot({path:path.join(out,`${reducedMotion}-${tag}.png`)});
  const initial=await shot('cross');
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.6,{steps:12});await page.mouse.up();
  assert(!(await shot('orbit')).equals(initial),'drag must change camera');assert.equal(await page.locator('#hero-name').textContent(),name,'drag must not select');
  await page.locator('#camera-reset').click();assert((await shot('reset')).equals(initial),'reset restores framing');
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.wheel(0,-180);await page.waitForTimeout(150);assert(!(await shot('zoom')).equals(initial),'wheel zoom');
  await page.locator('#camera-reset').click();
  const session=await context.newCDPSession(page),x=box.x+box.width*.5,y=box.y+box.height*.5;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-65,y,id:1},{x:x+65,y,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert(!(await shot('pinch')).equals(initial),'pinch zoom');assert.equal(await page.locator('#hero-name').textContent(),name,'pinch must not select');
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await page.locator('#camera-reset').click();assert((await shot('after-cancel')).equals(initial),'cancel then reset recovers');
  await canvas.focus();await page.keyboard.press('ArrowRight');assert(!(await shot('keyboard')).equals(initial),'keyboard orbit');await page.keyboard.press('Home');
  for(const tag of ['side','rear']){await page.locator('#camera').click();await shot(tag);}
  await page.locator('#mage').click();assert.notEqual(await page.locator('#hero-name').textContent(),name,'hero UI selection');
  await page.locator('#closeup').click();await shot('closeup');await page.locator('#closeup').click();await page.locator('#camera-reset').click();
  await page.locator('#play').click();await page.waitForTimeout(1500);await page.locator('#play').click();await shot('battle');await page.locator('#reset').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await page.setViewportSize({width:844,height:390});await page.locator('#camera-reset').click();await shot('landscape');
  assert.deepEqual(errors,[]);
  const renderer=await canvas.evaluate(c=>{const gl=c.getContext('webgl2');if(!gl)return {mode:'software fallback'};const debug=gl.getExtension('WEBGL_debug_renderer_info');return {mode:'WebGL2',renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
  results.push({reducedMotion,renderer,checks:'drag/select separation, wheel, pinch, cancel recovery, keyboard, reset, 3 presets, hero UI, closeup, replay, resize, overflow',scope:'Headless CI only; SwiftShader is CPU software WebGL, not physical GPU or Android performance proof.'});
  await context.close();
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
