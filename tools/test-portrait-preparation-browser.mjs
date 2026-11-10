// Local synthetic-only visual/interaction QA. Never connects to a live account.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {battleRoster} from '../battle-roster.js';
import {commanderSelectionPreview} from '../commander-selection-preview.js';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const root=fileURLToPath(new URL('../public/',import.meta.url)),artifacts=path.resolve(process.env.HERO_BROWSER_SCREENSHOTS||'artifacts/portrait-preparation');await mkdir(artifacts,{recursive:true});
const names=['Gök Çekici','Kuzgun Hançer','Kristal Şifacı','Altın Ozan','Fırtına Çağıran'];
const team=names.map((name,i)=>({...battleRoster.find(h=>h.name===name),power:[82,66,74,70,74][i]}));
const base={positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roles:team.map(h=>h.role)};
const profile={commanderId:'support',levels:{attack:18,defense:18,magic:18,support:18}};
const server=createServer(async(req,res)=>{try{
 if(req.url==='/fixture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/battle-preview.css"><link rel="stylesheet" href="/combined-preparation.css"><link rel="stylesheet" href="/theme.css"><body class="commander-selection"><main class="shell"><section id="match-commander-picker"></section><div id="battle-arena" hidden></div></main></body></html>');return;}
 const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep))throw Error('Outside fixture');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.webp')?'image/webp':'text/css');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});const origin='http://127.0.0.1:'+server.address().port;
let browser;const errors=[],report=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.HERO_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [320,390,1440])for(const english of [false,true]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});let confirmations=0;page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/api/battle-auction-commanders'){
    const {formation}=route.request().postDataJSON();const cards=formation.positions.map((index,slot)=>({...team[index],role:formation.roles[slot],lane:formation.lanes[slot]}));
    const preview=commanderSelectionPreview(cards,cards,{seat:0,profile});return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({matchKey:'fixture',preparation:{...formation,ready:false},selection:null,ready:[false,false],started:false,...preview})});
   }
   if(url.pathname==='/api/battle-auction-commander'){confirmations++;return route.fulfill({status:403,body:'{"error":"No confirmations in this fixture"}'});}
   return route.continue();
  });
  await page.goto(origin+'/fixture');await page.evaluate(async({team,base,english})=>{
   const {mountCombinedPreparation}=await import('/combined-preparation.js');window.fixtureTeam=team;window.fixtureBase=base;window.fixtureEnglish=english;
   window.mount=f=>{window.picker?.destroy();window.picker=mountCombinedPreparation({root:document.getElementById('match-commander-picker'),english,team,preparation:f,code:'synthetic',token:'synthetic',matchKey:'fixture',getPortrait:async i=>team[i].portrait,onStarted:()=>{throw Error('No battle should start')}})};window.mount(base);
  },{team,base,english});
  await page.waitForSelector('.combined-choice');await page.locator('.combined-choice').nth(3).click();
  await page.locator('.combined-hero-pick[data-slot="2"]').click();assert.equal(await page.locator('.combined-hero-pick[data-slot="2"]').getAttribute('aria-pressed'),'true');await page.locator('.combined-hero-pick[data-slot="3"]').click();await page.waitForFunction(()=>!window.picker.state.snapshot().previewPending);
  assert.deepEqual(await page.evaluate(()=>window.picker.state.snapshot().formation.positions),[0,1,3,2,4]);assert.equal(await page.locator('.combined-center-badge').evaluate(e=>e.parentElement.dataset.heroId),team[2].id);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.heroId),team[3].id);
  const wanted=await page.locator('.combined-hero-pick[data-slot="3"]').getAttribute('aria-label');assert.match(wanted,new RegExp(english?'Protected center':'Korumalı merkez'));
  await page.screenshot({path:path.join(artifacts,`swap-${width}-${english?'en':'tr'}.png`),fullPage:true});
  for(let mask=0;mask<32;mask++){
   await page.evaluate(mask=>{const f={...window.fixtureBase,lanes:Array.from({length:5},(_,i)=>mask&(1<<i)?'front':'back')};window.mount(f)},mask);
   await page.waitForFunction(()=>!window.picker.state.snapshot().previewPending);await page.locator('.combined-choice').nth(3).click();
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('.combined-portrait')).length===5);
   const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,cards:document.querySelectorAll('.combined-hero').length,badges:document.querySelectorAll('.combined-center-badge').length,buttons:Array.from(document.querySelectorAll('.combined-preparation button')).filter(e=>!e.hidden).map(e=>({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})),rows:Array.from(document.querySelectorAll('.combined-row')).map(row=>({count:row.dataset.count,rects:Array.from(row.querySelectorAll('.combined-hero')).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width}})}))}));
   assert.equal(geometry.overflow,false,`${width} ${english} mask ${mask}`);assert.equal(geometry.cards,5);assert.ok(geometry.buttons.every(b=>b.height>=44&&b.width>=44));assert.equal(geometry.badges,base.lanes.filter((_,i)=>mask&(1<<i)).length===2?1:0);
   if(mask===0||mask===31){const rects=geometry.rows.find(r=>r.count==='5').rects;assert.equal(rects[0].y,rects[2].y);assert.ok(rects[3].y>rects[2].y);assert.equal(rects[3].y,rects[4].y);assert.ok(rects[3].x>rects[0].x,'last two centered');}
   if([0,3,31].includes(mask))await page.screenshot({path:path.join(artifacts,`mask-${mask}-${width}-${english?'en':'tr'}.png`),fullPage:true});
  }
  assert.equal(confirmations,0);report.push({width,english,allMasks:32,confirmations});await page.close();
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));console.log('PASS: portrait A, same-lane swaps, live-engine values, center identity, 3+2 wraps, all 32 lane masks, focus, localization and 44px controls at 320/390/1440. No live requests or confirmations.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
