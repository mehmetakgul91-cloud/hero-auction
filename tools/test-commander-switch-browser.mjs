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
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes)}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser;const report=[];
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [390,1440])for(const startingGold of [99,100]){
  let gold=startingGold,changes=0;const errors=[],prompts=[],levels={attack:17,defense:4,magic:2,support:8};let profile={commanderId:'attack',levels};
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'}),authToken='synthetic-fee-'+width+'-'+startingGold;
  const identity={type:'google',authToken,user:{sub:'ui-test',provider:'google',name:'Fee Test'}};
  await context.addInitScript(identity=>{localStorage.setItem('hero-auction-login',JSON.stringify(identity));localStorage.setItem('hero-auction-first-match-guide','seen')},identity);
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   const body=request.postData()?JSON.parse(request.postData()):{},wallet={gold,diamonds:0,magicDust:0};let result={...wallet,incoming:[],outgoing:[],friends:[],players:0,matches:0,waiting:0};
   if(url.pathname==='/api/info')result={catalogueCount:50,playerAnalytics:{enabled:false},botEconomy:{available:false},victoryChests:{enabled:false,available:false}};
   if(url.pathname==='/api/auth/check')result={...wallet,user:identity.user};
   if(url.pathname==='/api/commander/get')result={...wallet,profile,progression:null,exchange:{available:false}};
   if(url.pathname==='/api/store/status')result={...wallet,diamondsEnabled:false,loginRewards:{enabled:false,available:false},purchase:{available:false},rewardedAds:{enabled:false},exchange:{available:false}};
   if(url.pathname==='/api/commander/change'){assert.equal(body.authToken,authToken);assert.equal(body.commanderId,'defense');assert.equal(gold,100);changes++;gold-=100;profile={commanderId:'defense',levels};result={gold,profile,cost:100};}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  let accept=false;page.on('dialog',async dialog=>{prompts.push(dialog.message());if(accept)await dialog.accept();else await dialog.dismiss()});
  await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#commander-open-profile').click();
  assert.match(await page.locator('#commander-change-open').textContent(),/100 ALTIN/);
  await page.locator('#commander-change-open').click();await page.locator('#commander-roster-options button').nth(1).click();
  const confirm=page.locator('#commander-change-confirm');assert.match(await confirm.textContent(),/100/);
  assert.equal(await confirm.isEnabled(),startingGold===100);
  await page.screenshot({path:path.join(artifacts,`switch-${width}-${startingGold}.png`),fullPage:false});
  if(startingGold===100){
   await confirm.click();assert.equal(changes,0);assert.match(prompts[0],/100 altın/);
   await page.locator('#commander-change-close').click();await page.locator('#commander-change-open').click();assert.equal(await confirm.isEnabled(),false);
   await page.locator('#commander-roster-options button').nth(1).click();accept=true;await confirm.click();await page.locator('#commander-change-panel').waitFor({state:'hidden'});
   assert.equal(changes,1);assert.equal(gold,0);assert.equal(profile.commanderId,'defense');assert.deepEqual(profile.levels,levels);
   assert.match(await page.locator('#commander-upgrade-message').textContent(),/100 altın harcandı/);
  }else{assert.equal(changes,0);assert.equal(prompts.length,0);}
  assert.deepEqual(errors,[]);report.push({width,startingGold,changes,remainingGold:gold,passed:true});await context.close();
 }
 console.log(JSON.stringify({scope:'Actual app loaded with synthetic APIs; no live authentication or real wallet/SQL',results:report},null,2));
}finally{await writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));}
