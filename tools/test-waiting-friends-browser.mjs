// CI-only waiting-room friends portal. Actual markup/modules/styles; synthetic HTTP responses.
// This does not validate authentication, SQL claims or any real user's wallet.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.CI!=='true'||process.env.DATABASE_URL){console.error('REFUSED: CI-only synthetic UI harness; DATABASE_URL must be absent.');process.exit(1)}
const {chromium}=await import('playwright');
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url))),artifacts=path.resolve(process.env.HERO_BROWSER_SCREENSHOTS||'artifacts/bot-browser');await mkdir(artifacts,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes)}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser;const report=[];
try{
 browser=await chromium.launch({headless:true});
 for(const width of [320,390,1440]){
  const calls=[],errors=[];let offline=false,fail=false;
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(['/app.js','/first-match-guide.js','/ad-rewards.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const body=req.postData()?JSON.parse(req.postData()):{};calls.push({path:url.pathname,body});
   let result={incoming:[],outgoing:[]};
   if(url.pathname==='/api/friends'){if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Geçici bağlantı hatası'})});result={...result,playerId:'HA-OWNER',friends:[{playerId:'HA-ONLINE',name:'Çevrimiçi arkadaş',online:!offline},{playerId:'HA-OFFLINE',name:'Çevrimdışı arkadaş',online:false}]};}
   if(url.pathname==='/api/friend/invite')assert.deepEqual(body,{code:'821',token:'synthetic-seat',playerId:'HA-ONLINE',authToken:'synthetic-owner'});
   return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
   const {createFriendsUI}=await import('/friends.js'),{createRoomInvitesUI}=await import('/room-invites.js');
   document.getElementById('home').hidden=true;document.getElementById('login-gate').hidden=true;document.getElementById('game').hidden=false;
   const room={code:'821',mode:'friend',phase:'waiting',me:0,players:[{},null]},login={type:'google',authToken:'synthetic-owner'};
   const invites=createRoomInvitesUI({onHosted:()=>{throw Error('Unexpected new room')}});
   const friends=createFriendsUI({onInvite:id=>invites.sendTo(id)});invites.setLogin(login);invites.setRoom(room,'synthetic-seat');friends.setLogin(login);friends.setRoom(room);
   window.fixture={friends,invites,room};
  });
  const dialog=page.locator('#waiting-friends-dialog');await page.locator('#waiting-friends-open').click();await dialog.waitFor({state:'visible'});
  await dialog.getByRole('button',{name:'DAVET ET',exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'DAVET ET',exact:true}).count(),1);
  const geometry=await dialog.evaluate(d=>({left:d.getBoundingClientRect().left,right:d.getBoundingClientRect().right,overflow:d.scrollWidth>d.clientWidth+1}));assert.ok(geometry.left>=0&&geometry.right<=width+1);assert.equal(geometry.overflow,false);
  await page.screenshot({path:path.join(artifacts,`waiting-friends-${width}.png`)});
  await dialog.getByRole('button',{name:'DAVET ET',exact:true}).click();await dialog.getByRole('button',{name:'BU ODAYA DAVET ET',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('friends-message')?.textContent==='Maç daveti gönderildi.');
  assert.equal(calls.filter(c=>c.path==='/api/friend/invite').length,1);assert.equal(calls.some(c=>['/api/create','/api/room/detach'].includes(c.path)),false);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('#waiting-friends-open').evaluate(e=>e===document.activeElement),true);
  await page.locator('#waiting-friends-open').click();offline=true;await dialog.locator('#friends-refresh').click();await page.waitForFunction(()=>document.querySelectorAll('#friends-panel .friend-invite').length===0);
  fail=true;await dialog.locator('#friends-refresh').click();await page.waitForFunction(()=>document.getElementById('friends-message')?.textContent==='Geçici bağlantı hatası');
  fail=false;offline=false;await dialog.locator('#friends-refresh').click();await dialog.getByRole('button',{name:'DAVET ET',exact:true}).waitFor();
  await page.evaluate(()=>fixture.friends.setRoom({...fixture.room,players:[{},{}]}));await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('#waiting-friends-open').isVisible(),false);
  assert.deepEqual(errors,[]);report.push({width,passed:true,geometry,scope:'Actual friends and invitation modules/markup; synthetic APIs, not real account/device proof'});await context.close();
 }
 console.log('PASS waiting-room friend picker: existing room, selected friend only, offline/error/retry, Escape/full-room closure, 320/390/1440.');
}finally{await writeFile(path.join(artifacts,'waiting-friends-report.json'),JSON.stringify(report,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));}
