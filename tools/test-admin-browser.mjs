// Local synthetic UI only; blocks all external network and never uses real accounts.
// Install Playwright separately, or pass its module path in HERO_BROWSER_TEST_RUNTIME.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const root=fileURLToPath(new URL('../public/',import.meta.url));
const server=createServer(async(req,res)=>{try{const name=req.url.split('?')[0]==='/admin'?'/admin.html':req.url.split('?')[0];const file=path.resolve(root,'.'+name);if(!file.startsWith(root))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const failures=[],requests=[];let delayedReport=false;let delayedMatch=false;
const fixtures=[{account_id:'fixture-player',display_name:'=Oyuncu; İzmir <img src=x>',gold:750,diamonds:3,magicDust:4,banned:false,analytics:{sessionCount:3,repeatVisits:2,activeMs:65000,lastSeen:new Date().toISOString(),latest:{source:'invite',platform:'android',device:'mobile'}}},{account_id:'fixture-owner',display_name:'Yönetici',gold:500,banned:false}];
try{
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Los_Angeles',acceptDownloads:true});const page=await context.newPage();page.on('pageerror',e=>failures.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('hero-auction-login',JSON.stringify({authToken:'synthetic-local-token',user:{sub:'fixture-owner'},type:'google'}));window.google={accounts:{id:{initialize(){},renderButton(){}}}};});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   const body=route.request().postDataJSON()||{};requests.push({path:url.pathname,body});let data;
   if(url.pathname==='/api/admin/list')data={accounts:fixtures,viewer:{accountId:'fixture-owner'},pagination:{offset:0,limit:50,total:2,hasMore:false},walletCredits:{enabled:true,available:true,legacyGoldSetAvailable:true,currencies:{gold:{available:true},diamonds:{available:true},magicDust:{available:true}}},playerAnalytics:{enabled:true,available:true}};
   else if(url.pathname==='/api/admin/session-report'){
    if(delayedReport)await new Promise(r=>setTimeout(r,200));
    const until=body.until||new Date().toISOString(),day=new Date(new Date(until).getTime()+10800000).toISOString().slice(0,10);
    data={available:true,options:{...body,until,limit:50,offset:0},total:2,summary:{sessions:2,uniqueAccounts:2,additionalSessions:0,androidSessions:1},days:[{day,sessions:2,uniqueAccounts:2,crazygamesSessions:0,reportedInviteSessions:1,googleSearchSessions:1,externalSessions:0,directSessions:0}],entries:fixtures.map((a,i)=>({accountId:a.account_id,name:a.display_name,startedAt:until,source:i?'google_search':'invite',platform:i?'web':'android',device:i?'desktop':'mobile',country:'TR',city:i?'İzmir':'Manisa'}))};
   }else if(url.pathname.endsWith('/location-status'))data={available:true,buildDate:'2026-10-01T00:00:00Z',location:{country:'TR',city:'İzmir'}};
   else if(url.pathname.endsWith('/history'))data={history:[],credits:[],creditsAvailable:true};
   else if(url.pathname.endsWith('/moderation/list'))data={reports:[{id:'fixture-report',reason:'harassment',status:'open',createdAt:Date.now(),reporter:'fixture-owner',target:'fixture-player',details:'Sentetik inceleme kaydı',evidence:{kind:'room',code:'123',created:1793217600000,names:['Oyuncu','Yönetici'],chat:[]}}]};
   else if(url.pathname.endsWith('/matches'))data={matches:[{id:'123:1:1793217600000',at:Date.now(),mode:'friend',participants:[{id:'fixture-player',name:'Deneme oyuncusu',score:3},{id:'fixture-owner',name:'Yönetici',score:1}],winner:0,rankChange:[16,-16]}],pagination:{offset:0,limit:25,total:1,hasMore:false},recordLimit:2000};
   else if(url.pathname.endsWith('/match')){if(delayedMatch)await new Promise(r=>setTimeout(r,200));data={record:{id:'123:1:1793217600000',at:Date.now(),mode:'friend',participants:[{id:'fixture-player',name:'Deneme oyuncusu',score:3},{id:'fixture-owner',name:'Yönetici',score:1}],winner:0,rankChange:[16,-16]},room:null,detailAvailable:false,reportEvidence:body.reportId?{reportId:'fixture-report',capturedAt:Date.now(),kind:'room',chat:[{name:'Deneme oyuncusu',message:'<img src=x> güvenli metin',time:Date.now()}]}:null};}
   else return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic fixture: unavailable'})});
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(origin+'/admin');await page.waitForSelector('#accounts tr');await page.waitForSelector('#session-rows tr',{state:'attached'});
  assert.equal(await page.locator('.admin-view:visible').count(),1);assert.equal(await page.locator('#dashboard').isVisible(),true);assert.equal(await page.locator('#wallet-credit-panel').isHidden(),true);
  await page.locator('#accounts tr').first().getByRole('button',{name:'Altın ekle',exact:true}).click();assert.equal(await page.locator('#wallet-credit-form').isVisible(),true);assert.equal(await page.inputValue('#wallet-credit-currency'),'Altın');await page.click('#wallet-credit-cancel');
  if(process.env.HERO_BROWSER_SCREENSHOTS){await mkdir(process.env.HERO_BROWSER_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.HERO_BROWSER_SCREENSHOTS,'players-'+width+'.png'),fullPage:true});}
  assert.equal(await page.locator('#accounts tr').count(),2);assert.equal(await page.locator('#accounts img').count(),0);assert.equal(await page.locator('#accounts tr').nth(1).getByRole('button',{name:'Askıya al',exact:true,includeHidden:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no document overflow at '+width);
  await page.locator('#accounts tr').first().locator('summary').click();await page.locator('#accounts tr').first().getByRole('button',{name:'Girişleri gör',exact:true}).click();assert.equal(await page.locator('#daily-report').isVisible(),true);assert.equal(await page.locator('#dashboard').isHidden(),true);
  await page.waitForFunction(()=>document.querySelector('#daily-status').textContent.includes('Son 7'));
  await page.getByText('Yaklaşık konum kontrolü',{exact:true}).click();await page.click('#location-check');await page.waitForFunction(()=>document.querySelector('#location-status').textContent.includes('TR · İzmir'));assert.ok((await page.locator('#location-status').innerText()).includes('01.10.2026'));
  assert.equal(await page.inputValue('#report-search'),'fixture-player');
  await page.selectOption('#daily-range','30');await page.waitForFunction(()=>document.querySelector('#daily-status').textContent.includes('Son 30'));
  assert.equal(await page.locator('#daily-rows tr').count(),30);
  assert.ok(requests.some(r=>r.path==='/api/admin/session-report'&&r.body.days===30&&r.body.accountId==='fixture-player'));
  const downloaded=page.waitForEvent('download');await page.click('#session-export');const download=await downloaded;const text=await readFile(await download.path(),'utf8');assert.ok(text.includes("'=Oyuncu; İzmir <img src=x>"));assert.ok(text.includes('Manisa'));assert.ok(text.includes('Türkiye'));assert.ok(requests.at(-1).body.export===true);
  await page.click('#report-reset');await page.waitForFunction(()=>document.querySelector('#daily-status').textContent.includes('Son 30'));assert.equal(requests.filter(r=>r.path.endsWith('/session-report')).at(-1).body.accountId,'');
  await page.locator('#admin-quick-nav a[href="#dashboard"]').click();await page.fill('#search','%_');await page.click('#find');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('hesap listelendi'));
  assert.ok(requests.some(r=>r.path==='/api/admin/list'&&r.body.search==='%_'&&r.body.offset===0));
  if(process.env.HERO_BROWSER_SCREENSHOTS){await mkdir(process.env.HERO_BROWSER_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.HERO_BROWSER_SCREENSHOTS,'admin-'+width+'.png'),fullPage:true});}
  await page.locator('#admin-quick-nav a[href="#moderationPanel"]').click();await page.getByRole('button',{name:'İlgili maç ve kanıtları incele',exact:true}).click();await page.waitForSelector('#match-detail .match-chat');assert.equal(await page.locator('#match-detail img').count(),0);assert.ok((await page.locator('#match-detail').innerText()).includes('saklanmıyor'));assert.equal(await page.locator('.admin-view:visible').count(),1);
  if(process.env.HERO_BROWSER_SCREENSHOTS)await page.screenshot({path:path.join(process.env.HERO_BROWSER_SCREENSHOTS,'matches-'+width+'.png'),fullPage:true});
  delayedMatch=true;await page.getByRole('button',{name:'Maçı incele',exact:true}).click();
  await page.locator('#admin-quick-nav a[href="#daily-report"]').click();delayedReport=true;await page.selectOption('#report-platform','android');
  await page.evaluate(()=>{localStorage.removeItem('hero-auction-login');window.dispatchEvent(new StorageEvent('storage',{key:'hero-auction-login'}));});
  await page.waitForTimeout(350);assert.equal(await page.locator('#daily-report').isHidden(),true);assert.equal(await page.locator('#session-rows tr').count(),0);delayedReport=false;delayedMatch=false;assert.equal(await page.locator('.admin-view:visible').count(),0);assert.equal(await page.locator('#match-detail').innerText(),'');
  await context.close();
 }
 assert.deepEqual(failures,[]);console.log('PASS: Chromium desktop 1440px and mobile 390/320px; single-section navigation, direct gold form, no overflow, text-safe player names, self-ban disabled, 30-day report, complete sanitized CSV, cleared filters, complaint-to-match evidence and stale report/match responses after logout.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
