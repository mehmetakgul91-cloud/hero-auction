// UI-only CI evidence. Actual app/modules/styles, synthetic HTTP responses.
// This does not validate authentication, SQL claims or any real user's wallet.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCommanderProfile} from '../arena-commanders.js';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.CI!=='true'||process.env.DATABASE_URL){console.error('REFUSED: CI-only synthetic UI harness; DATABASE_URL must be absent.');process.exit(1)}
const {chromium}=await import('playwright');
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url))),artifacts=path.resolve(process.env.HERO_BROWSER_SCREENSHOTS||'artifacts/bot-browser');await mkdir(artifacts,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes)}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const rewards=[100,150,200,250,300,400,0].map((gold,i)=>({day:i+1,gold,diamonds:i===6?5:0}));
let browser;const report=[];
try{
 browser=await chromium.launch({headless:true});
 for(const width of [320,390,1440]){
  let claimed=false,day='2026-11-02',claims=0,reads=0;const errors=[];
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'}),authToken='synthetic-ui-'+width;
  const identity={type:'google',authToken,user:{sub:'ui-member-'+width,provider:'google',name:'Ödül denemesi'}};
  const state=()=>({enabled:true,available:!claimed,eligible:true,serverDay:day,resetHour:2,timezone:'Europe/Istanbul',claimedToday:claimed,nextDay:claimed?2:1,completedDay:claimed?1:0,rewards,receipt:claimed?{day:1,gold:100,diamonds:0,rewardDate:day}:null});
  await context.addInitScript(identity=>{if(!localStorage.getItem('hero-auction-login'))localStorage.setItem('hero-auction-login',JSON.stringify(identity));localStorage.setItem('hero-auction-first-match-guide','seen')},identity);
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   const body=request.postData()?JSON.parse(request.postData()):{},wallet={gold:claimed?600:500,diamonds:0,magicDust:0};let result={...wallet,incoming:[],outgoing:[],friends:[],players:0,matches:0,waiting:0};
   if(url.pathname==='/api/info')result={catalogueCount:50,playerAnalytics:{enabled:false},botEconomy:{available:false},victoryChests:{enabled:false,available:false}};
   if(url.pathname==='/api/auth/check')result={...wallet,user:identity.user};
   if(url.pathname==='/api/commander/get')result={...wallet,profile:createCommanderProfile('attack'),progression:null,exchange:{available:false}};
   if(url.pathname==='/api/store/status'){reads++;assert.equal(body.authToken,authToken);result={...wallet,diamondsEnabled:true,loginRewards:state(),purchase:{available:false},rewardedAds:{enabled:false},exchange:{available:false}};}
   if(url.pathname==='/api/login-rewards/claim'){assert.deepEqual(body,{rewardDate:day,authToken});claims++;claimed=true;result={gold:600,diamonds:0,receipt:state().receipt,loginRewards:state()};}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
  const modal=page.locator('#login-reward-dialog');await modal.waitFor({state:'visible'});assert.equal(await modal.locator('li').count(),7);assert.equal(await modal.locator('[aria-current=step]').count(),1);assert.equal(claims,0);
  const geometry=await modal.evaluate(dialog=>({rect:{x:dialog.getBoundingClientRect().x,right:dialog.getBoundingClientRect().right,top:dialog.getBoundingClientRect().top,bottom:dialog.getBoundingClientRect().bottom},width:innerWidth,height:innerHeight,overflow:dialog.scrollWidth>dialog.clientWidth+1}));assert.ok(geometry.rect.x>=0&&geometry.rect.right<=width+1);assert.equal(geometry.overflow,false);assert.ok(geometry.rect.bottom<=geometry.height+1);
  await page.screenshot({path:path.join(artifacts,`login-reward-${width}-open.png`),fullPage:false});
  await modal.getByRole('button',{name:'ÖDÜLÜ AL',exact:true}).click();await modal.waitFor({state:'hidden'});assert.equal(claims,1);await page.reload({waitUntil:'networkidle'});assert.ok(reads>=2);assert.equal(await modal.isVisible(),false);assert.equal(claims,1);
  await page.screenshot({path:path.join(artifacts,`login-reward-${width}-claimed.png`),fullPage:false});
  day='2026-11-03';claimed=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await modal.waitFor({state:'visible'});await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(100);assert.equal(await modal.isVisible(),false);assert.equal(claims,1);
  await page.locator('#home-store-tab').click();await page.locator('#store-panel').waitFor({state:'visible'});assert.equal(await page.locator('#store-claim').isEnabled(),true);
  assert.deepEqual(errors,[],'Actual app startup/runtime errors');report.push({width,passed:true,claims,reads,geometry,scope:'Synthetic UI only, actual app loaded; not real authentication/SQL/device proof'});await context.close();
 }
 console.log('PASS login reward actual-app UI at320/390/1440: seven tiles, explicit claim, claimed reload suppressed, new day, dismissal, store recovery; synthetic APIs only.');
}finally{await writeFile(path.join(artifacts,'login-reward-ui-report.json'),JSON.stringify(report,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));}
