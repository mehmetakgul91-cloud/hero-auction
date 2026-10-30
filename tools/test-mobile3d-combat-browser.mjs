// Imported by the authorized CI browser workflow only. No local browser entrypoint.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export async function verifyCombatReplay({browser,url,root,out}){
 const data=JSON.parse(await fs.readFile(path.join(root,'replay.json'),'utf8'));
 const {planAction}=await import(pathToFileURL(path.join(root,'director.js')).href);
 const plans=data.frames.map((f,i)=>planAction(f,i?data.frames[i-1].teams:data.initial,i));
 const starts=[];let duration=0;for(const p of plans){starts.push(duration);duration+=p.duration;}
 const context=await browser.newContext({viewport:{width:1152,height:720},deviceScaleFactor:1,reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  // Coarse jumps cover unobserved turns; the inspected target turn is sampled at <=40ms.
  // Control only browser RAF timestamps. Production director, scene, clips and snapshots remain real.
  await page.addInitScript(()=>{let now=1000,id=0;const callbacks=new Map();window.requestAnimationFrame=fn=>{callbacks.set(++id,fn);return id;};window.cancelAnimationFrame=n=>callbacks.delete(n);window.__combatRafStep=ms=>{now+=ms;const pending=[...callbacks.values()];callbacks.clear();for(const fn of pending)fn(now);return callbacks.size;};});
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#arena')?.dataset.ready==='true',null,{timeout:60000,polling:100});
  await page.addStyleTag({content:'#viewport{position:fixed!important;inset:0!important;width:1152px!important;height:720px!important;max-width:none!important;z-index:9999!important}#arena{outline:none!important}'});
  const snapshot=()=>page.evaluate(async()=>{const m=await import('/main.js');return m.inspectCombat();});
  const click=id=>page.locator('#'+id).evaluate(el=>el.click());
  const step=ms=>page.evaluate(ms=>window.__combatRafStep(ms),ms);
  // Playwright screenshot waits on RAF; this context deliberately owns RAF timestamps.
  // CDP captures the already rendered real WebGL surface without advancing the replay.
  const capture=await context.newCDPSession(page);
  const shot=async name=>{const {data}=await capture.send('Page.captureScreenshot',{format:'png',fromSurface:true});await fs.writeFile(path.join(out,'combat-'+name+'.png'),Buffer.from(data,'base64'));};
  const hp=s=>s.units.map(u=>[u.key,u.hp,u.shield]);
  const expected=teams=>teams.flatMap((team,side)=>team.map(h=>[side+':'+h.id,h.hp,h.shield||0]));
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  let elapsed=0;const at=async seconds=>{assert(seconds>=elapsed-1e-7);const index=starts.findLastIndex(t=>t<=seconds),fineStart=Math.max(elapsed,starts[index]||0);await page.evaluate(({coarse,fine})=>{if(coarse>0)window.__combatRafStep(coarse);while(fine>0){const ms=Math.min(40,fine);window.__combatRafStep(ms);fine-=ms;}},{coarse:Math.max(0,(fineStart-elapsed)*1000),fine:Math.max(0,(seconds-fineStart)*1000)});elapsed=seconds;return snapshot();};
  assert.deepEqual(hp(await snapshot()),expected(data.initial));
  await click('play');await step(1); // first animation timestamp initializes without advancing combat
  // Two immediate clicks pause and resume a SINGLE clock; they must never duplicate a turn.
  await click('play');await click('play');await step(1);assert.equal((await snapshot()).cursor,0);
  const castIndex=plans.findIndex(p=>p.kind==='cast'&&p.targetKey),cast=plans[castIndex];assert(castIndex>=0);
  let s=await at(starts[castIndex]+cast.duration*.4),actor=s.units.find(u=>u.key===cast.actorKey),target=s.units.find(u=>u.key===cast.targetKey);
  assert(distance(actor.position,actor.base)<1e-7,'ranged caster remains in its lane');assert(s.projectile.visible,'real ranged projectile is visible before impact');assert(actor.clips.attack.weight>.7&&actor.clips.attack.tracks>0,'real rig attack clip, not only root bobbing');
  assert.deepEqual(hp(s),expected(castIndex?data.frames[castIndex-1].teams:data.initial),'HP unchanged before projectile contact');await shot('01-ranged-projectile');
  s=await at(starts[castIndex]+cast.duration*.499);assert(s.projectile.visible);s=await at(starts[castIndex]+cast.duration*.501);assert(!s.projectile.visible,'projectile ends at impact');assert.deepEqual(hp(s),expected(data.frames[castIndex].teams),'HP snapshot applies exactly on contact');assert(s.effects.floats>0,'damage text appears with impact');for(const u of s.units){assert.equal(u.hpBar,'scaleX('+Math.max(0,u.hp/u.maxHp)+')');assert(u.label.includes('Can '+u.hp+' / '+u.maxHp));}await shot('02-ranged-impact');
  const meleeIndex=plans.findIndex((p,i)=>i>castIndex&&p.kind==='melee'&&p.moving),melee=plans[meleeIndex];assert(meleeIndex>=0);
  s=await at(starts[meleeIndex]+melee.duration*.15);actor=s.units.find(u=>u.key===melee.actorKey);assert(distance(actor.position,actor.base)>.1,'melee actor approaches');assert(actor.clips.walk.weight>.8&&actor.clips.walk.tracks>0,'real walking rig clip drives approach');
  s=await at(starts[meleeIndex]+melee.duration*.44);actor=s.units.find(u=>u.key===melee.actorKey);target=s.units.find(u=>u.key===melee.targetKey);assert(Math.abs(distance(actor.position,target.base)-1.05)<.02,'melee stops at contact range, not overlapping target');assert(actor.clips.attack.weight>.8,'weapon attack clip is active at windup');
  assert.deepEqual(hp(s),expected(data.frames[meleeIndex-1].teams));await shot('03-melee-windup');
  s=await at(starts[meleeIndex]+melee.duration*.501);assert.deepEqual(hp(s),expected(data.frames[meleeIndex].teams));await shot('04-melee-contact');
  const cameraBefore=await page.locator('#arena').getAttribute('data-camera-state'),beforeOrbit=hp(s);
  await page.locator('#arena').evaluate(c=>{c.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));});
  assert.notEqual(await page.locator('#arena').getAttribute('data-camera-state'),cameraBefore,'orbit works during combat');assert.deepEqual(hp(await snapshot()),beforeOrbit,'orbit cannot apply combat impacts');assert.equal((await snapshot()).playing,true);
  s=await at(starts[meleeIndex]+melee.duration*.9);actor=s.units.find(u=>u.key===melee.actorKey);assert(distance(actor.position,actor.base)>.01&&distance(actor.position,actor.base)<distance(target.base,actor.base)-1.05,'melee retreat is in progress');
  s=await at(starts[meleeIndex]+melee.duration+.00001);actor=s.units.find(u=>u.key===melee.actorKey);assert(distance(actor.position,actor.base)<1e-6,'melee returns to original slot');
  // Mid-battle reset and quick restart: no stale projectile, HP/death state or duplicated clock.
  await click('reset');s=await snapshot();assert(!s.playing&&!s.finished&&s.cursor===0);assert.deepEqual(hp(s),expected(data.initial));assert(!s.projectile.visible&&s.effects.floats===0&&s.effects.pulses===0);assert(s.units.every(u=>!u.dead&&u.visible&&distance(u.position,u.base)<1e-7));
  await click('play');await step(1);elapsed=0;
  const deathIndex=data.frames.findIndex((f,i)=>f.teams.some((team,side)=>team.some(h=>h.hp<=0&&(i?data.frames[i-1].teams:data.initial)[side].find(old=>old.id===h.id)?.hp>0)));assert(deathIndex>=0);
  s=await at(starts[deathIndex]+plans[deathIndex].duration*.501);assert(s.units.some(u=>u.dead),'authoritative death is reflected immediately');
  const deadKeys=s.units.filter(u=>u.dead).map(u=>u.key);s=await at(starts[deathIndex]+plans[deathIndex].duration*.501+.75);assert(s.units.filter(u=>deadKeys.includes(u.key)).every(u=>!u.visible),'fallen bodies finish their bounded death animation');await shot('05-death-cleanup');
  s=await at(duration+.01);assert(s.finished&&!s.playing);assert.deepEqual(hp(s),expected(data.frames.at(-1).teams),'final result equals frozen authoritative battle');assert.equal(await page.locator('#result').evaluate(e=>e.hidden),false);assert.equal(await page.locator('#winner').textContent(),data.winner===null?'Denge bozulmadı':data.winner===0?'Mavi takım kazandı':'Kızıl takım kazandı');
  // Final effects continue briefly after the clock ends, then RAF stops entirely.
  await step(1200);await step(16);s=await snapshot();assert(s.units.filter(u=>u.dead).every(u=>!u.visible));assert.equal(s.effects.floats,0);assert.equal(s.effects.pulses,0);assert.equal(await step(16),0,'finished demo has no endless animation loop');await shot('06-result');
  await click('replay-result');await step(1);s=await snapshot();assert(s.playing&&!s.finished&&s.cursor===0);assert.deepEqual(hp(s),expected(data.initial));await click('reset');assert.deepEqual(errors,[]);
  return {combat:'Real frozen 66-frame battle; deterministic browser RAF, unchanged authoritative snapshots',checks:'rig walk/attack clips, melee approach/contact/retreat, stationary ranged projectile, exact impact HP, orbit during play, death cleanup, final outcome, mid-battle reset, double-click, result replay, bounded settle loop',screenshots:6,renderer:'Actual CI WebGL; software SwiftShader, not physical GPU performance proof'};
 }finally{await context.close();}
}
