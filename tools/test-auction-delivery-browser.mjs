// Real auction app, reveal queue, flights and CSS with synthetic API responses.
// No real accounts, gameplay writes, external services or production are used.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const root=fileURLToPath(new URL('../public/',import.meta.url));
const artifacts=path.resolve(process.env.HERO_BROWSER_SCREENSHOTS||'artifacts/auction-delivery');
await mkdir(artifacts,{recursive:true});
const roster=JSON.parse(await readFile(new URL('../battle-roster.json',import.meta.url),'utf8')).characters;
const heroes=roster.slice(0,10).map(({name,universe,rarity},index)=>({name,universe,rarity,cost:2,power:70+index}));
const bridge=`\nwindow.__deliveryTest={show,connect,
 setContext(){login={authToken:'synthetic-account',type:'guest',user:{sub:'synthetic-user',name:'Player'}};session={token:'synthetic-seat',code:'123'};},
 leave(){room=null;session=null;applyLogin();}};\n`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(req,res)=>{try{
 const name=new URL(req.url,'http://localhost').pathname,relative=name==='/'?'index.html':name.slice(1),file=path.resolve(root,relative);
 if(!file.startsWith(root)){res.writeHead(403).end();return;}
 // A historical CSS file proves this regression fails on the original bug,
 // without changing the checkout under another test or developer.
 let bytes=await readFile(relative==='auction-density.css'&&process.env.HERO_DELIVERY_DENSITY_SOURCE?process.env.HERO_DELIVERY_DENSITY_SOURCE:file);
 if(relative==='app.js')bytes=Buffer.from(bytes.toString()+bridge);
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,report=[];
function fixture(me,tailCount,matchNumber=1){
 const players=[0,1].map(seat=>({name:seat?'Opponent':'Player',commander:{commanderId:seat?'defense':'attack'},playerId:'HA-SYNTHETIC-'+seat,credits:10,team:heroes.slice(seat*5,seat*5+5)}));
 const tailAwards=tailCount===1?[{seat:me,card:players[me].team[4]}]:[
  {seat:me,card:players[me].team[3]},
  {seat:1-me,card:players[1-me].team[4]},
  {seat:me,card:players[me].team[4]}
 ];
 const offeredSeat=1-me,offeredIndex=tailCount===1?4:3,card=players[offeredSeat].team[offeredIndex];
 const common={code:'123',matchKey:`123:${matchNumber}:100`,matchNumber,created:100,me,round:8,universe:'mixed',mode:'friend',presence:{serverNow:Date.now(),seats:[]},history:[],chat:[],series:[0,0],rematch:[false,false]};
 const auction={...common,revision:1,phase:'auction',card:{name:card.name,universe:card.universe,rarity:card.rarity},turn:me,topBid:0,topSeat:null,deadline:Date.now()+60000,players:players.map((p,seat)=>({...p,team:p.team.filter(hero=>hero!==card&&!tailAwards.some(a=>a.seat===seat&&a.card===hero)).map(({name,universe,rarity,cost})=>({name,universe,rarity,cost}))}))};
 const finished={...common,revision:2,phase:'finished',players,final:players,tailAwards:tailAwards.map((a,index)=>({...a,id:`tail-${index}`,round:8+index}))};
 return {auction,finished};
}
const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
async function verifyStoneSurfaces(page,selectors){
 for(const selector of selectors){
  const background=await page.locator(selector).evaluate(node=>getComputedStyle(node).backgroundImage);
  assert.match(background,/preparation-ground\.webp/,`${selector} retains the arena stone texture`);
 }
 for(const selector of ['#chat-messages','#chat-input']){
  const color=await page.locator(selector).evaluate(node=>getComputedStyle(node).backgroundColor);
  const channels=color.match(/\d+/g).map(Number);
  assert.ok(channels.slice(0,3).every(value=>value<96)&&channels[3]!==0,`${selector} has a dark well`);
 }
}
async function verifyCompactAuction(page){
 assert.equal(await page.locator('#game').getAttribute('data-phase'),'auction');
 assert.equal(await page.locator('#game').evaluate(node=>node.classList.contains('auction-delivery-active')),false);
 for(const side of [0,1]){
  assert.equal(await page.locator('#player'+side).evaluate(node=>getComputedStyle(node).position),'relative','bidding keeps compact relative sidebars');
  assert.equal(await page.locator(`#player${side} .auction-commander img`).evaluate(node=>getComputedStyle(node).height),page.viewportSize().width<=360?'38px':'44px','bidding keeps compact commander portraits');
 }
 assert.equal(await page.locator('.auction-deck-scene').evaluate(node=>getComputedStyle(node).maxWidth),'165px','bidding keeps compact hero composition');
 assert.equal(await page.locator('.auction-hero .card-art').evaluate(node=>getComputedStyle(node).height),'180px');
 for(const selector of ['#bidbutton','#passbutton']){
  const box=await page.locator(selector).boundingBox();assert.ok(box.width>=44&&box.height>=44,'bidding retains touch targets');
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'bidding has no horizontal overflow');
}
async function verifyDeliveryGeometry(page){
 const snapshot=await page.evaluate(()=>{
  const selectors=['#player0','#player1','.auction-tail-sequence','.auction-tail-sequence .auction-deck-scene','.auction-tail-sequence .card-art','.auction-tail-name','.auction-tail-values'];
  const read=()=>Object.fromEntries(selectors.map(selector=>{
   const node=document.querySelector(selector);if(!node)return [selector,null];
   const b=node.getBoundingClientRect(),s=getComputedStyle(node);
   return [selector,{left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height,position:s.position,padding:s.padding,fontSize:s.fontSize,maxWidth:s.maxWidth}];
  }));
  const current=read(),sheet=[...document.styleSheets].find(sheet=>sheet.href?.includes('/auction-density.css'));
  if(!sheet)throw Error('Production auction density stylesheet was not loaded');
  // Disabling only the newly introduced layer is the pre-density baseline.
  // Delivery must be identical, not merely patched enough to stop overlap.
  const disabled=sheet.disabled;let original;
  try{sheet.disabled=true;original=read();}finally{sheet.disabled=disabled;}
  return {current,original,phase:document.getElementById('game').dataset.phase,width:innerWidth,height:innerHeight};
 });
 assert.equal(snapshot.phase,'auction','real finished-state reveal intentionally retains auction phase');
 const boxes=[snapshot.current['#player0'],snapshot.current['#player1']];
 for(const [seat,box] of boxes.entries()){
  assert.equal(box.position,'fixed',`receiver ${seat} must stay fixed, never become an in-flow auction sidebar`);
  assert.equal(box.height,122,'receiver retains original 122px height');
  assert.ok(Math.abs(box.bottom-(snapshot.height-12))<1,'receiver stays 12px above viewport bottom');
  assert.ok(box.left>=0&&box.right<=snapshot.width,'receiver is inside viewport');
 }
 assert.ok(!overlap(...boxes),'receiver boxes do not overlap');
 const panel=snapshot.current['.auction-tail-sequence'];
 assert.ok(panel.left>=0&&panel.right<=snapshot.width,'reveal panel fits horizontally');
 assert.ok(panel.top>=0&&panel.bottom<=Math.min(...boxes.map(box=>box.top)),'reveal panel is above receiver boxes, including in landscape');
 for(const selector of ['.auction-tail-name','.auction-tail-values']){
  const box=snapshot.current[selector];
  if(box)for(const receiver of boxes)assert.ok(!overlap(box,receiver),`${selector} is not covered by a receiver`);
 }
 assert.deepEqual(snapshot.current,snapshot.original,'delivery geometry and typography exactly match the pre-density stylesheet baseline');
 return snapshot.current;
}
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']});
 for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390},{width:1280,height:900}])for(const reducedMotion of ['reduce','no-preference'])for(const me of [0,1])for(const tailCount of [1,3]){
  const name=`${viewport.width}x${viewport.height}-${reducedMotion}-seat${me}-tail${tailCount}`;
  if(process.env.HERO_DELIVERY_CASE&&!name.includes(process.env.HERO_DELIVERY_CASE))continue;
  const context=await browser.newContext({viewport,reducedMotion,serviceWorkers:'block'}),page=await context.newPage(),errors=[],writes=[];
  let {auction,finished}=fixture(me,tailCount),snapshot=auction;
  try{
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{
    localStorage.setItem('hero-auction-first-match-guide','seen');
    window.EventSource=class{constructor(){window.__testStream=this;this.handlers={};}close(){}addEventListener(type,handler){this.handlers[type]=handler;}removeEventListener(type){delete this.handlers[type];}emit(room){this.onmessage?.({data:JSON.stringify(room)});}};
    window.google={accounts:{id:{initialize(){},renderButton(){}}}};
   });
   await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    const wallet={gold:500,diamonds:0,magicDust:0};let data;
    const incidental={
     '/api/friends':{playerId:'HA-SYNTHETIC-0',friends:[],incoming:[],outgoing:[],persistent:false,guest:true},
     '/api/friends/presence':{ok:true},'/api/friend/invitations':{incoming:[],outgoing:[]},'/api/wallet':wallet,
     '/api/info':{catalogueCount:50,playerAnalytics:{enabled:false},botEconomy:{available:false},victoryChests:{enabled:false,available:false}},
     '/api/commander/get':{...wallet,profile:{commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}},progression:null,exchange:{available:false}},
     '/api/store/status':{...wallet,diamondsEnabled:false,loginRewards:{enabled:false,available:false},purchase:{available:false},rewardedAds:{enabled:false},exchange:{available:false}},
     '/api/moderation/state':{blocked:[],reports:[]}
    };
    if(url.pathname==='/api/state')data={room:snapshot};
    else if(url.pathname==='/api/heroes')data={heroes:roster.map(({name,universe,role})=>({name,universe,role}))};
    else if(url.pathname==='/api/online')data={players:0,matches:0,waiting:0};
    else if(url.pathname==='/api/art'){
     const hero=roster.find(h=>h.name===url.searchParams.get('name')&&h.universe===url.searchParams.get('universe'));assert.ok(hero,'art requests use real public hero metadata');
     data={url:hero.portrait,source:null,description:hero.name,role:hero.role,active:hero.active,passive:hero.passive,laneModifiers:hero.laneModifiers};
    }else if(url.pathname==='/api/auth/check')data={...wallet,user:{sub:'synthetic-user',name:'Player'}};
    else if(url.pathname==='/api/room/current')data={room:null};
    else if(Object.hasOwn(incidental,url.pathname))data=incidental[url.pathname];
    else{writes.push(url.pathname);return route.fulfill({status:501,contentType:'application/json',body:JSON.stringify({error:'No synthetic response for '+url.pathname})});}
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   });
   const open=async()=>{
    await page.goto(origin);await page.waitForFunction(()=>!!window.__deliveryTest);await page.waitForLoadState('networkidle');
    await page.evaluate(()=>{window.__deliveryTest.setContext();window.__deliveryTest.connect();});
   };
   const show=async room=>{snapshot=room;await page.evaluate(r=>window.__testStream.emit(r),room);};
   const begin=async next=>{
    await show(next);
    await page.waitForFunction(()=>document.getElementById('game').classList.contains('auction-delivery-active')&&!!document.querySelector('.auction-tail-name'));
   };
   await open();await show(auction);
   await page.waitForFunction(()=>document.querySelector('#stage .card-art img')?.naturalWidth>0);
   await verifyCompactAuction(page);
   await verifyStoneSurfaces(page,['body','#chat-panel','#activity']);
   // Let the normal bidding flip settle before its offered card takes flight.
   await page.waitForFunction(()=>!document.querySelector('#stage .auction-drawing'));
   await begin(finished);
   if(reducedMotion==='no-preference')await page.waitForFunction(()=>!document.querySelector('.auction-tail-sequence .auction-drawing'));
   await verifyStoneSurfaces(page,['body','.auction-tail-sequence','#chat-panel']);
   const geometry=await verifyDeliveryGeometry(page);
   assert.equal(await page.locator('#player0 .name').textContent(),finished.final[me].name,'own player remains the left receiver for both server seats');
   assert.equal(await page.locator('#player1 .name').textContent(),finished.final[1-me].name);
   assert.equal(await page.locator('.auction-tail-name').textContent(),finished.tailAwards[0].card.name);
   assert.match(await page.locator('.auction-tail-values').textContent(),new RegExp(String(finished.tailAwards[0].card.power)));
   await page.evaluate(()=>{window.__originalTail=document.querySelector('.auction-tail-sequence');});
   await show({...finished,revision:3,presence:{...finished.presence,serverNow:Date.now()}});
   assert.equal(await page.evaluate(()=>document.querySelector('.auction-tail-sequence')===window.__originalTail),true,'repeated server snapshot does not recreate the reveal');
   if(tailCount>1){
    // The first real flight/receipt arrives once, then the other team's card opens.
    await page.waitForFunction(name=>document.querySelector('.auction-tail-name')?.textContent===name,finished.tailAwards[1].card.name);
    assert.equal(await page.locator('#player0 .delivery-count').textContent(),'4 / 5','first tail is received by the correct team exactly once');
    if(reducedMotion==='reduce')assert.equal(await page.locator('.auction-card-glide').count(),0,'reduced motion never creates moving card ghosts');
   }
   if(tailCount>1||me===0){
    await page.locator('.auction-tail-sequence button.outline').click();
    assert.equal(await page.locator('#confirm-arena-entry').count(),0,'Show all stops at review, never jumps straight to calculation');
   }
   await page.locator('.auction-tail-review').waitFor();
   await verifyDeliveryGeometry(page);
   await verifyStoneSurfaces(page,['body','.auction-tail-review','#chat-panel']);
   assert.equal(await page.locator('.auction-tail-review-card').count(),tailCount);
   for(const side of [0,1]){
    assert.equal(await page.locator(`#player${side} .delivery-count`).textContent(),'5 / 5');
    assert.equal(await page.locator(`#player${side} .delivery-portrait`).count(),5);
   }
   assert.deepEqual(await page.locator('.auction-tail-review-card strong').allTextContents(),finished.tailAwards.map(a=>a.card.name));
   assert.equal(await page.locator('.auction-card-glide').count(),0,'review removes in-flight card ghosts');
   await page.screenshot({path:path.join(artifacts,name+'-review.png'),fullPage:true,animations:'disabled'});
   // Refresh with received-but-unconfirmed receipts restores review, not bidding.
   await open();await show(finished);
   await page.locator('.auction-tail-review').waitFor();await page.waitForFunction(()=>document.getElementById('game').classList.contains('auction-delivery-active'));
   await verifyDeliveryGeometry(page);
   assert.equal(await page.locator('.auction-tail-name').count(),0,'refresh does not replay cards already received');
   const proceed=page.locator('.auction-tail-review button.primary');
   await proceed.click();await page.locator('#confirm-arena-entry').waitFor();
   assert.equal(await page.locator('#game').getAttribute('data-phase'),'finished');
   await verifyStoneSurfaces(page,['body','#stage','#chat-panel']);
   assert.equal(await page.locator('#game').evaluate(node=>node.classList.contains('auction-delivery-active')),false);
   assert.equal(await page.locator('.auction-tail-sequence,.auction-card-glide').count(),0,'continue cleans up the reveal and ghosts');
   await show({...finished,revision:4});
   assert.equal(await page.locator('.auction-tail-sequence').count(),0,'confirmed review is not replayed by a repeated snapshot');
   // Same-code rematch must restore the compact auction and cancel an active reveal.
   const rematch=fixture(me,tailCount,2);await show(rematch.auction);await verifyCompactAuction(page);
   await page.waitForFunction(()=>!document.querySelector('#stage .auction-drawing'));
   await begin(rematch.finished);
   await show(fixture(me,tailCount,3).auction);await verifyCompactAuction(page);
   assert.equal(await page.locator('.auction-tail-sequence,.auction-card-glide,.delivery-slot').count(),0,'new match clears interrupted delivery state');
   await page.waitForTimeout(800);
   assert.equal(await page.locator('.auction-tail-sequence,.auction-card-glide').count(),0,'cancelled reveal timers do not resurrect old cards');
   assert.deepEqual(errors,[],'no browser exceptions');assert.deepEqual(writes,[],'presentation never calls gameplay or unknown mutation endpoints');
   report.push({name,status:'passed',geometry});console.log('PASS',name);
  }catch(error){
   report.push({name,status:'failed',error:String(error),errors,writes});
   await page.screenshot({path:path.join(artifacts,name+'-failure.png'),fullPage:true,animations:'disabled'}).catch(()=>{});
   throw error;
  }finally{await context.close();}
 }
 assert.ok(report.length,'case filter must select at least one test');
 console.log(`Auction delivery browser regression passed: ${report.length} cases.`);
}finally{
 await writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
