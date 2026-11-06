// Real production emote entry/controller and auction app against synthetic APIs.
// Arena simulation is replaced with a deterministic, populated production renderer so no game,
// account, payment, external service, or production deployment is touched.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {abilityImpact} from '../public/hero-ability-text.js';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const artifacts=path.resolve(process.env.HERO_BROWSER_SCREENSHOTS||'artifacts/arena-emotes');
await mkdir(artifacts,{recursive:true});
const report=[];
const root=fileURLToPath(new URL('../public/',import.meta.url));
const roster=JSON.parse(await readFile(new URL('../battle-roster.json',import.meta.url),'utf8')).characters;
const fixtureHeroes=['original:09','original:15','original:expansion-01','original:14','original:01'].map((id,index)=>{
 const hero=roster.find(hero=>hero.id===id);assert.ok(hero,'fixture hero exists');
 return {...hero,hp:1000,maxHp:1000,lane:index<3?'front':'back',cost:2,power:80};
});
// Match publicRoom metadata exactly. Portraits, IDs, roles and powers are not
// available on acquired auction cards. Completed teams are a layout stress fixture.
const publicHeroes=fixtureHeroes.map(({name,universe,rarity,cost})=>({name,universe,rarity,cost}));
const bridge=`\nwindow.__emoteAuction={show,connect,showFresh(r){room=null;show(r);},setContext(){login={authToken:'synthetic-account',type:'guest',user:{sub:'synthetic-user',name:'Player'}};session={token:'synthetic-seat',code:'123'};},leave(){room=null;session=null;applyLogin();}};\n`;
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
const event=(id,emoteId='laugh',side=1)=>({id,emoteId,side,expiresAt:Date.now()+5000});
const room=(teamSize=5)=>({code:'123',matchKey:'123:1:100',matchNumber:1,created:100,revision:1,me:0,phase:'auction',round:8,card:{...publicHeroes[0]},turn:0,topBid:0,topSeat:null,deadline:Date.now()+60000,universe:'mixed',mode:'friend',presence:{serverNow:Date.now(),seats:[]},history:[],chat:[],series:[0,0],rematch:[false,false],players:[{name:'Player',commander:{commanderId:'attack'},credits:10,team:publicHeroes.slice(0,teamSize),playerId:'HA-PLAYER'},{name:'Opponent',commander:{commanderId:'defense'},credits:10,team:publicHeroes.slice(0,teamSize),playerId:'HA-OPPONENT'}],arenaEmotes:emotes()});
const overlap=(a,b)=>a&&b&&Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1;
async function visible(page,selector){return page.locator(selector).first().isVisible();}
async function documentBox(page,selector){return page.locator(selector).evaluate(node=>{const box=node.getBoundingClientRect();return {x:box.x+scrollX,y:box.y+scrollY,width:box.width,height:box.height};});}
async function verifyPlacement(page,mode){
 const reaction=await page.locator('.arena-emotes').boundingBox();assert.ok(reaction,'reaction controls are visible');
 assert.ok(reaction.x>=-1&&reaction.x+reaction.width<=page.viewportSize().width+1,'reaction controls fit viewport');
 for(const selector of mode==='arena'?['#arena-score','#experimental-commander-controls','#arena-music-toggle','.arena-home-link','#arena-friend-opponent']:['#bidrange','#bidbutton','#passbutton']){
  if(!await visible(page,selector))continue;
  assert.ok(!overlap(reaction,await page.locator(selector).first().boundingBox()),`closed reactions must not overlap ${selector}`);
 }
}
async function verifyCompactIdle(page,mode){
 assert.equal(await page.locator('.arena-emote-image').count(),0,'idle state has no reaction artwork');
 if(mode==='arena'){
  const nav=await page.locator('.arena-room-nav').boundingBox(),score=await page.locator('#arena-score').boundingBox();
  assert.equal(nav.height,44,'idle navigation must retain its original 44px height, not reserve an emote rail');
  assert.ok(score.y-nav.y-nav.height<=8,'score follows navigation without a permanent reaction gap');
  assert.equal(await page.locator('.shell').evaluate(n=>getComputedStyle(n).gridTemplateRows.split(' ')[0]),'44px','arena grid must not reserve 180px for hidden reactions');
 }else{
  assert.equal((await page.locator('.auction-player-heading .arena-emotes').boundingBox()).height,44,'auction reserves only its actual picker control');
  if(page.viewportSize().width>=360){
   for(const selector of ['#player0 .auction-player-heading','#player1 .auction-player-heading']){
    const height=(await page.locator(selector).boundingBox()).height;
    // A real scrollbar can wrap the self label at 390px (observed 53.08px).
    // Keep that approved compact row rather than assuming overlay scrollbars.
    if(page.viewportSize().width<520)assert.ok(height>=44&&height<=60,'mobile commander/picker heading stays compact when its self label wraps');
    else assert.equal(height,51,'wide commander and picker share the approved 51px heading');
   }
  }
  assert.equal(await page.locator('.auction-player-heading .arena-emotes').evaluate(n=>getComputedStyle(n).zIndex),'auto','own reaction cannot be trapped beneath chat by its flex-item wrapper');
  assert.equal(await page.locator('#player1 .arena-emote-slot-1').evaluate(n=>getComputedStyle(n).position),'absolute','opponent reaction cannot reserve header height');
 }
}
async function layoutSnapshot(page,mode){
 const selectors=mode==='arena'?['.arena-room-nav','#arena-score','#battle-arena','#experimental-commander-controls']:['#stage','#player0','#player1','#bidbutton','#passbutton','#player0 .auction-player-heading','#player1 .auction-player-heading','#player0 .teams','#player1 .teams','.auction-card-details','#auction-lane-bonuses','#chat-compose'];
 const result={};for(const selector of selectors)if(await visible(page,selector))result[selector]=await documentBox(page,selector);return result;
}
async function verifyBubbles(page,mode){
 const images=page.locator('.arena-emote-image');assert.equal(await images.count(),2,'both senders are visible simultaneously');
 const boxes=[];
 for(const img of await images.all()){
  const box=await img.boundingBox();assert.equal(box.width,132,'reaction is exactly three times the old 44px width');assert.equal(box.height,132,'reaction is exactly three times the old 44px height');
  assert.ok(box.x>=-1&&box.x+box.width<=page.viewportSize().width+1,'large reaction stays inside horizontal viewport');
  assert.equal(await img.evaluate(node=>getComputedStyle(node.parentElement).pointerEvents),'none','reaction cannot intercept gameplay input');
  assert.equal(await img.evaluate(node=>getComputedStyle(node.parentElement).zIndex),'30','reaction retains its shared overlay layer');
  for(const selector of mode==='arena'?['#arena-score','#experimental-commander-controls','#arena-music-toggle','.arena-home-link','#arena-friend-opponent','.arena-emote-toggle']:['#bidrange','#bidbutton','#passbutton','#player0 .auction-commander','#player1 .auction-commander','#auction-active','#auction-passive','#auction-lane-bonuses','.arena-emote-toggle','#minusbid','#plusbid','#chat-compose','#chat-input','#chat-send']){
   if(!await visible(page,selector))continue;
   assert.ok(!overlap(box,await page.locator(selector).first().boundingBox()),`large reaction must not obscure ${selector}`);
  }
  if(mode==='arena'){
   const stage=await page.locator('#battle-arena').boundingBox();
   assert.ok(box.x>=stage.x&&box.x+box.width<=stage.x+stage.width&&box.y>=stage.y&&box.y+box.height<=stage.y+stage.height,'reaction floats inside existing battlefield, not another layout row');
  }
  if(mode==='auction'){
   const card=await img.evaluate(node=>{const r=node.closest('.player-side').getBoundingClientRect();return {x:r.x,width:r.width};});
   assert.ok(box.x>=card.x&&box.x+box.width<=card.x+card.width,'reaction stays within its commander card horizontally; empty teams need no permanent vertical rail');
  }
  boxes.push(box);
 }
 assert.ok(!overlap(...boxes),'sender and opponent reactions stay separate');
}

async function verifyAuctionContent(page,teamSize){
 assert.equal(await page.locator('.side-hero').count(),2*teamSize);
 assert.equal(await page.locator('.side-hero-portrait').count(),2*teamSize);
 if(teamSize)await page.waitForFunction(()=>[...document.querySelectorAll('.side-hero-portrait')].every(img=>img.complete&&img.naturalWidth>0));
 const rows=await page.locator('.side-hero').evaluateAll(nodes=>nodes.map(node=>{
  const box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const img=node.querySelector('img');return {name:box(node.querySelector('.side-hero-name')),cost:box(node.querySelector('.side-hero-cost')),portrait:img.getAttribute('src'),hero:img.dataset.heroName,role:node.querySelector('.side-hero-role').textContent};
 }));
 for(const row of rows){assert.ok(!overlap(row.name,row.cost),'hero name never collides with its price');const hero=fixtureHeroes.find(hero=>hero.name===row.hero);assert.equal(row.portrait,hero.portrait,'portrait comes from real API lookup, not a fixture-only URL');assert.ok(row.role.trim());}
 const width=page.viewportSize().width;
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow');
 if(width===390&&teamSize===5)for(const side of [0,1]){
  const last=await documentBox(page,`#player${side} .side-hero:last-child`);assert.ok(last.y+last.height<=page.viewportSize().height+1,'all ten acquired cards fit 390x844 without scrolling');
 }
 for(const selector of ['#auction-active','#auction-passive','#auction-lane-bonuses']){
  assert.equal(await visible(page,selector),true,selector+' remains visible without a disclosure click');
  assert.equal(await page.locator(selector).evaluate(node=>node.scrollHeight<=node.clientHeight+1&&node.scrollWidth<=node.clientWidth+1),true,selector+' is not clipped');
 }
 assert.equal(await page.locator('#auction-active').textContent(),'⚔ Aktif: '+abilityImpact(fixtureHeroes[0].active,{compact:true}));
 assert.equal(await page.locator('#auction-passive').textContent(),'✦ Pasif: '+abilityImpact(fixtureHeroes[0].passive,{compact:true}));
 assert.match(await page.locator('#auction-lane-bonuses').textContent(),/ÖN SAF.*%.*ARKA SAF.*%/);
 assert.ok(await page.locator('#auction-lane-bonuses').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=11));
 const main=await documentBox(page,'.auction-main'),details=await documentBox(page,'.auction-card-details');
 assert.ok(details.y>=main.y+main.height&&details.width>=main.width-1,'ability text is full-width below the art/bid composition');
 for(const selector of ['#bidbutton','#passbutton','#minusbid','#plusbid','.arena-emote-toggle']){
  const box=await page.locator(selector).boundingBox();assert.ok(box.width>=44&&box.height>=44,selector+' keeps a touch-sized target');
 }
 for(const selector of ['#player0>.credit','#player0>.spent-credit','#hero-description'])assert.equal(await visible(page,selector),false,'no duplicate budget stack or invented story area');
}

try{
 browser=await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']});
 for(const mode of ['arena','auction'])for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390},{width:1280,height:900}]){
  const context=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage(),errors=[],sent=[];
  const caseName=`${mode}-${viewport.width}x${viewport.height}`,apiCalls=[];
  const screenshot=async name=>{await page.screenshot({path:path.join(artifacts,`${caseName}-${name}.png`),fullPage:true,animations:'disabled',timeout:10000});};
  let data=room(mode==='auction'?0:5),snapshot=emotes(),reads=0,held=null,hold=false;
  try{
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   localStorage.setItem('hero-auction-login',JSON.stringify({authToken:'synthetic-account',type:'guest',user:{sub:'synthetic-user',name:'Player'}}));
   localStorage.setItem('hero-auction-first-match-guide','seen');
   localStorage.setItem('hero-auction-session',JSON.stringify({code:'123',token:'synthetic-seat'}));
   window.EventSource=class{constructor(){window.__testStream=this;this.handlers={};}close(){}addEventListener(type,handler){this.handlers[type]=handler;}removeEventListener(type){delete this.handlers[type];}emit(room){this.onmessage?.({data:JSON.stringify(room)});}emitEmotes(data){this.handlers['arena-emotes']?.({data:JSON.stringify(data)});}};
   window.google={accounts:{id:{initialize(){},renderButton(){}}}};
  });
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
   if(mode==='arena'&&['/battle-preview.js','/commander-arena-effects.js','/commander-round-playback.js','/commander-live-cooldown.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   if(!url.pathname.startsWith('/api/'))return route.continue();
   apiCalls.push({path:url.pathname,query:url.search,method:request.method()});
   const wallet={gold:500,diamonds:0,magicDust:0};let result;
   const incidental={
    '/api/friends':{playerId:'HA-PLAYER',friends:[],incoming:[],outgoing:[],persistent:false,guest:true},
    '/api/friends/presence':{ok:true},
    '/api/friend/invitations':{incoming:[],outgoing:[]},
    '/api/wallet':wallet,
    '/api/info':{catalogueCount:50,playerAnalytics:{enabled:false},botEconomy:{available:false},victoryChests:{enabled:false,available:false}},
    '/api/commander/get':{...wallet,profile:{commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}},progression:null,exchange:{available:false}},
    '/api/store/status':{...wallet,diamondsEnabled:false,loginRewards:{enabled:false,available:false},purchase:{available:false},rewardedAds:{enabled:false},exchange:{available:false}},
    '/api/moderation/state':{blocked:[],reports:[]}
   };
   if(url.pathname==='/api/experimental/commander-live'){reads++;result={version:1,round:1,side:0,commanderId:'attack',finished:false,abilities:[{energy:100,ultimateEnergy:100},{}],arenaEmotes:snapshot};}
   else if(url.pathname==='/api/arena-emotes'){
    sent.push(request.postDataJSON());snapshot=emotes({matchKey:sent.at(-1).matchKey,cooldownMs:5000,events:[event('own-'+sent.length,sent.at(-1).emoteId,0)]});result={arenaEmotes:snapshot};
    if(hold){held={route,result};return;}
   }else if(url.pathname==='/api/state'){reads++;result={room:{...data,arenaEmotes:snapshot}};}
   else if(url.pathname==='/api/heroes')result={heroes:roster.map(({name,universe,role})=>({name,universe,role}))};
   else if(url.pathname==='/api/online')result={players:0,matches:0,waiting:0};
   else if(url.pathname==='/api/art'){const hero=roster.find(hero=>hero.name===url.searchParams.get('name')&&hero.universe===url.searchParams.get('universe'));assert.ok(hero,'art requests contain real public name/universe metadata');result={url:hero.portrait,source:null,description:hero.name,role:hero.role,active:hero.active,passive:hero.passive,laneModifiers:hero.laneModifiers};}
   else if(url.pathname==='/api/auth/check')result={...wallet,user:{sub:'synthetic-user',name:'Player'}};
   else if(url.pathname==='/api/room/current')result={room:null};
   else if(Object.hasOwn(incidental,url.pathname))result=incidental[url.pathname];
   // An unsupported incidental endpoint must not masquerade as a successful
   // empty response and corrupt another component's cached model.
   else return route.fulfill({status:501,contentType:'application/json',body:JSON.stringify({error:'Synthetic fixture has no response for '+url.pathname})});
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  if(mode==='arena'){
   await page.goto(origin+'/battle-preview.html?room=arena&auctionCode=123&auctionToken=synthetic-seat&auctionMatchKey=123%3A1%3A100&commanderTest=1');
   await page.evaluate(()=>{document.body.classList.add('arena-room','arena-fit');for(const id of ['arena-score','battle-arena','experimental-commander-controls'])document.getElementById(id).hidden=false;const dock=document.createElement('div');dock.id='arena-commander-dock';dock.className='arena-commander-dock';document.getElementById('battle-arena').after(dock);dock.append(document.getElementById('arena-commander-matchup'),document.getElementById('experimental-commander-controls'));document.querySelector('.formation').hidden=true;document.getElementById('battle-lobby').hidden=true;const nav=document.querySelector('.arena-room-nav');nav.classList.add('arena-social-nav');const friend=document.createElement('button');friend.id='arena-friend-opponent';friend.textContent='＋ Rakibi arkadaş ekle';nav.append(friend);});
   await page.evaluate(async heroes=>{
    const {createArenaTeamRenderer}=await import('/arena-team-renderer.js');
    const {getArenaLaneLayout,refreshArenaViewport}=await import('/arena-viewport.js');
    const {mountArenaSceneLayout}=await import('/arena-scene-layout.js');
    const stage=document.getElementById('battle-arena');stage.dataset.arenaTheme='ruins';
    const teams=[heroes,heroes],layout=getArenaLaneLayout(teams),renderer=createArenaTeamRenderer({document,loadArt:hero=>hero.portrait});
    for(let side=0;side<2;side++)renderer.update(document.getElementById(side?'team-b':'team-a'),teams[side],{side,rows:layout.rows,laneRows:layout.teams[side],fittedRows:layout.teams[side],roleNames:{}});
    for(const side of ['a','b'])document.getElementById('team-hp-'+side+'-label').textContent='5000 / 5000 HP';
    refreshArenaViewport({document});mountArenaSceneLayout(stage).refresh();
   },fixtureHeroes);
   await page.waitForFunction(()=>document.querySelectorAll('.arena-portrait-image').length===10&&[...document.querySelectorAll('.arena-portrait-image')].every(img=>img.complete&&img.naturalWidth>0));
  }else{
   await page.goto(origin);await page.waitForFunction(()=>!!window.__emoteAuction);await page.waitForLoadState('networkidle');
   await page.evaluate(r=>{window.__emoteAuction.setContext();window.__emoteAuction.show(r);window.__emoteAuction.connect();},data);
   await page.waitForFunction(()=>document.querySelector('#stage .card-art img')?.naturalWidth>0);
  }
  await page.locator('.arena-emote-toggle').waitFor({state:'visible'});
  const push=async next=>{snapshot=next;if(mode==='arena')await page.evaluate(arenaEmotes=>window.dispatchEvent(new CustomEvent('heroarena:commander-state',{detail:{finished:false,arenaEmotes}})),next);else{data={...data,revision:data.revision+1,arenaEmotes:next};await page.evaluate(r=>window.__testStream.emit(r),data);}};
  if(mode==='auction'){
   await verifyAuctionContent(page,0);await verifyCompactIdle(page,mode);
   const empty=await layoutSnapshot(page,mode);await push(emotes({events:[event('empty-own','laugh',0),event('empty-opponent','nanik',1)]}));
   await verifyBubbles(page,mode);assert.deepEqual(await layoutSnapshot(page,mode),empty,'early reactions never expand empty teams or cover controls');await screenshot('empty-team-reactions');
   await page.waitForTimeout(5200);await verifyCompactIdle(page,mode);assert.deepEqual(await layoutSnapshot(page,mode),empty);
   data=room();snapshot=emotes();data.arenaEmotes=snapshot;await page.evaluate(r=>window.__emoteAuction.showFresh(r),data);await verifyAuctionContent(page,5);
   const artCount=apiCalls.filter(call=>call.path==='/api/art').length;
   await page.evaluate(()=>{window.__bidNode=document.getElementById('bidrange');window.__chatNode=document.getElementById('chat-input');window.__bidNode.value='6';window.__bidNode.dispatchEvent(new Event('input'));window.__bidNode.focus({preventScroll:true});window.__chatNode.value='Unsent draft';});
   await push(emotes());await verifyAuctionContent(page,5);
   assert.equal(await page.evaluate(()=>window.__bidNode===document.getElementById('bidrange')&&document.activeElement===window.__bidNode&&window.__bidNode.value==='6'),true,'presence repaint preserves bid selection, controls and focus');
   assert.equal(await page.evaluate(()=>window.__chatNode===document.getElementById('chat-input')&&window.__chatNode.value==='Unsent draft'),true,'presence repaint preserves the chat composer');
   assert.equal(apiCalls.filter(call=>call.path==='/api/art').length,artCount,'acquired portrait requests are cached across repaints');
  }
  await verifyPlacement(page,mode);await verifyCompactIdle(page,mode);const compactBefore=await layoutSnapshot(page,mode);const gameplayBefore=await documentBox(page,mode==='arena'?'#battle-arena':'#bidbutton');await screenshot('closed-controls');
  if(mode==='arena'){
   await page.evaluate(arenaEmotes=>window.dispatchEvent(new CustomEvent('heroarena:commander-state',{detail:{finished:true,arenaEmotes}})),emotes({matchKey:'123:0:100'}));
   assert.equal(await visible(page,'.arena-emotes'),true,'late finished snapshot from old match must not stop current reactions');
  }
  if(mode==='arena'&&await visible(page,'#arena-friend-opponent'))assert.ok(!overlap(await page.locator('#arena-friend-opponent').boundingBox(),await page.locator('#arena-score').boundingBox()),'friend control beside emotes must not spill into HP');
  if(mode==='auction'){assert.equal(await page.locator('#player0 .auction-player-heading .arena-emotes').count(),1,'picker is mounted inside own commander heading');assert.equal(await page.locator('#player1 .auction-player-heading .arena-emote-slot-1').count(),1,'opponent reaction uses opponent commander heading');}
  await page.locator('.arena-emote-toggle').click();
  assert.deepEqual(await page.locator('[data-emote-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.emoteId)),['laugh','slow_clap','fake_cry','yawn','sunglasses','nanik']);
  assert.equal(await page.locator('.arena-emotes input,.arena-emotes textarea,.arena-emote-picker input,.arena-emote-picker textarea').count(),0,'no free text');
  await screenshot('picker-open');
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
  await screenshot('opponent-reaction');
  await push(emotes({events:[event('large-own','laugh',0),event('large-opponent','nanik',1)]}));
  await verifyBubbles(page,mode);
  assert.deepEqual(await layoutSnapshot(page,mode),compactBefore,'active reactions never expand headers, move controls or resize the battlefield');
  assert.deepEqual(await documentBox(page,mode==='arena'?'#battle-arena':'#bidbutton'),gameplayBefore,'reactions never move gameplay controls');
  await screenshot('simultaneous-large-reactions');
  await page.waitForTimeout(3100);assert.equal(await page.locator('.arena-emote-image').count(),2,'reactions remain beyond the old 2.8-second lifetime');
  await page.waitForTimeout(2100);assert.equal(await page.locator('.arena-emote-image').count(),0,'both reactions disappear after five seconds');
  await verifyCompactIdle(page,mode);assert.deepEqual(await layoutSnapshot(page,mode),compactBefore,'expiry restores the same compact geometry without leaving a blank rail');
  assert.deepEqual(await documentBox(page,mode==='arena'?'#battle-arena':'#bidbutton'),gameplayBefore,'expiry does not shift gameplay');
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
  await screenshot('passed-cleanup');report.push({case:caseName,status:'passed',errors,apiCalls});
  console.log(`PASS ${mode} ${viewport.width}x${viewport.height}`);
  }catch(error){
   await screenshot('FAILED').catch(captureError=>console.error('Failure screenshot unavailable:',captureError.message));
   report.push({case:caseName,status:'failed',error:error.stack||String(error),errors,apiCalls});throw error;
  }finally{
   await writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));await context.close();
  }
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
