// Actual local arena page, synthetic server-owned frames. No live account or match.
// HERO_BROWSER_TEST_RUNTIME=/path/to/playwright/index.mjs
// HERO_BROWSER_EXECUTABLE=/usr/bin/chromium node tools/test-mage-surge-browser.mjs
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {simulateRosterBattle} from '../battle-roster.js';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const root=new URL('../',import.meta.url).pathname,port=Number(process.env.HERO_BROWSER_TEST_PORT||3136),origin='http://127.0.0.1:'+port;
const shots=process.env.HERO_BROWSER_SCREENSHOTS||'/tmp/hero-mage-surge-qa';await mkdir(shots,{recursive:true});
const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DATABASE_URL:'',HERO_PLAYER_LOCATIONS_ENABLED:'0'},stdio:'pipe'});
let output='',browser;server.stdout.on('data',s=>output+=s);server.stderr.on('data',s=>output+=s);
try{
 for(let n=0;!output.includes('Hero Auction http://')&&n<100;n++)await new Promise(r=>setTimeout(r,100));assert.ok(output.includes('Hero Auction http://'),output);
 browser=await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const cards=['original:09','original:15','original:expansion-01','original:14','original:01'].map(id=>({id,power:80}));
 const fixture={...simulateRosterBattle(cards,cards,{seed:'mage-surge-qa'}),live:true,log:[]};
 for(const team of fixture.teams)for(const u of team){u.hp=u.maxHp;u.shield=0;}
 for(const width of [1440,390,320])for(const english of [false,true]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/api/battle-preview')return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)});return route.continue();});
  await page.goto(origin+'/battle-preview.html?room=arena');await page.waitForSelector('#team-a .hero');
  await page.evaluate(english=>document.documentElement.lang=english?'en':'tr',english);
  const emit=(teams,round,finished=false)=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('heroarena:experimental-round-end',{detail})),{teams,round,finished,events:[]});
  const buffed=structuredClone(fixture.teams);Object.assign(buffed[0][0],{arcaneSurgeBonusAttack:buffed[0][0].attack,arcaneSurgeFromRound:3,arcaneSurgeUntilRound:5});
  const badge=page.locator('#team-a .hero').first().locator('.arena-surge-status');
  await emit(buffed,2);assert.equal(await badge.getAttribute('data-state'),'pending');assert.equal(await page.locator('.arcane-surge-active').count(),0);
  for(const round of [3,4,5]){
   await emit(buffed,round);assert.equal(await badge.isVisible(),true);assert.match(await badge.textContent(),new RegExp(String(6-round)+(english?'R':'T')));
   assert.equal(await page.locator('#team-b .arena-surge-status:visible').count(),0,'same ID on enemy side never receives allied status');
   assert.equal(await page.locator('#round').textContent(),String(round));
  }
  await emit(buffed,3);await page.screenshot({path:shots+'/surge-'+width+'-'+(english?'en':'tr')+'.png'});
  const bounds=await badge.evaluate(el=>{const b=el.getBoundingClientRect(),c=el.closest('.hero').getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,cardLeft:c.left,cardTop:c.top,cardRight:c.right,cardBottom:c.bottom};});
  assert.ok(bounds.left>=bounds.cardLeft-1&&bounds.right<=bounds.cardRight+1&&bounds.top>=bounds.cardTop&&bounds.bottom<=bounds.cardBottom,'badge remains inside card at '+width);
  await emit(fixture.teams,6);assert.equal(await badge.isVisible(),false,'expiry removes server-owned status');
  await emit(buffed,3);const transferred=structuredClone(fixture.teams);transferred[0][0].hp=0;Object.assign(transferred[0][1],{arcaneSurgeBonusAttack:transferred[0][1].attack,arcaneSurgeFromRound:4,arcaneSurgeUntilRound:5});
  await emit(transferred,4);assert.equal(await badge.isVisible(),false);assert.equal(await page.locator('#team-a .arena-surge-status:visible').count(),1);
  await page.setViewportSize({width:width===320?321:width-1,height:899});assert.match(await page.locator('#team-a .arena-surge-status:visible').textContent(),/2[TR]/,'resize retains authoritative current round');
  await emit(transferred,4,true);assert.equal(await page.locator('.arena-surge-status:visible').count(),0,'finish clears both active and scheduled bonus');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS '+width+' '+(english?'EN':'TR'));
 }
}finally{await browser?.close();server.kill();}
