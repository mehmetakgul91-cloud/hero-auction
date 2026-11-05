// Real production emote entry/controller and auction app against synthetic APIs.
// Arena combat simulation is replaced with static real-page layout so no game,
// account, payment, external service, or production deployment is touched.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const root=fileURLToPath(new URL('../public/',import.meta.url));
const bridge=`\nwindow.__emoteAuction={show,connect,setContext(){login={authToken:'synthetic-account',type:'guest',user:{sub:'synthetic-user',name:'Player'}};session={token:'synthetic-seat',code:'123'};},leave(){room=null;session=null;applyLogin();}};\n`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(req,res)=>{try{
 const name=new URL(req.url,'http://localhost').pathname,relative=name==='/'?'index.html':name.slice(1),file=path.resolve(root,relative);
 if(!file.startsWith(root)){res.writeHead(403).end();return;}
 let bytes=await readFile(file);if(relative==='app.js')bytes=Buffer.from(bytes.toString()+bridge);
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
const emotes=(overrides={})=>({matchKey:'123:1:100',serverTime:Date.now(),enabled:true,cooldownMs:0,events:[],...overrides});
const event=(id,emoteId='laugh',side=1)=>({id,emoteId,side,expiresAt:Date.now()+2800});
const room=()=>({code:'123',matchKey:'123:1:100',matchNumber:1,created:100,revision:1,me:0,phase:'auction',round:6,card:{name:'Morvan',universe:'original',rarity:'legendary'},turn:0,topBid:0,topSeat:null,deadline:Date.now()+60000,universe:'mixed',mode:'friend',presence:{serverNow:Date.now(),seats:[]},history:[],chat:[],series:[0,0],rematch:[false,false],players:[{name:'Player',commander:{commanderId:'attack'},credits:10,team:[],playerId:'HA-PLAYER'},{name:'Opponent',commander:{commanderId:'defense'},credits:10,team:[],playerId:'HA-OPPONENT'}],arenaEmotes:emotes()});
const overlap=(a,b)=>a&&b&&Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1;
async function visible(page,selector){return page.locator(selector).first().isVisible();}
async function verifyPlacement(page,mode){
 const reaction=await page.locator('.arena-emotes').boundingBox();assert.ok(reaction,'reaction controls are visible');
 assert.ok(reaction.x>=-1&&reaction.x+reaction.width<=page.viewportSize().width+1,'reaction controls fit viewport');
 for(const selector of mode==='arena'?['#arena-score','#experimental-commander-controls','#arena-music-toggle','.arena-home-link','#arena-friend-opponent']:['#bidrange','#bidbutton','#passbutton']){
  if(!await visible(page,selector))continue;
  assert.ok(!overlap(reaction,await page.locator(selector).first().boundingBox()),`closed reactions must not overlap ${selector}`);
 }
}
try{
 browser=await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']});
 for(const mode of ['arena','auction'])for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage(),errors=[],sent=[];
  let data=room(),snapshot=emotes(),reads=0,held=null,hold=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   localStorage.setItem('hero-auction-login',JSON.stringify({authToken:'synthetic-account',type:'guest',user:{sub:'synthetic-user',name:'Player'}}));
   localStorage.setItem('hero-auction-session',JSON.stringify({code:'123',token:'synthetic-seat'}));
   window.EventSource=class{constructor(){window.__testStream=this;this.handlers={};}close(){}addEventListener(type,handler){this.handlers[type]=handler;}removeEventListener(type){delete this.handlers[type];}emit(room){this.onmessage?.({data:JSON.stringify(room)});}emitEmotes(data){this.handlers['arena-emotes']?.({data:JSON.stringify(data)});}};
   window.google={accounts:{id:{initialize(){},renderButton(){}}}};
  });
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
   if(mode==='arena'&&['/battle-preview.js','/commander-arena-effects.js','/commander-round-playback.js','/commander-live-cooldown.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   if(!url.pathname.startsWith('/api/'))return route.continue();
   let result={};
   if(url.pathname==='/api/experimental/commander-live'){reads++;result={version:1,round:1,side:0,commanderId:'attack',finished:false,abilities:[{energy:100,ultimateEnergy:100},{}],arenaEmotes:snapshot};}
   else if(url.pathname==='/api/arena-emotes'){
    sent.push(request.postDataJSON());snapshot=emotes({matchKey:sent.at(-1).matchKey,cooldownMs:5000,events:[event('own-'+sent.length,sent.at(-1).emoteId,0)]});result={arenaEmotes:snapshot};
    if(hold){held={route,result};return;}
   }else if(url.pathname==='/api/state'){reads++;result={room:{...data,arenaEmotes:snapshot}};}
   else if(url.pathname==='/api/heroes')result={heroes:[]};
   else if(url.pathname==='/api/online')result={players:0,matches:0,waiting:0};
   else if(url.pathname==='/api/art')result={description:'Synthetic hero',active:{},passive:{}};
   else if(url.pathname==='/api/auth/check')result={user:{sub:'synthetic-user'}};
   else if(url.pathname==='/api/room/current')result={room:null};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  if(mode==='arena'){
   await page.goto(origin+'/battle-preview.html?room=arena&auctionCode=123&auctionToken=synthetic-seat&auctionMatchKey=123%3A1%3A100&commanderTest=1');
   await page.evaluate(()=>{document.body.classList.add('arena-room','arena-fit');for(const id of ['arena-score','battle-arena','experimental-commander-controls'])document.getElementById(id).hidden=false;document.querySelector('.formation').hidden=true;document.getElementById('battle-lobby').hidden=true;const nav=document.querySelector('.arena-room-nav');nav.classList.add('arena-social-nav');const friend=document.createElement('button');friend.id='arena-friend-opponent';friend.textContent='＋ Rakibi arkadaş ekle';nav.append(friend);});
  }else{
   await page.goto(origin);await page.waitForFunction(()=>!!window.__emoteAuction);
   await page.evaluate(r=>{window.__emoteAuction.setContext();window.__emoteAuction.show(r);window.__emoteAuction.connect();},data);
  }
  await page.locator('.arena-emote-toggle').waitFor({state:'visible'});
  const push=async next=>{snapshot=next;if(mode==='arena')await page.evaluate(arenaEmotes=>window.dispatchEvent(new CustomEvent('heroarena:commander-state',{detail:{finished:false,arenaEmotes}})),next);else{data={...data,revision:data.revision+1,arenaEmotes:next};await page.evaluate(r=>window.__testStream.emit(r),data);}};
  await verifyPlacement(page,mode);
  if(mode==='arena'){
   await page.evaluate(arenaEmotes=>window.dispatchEvent(new CustomEvent('heroarena:commander-state',{detail:{finished:true,arenaEmotes}})),emotes({matchKey:'123:0:100'}));
   assert.equal(await visible(page,'.arena-emotes'),true,'late finished snapshot from old match must not stop current reactions');
  }
  if(mode==='arena'&&await visible(page,'#arena-friend-opponent'))assert.ok(!overlap(await page.locator('#arena-friend-opponent').boundingBox(),await page.locator('#arena-score').boundingBox()),'friend control beside emotes must not spill into HP');
  if(mode==='auction'){assert.equal(await page.locator('#player0 .auction-player-heading .arena-emotes').count(),1,'picker is mounted inside own commander heading');assert.equal(await page.locator('#player1 .auction-player-heading .arena-emote-slot-1').count(),1,'opponent reaction uses opponent commander heading');}
  await page.locator('.arena-emote-toggle').click();
  assert.deepEqual(await page.locator('[data-emote-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.emoteId)),['laugh','slow_clap','fake_cry','yawn','sunglasses','nanik']);
  assert.equal(await page.locator('.arena-emotes input,.arena-emotes textarea,.arena-emote-picker input,.arena-emote-picker textarea').count(),0,'no free text');
  const picker=await page.locator('.arena-emote-picker').boundingBox();assert.ok(picker.x>=0&&picker.x+picker.width<=viewport.width+1);
  await page.keyboard.press('Escape');assert.equal(await visible(page,'.arena-emote-picker'),false);
  await push(emotes({events:[event('remote-1')]}));
  await page.locator('.arena-emote-slot-1 img').waitFor();
  if(mode==='auction'){snapshot=emotes({events:[event('named-stream','yawn')]});await page.evaluate(s=>window.__testStream.emitEmotes(s),snapshot);await page.waitForFunction(()=>document.querySelector('.arena-emote-slot-1 img')?.src.includes('yawn'));}
  assert.match(await page.locator('.arena-emote-slot-1 img').getAttribute('src'),/\.png$/,'reduced motion uses still artwork');
  await page.evaluate(()=>window.__firstBubble=document.querySelector('.arena-emote-slot-1 img'));
  await push(snapshot);assert.equal(await page.evaluate(()=>document.querySelector('.arena-emote-slot-1 img')===window.__firstBubble),true,'replayed event does not recreate/restart bubble');
  const current=snapshot;await push({...current,serverTime:current.serverTime-1000,events:[event('stale','fake_cry')]});
  assert.equal(await page.evaluate(()=>document.querySelector('.arena-emote-slot-1 img')===window.__firstBubble),true,'older snapshot cannot replace current reaction');snapshot=current;
  await page.emulateMedia({reducedMotion:'no-preference'});await push(emotes({events:[event('animated','slow_clap')]}));
  assert.match(await page.locator('.arena-emote-slot-1 img').getAttribute('src'),/\.webp(?:\?|$)/,'normal motion uses animated artwork');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('.arena-emote-slot-1 img')?.src.endsWith('.png'));
  await push(emotes({enabled:false,events:[]}));assert.equal(await page.locator('.arena-emote-image').count(),0,'server block/disable clears visible reactions');assert.equal(await visible(page,'.arena-emotes'),false);
  await push(emotes());await page.locator('.arena-emote-toggle').waitFor({state:'visible'});
  await page.locator('.arena-emote-toggle').click();await page.locator('.arena-emote-mute').click();
  assert.equal(await page.locator('.arena-emote-slot-1 img').count(),0,'mute immediately clears incoming reaction');
  await push(emotes({events:[event('muted-2','nanik')]}));assert.equal(await page.locator('.arena-emote-slot-1 img').count(),0);
  await page.locator('.arena-emote-mute').click();await page.locator('[data-emote-id="laugh"]').click();
  await page.waitForFunction(()=>!!document.querySelector('.arena-emote-slot-0 img'));
  assert.equal(sent.length,1);assert.equal(sent[0].emoteId,'laugh');assert.equal(sent[0].matchKey,'123:1:100');assert.ok(sent[0].requestId);
  await page.locator('.arena-emote-toggle').click();assert.equal(await page.locator('[data-emote-id]:disabled').count(),6,'server cooldown disables every choice');
  await page.keyboard.press('Escape');
  const before=reads;await page.waitForTimeout(mode==='arena'?900:4300);assert.ok(reads>before,'real polling is active');
  await push(emotes());
  if(mode==='auction'){
   snapshot=emotes({matchKey:'123:2:100',events:[event('initial-new-match')]});data={...data,matchKey:snapshot.matchKey,matchNumber:2,round:0,revision:0,arenaEmotes:snapshot};
   await page.evaluate(r=>window.__emoteAuction.show(r),data);await page.locator('.arena-emote-toggle').waitFor({state:'visible'});
   assert.equal(await page.locator('.arena-emote-image').count(),0,'rematch does not replay initial history');
   await page.evaluate(s=>window.__testStream.emitEmotes(s),emotes({events:[event('late-old-match')]}));
   assert.equal(await page.locator('.arena-emote-image').count(),0,'late prior-match event cannot enter rematch');
  }else{
   await push(emotes({matchKey:'123:0:100',events:[event('late-old-match')]}));
   assert.equal(await page.locator('.arena-emote-slot-1 img').count(),0,'old arena match snapshot is ignored');snapshot=emotes();
  }
  hold=true;await page.locator('.arena-emote-toggle').click();await page.locator('[data-emote-id="nanik"]').click();
  await page.waitForFunction(()=>document.querySelector('.arena-emote-status').textContent.includes('Gönderiliyor'));
  for(let attempt=0;!held&&attempt<100;attempt++)await page.waitForTimeout(10);assert.ok(held,'pending POST reached synthetic server before leaving');
  if(mode==='arena')await page.evaluate(()=>{history.replaceState({},'',location.pathname+'?auctionCode=456&auctionToken=other');window.dispatchEvent(new Event('heroarena:route-change'));});
  else await page.evaluate(()=>window.__emoteAuction.leave());
  if(held)await held.route.fulfill({contentType:'application/json',body:JSON.stringify(held.result)}).catch(()=>{});
  await page.waitForTimeout(100);assert.equal(await visible(page,'.arena-emotes'),false,'old response cannot restore departed match');
  assert.equal(await page.locator('.arena-emote-image').count(),0,'departing removes bubbles');
  // Restore a test context, then model logout in another tab without changing
  // app.js's in-memory login. The persisted identity must win immediately.
  snapshot=emotes();
  if(mode==='arena'){
   await page.evaluate(()=>{history.replaceState({},'',location.pathname+'?room=arena&auctionCode=123&auctionToken=synthetic-seat&auctionMatchKey=123%3A1%3A100&commanderTest=1');window.dispatchEvent(new Event('heroarena:route-change'));});
   await push(snapshot);
  }else{data=room();await page.evaluate(r=>{window.__emoteAuction.setContext();window.__emoteAuction.show(r);},data);}
  await page.locator('.arena-emote-toggle').waitFor({state:'visible'});
  await page.evaluate(()=>{localStorage.removeItem('hero-auction-login');window.dispatchEvent(new StorageEvent('storage',{key:'hero-auction-login',newValue:null}));});
  assert.equal(await visible(page,'.arena-emotes'),false,'cross-tab logout disables old seat reactions');
  assert.equal(await page.locator('.arena-emote-image').count(),0,'cross-tab logout clears artwork');
  assert.deepEqual(errors,[],mode+' has no uncaught browser errors');
  console.log(`PASS ${mode} ${viewport.width}x${viewport.height}`);await context.close();
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
