// Isolated visual fixture: use production markup/CSS/assets, without account or API calls.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const root=fileURLToPath(new URL('../public/',import.meta.url));
const html=await readFile(path.join(root,'index.html'),'utf8');
const links=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]).join('');
const nav=html.match(/<nav class="home-quick-nav"[\s\S]*?<\/nav>/)[0];
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local.test');
 if(url.pathname==='/fixture'){
  const english=url.searchParams.get('lang')==='en';
  const menu=english?nav.replace('>Oyna<','>Play<').replace('>Komutan<','>Commander<').replace('>Kahramanlar<','>Heroes<').replace('>Mağaza<','>Store<'):nav;
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="${english?'en':'tr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${links}<style>${english?'.quick-nav-friends,.quick-nav-contact{display:none!important}':''}</style></head><body><main class="shell"><section id="home" class="cinema-home">${menu}</section></main></body></html>`);return;
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root))throw Error('Invalid asset path');
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{})});
 for(const width of [320,393,550,620,768,1280])for(const lang of ['tr','en']){
  const context=await browser.newContext({viewport:{width,height:760},deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin+'/fixture?lang='+lang);
  await page.locator('#home-play-tab img').evaluate(img=>img.decode());
  const result=await page.locator('#home-play-tab').evaluate(button=>{
   const img=button.querySelector('img'),art=button.querySelector('.nav-art');
   const b=button.getBoundingClientRect(),a=art.getBoundingClientRect(),i=img.getBoundingClientRect(),label=button.querySelector('.nav-label').getBoundingClientRect(),s=getComputedStyle(img);
   return {imageLoaded:img.complete&&img.naturalWidth===768&&img.naturalHeight===512,source:img.getAttribute('src'),noOverflow:document.documentElement.scrollWidth<=innerWidth,tapTarget:b.width>=44&&b.height>=44,imageContained:Math.abs(i.width-a.width)<1&&Math.abs(i.height-a.height)<1,labelVisible:label.bottom<=b.bottom&&label.right<=b.right,fit:s.objectFit,position:s.objectPosition,mask:s.maskImage};
  });
  for(const key of ['imageLoaded','noOverflow','tapTarget','imageContained','labelVisible'])assert.equal(result[key],true,`${width}px ${lang}: ${key}`);
  assert.match(result.source,/home-play-arena\.da9037bd905f1998\.webp$/);
  assert.equal(result.fit,'cover');assert.equal(result.position,'50% 45%');assert.ok(result.mask.includes('68%'));assert.deepEqual(errors,[]);
  assert.equal(await page.locator('#nav-commander-portrait').getAttribute('src'),'/images/lobby-crest.svg','Play replacement must not replace the commander image');
  await page.locator('#home-play-tab').focus();
  assert.equal(await page.locator('#home-play-tab').evaluate(button=>document.activeElement===button),true,'Play remains keyboard-focusable');
  if(process.env.HERO_BROWSER_SCREENSHOTS){await mkdir(process.env.HERO_BROWSER_SCREENSHOTS,{recursive:true});await page.locator('.home-quick-nav').screenshot({path:path.join(process.env.HERO_BROWSER_SCREENSHOTS,`home-play-${width}-${lang}.png`)});}
  console.log(JSON.stringify({width,lang,...result}));await context.close();
 }
 console.log('PASS: distinct Play artwork, responsive bounds, labels and unchanged commander source at six widths in TR/EN.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
