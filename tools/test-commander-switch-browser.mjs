import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// UI-only synthetic CI test: never uses production authentication or wallets.
if(process.env.GITHUB_ACTIONS!=='true'||process.env.CI!=='true'||process.env.DATABASE_URL){console.error('REFUSED: CI-only synthetic UI harness; DATABASE_URL must be absent.');process.exit(1)}
const {chromium}=await import('playwright');
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const artifacts=path.resolve(process.env.HERO_BROWSER_SCREENSHOTS||'artifacts/commander-switch');
await mkdir(artifacts,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}let bytes=await readFile(file);if(path.extname(file)==='.html'&&new URL(req.url,'http://localhost').searchParams.get('lang')==='en')bytes=Buffer.from(bytes.toString().replace('<html lang="tr">','<html lang="en">').replace('</body>','<script type="module" src="/crazygames-en.js"></script></body>'));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes)}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser;const report=[];
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [390,1440])for(const language of ['tr','en'])for(const newAccount of [false,true]){
  const startingGold=0;
  let gold=startingGold,changes=0,selections=0;const errors=[],prompts=[],levels={attack:17,defense:4,magic:2,support:8};let profile=newAccount?null:{commanderId:'attack',levels};
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'}),authToken='synthetic-free-'+width+'-'+language+'-'+newAccount;
  const identity={type:'google',authToken,user:{sub:'ui-test',provider:'google',name:'Free Choice Test'}};
  await context.addInitScript(identity=>{localStorage.setItem('hero-auction-login',JSON.stringify(identity));localStorage.setItem('hero-auction-first-match-guide','seen');localStorage.setItem('hero-auction-first-bot-intro-v1:ui-test','done')},identity);
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   const body=request.postData()?JSON.parse(request.postData()):{},wallet={gold,diamonds:0,magicDust:0};let result={...wallet,incoming:[],outgoing:[],friends:[],players:0,matches:0,waiting:0};
   if(url.pathname==='/api/info')result={catalogueCount:50,playerAnalytics:{enabled:false},botEconomy:{
    available:true,entryGold:0,version:'bot-free-v2',difficulties:{easy:{level:15,gold:100,magicDust:0},medium:{level:25,gold:125,magicDust:2},hard:{level:40,gold:175,magicDust:5}}
   },victoryChests:{enabled:true,available:true,goldOptions:[100,105,110,115,120],goldWeights:[1,1,1,1,1],magicDustOptions:[3,4,5],magicDustChance:40,diamondChance:10}};
   if(url.pathname==='/api/auth/check')result={...wallet,user:identity.user};
   if(url.pathname==='/api/commander/get')result={...wallet,profile,progression:null,exchange:{available:false}};
   if(url.pathname==='/api/store/status')result={...wallet,diamondsEnabled:false,loginRewards:{enabled:false,available:false},purchase:{available:false},rewardedAds:{enabled:false},exchange:{available:false}};
   if(url.pathname==='/api/commander/change'){assert.equal(body.authToken,authToken);assert.equal(body.commanderId,'defense');assert.equal(gold,0);changes++;profile={commanderId:'defense',levels};result={gold,profile,cost:0};}
   if(url.pathname==='/api/commander/select'){assert.equal(body.authToken,authToken);assert.equal(profile,null);assert.equal(body.commanderId,'attack');selections++;profile={commanderId:'attack',levels};result={gold,profile,cost:0};}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',async dialog=>{prompts.push(dialog.message());await dialog.dismiss()});
  await page.goto(origin+'/?lang='+language,{waitUntil:'networkidle'});
  assert.equal(await page.locator('#home').isVisible(),true);
  assert.equal(await page.locator('#commander-onboarding').isVisible(),false);
  if(!newAccount && language==='tr'){
   const guide=page.locator('.home-guide');
   for(const size of width===390?[320,390]:[768,1440]){
    await page.setViewportSize({width:size,height:900});
    await guide.scrollIntoViewIfNeeded();
    const art=guide.locator('img.home-guide-art');
    assert.equal(await art.count(),4);
    await art.evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    const geometry=await guide.evaluate(el=>{
     const cards=[...el.querySelectorAll('.home-guide-card')];
     return {
      columns:getComputedStyle(el.querySelector('.home-guide-grid')).gridTemplateColumns.split(' ').length,
      clipped:cards.some(card=>card.scrollWidth>card.clientWidth+1||card.scrollHeight>card.clientHeight+1),
      overflowsPage:el.getBoundingClientRect().right>document.documentElement.clientWidth+1,
      header:getComputedStyle(el.querySelector('.home-guide-head'),'::before').backgroundImage
     };
    });
    assert.equal(geometry.columns,size<760?2:4);
    assert.equal(geometry.clipped,false);
    assert.equal(geometry.overflowsPage,false);
    assert.match(geometry.header,/guide-gate/);
    assert.equal(await guide.locator('a[href*="arena-3d"]').count(),0);
    assert.match(await guide.locator('#home-guide-reward-detail').innerText(),/120/);
    await guide.screenshot({path:path.join(artifacts,`guide-${size}.png`)});
   }
   await guide.locator('#first-match-guide-open').click();
   await page.locator('#first-match-guide[open]').waitFor({state:'visible'});
   await page.locator('#first-match-guide [data-guide=skip]').click();
   await guide.locator('#home-guide-play').click();
   await page.locator('#home-play-panel').waitFor({state:'visible'});
   const lobby=page.locator('#home-play-panel'),rewards=lobby.locator('.play-rewards');
   for(const size of width===390?[320,390]:[768,1440]){
    await page.setViewportSize({width:size,height:900});
    await lobby.locator('.play-mode-art').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
    const bounds=await lobby.evaluate(el=>{
     const box=selector=>el.querySelector(selector).getBoundingClientRect();
     const a=box('.play-compact-friend'),b=box('.play-compact-bot');
     return {aligned:a.right<=b.left&&Math.abs(a.top-b.top)<1&&Math.abs(a.bottom-b.bottom)<1,
      inside:el.scrollWidth<=el.clientWidth+1&&[...el.querySelectorAll('.play-mode-body,.play-match-footer')].every(node=>node.scrollWidth<=node.clientWidth+1),
      invite:box('#room-invite-open').left>=box('#match').right, duel:getComputedStyle(el.querySelector('.play-match-copy')).backgroundImage};
    });
    assert.ok(bounds.aligned&&bounds.inside&&bounds.invite,JSON.stringify({size,...bounds}));
    assert.match(bounds.duel,/play-duel/);
    assert.ok(await lobby.locator('#roomcode').isVisible());
    assert.equal(await rewards.evaluate(el=>el.open),false);
    await lobby.screenshot({path:path.join(artifacts,`play-lobby-${size}.png`)});
   }
   await lobby.locator('#room-invite-open').click();
   await lobby.locator('#room-invite-compose').waitFor({state:'visible'});
   await lobby.locator('#room-invite-open').click();
   await lobby.locator('#room-invite-compose').waitFor({state:'hidden'});
   await rewards.locator('summary').click();
   assert.match(await lobby.locator('#play-reward-odds').innerText(),/%40/);
   await rewards.locator('summary').click();
   for(const [difficulty,amount] of [['easy','100 altın'],['medium','125 altın + 2 büyü tozu'],['hard','175 altın + 5 büyü tozu']]){
    await lobby.locator('#bot-difficulty').selectOption(difficulty);
    assert.equal(await lobby.locator('#bot-economy').innerText(),amount);
   }
   for(const [id,endpoint] of [['match','match'],['create','create'],['join','join']]){
    // Exercise the wired buttons without creating a room in the synthetic fixture.
    await page.route('**/api/'+endpoint,route=>route.fulfill({status:409,json:{error:'Oda işlemi sürüyor.'}}));
    if(id==='join')await lobby.locator('#roomcode').fill('123');
    const [request]=await Promise.all([page.waitForRequest(req=>new URL(req.url()).pathname==='/api/'+endpoint),lobby.locator('#'+id).click()]);
    assert.equal(request.postDataJSON().authToken,authToken);
    if(id==='join')assert.equal(request.postDataJSON().code,'123');
   }
   await page.locator('#play-lobby-back').click();
  }
  await page.locator('#commander-open-profile').click();
  if(newAccount){
   await page.locator('#commander-onboarding').waitFor({state:'visible'});
   await page.locator('#commander-onboarding-close').click();
   assert.equal(await page.locator('#home').isVisible(),true);assert.equal(selections,0);
   await page.locator('#commander-open-profile').click();
   await page.locator('#commander-onboarding-options button').first().click();
   await page.locator('#commander-select-confirm').click();
   await page.locator('#commander-profile').waitFor({state:'visible'});assert.equal(selections,1);
  }
  assert.match(await page.locator('#commander-change-open').textContent(),language==='en'?/FREE/:/ÜCRETSİZ/);
  await page.locator('#commander-change-open').click();await page.locator('#commander-roster-options button').nth(1).click();
  const confirm=page.locator('#commander-change-confirm');assert.match(await confirm.textContent(),language==='en'?/SELECT FOR FREE/:/ÜCRETSİZ SEÇ/);
  assert.equal(await confirm.isEnabled(),true);
  await page.screenshot({path:path.join(artifacts,`switch-${width}-${language}-${newAccount?'new':'existing'}.png`),fullPage:false});
  await page.locator('#commander-change-close').click();await page.locator('#commander-change-open').click();assert.equal(await confirm.isEnabled(),false);
  await page.locator('#commander-roster-options button').nth(1).click();await confirm.click();await page.locator('#commander-change-panel').waitFor({state:'hidden'});
  assert.equal(changes,1);assert.equal(gold,0);assert.equal(profile.commanderId,'defense');assert.deepEqual(profile.levels,levels);
  assert.match(await page.locator('#commander-upgrade-message').textContent(),language==='en'?/changed for free/:/ücretsiz değiştirildi/);
  assert.equal(prompts.length,0);
  await page.locator('#commander-profile-close').click();assert.equal(await page.locator('#home').isVisible(),true);
  assert.deepEqual(errors,[]);report.push({width,language,newAccount,startingGold,selections,changes,remainingGold:gold,dialogs:prompts.length,passed:true});await context.close();
 }
 console.log(JSON.stringify({scope:'Actual app loaded with synthetic APIs; no live authentication or real wallet/SQL',results:report},null,2));
}finally{await writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));}
