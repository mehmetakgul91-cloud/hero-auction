// Local synthetic fixtures only. Exercises shipped controls and real server combat; no accounts or external network.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url))),markup=await readFile(path.join(root,'battle-preview.html'),'utf8');
const panel=markup.slice(markup.indexOf('<section id="experimental-commander-controls"'),markup.indexOf('<section class="score"'));
const fixtures=new Map(),failures=[];
const snapshot=f=>({version:f.c.version,round:1,side:f.side,commanderId:f.id,revivalUsed:[...f.c.revivalUsed],ultimateUsed:[...f.c.abilities.ultimateUsed],teams:structuredClone(f.c.teams),abilities:f.c.abilities.energy.map((energy,side)=>({energy,ultimateEnergy:f.c.abilities.ultimateEnergy[side],cooldownMs:f.posts?5000:0,effectLockMs:0})),finished:false,events:f.events||[]});
const pageHtml=`<!doctype html><html lang="tr"><head><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/commander-arena-magic-targeting.css"><style>body{font:16px sans-serif;margin:12px}button{padding:8px}.team{display:flex;gap:10px;margin:20px 0}.arena-hero{position:relative;width:90px;min-height:85px;border:2px solid #777;border-radius:10px;padding:8px}.arena-hero.dead{opacity:.5}</style></head><body>${panel}<h2>Allies / Enemies</h2><div id="team-a" class="team"></div><div id="team-b" class="team"></div><script>window.addEventListener('heroarena:experimental-round-end',event=>{event.detail.teams.forEach((team,side)=>{document.getElementById(side?'team-b':'team-a').innerHTML=team.map(hero=>'<div class="arena-hero '+(hero.hp<=0?'dead':'')+'" data-hero-id="'+hero.id+'"><span>'+hero.id+'</span><p>'+hero.hp+' HP</p></div>').join('')})});</script><script type="module" src="/commander-experimental.js"></script></body></html>`;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pageHtml);return}
  if(url.pathname==='/api/experimental/commander-live'){
   let body={};if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;body=JSON.parse(raw)}
   const f=fixtures.get(body.code||url.searchParams.get('code'));assert.ok(f);
   if(req.method==='POST'){
    f.posts++;f.payload=body;
    try{f.events=castLiveCommanderCombat(f.c,{...body,side:f.side,matchKey:'browser',now:2000}).events;}catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));return}
    await new Promise(resolve=>setTimeout(resolve,150));
   }
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot(f)));return;
  }
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))throw Error('outside public root');
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/plain');res.end(await readFile(file));
 }catch(error){res.writeHead(404);res.end(error.message)}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
// Fail on a broken fixture/module graph before a hidden panel becomes a misleading UI timeout.
const checked=new Set();
async function checkModule(url){
 if(checked.has(url))return;checked.add(url);
 const response=await fetch(url);assert.equal(response.status,200,'Fixture module unavailable: '+url);
 assert.match(response.headers.get('content-type')||'',/javascript/,'Fixture module MIME type: '+url);
 const source=await response.text();
 for(const match of source.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm))await checkModule(new URL(match[1],url).href);
}
try{
 await checkModule(origin+'/commander-experimental.js');
 const css=await fetch(origin+'/commander-arena-magic-targeting.css');assert.equal(css.status,200);assert.match(css.headers.get('content-type')||'',/css/);
}catch(error){await new Promise(resolve=>server.close(resolve));throw error}
if(process.argv.includes('--check-fixture')){
 console.log(`PASS: fixture serves ${checked.size} controller/dependency modules and targeting CSS over HTTP.`);
 await new Promise(resolve=>server.close(resolve));process.exit(0);
}
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']});
let runs=0;
try{
 for(const mobile of [false,true])for(const side of [0,1])for(const [id,ability,mode] of [['magic','normal','enemy'],['magic','ultimate','ally'],['defense','ultimate','ally'],['attack','ultimate','enemy'],['support','ultimate','fallen']]){
  const code=String(++runs),targetSide=mode==='enemy'?1-side:side,c=createLiveCommanderCombat({teams:[0,1].map(s=>['a','b','c'].map(name=>({id:s+name,hp:100,maxHp:100,attack:50}))),commanders:[{commanderId:id},{commanderId:id}],abilities:createLiveCommanderAbilities({matchKey:'browser',energy:[100,100],ultimateEnergy:[100,100],now:0})});
  if(mode==='fallen')c.teams[side][1].hp=0;else c.teams[targetSide][0].hp=0;
  const f={c,id,side,posts:0};fixtures.set(code,f);
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});const page=await context.newPage();page.on('pageerror',error=>failures.push(error.message));page.on('response',response=>{if(response.status()>=400)failures.push(response.status()+' '+response.url())});
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin+'/fixture?commanderTest=1&auctionCode='+code+'&auctionToken=synthetic');
  const button=page.locator(`[data-command="${ability}"]`);await button.waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-command="ultimate"]').disabled);
  assert.equal(await page.locator('[data-magic-confirm]').count(),0);
  const press=async locator=>mobile?locator.tap():locator.click();
  await press(button);assert.match(await page.locator('[data-status]').innerText(),/Seçince hemen uygulanır/);
  await press(page.locator('[data-magic-cancel]'));assert.equal(f.posts,0);await press(button);
  const wrong=page.locator(`[data-hero-id="${1-targetSide}b"]`),invalid=page.locator(`[data-hero-id="${targetSide}a"]`),target=page.locator(`[data-hero-id="${targetSide}b"]`);
  await press(wrong);await press(invalid);assert.equal(f.posts,0);
  if(!mobile&&side===1)await target.press(ability==='normal'?'Enter':'Space');else await press(target);
  // A second activation in the same event loop must not submit another request.
  await target.dispatchEvent('click');await target.dispatchEvent('keydown',{key:'Enter',repeat:true});
  await page.waitForFunction(()=>!document.querySelector('[data-command="normal"]').hidden);
  assert.equal(f.posts,1,`${id} ${ability} seat ${side} mobile=${mobile}`);assert.deepEqual(f.payload.targetIds,[targetSide+'b']);
  assert.equal(f.c.abilities.energy[side],ability==='normal'?40:100);if(ability==='ultimate')assert.equal(f.c.abilities.ultimateUsed[side],true);
  assert.equal(await page.locator('[data-magic-confirm]').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await context.close();
 }
 assert.deepEqual(failures,[]);console.log(`PASS: ${runs} real Chromium runs; all five targeted abilities, both seats, desktop click/keyboard and mobile tap; immediate cast, no confirmation DOM, cancel before selection, invalid targets, repeat inputs, authoritative energy/usage, no overflow or page errors.`);
}catch(error){if(failures.length)console.error('Browser fixture errors:',failures);throw error}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
