import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import manifest from '../image-asset-manifest.json' with {type:'json'};
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const shots=process.env.HERO_BROWSER_SCREENSHOTS||'/tmp/hero-versioned-portraits-browser';
await mkdir(shots,{recursive:true});
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
const port=socket.address().port;await new Promise(r=>socket.close(r));
const base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:'pipe'});
let output='',browser;server.stdout.on('data',s=>output+=s);server.stderr.on('data',s=>output+=s);
const results=[];
try{
 let ready=false;for(let n=0;n<100;n++){try{if((await fetch(base+'/api/info')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(ready,output);
 browser=await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{})});
 // No request interception in this context: Playwright routing disables HTTP cache.
 const cacheContext=await browser.newContext(),cachePage=await cacheContext.newPage();
 for(const prefix of ['','/crazygames']){
  const loads=[];
  for(let pass=0;pass<2;pass++){
   await cachePage.goto(base+'/privacy');
   const loaded=await cachePage.evaluate(async({assets,prefix})=>{
    performance.clearResourceTimings();
    await Promise.all(assets.map(async asset=>{const image=new Image();image.src=prefix+asset.url;await image.decode();if(image.naturalWidth!==asset.width||image.naturalHeight!==asset.height)throw Error('Incorrect decoded dimensions: '+asset.url);}));
    return performance.getEntriesByType('resource').filter(r=>r.name.includes('/images/optimized/')).map(r=>({url:new URL(r.name).pathname,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize}));
   },{assets:manifest.assets,prefix});
   assert.equal(loaded.length,13);loads.push(loaded);
  }
  assert.ok(loads[0].every(r=>r.transferSize>0),'cold load must transfer each image');
  assert.ok(loads[1].every(r=>r.transferSize===0),'warm navigation must reuse all 13 cached images');
  results.push({kind:'browser-cache',prefix,coldTransferBytes:loads[0].reduce((s,r)=>s+r.transferSize,0),warmTransferBytes:loads[1].reduce((s,r)=>s+r.transferSize,0),images:13});
 }
 await cacheContext.close();
 for(const width of [390,1440])for(const prefix of ['','/crazygames']){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // Keep local QA isolated from advertising, login providers and platform SDKs.
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(base+prefix+'/kahramanlar.html');
  await page.waitForSelector('.gallery-card');
  const loaded=await page.evaluate(async()=>{
   const images=[...document.querySelectorAll('.gallery-card img')].filter(i=>i.src.includes('/images/optimized/'));
   await Promise.all(images.map(async image=>{image.loading='eager';await image.decode();}));
   return images.map(i=>({url:new URL(i.src).pathname,width:i.naturalWidth,height:i.naturalHeight}));
  });
  assert.equal(loaded.length,9);assert.ok(loaded.every(i=>i.width===1374&&i.height===1145));
  await page.screenshot({path:`${shots}/gallery-${prefix?'cg':'web'}-${width}.png`});
  await page.locator('.gallery-card').first().click();
  await page.waitForSelector('#hero-story-dialog[open]');
  await page.locator('#hero-detail-portrait img').evaluate(image=>image.decode());
  await page.screenshot({path:`${shots}/detail-${prefix?'cg':'web'}-${width}.png`});
  await page.keyboard.press('Escape');
  await page.locator('.gallery-card').first().click();
  assert.equal(await page.locator('#hero-story-dialog[open]').count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#hero-story-dialog[open]').count(),0);
  assert.deepEqual(errors,[]);results.push({kind:'gallery',prefix,width,optimizedHeroes:9,repeatedDialog:'passed'});
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await page.goto(base+'/');await page.locator('#guest-login').click();
 await page.waitForSelector('#commander-onboarding:not([hidden])');
 const commanders=await page.evaluate(async()=>{const images=[...document.querySelectorAll('#commander-onboarding-options img')];await Promise.all(images.map(i=>i.decode()));return images.map(i=>({url:new URL(i.src).pathname,width:i.naturalWidth,height:i.naturalHeight}));});
 assert.equal(commanders.length,4);assert.ok(commanders.every(i=>i.url.includes('/images/optimized/')&&i.width===1024&&i.height===1536));
 await page.screenshot({path:shots+'/commander-onboarding.png'});results.push({kind:'onboarding',optimizedCommanders:4});await context.close();
 await writeFile(shots+'/results.json',JSON.stringify({browser:browser.version(),results},null,2)+'\n');
 console.log(JSON.stringify({browser:browser.version(),results},null,2));
}finally{
 await browser?.close();server.kill('SIGTERM');
 await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(resolve,2000).unref();});
}
