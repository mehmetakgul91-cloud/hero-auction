// CI-only browser integration. No local browser launch, production credentials,
// mocked payment responses, public fixture endpoint, or authentication bypass.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const APPROVED='postgresql://test:test@127.0.0.1:5432/hero_bot_browser_test';
if(process.env.HERO_BOT_BROWSER_TEST_DB!==APPROVED||process.env.DATABASE_URL||process.env.GITHUB_ACTIONS!=='true'||process.env.CI!=='true'){
 console.error('REFUSED: GitHub Actions CI and exact disposable loopback HERO_BOT_BROWSER_TEST_DB required; remove DATABASE_URL. No connection or browser launch attempted.');process.exit(1);
}
const {default:pg}=await import('pg');
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const {settleBotMatch,BOT_ECONOMY}=await import('../bot-economy.js');
const {simulateRosterBattle}=await import('../battle-roster.js');
const {prepareBattleTeams,auctionRoomToBattleState}=await import('../battle-match.js');
const {battleRoster}=await import('../battle-roster.js');
const {buildDefaultFormation}=await import('../public/preparation-formation.js');
const pool=new pg.Pool({host:'127.0.0.1',port:5432,database:'hero_bot_browser_test',user:'test',password:'test',ssl:false,max:5,connectionTimeoutMillis:5000,options:'-c statement_timeout=10000 -c lock_timeout=5000',application_name:'hero-disposable-bot-browser'});
const artifacts=path.resolve(process.env.HERO_BROWSER_SCREENSHOTS||'artifacts/bot-browser');
await mkdir(artifacts,{recursive:true});
const failures=[],dialogs=[],network=[],direct=[];let child,browser,origin,logs='',lastPage;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function stop(){
 if(!child)return;const current=child;child=null;if(current.exitCode!==null||current.signalCode!==null)return;
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{current.kill('SIGKILL');},3000),deadline=setTimeout(()=>reject(Error('Fixture server did not exit; DB fixture write refused')),8000);current.once('exit',()=>{clearTimeout(timeout);clearTimeout(deadline);resolve();});current.kill('SIGTERM');});
}
async function start(){
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));origin='http://127.0.0.1:'+port;
 child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),DATABASE_URL:APPROVED,AUTH_SIGNING_SECRET:'22'.repeat(32),COMMANDER_TEST_GUEST_MODE:'0',HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1',HERO_VICTORY_CHESTS_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs);try{const response=await fetch(origin+'/api/info');if(response.ok&&(await response.json()).botEconomy?.available)return;}catch{}await delay(50)}throw Error('Bot browser server unavailable: '+logs);
}
async function post(route,body){const response=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();assert.equal(response.status,200,route+': '+JSON.stringify(data));return data;}
async function wallet(account){return(await pool.query('SELECT w.gold,d.diamonds,m.magic_dust FROM hero_auction_wallets w LEFT JOIN hero_auction_diamond_wallets d USING(account_id) LEFT JOIN hero_auction_magic_dust_wallets m USING(account_id) WHERE account_id=$1',[account])).rows[0];}
async function entries(account){return Number((await pool.query('SELECT count(*) AS n FROM hero_auction_bot_entries WHERE account_id=$1',[account])).rows[0].n);}
async function identity(name){const auth=await post('/api/auth/guest',{name});await post('/api/commander/select',{authToken:auth.authToken,commanderId:'attack'});return auth;}
async function pageFor(auth,width=1440,session=null){
 const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){network.push({blocked:url.origin});return route.abort();}return route.continue();});
 await context.addInitScript(({auth,session})=>{
  localStorage.setItem('hero-auction-login',JSON.stringify({type:'guest',user:auth.user,authToken:auth.authToken}));
  localStorage.setItem('hero-auction-first-match-guide','seen');
  if(session)localStorage.setItem('hero-auction-session',JSON.stringify(session));
 },{auth,session});
 const page=await context.newPage();lastPage=page;page.setDefaultTimeout(15000);page.on('pageerror',e=>failures.push(e.message));return{context,page};
}
async function lobby(page){await page.goto(origin+'/');await page.locator('#home-play-tab').click();await page.locator('#bot').waitFor({state:'visible'});}
async function confirmAction(page,selector,auth,{accept=false,difficulty='medium'}={}){
 const before=await wallet(auth.user.sub),count=await entries(auth.user.sub),waiting=page.waitForEvent('dialog');
 const clicked=page.locator(selector).click();const dialog=await waiting;
 const copy=dialog.message(),rule=BOT_ECONOMY.difficulties[difficulty];dialogs.push({selector,difficulty,copy});
 assert.match(copy,/50 altın/);assert.ok(copy.includes(String(rule.level)));assert.ok(copy.includes(rule.gold+' altın'));assert.match(copy,/Elmas yok/);
 if(rule.magicDust)assert.ok(copy.includes(rule.magicDust+' büyü tozu'));
 assert.deepEqual(await wallet(auth.user.sub),before,'dialog appears before any debit');assert.equal(await entries(auth.user.sub),count);
 if(accept)await dialog.accept();else await dialog.dismiss();await clicked;
 return{before,count};
}
async function capture(page,name){await page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:true});}
try{
 assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'hero_bot_browser_test');
 assert.equal(Number((await pool.query("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n),0,'fresh empty database only; never reset an existing DB');
 await pool.query('CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0)); CREATE TABLE hero_auction_magic_dust_wallets(account_id TEXT PRIMARY KEY REFERENCES hero_auction_wallets(account_id),magic_dust INTEGER NOT NULL DEFAULT 0 CHECK(magic_dust>=0)); CREATE TABLE hero_auction_diamond_wallets(account_id TEXT PRIMARY KEY REFERENCES hero_auction_wallets(account_id),diamonds INTEGER NOT NULL DEFAULT 0 CHECK(diamonds>=0)); CREATE TABLE hero_auction_rooms(code VARCHAR(3) PRIMARY KEY,state JSONB NOT NULL,updated_at TIMESTAMPTZ DEFAULT NOW());');
 await pool.query(await readFile(new URL('../migrations/009-bot-fixed-economy.sql',import.meta.url),'utf8'));
 await start();browser=await chromium.launch({headless:true});
 for(const [index,difficulty] of ['easy','medium','hard'].entries()){
  const auth=await identity('Browser '+difficulty),{context,page}=await pageFor(auth,index===1?390:1440);await lobby(page);
  await page.selectOption('#bot-difficulty',difficulty);const copy=await page.locator('#bot-economy').innerText(),rule=BOT_ECONOMY.difficulties[difficulty];
  assert.match(copy,/Giriş: 50 altın/);assert.ok(copy.includes(rule.gold+' altın'));assert.ok(copy.includes('Seviye '+rule.level));assert.match(copy,/Elmas yok/);
  await capture(page,'before-charge-'+difficulty+(index===1?'-mobile':'-desktop'));
  const cancelled=await confirmAction(page,'#bot',auth,{difficulty});assert.equal(await entries(auth.user.sub),0);assert.deepEqual(await wallet(auth.user.sub),cancelled.before);assert.equal(await page.locator('#bot').isDisabled(),false);
  let release,held=0;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/api/bot',async route=>{held++;await gate;await route.continue();});
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/bot');
  await confirmAction(page,'#bot',auth,{accept:true,difficulty});
  await page.waitForFunction(()=>document.getElementById('bot').disabled===true);
  await page.evaluate(()=>{document.getElementById('bot').click();document.getElementById('bot').click()});for(let i=0;i<100&&held===0;i++)await delay(20);assert.equal(held,1,'pending entry cannot submit duplicate requests');
  assert.equal(await entries(auth.user.sub),0);release();const admitted=await response;assert.equal(admitted.status(),200);const result=await admitted.json();
  await page.waitForSelector('#game:not([hidden])');assert.equal(await entries(auth.user.sub),1);assert.equal((await wallet(auth.user.sub)).gold,cancelled.before.gold-50);
  direct.push({auth,room:result.room,token:result.token,difficulty,width:index===1?390:1440,before:cancelled.before});await context.close();
 }
 const poor=await identity('Browser insufficient');await pool.query('UPDATE hero_auction_wallets SET gold=49 WHERE account_id=$1',[poor.user.sub]);
 {const {context,page}=await pageFor(poor,390);await lobby(page);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/bot');await confirmAction(page,'#bot',poor,{accept:true});assert.equal((await response).status(),400);await page.waitForFunction(()=>document.getElementById('bot').disabled===false);assert.match(await page.locator('#toast').innerText(),/50 altın/);assert.equal(await entries(poor.user.sub),0);assert.equal((await wallet(poor.user.sub)).gold,49);await capture(page,'insufficient-mobile');await context.close();}
 // Exercise the actual sixty-second server fallback, not a mocked timer/response.
 const fallback=await identity('Browser fallback');
 {const {context,page}=await pageFor(fallback,390);await lobby(page);const before=await wallet(fallback.user.sub);await page.click('#match');await page.locator('#bot-offer-accept').waitFor({state:'visible',timeout:75000});assert.equal(await entries(fallback.user.sub),0);assert.deepEqual(await wallet(fallback.user.sub),before);await capture(page,'fallback-offer-mobile');
  await confirmAction(page,'#bot-offer-accept',fallback);assert.deepEqual(await wallet(fallback.user.sub),before);
  const leaving=page.waitForEvent('dialog'),click=page.click('#bot-offer-cancel');await(await leaving).accept();await click;await page.locator('#home-play-tab').waitFor({state:'visible'});assert.equal(await entries(fallback.user.sub),0);
  await page.click('#home-play-tab');await page.click('#match');await page.locator('#bot-offer-accept').waitFor({state:'visible',timeout:75000});const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/bot-accept');await confirmAction(page,'#bot-offer-accept',fallback,{accept:true});assert.equal((await response).status(),200);assert.equal(await entries(fallback.user.sub),1);assert.equal((await wallet(fallback.user.sub)).gold,before.gold-50);await context.close();}
 // Trusted disposable-DB terminal fixtures. No browser/public winner endpoint.
 // Combat has independent real-engine HTTP coverage; truncate only this fixture's
 // replay transcript to its last real event so UI verification does not replay
 // several minutes of combat. Winner and teams come from the real simulator.
 await stop();
 for(const item of direct){
  const room=(await pool.query('SELECT state FROM hero_auction_rooms WHERE code=$1',[item.room.code])).rows[0].state;
  room.phase='finished';room.round=10;room.deadline=null;room.players.forEach((p,i)=>{p.team=room.cards.slice(i*5,i*5+5).map(c=>({...c,cost:0}));p.credits=20;});
  let teams=prepareBattleTeams(auctionRoomToBattleState(room)),result;
  for(let attempt=0;attempt<100;attempt++){result=simulateRosterBattle(...teams,{seed:'browser-terminal-'+attempt,remainingCredits:[20,20]});if(result.winner===0)break;}
  if(result.winner!==0){[room.players[0].team,room.players[1].team]=[room.players[1].team,room.players[0].team];teams=prepareBattleTeams(auctionRoomToBattleState(room));for(let attempt=0;attempt<100;attempt++){result=simulateRosterBattle(...teams,{seed:'browser-terminal-swapped-'+attempt,remainingCredits:[20,20]});if(result.winner===0)break;}}
  assert.equal(result.winner,0,'synthetic terminal fixture must be a simulator win');assert.ok(result.log.length);
  const formations=teams.map(team=>buildDefaultFormation(team.map(card=>({...card,role:battleRoster.find(h=>h.id===card.id).role}))));
  room.battleSync={key:(room.matchNumber||1)+':'+room.created,ready:formations,drafts:formations,result:{...result,live:false,finished:true,log:result.log.slice(-1)}};
  room.battleCompleted=[false,false];const settled=await settleBotMatch({database:pool,room,winner:0});item.receipt=settled.receipt;
 }
 await start();
 for(const item of direct){
  const {context,page}=await pageFor(item.auth,item.width,{code:item.room.code,token:item.token});
  await page.goto(origin+'/battle-preview.html?room=arena&auctionCode='+item.room.code+'&auctionToken='+item.token);
  await page.locator('#arena-victory-chest').waitFor({state:'visible',timeout:45000});
  const chest=page.locator('#arena-victory-chest'),rule=BOT_ECONOMY.difficulties[item.difficulty];
  assert.equal(await chest.locator('[data-currency="gold"] .victory-chest-amount').innerText(),'+'+rule.gold);assert.equal(await chest.locator('[data-currency="diamonds"]').count(),0);
  if(rule.magicDust)assert.equal(await chest.locator('[data-currency="magicDust"] .victory-chest-amount').innerText(),'+'+rule.magicDust);else assert.equal(await chest.locator('[data-currency="magicDust"]').count(),0);
  await capture(page,'fixed-win-'+item.difficulty+(item.width===390?'-mobile':'-desktop'));
  const balance=await wallet(item.auth.user.sub);assert.equal(balance.gold,item.before.gold-50+rule.gold);assert.equal(Number(balance.magic_dust),rule.magicDust);assert.equal(Number(balance.diamonds||0),Number(item.before.diamonds||0));
  await confirmAction(page,'.arena-rematch-button',item.auth,{difficulty:item.difficulty});assert.deepEqual(await wallet(item.auth.user.sub),balance);assert.equal(await page.locator('.arena-rematch-button').isDisabled(),false);
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/rematch');await confirmAction(page,'.arena-rematch-button',item.auth,{accept:true,difficulty:item.difficulty});assert.equal((await response).status(),200);assert.equal(await entries(item.auth.user.sub),2);assert.equal((await wallet(item.auth.user.sub)).gold,balance.gold-50);await context.close();
 }
 assert.deepEqual(failures,[]);console.log('PASS: real PostgreSQL browser integration: all difficulty terms before payment, cancel, pending duplicate lock, insufficient balance, real 60-second fallback, committed fixed win receipts/no diamonds, and per-game rematch confirmation. Desktop/mobile screenshots saved.');
}catch(error){if(lastPage&&!lastPage.isClosed())await capture(lastPage,'failure').catch(()=>{});throw error;}
finally{await writeFile(path.join(artifacts,'dialogs.json'),JSON.stringify(dialogs,null,2));await writeFile(path.join(artifacts,'browser-errors.json'),JSON.stringify(failures,null,2));await writeFile(path.join(artifacts,'network-policy.json'),JSON.stringify(network,null,2));await writeFile(path.join(artifacts,'server.log'),logs);if(browser)await browser.close();await stop();await pool.end();}
