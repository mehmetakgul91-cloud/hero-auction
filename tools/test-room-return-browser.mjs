// Real application modules, DOM, storage and clicks; synthetic local APIs only.
// This verifies lifecycle handlers in Chromium at desktop/mobile viewport sizes.
// Visibility and persisted page events are dispatched deliberately: this is not
// an iOS/WebKit, real BFCache, server timeout, database or fee-settlement test.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auctionRevealSnapshot,recordTailAward} from '../auction-reveal-events.js';
const {chromium,webkit,devices}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const iPhone=process.env.HERO_RETURN_BROWSER==='webkit';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const source=process.env.HERO_RETURN_APP_SOURCE||path.join(root,'app.js');
// Observation and the existing read-only snapshot entry point only. Cold restore
// always runs the real app bootstrap, never a direct show()/save() injection.
const bridge=`\nwindow.__returnTest={sync:syncRoomSnapshot,restored:()=>restorePending||Promise.resolve(),read:()=>({room,session,login,tailActive:!!tailReveal?.active})};\n`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 try{
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name==='/')name='/index.html';
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  let bytes=await readFile(name==='/app.js'?source:file);
  if(name==='/app.js')bytes=Buffer.from(bytes.toString()+bridge);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
 }catch{res.writeHead(404).end();}
});
const account={authToken:'synthetic-account',type:'guest',user:{sub:'synthetic-user',name:'Player',provider:'guest'}};
const seat={token:'synthetic-seat',code:'123'};
const receiptKey='hero-auction-tail-receipts:web';
function fixture(){
 const cards=Array.from({length:10},(_,i)=>({name:'Synthetic hero '+i,universe:'original',power:50+i,cost:2,rarity:'common'}));
 const players=[0,1].map(n=>({name:n?'Opponent':'Player',credits:10,team:cards.filter((_,i)=>i%2===n)}));
 const raw={code:seat.code,created:100,matchNumber:1,revision:10,phase:'finished',round:3,players};
 // The real server serializer produces IDs, deck order, round/seat and card data.
 for(let n=3;n<10;n++){raw.round=n;recordTailAward(raw,n%2,cards[n],cards[n].cost);}
 return {...auctionRevealSnapshot(raw),code:raw.code,me:0,phase:'finished',round:10,card:null,turn:0,topBid:0,topSeat:null,deadline:null,
  universe:'mixed',mode:'friend',entryPaid:true,history:[],chat:[],series:[0,0],rematch:[false,false],idleClosed:null,forfeit:null,cancellation:null,
  presence:{serverNow:1000,seats:[{connected:true},{connected:true}],candidate:null},players,
  final:players.map(p=>({...p,score:Math.round(p.team.reduce((sum,c)=>sum+c.power,0)*(1+p.credits*.01)*100)/100}))};
}
function deferred(){let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve};}
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=iPhone?await webkit.launch():await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']});
 async function run(width,label,test){
  const context=await browser.newContext({...(iPhone?devices['iPhone 13']:{}),viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],requests=[],unexpected=[],navigations=[];
  const state={room:fixture(),status:200,error:null,currentMissing:false,gate:null};
  page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url());});
  await page.addInitScript(({account,seat})=>{
   if(!sessionStorage.getItem('return-test-seeded')){
    localStorage.setItem('hero-auction-login',JSON.stringify(account));
    localStorage.setItem('hero-auction-session',JSON.stringify(seat));
    localStorage.setItem('hero-auction-first-bot-intro-v1:'+account.user.sub,'done');
    sessionStorage.setItem('return-test-seeded','1');
   }
   window.__returnHidden=false;
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__returnHidden});
   Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__returnHidden?'hidden':'visible'});
   window.EventSource=class{
    constructor(){window.__returnStream=this;this.closed=false;}
    addEventListener(){}
    close(){this.closed=true;}
    emit(room){if(!this.closed)this.onmessage?.({data:JSON.stringify(room)});}
   };
   window.google={accounts:{id:{initialize(){},renderButton(){}}}};
  },{account,seat});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin)return route.abort(); // No production, login, art CDN or other external requests.
   if(url.pathname==='/battle-preview.html'&&!state.realArena)return route.fulfill({contentType:'text/html',body:'<!doctype html><p id="verified-arena-navigation">Synthetic arena destination</p>'});
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const body=request.postData()?request.postDataJSON():null;
   requests.push({path:url.pathname,method:request.method(),body});
   let data={},status=200;
   if(url.pathname==='/api/state'){
    if(state.gate){const gate=state.gate;gate.requested.resolve();await gate.release.promise;}
    status=state.status;data=status===200?{room:state.room}:{error:state.error};
   }else if(url.pathname==='/api/room/current')data=state.currentMissing?{room:null}:{token:seat.token,room:state.room,resumeStage:state.room.idleClosed||state.room.forfeit?'result':'formation'};
   else if(url.pathname==='/api/auth/check')data={user:account.user,gold:1000};
   else if(url.pathname==='/api/wallet')data={gold:1000,diamonds:0,magicDust:0};
   else if(url.pathname==='/api/commander/get')data={profile:null,gold:1000,diamonds:0};
   else if(url.pathname==='/api/friend/invitations')data={incoming:[],outgoing:[]};
   else if(url.pathname==='/api/friends')data={friends:[],incoming:[],outgoing:[]};
   else if(url.pathname==='/api/friends/presence')data={ok:true}; // Ordinary app heartbeat, not admission/payment.
   else if(url.pathname==='/api/store/status')data={gold:1000,diamonds:0};
   // ad-rewards.js reads this on each boot; server rewardedAdStatus() only counts claims.
   else if(url.pathname==='/api/rewarded/status')data={enabled:false,rewardGold:100,dailyLimit:5,used:0,remaining:0,message:'Google reklam onayı ve güvenli ödül doğrulaması bekleniyor.'};
   else if(url.pathname==='/api/info')data={catalogueCount:10,playerAnalytics:{enabled:false},campaignMeasurement:null,victoryChests:{enabled:false}};
   else if(url.pathname==='/api/heroes')data={heroes:[]};
   else if(url.pathname==='/api/online')data={players:0,matches:0,waiting:0};
   else if(url.pathname==='/api/art')data={description:'Synthetic hero',active:{},passive:{}};
   else{unexpected.push(url.pathname);status=503;data={error:'Unexpected API is forbidden in isolated return regression'};}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  const tail=()=>page.locator('.auction-tail-sequence');
  const review=()=>page.locator('.auction-tail-review');
  const proceed=()=>page.getByRole('button',{name:'HESAPLAMAYA GEÇ',exact:true});
  const stored=()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)||'[]'),receiptKey);
  const receiptIds=async()=>new Map(await stored()).get(state.room.matchKey+':'+state.room.me)||[];
  const noPrematureEntry=async()=>{
   assert.equal(new URL(page.url()).pathname,'/','pending review must stay in the lobby document');
   assert.equal(await page.locator('#confirm-arena-entry').count(),0,'review requires its own confirmation before arena entry');
   assert.equal(navigations.some(url=>url.includes('/battle-preview.html')),false,'restore must not briefly visit arena behind review');
  };
  const boot=async(reload=false)=>{
   if(reload)await page.reload();else await page.goto(origin);
   await page.waitForFunction(()=>!!window.__returnTest);
   await page.evaluate(()=>window.__returnTest.restored());
  };
  const suspend=async mode=>{
   await page.evaluate(mode=>{
    if(mode==='visibility'){window.__returnHidden=true;document.dispatchEvent(new Event('visibilitychange'));}
    else window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
   },mode);
   assert.equal(await tail().count(),0,'suspension cancels the old reveal DOM');
  };
  const resume=async mode=>{
   state.gate={requested:deferred(),release:deferred()};
   await page.evaluate(mode=>{
    if(mode==='visibility'){window.__returnHidden=false;document.dispatchEvent(new Event('visibilitychange'));}
    else window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
   },mode);
   await Promise.race([state.gate.requested.promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Foreground did not request authoritative /api/state')),10000);timer.unref();})]);
   assert.equal(await tail().count(),0,'cached reveal must not restart while authoritative response is pending');
   assert.equal(await page.locator('#confirm-arena-entry').count(),0);
   state.gate.release.resolve();state.gate=null;
  };
  try{
   await test({page,state,requests,navigations,tail,review,proceed,receiptIds,noPrematureEntry,boot,suspend,resume});
   assert.deepEqual(errors,[],'application must have no uncaught DOM/module exceptions');
   assert.deepEqual(unexpected,[],'restore may only call allowlisted reads and ordinary presence; no create/join/bot/match/rematch, claims or purchases');
   const admissions=requests.filter(r=>/^\/api\/(create|join|match|bot(?:-accept)?|rematch|room\/detach|diamonds\/exchange|login-rewards\/claim)$/.test(r.path));
   assert.deepEqual(admissions,[],'restore never creates, joins, pays for, detaches or rematches a room');
   for(const r of requests.filter(r=>r.path==='/api/room/current'))assert.deepEqual(r.body,{authToken:account.authToken,automaticReturn:true},'account recovery sends only its identity, not an admission request');
   for(const r of requests.filter(r=>r.path==='/api/state'))assert.deepEqual(r.body,{authToken:account.authToken,...seat,...(r.body.automaticReturn===true?{automaticReturn:true}:{foreground:true})},'snapshot reads keep the same saved seat');
   console.log(`PASS ${width}px: ${label}.`);
  }catch(error){console.error(`FAIL ${width}px: ${label}; URL=${page.url()}; APIs=${JSON.stringify(requests.map(r=>r.path))}; page errors=${JSON.stringify(errors)}`);throw error;}
  finally{state.gate?.release.resolve();await context.close();}
 }
 for(const width of iPhone?[390]:[1440,390]){
  for(const gap of [99_000,100_000,3_600_000])await run(width,`resume after ${gap/1000} seconds`,async({page,boot,tail,suspend} )=>{
   await boot();await tail().waitFor();
   await suspend('visibility');
   // Move the browser clock relative to the real departure without waiting an hour.
   await page.evaluate(gap=>{
    const original=Date.now;Date.now=()=>original()+gap;
    window.__returnHidden=false;document.dispatchEvent(new Event('visibilitychange'));
   },gap);
   if(gap<100_000){await tail().waitFor();assert.equal(await page.locator('#game').isVisible(),true);}
   else{
    await page.locator('#home').waitFor();assert.equal(await page.locator('#game').isVisible(),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('hero-auction-session')),null);
   }
  });
  for(const gap of [99_000,100_000,3_600_000])await run(width,'OS kills or freezes a tab without a close event at '+gap+'ms',async({page,boot,tail})=>{
   await boot();await tail().waitFor();
   await page.evaluate(gap=>{
    // No hide or pagehide. Native suspension can leave the EventSource connected.
    const seen=JSON.parse(localStorage.getItem('hero-auction-room-departure')).at;
    Date.now=()=>seen+gap;
    window.dispatchEvent(new Event('focus'));
   },gap);
   if(gap<100_000)assert.equal(await page.locator('#game').isVisible(),true);
   else{
    await page.locator('#home').waitFor();
    assert.equal(await page.locator('#game').isVisible(),false);
    await boot(true);assert.equal(await page.locator('#home').isVisible(),true);
   }
  });
  for(const fallback of [false,true])await run(width,'one-hour-old saved room opens the main menu on repeated cold starts',async({page,state,boot,tail})=>{
   await boot();await tail().waitFor();
   state.currentMissing=fallback;
   await page.addInitScript(()=>{
    const seat=JSON.parse(localStorage.getItem('hero-auction-session'));
    if(seat)localStorage.setItem('hero-auction-room-departure',JSON.stringify({...seat,at:Date.now()-3_600_000}));
   });
   for(let n=0;n<2;n++){
    await boot(true);assert.equal(await page.locator('#home').isVisible(),true);
    assert.equal(await page.locator('#game').isVisible(),false);
    assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('hero-auction-login')).authToken));
   }
  });
  await run(width,'restored arena URL with expired seat leads straight to home',async({page,state,boot,tail,requests})=>{
   await boot();await tail().waitFor();
   state.realArena=true;
   await page.addInitScript(()=>{
    const seat=JSON.parse(localStorage.getItem('hero-auction-session'));
    if(seat)localStorage.setItem('hero-auction-room-departure',JSON.stringify({...seat,at:Date.now()-3_600_000}));
   });
   const before=requests.length;
   await page.goto(origin+'/battle-preview.html?'+new URLSearchParams({auctionCode:seat.code,auctionToken:seat.token,room:'arena'}),{waitUntil:'commit'});
   await page.waitForURL(origin+'/');await page.waitForFunction(()=>!!window.__returnTest);
   await page.evaluate(()=>window.__returnTest.restored());assert.equal(await page.locator('#home').isVisible(),true);
   assert.equal(requests.slice(before).some(r=>r.path==='/api/battle-auction-preview'),false);
  });
  if(iPhone)continue; // The iPhone run covers foreground recovery, cold starts and a restored arena URL.
  await run(width,'cold reload and interrupted seven-card review preserve separate confirmation',async h=>{
   const {page,state,requests,tail,review,proceed,receiptIds,noPrematureEntry,boot,suspend,resume}=h;
   await boot();await tail().waitFor({state:'visible'});await noPrematureEntry();
   assert.equal(requests.filter(r=>r.path==='/api/room/current').length,1);
   assert.equal(await page.getByRole('button',{name:'Tüm kartları göster',exact:true}).isVisible(),true);
   await boot(true);await tail().waitFor({state:'visible'});await noPrematureEntry();
   await suspend('visibility');await resume('visibility');await tail().waitFor({state:'visible'});await noPrematureEntry();
   await page.getByRole('button',{name:'Tüm kartları göster',exact:true}).evaluate(button=>button.addEventListener('click',()=>{window.__showAllBlockedConfirmation=document.querySelector('.auction-tail-review .primary')?.disabled===true;},{once:true}));
   await page.getByRole('button',{name:'Tüm kartları göster',exact:true}).click();
   await review().waitFor({state:'visible'});
   assert.equal(await page.locator('.auction-tail-review-card').count(),7);
   assert.equal(await page.evaluate(()=>window.__showAllBlockedConfirmation),true,'show-all cannot double as confirmation');
   assert.equal((await receiptIds()).includes('@review-confirmed'),false);
   for(const award of state.room.tailAwards)assert.ok((await receiptIds()).includes(award.id),'every opened card has a receipt');
   await page.evaluate(()=>{window.__reviewNode=document.querySelector('.auction-tail-review');});
   await page.evaluate(()=>window.__returnTest.sync());
   await page.evaluate(room=>window.__returnStream.emit(room),state.room);
   assert.equal(await page.evaluate(()=>document.querySelector('.auction-tail-review')===window.__reviewNode),true,'same snapshot/SSE preserves the current review node');
   await noPrematureEntry();
   // All cards received is distinct from explicit confirmation, across both lifecycle paths.
   for(const mode of ['visibility','pageshow']){
    await suspend(mode);await resume(mode);await review().waitFor({state:'visible'});
    assert.equal(await page.locator('.auction-tail-review-card').count(),7);
    assert.equal((await receiptIds()).includes('@review-confirmed'),false);await noPrematureEntry();
   }
   await boot(true);await review().waitFor({state:'visible'});await noPrematureEntry();
   assert.equal(await page.locator('.auction-tail-review-card').count(),7);
   assert.equal((await receiptIds()).includes('@review-confirmed'),false,'cold boot must not mark review confirmed');
   await page.waitForFunction(()=>{const button=document.querySelector('.auction-tail-review .primary');return !!button&&!button.disabled;});
   await proceed().click();await page.locator('#confirm-arena-entry').waitFor({state:'visible'});
   assert.ok((await receiptIds()).includes('@review-confirmed'));
   assert.equal(await tail().count(),0);
   // Once explicitly confirmed, a subsequent verified formation restore may navigate.
   await page.reload();await page.locator('#verified-arena-navigation').waitFor({state:'visible'});
   const url=new URL(page.url());assert.equal(url.pathname,'/battle-preview.html');
   assert.equal(url.searchParams.get('auctionCode'),seat.code);assert.equal(url.searchParams.get('auctionToken'),seat.token);
  });
  for(const [kind,mode] of [['idle','visibility'],['forfeit','pageshow']]){
   await run(width,`${kind} server result replaces cached reveal on ${mode} and cold reload`,async h=>{
    const {page,state,tail,boot,suspend,resume}=h;
    await boot();await tail().waitFor({state:'visible'});await suspend(mode);
    state.room={...state.room,revision:11,...(kind==='idle'?{idleClosed:{at:2000,auctionStarted:true,refundGold:0}}:{forfeit:{winner:1,reason:'disconnect',deadline:2000}})};
    await resume(mode);await page.locator('.match-cancelled').waitFor({state:'visible'});
    assert.equal(await tail().count(),0);assert.equal(await page.locator('#confirm-arena-entry').count(),0);
    assert.match(await page.locator('#phase').textContent(),kind==='idle'?/İPTAL/:/HÜKMEN/);
    await boot(true);await page.locator('.match-cancelled').waitFor({state:'visible'});
    assert.equal(await tail().count(),0);assert.equal(new URL(page.url()).pathname,'/');
    assert.deepEqual(await page.evaluate(()=>window.__returnTest.read().room),state.room);
   });
  }
  for(const [status,mode] of [[401,'pageshow'],[404,'visibility']]){
   await run(width,`${status} authoritative response clears obsolete reveal on ${mode}`,async h=>{
    const {page,state,tail,boot,suspend,resume}=h;
    await boot();await tail().waitFor({state:'visible'});await suspend(mode);
    state.status=status;state.error=status===401?'Unauthorized':'Oda bulunamadı.';
    await resume(mode);
    await page.locator(status===401?'#login-gate':'#home').waitFor({state:'visible'});
    assert.equal(await tail().count(),0);assert.equal(await page.locator('#game').isVisible(),false);
    const current=await page.evaluate(()=>({state:window.__returnTest.read(),login:localStorage.getItem('hero-auction-login'),seat:localStorage.getItem('hero-auction-session'),closed:window.__returnStream.closed}));
    assert.equal(current.state.room,null);assert.equal(current.state.session,null);assert.equal(current.seat,null);assert.equal(current.closed,true);
    if(status===401){assert.equal(current.state.login,null);assert.equal(current.login,null);}
    else{assert.equal(current.state.login.authToken,account.authToken);assert.equal(JSON.parse(current.login).authToken,account.authToken);}
   });
  }
 }
 console.log(iPhone?'PASS: iPhone WebKit return window, frozen tabs, old seats and direct arena URLs.':'PASS: 28 isolated Chromium scenarios, desktop 1440px/mobile 390px; no real accounts, paid endpoints or external traffic. Lifecycle dispatch is synthetic; server inactivity/fees and actual iOS/BFCache require separate coverage.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
