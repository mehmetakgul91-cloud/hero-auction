import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,mkdir} from 'node:fs/promises';
import {battleRoster} from '../battle-roster.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
const {chromium}=await import(process.env.HERO_BROWSER_TEST_RUNTIME||'playwright');
const root=new URL('..',import.meta.url),shots=process.env.HERO_BROWSER_SCREENSHOTS||'/tmp/hero-splash-browser';
await mkdir(shots,{recursive:true});
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.js'],{cwd:root,env:{PATH:process.env.PATH,PORT:String(port),DATABASE_URL:''},stdio:'pipe'});
let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
function golden(side){
 const mage=battleRoster.find(h=>h.name==='Kış Kraliçesi');
 const all=[mage,...battleRoster.filter(h=>h.id!==mage.id).slice(0,9)].map(h=>({id:h.id,power:75}));
 const teams=prepareLiveArenaTeams(all.slice(0,5),all.slice(5),{cardAdapter:'auction'});
 for(const team of teams)for(const h of team)Object.assign(h,{hp:100,maxHp:100,defense:0,attack:1,shield:0,active:null,passive:null,lane:'back'});
 const actor=teams[0][0];Object.assign(actor,{attack:74,role:'energy',active:{effect:'splash',name:'Alan hasarı',power:1,splashRate:.3}});
 teams[1][0].lane='front';[20,0,6,20,0].forEach((shield,i)=>teams[1][i].shield=shield);
 const combat=createLiveCommanderCombat({teams,round:3,abilities:createLiveCommanderAbilities({matchKey:'browser-splash'}),commanders:[{commanderId:'attack'},{commanderId:'defense'}]});
 const before={teams:structuredClone(combat.teams),round:3,version:0,events:[],finished:false};
 const out=stepParityDamageSpecial(combat,{side:0,actorId:actor.id});
 const current={teams:out.teams,round:3,version:1,events:out.events,finished:false};
 if(side===1)for(const frame of [before,current]){frame.teams.reverse();frame.events=frame.events.map(e=>({...e,side:1-e.side}));}
 return {name:'50-primary-seat-'+side,before,current};
}
const samples=[golden(0),golden(1)];
if(process.env.HERO_SPLASH_TEST_EVIDENCE){
 const evidence=JSON.parse(await readFile(process.env.HERO_SPLASH_TEST_EVIDENCE,'utf8'));
 const sample=evidence.records.find(r=>r.match===1&&r.before&&r.current.version===r.before.version+1&&r.current.events.some(e=>e.version===r.current.version&&e.damageType==='special'&&e.absorbed>0));
 assert.ok(sample,'HTTP evidence must contain an atomic shielded main hit with splash');
 samples.push({name:'actual-http-rematch-'+sample.match,before:sample.before,current:{...sample.current,events:sample.current.events.filter(e=>e.version>sample.before.version)}});
}
let browser;
try{
 for(let i=0;i<100&&!logs.includes('Hero Auction http://');i++)await new Promise(r=>setTimeout(r,50));assert.ok(logs.includes('Hero Auction http://'),logs);
 browser=await chromium.launch({headless:true,...(process.env.HERO_BROWSER_EXECUTABLE?{executablePath:process.env.HERO_BROWSER_EXECUTABLE}:{}),env:{...process.env,HOME:'/tmp',XDG_CONFIG_HOME:'/tmp/hero-splash-chromium'}});
 for(const width of [390,1440])for(const sample of samples){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const fixture={live:true,teams:sample.before.teams,rounds:sample.before.round,log:[],winner:null};
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base)return route.abort();if(u.pathname==='/api/battle-preview')return route.fulfill({json:fixture});return route.continue()});
  await page.clock.install({time:new Date('2026-11-09T12:00:00Z')});
  await page.goto(base+'/battle-preview.html?room=arena');await page.waitForSelector('#team-a .hero');
  await page.waitForFunction(()=>[...document.querySelectorAll('.arena-portrait')].every(p=>p.querySelector('img.arena-portrait-image')?.naturalWidth>0));
  await page.clock.pauseAt(new Date('2026-11-09T12:01:00Z'));
  const emit=frame=>page.evaluate(frame=>window.dispatchEvent(new CustomEvent('heroarena:experimental-round-end',{detail:{...frame,presentation:{}}})),frame);
  await emit({...sample.before,events:[]});
  const beforeMeters=await page.locator('.hero').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.heroId,shield:Number(n.querySelector('.arena-shield').getAttribute('aria-valuenow'))})));
  await emit(sample.current);
  assert.equal(await page.locator('.arena-floating-damage').count(),0,'damage should wait for projectile contact');
  await page.clock.runFor(900);
  const labels=await page.locator('.arena-floating-damage').allTextContents();
  const expected=sample.current.events.filter(e=>e.value>0&&['special','splash'].includes(e.damageType)).map(e=>'−'+e.value+(e.critical?'!':''));
  assert.deepEqual(labels.sort(),expected.sort());
  const meters=await page.locator('.hero').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.heroId,shield:Number(n.querySelector('.arena-shield').getAttribute('aria-valuenow')),hp:n.querySelector('.hp')?.getAttribute('aria-label')})));
  for(const hero of sample.current.teams.flat()){const meter=meters.find(m=>m.id===hero.id);assert.equal(meter?.shield,hero.shield,'rendered shield must equal authoritative post-hit shield');assert.equal(meter.hp,`Can ${hero.hp} / ${hero.maxHp}`,'rendered HP must equal authoritative post-hit HP');}
  await page.evaluate(()=>{for(const n of document.querySelectorAll('.arena-floating-damage'))for(const a of n.getAnimations()){a.pause();a.currentTime=100;}});
  await page.screenshot({path:shots+'/'+sample.name+'-'+width+'.png'});
  const feedback=await page.locator('#events').innerText();
  for(const e of sample.current.events.filter(e=>e.damageType==='splash'))assert.ok(feedback.includes(e.value+' hasar'),'battle log must preserve each splash HP amount');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({sample:sample.name,width,labels,beforeMeters,meters}));
  // A route reset and same cast number in the next game must not suppress hits.
  await page.evaluate(teams=>window.dispatchEvent(new CustomEvent('heroarena:ready',{detail:{teams}})),sample.before.teams);await emit({...sample.before,events:[]});await emit(sample.current);await page.clock.runFor(900);
  assert.deepEqual((await page.locator('.arena-floating-damage').allTextContents()).sort(),expected.sort());
  await context.close();
 }
 console.log('PASS: real arena DOM, projectile damage labels, shield meters, both seats, mobile/desktop and next-game reset. No production requests or state changes.');
}catch(error){
 if(browser)for(const [index,page] of browser.contexts().flatMap(c=>c.pages()).entries()){
  await page.screenshot({path:shots+'/failure-'+index+'.png',fullPage:true}).catch(()=>{});
  console.error('Mage splash browser diagnostic',await page.evaluate(()=>({message:document.getElementById('message')?.textContent,labels:[...document.querySelectorAll('.arena-floating-damage')].map(n=>n.textContent),hidden:document.hidden,motion:document.getElementById('motion')?.checked})).catch(()=>null));
 }
 throw error;
}finally{await browser?.close();server.kill('SIGTERM');}
