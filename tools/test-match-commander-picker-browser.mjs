// Synthetic component harness. No accounts, wallets, or live network requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const root=fileURLToPath(new URL('../public/',import.meta.url));
const artifacts=path.resolve(process.env.HERO_BROWSER_SCREENSHOTS||'artifacts/match-commander-picker');await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{try{
 if(req.url==='/fixture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/match-commander-picker.css"><style>body{margin:0;background:#eef0f4;font-family:system-ui}*{box-sizing:border-box}button{font:inherit}</style></head><body><section id="picker"></section></body></html>');return}
 const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.webp')?'image/webp':'text/css');res.end(await readFile(file));
 }catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.HERO_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [320,390,1440])for(const english of [false,true]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await page.goto(origin+'/fixture');
  await page.evaluate(async english=>{
   document.documentElement.lang=english?'en':'tr';const {mountMatchCommanderPicker}=await import('/match-commander-picker.js');window.posts=0;window.starts=0;window.locked=null;window.start=false;
   const levels={attack:25,magic:30,defense:5,support:0};const options=['attack','defense','magic','support'].map((commanderId,index)=>({commanderId,profile:{commanderId,levels},totals:{attack:500+index*25,defense:150,maxHp:3000,speed:50,cardPower:450},heroes:Array.from({length:5},(_,i)=>({id:'h'+i,name:'Kahraman '+i,role:'energy',lane:i<2?'front':'back',attack:100+index*5,defense:30,maxHp:600,speed:10,delta:{attack:index*5,defense:0,maxHp:0,speed:0}}))}));
   window.mount=()=>mountMatchCommanderPicker({root:document.getElementById('picker'),english,code:'fixture',token:'seat',matchKey:'match1',getAuthToken:()=> 'synthetic',onStarted:()=>window.starts++,fetcher:async(url,init)=>{if(init.method==='POST'){window.posts++;window.locked=JSON.parse(init.body).commanderId;await new Promise(resolve=>setTimeout(resolve,100))}return {ok:true,json:async()=>({matchKey:'match1',options,baseline:{totals:{attack:500,defense:150,maxHp:3000,speed:50,cardPower:450}},selection:window.locked?{commanderId:window.locked,levels}:null,ready:[!!window.locked,false],started:window.start})}}});window.picker=window.mount();
  },english);
  await page.waitForSelector('.match-commander-option');assert.equal(await page.locator('[aria-pressed="true"]').count(),0);assert.equal(await page.locator('#picker>button').first().isEnabled(),false);
  await page.locator('.match-commander-option').nth(2).click();assert.match(await page.locator('.match-commander-details').textContent(),/550/);assert.equal(await page.locator('.match-commander-heroes li').count(),5);
  await page.locator('.match-commander-option').nth(2).focus();await page.waitForTimeout(1900);assert.equal(await page.evaluate(()=>document.activeElement===document.querySelectorAll('.match-commander-option')[2]),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow at '+width);
  await page.screenshot({path:path.join(artifacts,`picker-${width}-${english?'en':'tr'}.png`),fullPage:true});
  await page.locator('#picker>button').first().click();await page.waitForFunction(()=>window.locked==='magic');await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.posts),1);assert.equal(await page.locator('.match-commander-option').first().isEnabled(),false);assert.equal(await page.evaluate(()=>window.starts),0);
  await page.evaluate(()=>{window.picker.destroy();window.picker=window.mount()});await page.waitForFunction(()=>document.querySelector('[aria-pressed="true"]')?.textContent.includes('30'));assert.equal(await page.locator('.match-commander-option').first().isEnabled(),false);
  await page.evaluate(()=>{window.start=true;return window.picker.state.refresh()});assert.equal(await page.evaluate(()=>window.starts),1);assert.equal(await page.locator('#picker').isVisible(),false);await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: picker EN/TR at 320/390/1440px, server-stat comparison, no auto-pick, retained focus, lock/reload/wait/start.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
