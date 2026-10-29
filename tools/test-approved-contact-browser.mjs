import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
import {simulateRosterBattle} from '../battle-roster.js';
const root=new URL('../',import.meta.url).pathname,shots=(process.env.HERO_BROWSER_SCREENSHOTS||'/tmp/hero-approved-contact-qa')+'/';
await mkdir(shots,{recursive:true});
const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3127',DATABASE_URL:''},stdio:'pipe'});let output='';server.stdout.on('data',s=>output+=s);server.stderr.on('data',s=>output+=s);
let browser;
try{
 for(let n=0;!output.includes('Hero Auction http://')&&n<100;n++)await new Promise(r=>setTimeout(r,100));
 assert.ok(output.includes('Hero Auction http://'),output);
 browser=await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{})});
 const cards=['original:09','original:15','original:expansion-01','original:14','original:01'].map(id=>({id,power:80}));
 const fixture={...simulateRosterBattle(cards,cards,{seed:'approved-v2-contact'}),live:true,log:[]};
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!=='http://127.0.0.1:3127')return r.abort();if(u.pathname==='/api/battle-preview')return r.fulfill({json:fixture});return r.continue()});
  await page.goto('http://127.0.0.1:3127/battle-preview.html?room=arena');await page.waitForSelector('#team-a .hero');
  await page.clock.install();
  const stateBefore=await page.evaluate(()=>JSON.stringify(window.heroArenaTeams));
  const emit=(extra={})=>page.evaluate(extra=>window.dispatchEvent(new CustomEvent('heroarena:experimental-move',{detail:{event:{side:0,version:1,actor:'original:14',target:'original:01',action:'attack',damageType:'normal',value:164,...extra}}})),extra);
  await emit();assert.equal(await page.locator('.arena-floating-damage').count(),0);
  await page.clock.runFor(599);assert.equal(await page.locator('.arena-floating-damage').count(),0);
  await page.clock.runFor(1);assert.equal(await page.locator('.arena-floating-damage').count(),1);
  await page.clock.runFor(120);await page.screenshot({path:shots+'arena-contact-'+width+'.png'});
  assert.equal(await page.locator('.hero-contact canvas').count(),1);
  await page.evaluate(()=>window.dispatchEvent(new Event('heroarena:route-change')));assert.equal(await page.locator('.hero-fx,.arena-floating-damage').count(),0);
  await emit({version:2,damageType:'special'});await page.clock.runFor(839);assert.equal(await page.locator('.arena-floating-damage').count(),0);await page.clock.runFor(1);assert.equal(await page.locator('.arena-floating-damage').count(),1);await page.clock.runFor(120);await page.screenshot({path:shots+'arena-special-contact-'+width+'.png'});await page.evaluate(()=>window.dispatchEvent(new Event('heroarena:route-change')));
  await emit();await page.clock.runFor(100);await page.evaluate(()=>window.dispatchEvent(new Event('heroarena:connection-lost')));await page.clock.runFor(1000);assert.equal(await page.locator('.hero-fx,.arena-floating-damage').count(),0);
  await page.emulateMedia({reducedMotion:'reduce'});await emit();assert.equal(await page.locator('.hero-fx-flight').count(),0);assert.equal(await page.locator('.arena-floating-damage').count(),1);
  await page.clock.runFor(2500);assert.equal(await page.locator('.hero-fx,.arena-floating-damage').count(),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.heroArenaTeams)),stateBefore,'presentation cannot mutate authoritative teams');
  const health=await page.evaluate(async()=>{
   const {createArenaTeamRenderer}=await import('/arena-team-renderer.js');
   const host=document.createElement('section');host.className='battle-arena';host.style.cssText='position:fixed;left:20px;top:20px;width:180px;z-index:20000;background:#121822';document.body.append(host);
   const parent=document.createElement('div');host.append(parent);
   const renderer=createArenaTeamRenderer({document,loadArt:()=>'/images/original/hero-01.png'});
   const unit={...window.heroArenaTeams[0][0],maxHp:100,hp:19.9},options={side:0,rows:1,laneRows:{front:[1],back:[1]},fittedRows:{front:[1],back:[1]},roleNames:{}};
   const rows=[];for(const hp of [19.9,20,21,19,100]){unit.hp=hp;renderer.update(parent,[unit],options);const bar=parent.querySelector('.hp');rows.push({hp,low:bar.classList.contains('low-health'),background:getComputedStyle(bar.firstElementChild).backgroundImage});}
   host.remove();return rows;
  });
  assert.deepEqual(health.map(x=>x.low),[true,false,false,true,false]);assert.match(health[0].background,/231, 51, 69/);assert.notEqual(health[0].background,health[1].background);
  assert.deepEqual(errors,[]);await context.close();
 }
 // Pure renderer sampled at exact prototype seconds on normal-size portraits.
 const page=await browser.newPage({viewport:{width:800,height:500}});await page.goto('http://127.0.0.1:3127/');
 await page.evaluate(async()=>{
  const {drawContactFrame,heroImpactArtwork}=await import('/hero-impact-art.js');
  document.body.innerHTML='';document.body.style.cssText='margin:20px;background:#0c111a;color:white;font:14px sans-serif;display:flex;gap:24px;align-items:flex-start';
  for(const width of [190,54])for(const special of [false,true]){
   const host=document.createElement('div');host.textContent=`${width}px ${special?'special':'normal'}`;document.body.append(host);
   for(const seconds of [.08,.18,.35]){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width*232/190);canvas.style.cssText='display:block;margin:8px 0';host.append(canvas);
    const image=new Image();image.src='/images/original/hero-01.png';await image.decode();const ctx=canvas.getContext('2d');
    // Preserve actual game portrait pixels behind transparent particle layer.
    ctx.drawImage(image,300,25,910,1110,0,0,canvas.width,canvas.height);
    const layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;
    drawContactFrame(layer.getContext('2d'),heroImpactArtwork('blade',special,width),seconds,{width,height:canvas.height});ctx.drawImage(layer,0,0);
   }
  }
 });await page.screenshot({path:shots+'controlled-normal-size.png',fullPage:true});
 console.log('PASS browser: exact600/840ms damage arrival, actual canvas, mobile/desktop, route/disconnect cancellation, reduced static and cleanup; controlled sampled frames.');
}finally{await browser?.close();server.kill();}
