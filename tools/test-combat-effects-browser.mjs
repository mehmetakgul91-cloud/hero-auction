// Real local server + actual arena page. Only /api/battle-preview is replaced with
// deterministic real-engine teams; synthetic presentation events never hit an API.
// Usage: HERO_BROWSER_TEST_RUNTIME=/path/to/playwright/index.mjs node tools/test-combat-effects-browser.mjs
// Optional: HERO_BROWSER_EXECUTABLE=/usr/bin/chromium HERO_BROWSER_SCREENSHOTS=/tmp/combat-shots
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {simulateRosterBattle} from '../battle-roster.js';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.HERO_BROWSER_TEST_PORT||3118),origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DATABASE_URL:'',HERO_PLAYER_LOCATIONS_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',chunk=>output+=chunk);server.stderr.on('data',chunk=>output+=chunk);
let browser;
try{
 await Promise.race([new Promise((resolve,reject)=>{const timer=setInterval(()=>{if(output.includes('Hero Auction http://')){clearInterval(timer);resolve()}else if(server.exitCode!==null){clearInterval(timer);reject(Error(output))}},50);setTimeout(()=>{clearInterval(timer);reject(Error('Local server startup timeout: '+output))},15000).unref()}),once(server,'error').then(([error])=>Promise.reject(error))]);
 browser=await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const cards=['original:09','original:15','original:expansion-01','original:14','original:01'].map(id=>({id,power:80}));
 const fixture={...simulateRosterBattle(cards,cards,{seed:'web-combat-visual-qa'}),live:true,log:[]};
 const fx='.combat-fx,.combat-beam,.battle-projectile';
 const scenarios=[
  ['magic',{actor:'original:09',target:'original:01',action:'attack',damageType:'normal',value:35}],
  ['heal',{actor:'original:15',target:'original:01',action:'heal',value:28}],
  ['shield',{actor:'original:15',target:'original:01',action:'shield',value:24}],
  ['lightning',{actor:'original:expansion-01',target:'original:01',action:'attack',damageType:'normal',value:46}],
  ['strike',{actor:'original:14',target:'original:01',action:'attack',damageType:'normal',value:31}]
 ];
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/api/battle-preview')return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)});return route.continue()});
  await page.goto(origin+'/battle-preview.html?room=arena');
  await page.waitForSelector('#team-a .hero');
  await page.waitForFunction(()=>window.heroArenaTeams?.length===2);
  const emit=event=>page.evaluate(event=>window.dispatchEvent(new CustomEvent('heroarena:experimental-move',{detail:{event:{side:0,...event}}})),event);
  const clear=()=>page.evaluate(()=>window.dispatchEvent(new Event('heroarena:route-change')));
  const before=await page.evaluate(()=>JSON.stringify(window.heroArenaTeams));
  for(const [kind,event] of scenarios){
   await clear();await emit(event);
   const side=kind==='heal'||kind==='shield'?'a':'b';
   assert.ok(await page.locator('#team-'+side+' .fx-'+kind).count(),kind+' must mark correct target side');
   assert.equal(await page.locator('#team-'+(side==='a'?'b':'a')+' [data-hero-id="original:01"] .fx-'+kind).count(),0,'duplicate IDs cannot mark wrong team');
   assert.equal(await page.locator('.arena-impact-flash').count(),0,'no full-screen flash');
   if(process.env.HERO_BROWSER_SCREENSHOTS){await mkdir(process.env.HERO_BROWSER_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.HERO_BROWSER_SCREENSHOTS,kind+'-'+width+'.png')})}
   await page.waitForTimeout(1900);assert.equal(await page.locator(fx).count(),0,'effect expiry');
  }
  await emit({actor:'original:15',target:'original:01',action:'attack',damageType:'normal',value:20});
  assert.equal(await page.locator('.fx-heal').count(),0,'support attacking must not heal');
  for(const action of ['stun-skip','delay','haste','rage','weaken']){await clear();await emit({actor:'original:09',target:'original:01',action,value:20});assert.equal(await page.locator(fx).count(),0,action+' must not strike')}
  await page.evaluate(event=>{for(let i=0;i<100;i++)window.dispatchEvent(new CustomEvent('heroarena:experimental-move',{detail:{event:{side:0,...event}}}))},scenarios[3][1]);
  assert.ok(await page.locator(fx).count()<=80,'burst resources bounded');
  for(const name of ['heroarena:route-change','heroarena:connection-lost','heroarena:ready','pagehide','popstate']){await emit(scenarios[0][1]);await page.evaluate(name=>window.dispatchEvent(new Event(name)),name);assert.equal(await page.locator(fx).count(),0,name+' cleanup')}
  await emit(scenarios[0][1]);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});assert.equal(await page.locator(fx).count(),0,'background cleanup');await emit(scenarios[0][1]);assert.equal(await page.locator(fx).count(),0,'background suppresses FX');await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
  await page.evaluate(()=>document.body.classList.add('arena-catching-up'));await emit(scenarios[0][1]);assert.equal(await page.locator(fx).count(),0,'catch-up suppresses FX');await page.evaluate(()=>document.body.classList.remove('arena-catching-up'));
  await emit(scenarios[0][1]);await page.evaluate(()=>{document.getElementById('motion').checked=false;document.getElementById('motion').dispatchEvent(new Event('change'))});assert.equal(await page.locator(fx).count(),0);await emit(scenarios[0][1]);assert.equal(await page.locator(fx).count(),0);
  await page.evaluate(()=>{document.getElementById('motion').checked=true;document.getElementById('motion').dispatchEvent(new Event('change'))});
  await emit(scenarios[0][1]);await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);assert.equal(await page.locator(fx).count(),0);await emit(scenarios[0][1]);assert.equal(await page.locator(fx).count(),0,'reduced motion suppresses effects');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.heroArenaTeams)),before,'effects cannot alter battle state');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile width fits');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: actual arena DOM; 1440/390/320px; five effects; duplicate IDs; status actions; repeated/interrupted flows; reduced motion; unchanged state.');
}finally{await browser?.close();server.kill('SIGTERM');}
