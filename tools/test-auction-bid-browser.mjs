// Actual application modules and DOM with synthetic APIs. No real accounts,
// production server, wallet or external network are used by this regression.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {crazyGamesSource} from '../crazygames-build.js';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const bridge=`\nwindow.__auctionTest={show,connect,sync:syncRoomSnapshot,
 setContext(){login={authToken:'synthetic-account',type:'guest',user:{sub:'synthetic-user',name:'Player'}};session={token:'synthetic-seat',code:'123'};},
 switchSeat(){session={...session,token:'synthetic-other-seat'};},
 switchAccount(){login={...login,authToken:'synthetic-other-account'};},
 leave(){room=null;session=null;applyLogin();},read:()=>room};\n`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),platform=url.pathname.startsWith('/crazygames/');
  let name=decodeURIComponent(platform?url.pathname.slice('/crazygames'.length):url.pathname);
  if(name==='/')name='/index.html';
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  let bytes=await readFile(name==='/app.js'&&process.env.HERO_AUCTION_APP_SOURCE?process.env.HERO_AUCTION_APP_SOURCE:file);
  if(name==='/app.js')bytes=Buffer.from(bytes.toString()+bridge);
  if(platform&&path.extname(file)==='.js')bytes=Buffer.from(crazyGamesSource(bytes.toString(),'.js'));
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']});
const fixture=()=>({code:'123',matchKey:'123:1:100',matchNumber:1,created:100,revision:1,me:0,
 phase:'auction',round:6,card:{name:'Morvan',universe:'original',rarity:'legendary'},
 turn:0,topBid:0,topSeat:null,deadline:Date.now()+60000,universe:'mixed',mode:'bot',
 presence:{serverNow:Date.now(),seats:[]},history:[],chat:[],series:[0,0],rematch:[false,false],
 players:[{name:'Player',credits:10,team:[]},{name:'Computer',credits:10,team:[]}]});
try{
 for(const [width,english] of [[1440,false],[390,false],[320,false],[390,true]]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],bids=[];let snapshot=fixture(),stateReads=0;
  page.on('pageerror',error=>{errors.push(error.message);console.error('Browser page error:',error.message);});
  await page.addInitScript(()=>{
   window.EventSource=class{constructor(){window.__testStream=this;}close(){} emit(room){this.onmessage?.({data:JSON.stringify(room)});}};
   window.google={accounts:{id:{initialize(){},renderButton(){}}}};
  });
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/api/')){
    // Use the same module import rewriting as the CrazyGames build, without its SDK.
    if(english&&url.pathname==='/app.js')return route.fulfill({contentType:'text/javascript',body:crazyGamesSource((await readFile(process.env.HERO_AUCTION_APP_SOURCE||path.join(root,'app.js'),'utf8'))+bridge,'.js')});
    return route.continue();
   }
   let data={};const body=request.postDataJSON();
   if(url.pathname==='/api/state'){stateReads++;data={room:{...snapshot,presence:{...snapshot.presence,serverNow:Date.now()}}};}
   else if(url.pathname==='/api/bid'){bids.push(body.amount);snapshot={...snapshot,revision:snapshot.revision+1,turn:1,topBid:body.amount,topSeat:0,deadline:Date.now()+20000};data={room:snapshot};}
   else if(url.pathname==='/api/pass'){snapshot={...snapshot,revision:snapshot.revision+1,turn:1,deadline:Date.now()+20000};data={room:snapshot};}
   else if(url.pathname==='/api/heroes')data={heroes:[]};
   else if(url.pathname==='/api/online')data={players:0,matches:0,waiting:0};
   else if(url.pathname==='/api/art')data={description:'Synthetic hero',active:{},passive:{}};
   else if(url.pathname==='/api/auth/check')data={user:{sub:'synthetic-user'}};
   else if(url.pathname==='/api/room/current')data={room:null};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(origin);await page.waitForFunction(()=>!!window.__auctionTest);await page.waitForLoadState('networkidle');
  await page.evaluate(({room,english})=>{document.documentElement.lang=english?'en':'tr';window.__auctionTest.setContext();window.__auctionTest.show(room);window.__auctionTest.connect();},{room:snapshot,english});
  const setAmount=async amount=>page.locator('#bidrange').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},amount);
  const show=async room=>{snapshot=room;await page.evaluate(r=>window.__auctionTest.show(r),room);};
  const amount=()=>page.locator('#bidrange').inputValue();

  // Reproduce the original bug using the real snapshot path and changing serverNow.
  await setAmount(6);await page.locator('#bidrange').focus();
  await page.evaluate(()=>{window.__originalRange=document.getElementById('bidrange');window.__originalBid=document.getElementById('bidbutton');});
  await page.evaluate(()=>window.__auctionTest.sync());
  assert.equal(await amount(),'6','unchanged server snapshot must preserve the chosen bid');
  assert.equal(await page.evaluate(()=>document.getElementById('bidrange')===window.__originalRange&&document.activeElement===window.__originalRange),true,'same connected range retains keyboard focus');
  assert.equal(await page.evaluate(()=>document.getElementById('bidbutton')===window.__originalBid),true);

  // Exercise the actual 4-second polling interval, not only a direct helper call.
  const beforePoll=stateReads;await page.waitForTimeout(4200);assert.ok(stateReads>beforePoll);assert.equal(await amount(),'6');
  await page.keyboard.press('ArrowRight');assert.equal(await amount(),'7');
  snapshot={...snapshot,revision:2,history:['Synthetic update'],chat:[{id:1,seat:1,name:'Computer',message:'Hello',at:Date.now()}],presence:{serverNow:Date.now(),seats:[]}};
  await page.evaluate(r=>window.__testStream.emit(r),snapshot);assert.equal(await amount(),'7');
  assert.deepEqual(await page.evaluate(()=>window.__auctionTest.read().history),['Synthetic update']);
  assert.match(await page.locator('#log').textContent(),/Synthetic update/);

  // Native range dragging survives a snapshot arriving while the pointer is down.
  const box=await page.locator('#bidrange').boundingBox();
  await page.mouse.move(box.x+box.width*.25,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.45,box.y+box.height/2);const during=Number(await amount());
  await page.evaluate(r=>window.__testStream.emit(r),{...snapshot,revision:3});
  await page.mouse.move(box.x+box.width*.8,box.y+box.height/2);await page.mouse.up();
  assert.ok(Number(await amount())>during,'drag continues after SSE without releasing/restarting it');
  await setAmount(8);await page.click('#minusbid');assert.equal(await amount(),'7');await page.click('#plusbid');assert.equal(await amount(),'8');
  await page.evaluate(()=>window.__auctionTest.sync());await page.click('#bidbutton');
  await page.waitForFunction(()=>!document.getElementById('bidrange'));assert.deepEqual(bids,[8],'submit sends selected credits, never reset minimum');

  // New turn/minimum, tighter budget, round and same-code rematch must reset safely.
  await show({...snapshot,revision:5,turn:0,topBid:8,topSeat:1,deadline:Date.now()+60000});assert.equal(await amount(),'9');
  await setAmount(10);await show({...snapshot,revision:6,players:[{...snapshot.players[0],credits:9},snapshot.players[1]]});assert.equal(await amount(),'9');assert.equal(await page.locator('#bidrange').getAttribute('max'),'9');
  await show({...snapshot,revision:7,round:7,topBid:0,topSeat:null,card:{...snapshot.card,name:'Next hero'}});assert.equal(await amount(),'1');
  await setAmount(5);await show({...snapshot,matchKey:'123:2:100',matchNumber:2,revision:1});assert.equal(await amount(),'1');
  await setAmount(5);await page.evaluate(()=>window.__auctionTest.switchSeat());await show({...snapshot,revision:2});assert.equal(await amount(),'1');
  await setAmount(5);await page.evaluate(()=>window.__auctionTest.switchAccount());await show({...snapshot,revision:3});assert.equal(await amount(),'1');
  await setAmount(5);await page.evaluate(()=>window.__auctionTest.leave());await page.evaluate(()=>window.__auctionTest.setContext());await show({...snapshot,revision:4});assert.equal(await amount(),'1');
  // A late old snapshot cannot revive an old decision or erase the current bid.
  await setAmount(4);await page.evaluate(r=>window.__auctionTest.show(r),{...snapshot,matchKey:'123:1:100',matchNumber:1,revision:999});assert.equal(await amount(),'4');
  await page.click('#passbutton');await page.waitForFunction(()=>!document.getElementById('bidrange'));
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px ${english?'English/CrazyGames imports':'Turkish/web'}: poll, SSE, focus, drag, stepper, submit, transitions, scope and stale snapshots.`);
  await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
