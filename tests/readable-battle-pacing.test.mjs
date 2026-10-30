import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveArenaLifecycle} from '../commander-live-arena-lifecycle.js';
import {createLiveArenaPacer} from '../commander-live-arena-pacer.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createReadableBattleClock} from '../readable-battle-clock.js';
function combat(matchKey,mixed=false){
 const hero=(id,speed)=>({id,role:'fighter',active:mixed?{effect:'burst',name:'Burst',power:1.5}:null,damage:0,kills:0,healing:0,hp:1000,maxHp:1000,attack:10,defense:10,shield:0,lane:'front',position:0,speed});
 return createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey,energy:[100,100],commanderIds:['defense','support'],now:0}),teams:[[hero('a',20)],[hero('b',10)]],commanders:[{commanderId:'defense'},{commanderId:'support'}]});
}
function setup(readablePacing,mixed=false){
 let now=0,callback,frequency,canceled=0;
 const lifecycle=createLiveArenaLifecycle({readablePacing,clock:()=>now,scheduler:(fn,ms)=>{callback=fn;frequency=ms;return 1},canceller:()=>canceled++});
 const matchKey='pace:1';lifecycle.begin({matchKey,tokens:['a','b'],combat:combat(matchKey,mixed),options:mixed?{parity:true,damageSpecial:true}:{} });
 return {lifecycle,matchKey,get now(){return now},get frequency(){return frequency},get canceled(){return canceled},at(n){now=n;return callback()},view(token='a'){return lifecycle.snapshot({matchKey,token,now})},cast(requestId='normal_0001'){return lifecycle.cast({matchKey,token:'a',ability:'normal',requestId,now})}};
}
test('readable pacer gives committed normal 1100ms and special 1500ms, not rounded 900ms ticks',()=>{
 const kinds=['normal','special','normal'];let index=0;
 const registry={snapshot:()=>({round:1,nextHero:{},finished:false}),stepServerHero:()=>({result:{events:[{damageType:kinds[index++]}]}}),advanceServerRound:()=>{}};
 const clock=createReadableBattleClock({now:0});
 const pacer=createLiveArenaPacer({registry,matchKey:'m',token:'a',readablePacing:true,timeline:clock});
 pacer.start(0);assert.equal(pacer.tick(1099).advanced,false);
 assert.equal(pacer.tick(1100).nextAt,2200);assert.equal(clock.time(1100),900);
 assert.equal(pacer.tick(2200).nextAt,3700);assert.equal(clock.time(2200),1800);
 assert.equal(pacer.tick(3699).advanced,false);assert.equal(pacer.tick(3700).nextAt,4800);assert.equal(clock.time(3700),2700);
});
test('cooldown eligibility is unchanged in combat time; commander tactical lock is preserved beyond its cinematic floor',()=>{
 const h=setup(true);assert.equal(h.frequency,50);h.cast();
 let view=h.view();assert.equal(view.abilities[0].normalCooldownMs,5000*1100/900);assert.equal(view.abilities[0].effectLockMs,1200*1100/900);
 h.at(1200);assert.ok(h.view().abilities[0].effectLockMs>0);
 assert.equal(h.view('b').abilities[1].canUseUltimate,false);
 assert.throws(()=>h.lifecycle.cast({matchKey:h.matchKey,token:'a',ability:'ultimate',targetIds:['a'],requestId:'ultimate_0001',now:h.now}),/Komutan efekti/);
 h.at(1200*1100/900);assert.equal(h.view().abilities[0].effectLockMs,0);
 h.at(5000);assert.equal(h.view().abilities[0].canUseNormal,false);
 h.at(5000*1100/900);view=h.view();assert.equal(view.abilities[0].canUseNormal,true);
 assert.equal(view.combatTime,5000);assert.equal(h.view('b').combatTime,view.combatTime);
 const before=h.view();h.cast();assert.equal(h.view().abilities[0].energy,before.abilities[0].energy); // same idempotency key
 h.lifecycle.endRoom('pace');assert.equal(h.canceled,1);
});
function run(readablePacing,mixed=false){
 const h=setup(readablePacing,mixed),trace=[];let casts=0,heroActions=0,specialActions=0;
 while(!h.view().finished){
  const due=h.lifecycle.status(h.matchKey).nextAt;assert.equal(due%50,0,'deadline aligns with existing scheduler');const tick=h.at(due);
  if(tick.kind==='hero'){heroActions++;if(tick.action?.result?.events?.some(e=>e.damageType==='special')||tick.action?.result?.event?.damageType==='special')specialActions++;}
  const state=h.view();
  if(!state.finished&&state.abilities[0].canUseNormal){h.cast('scripted_'+String(++casts).padStart(4,'0'));}
  const current=h.view();trace.push({round:current.round,version:current.version,teams:current.teams,events:current.events.map(e=>{const {at,...rest}=e;return rest}),energy:current.abilities[0].energy,canUseNormal:current.abilities[0].canUseNormal});
  assert.ok(trace.length<100);
 }
 return {trace,ms:h.now,winner:h.view().winner,casts,heroActions,specialActions};
}
test('measured complete deterministic battle: same events, HP, energy and scripted cooldown eligibility, about 21% shorter than released wall time',()=>{
 const baseline=run(false),readable=run(true);
 assert.deepEqual(readable.trace,baseline.trace);assert.equal(readable.winner,baseline.winner);assert.equal(readable.casts,baseline.casts);
 assert.ok(readable.ms>baseline.ms);assert.equal(readable.ms/baseline.ms,1100/900);assert.equal(readable.ms,48400);
 console.log('Measured basic fixture wall duration:',JSON.stringify({baselineMs:baseline.ms,previousReleasedMs:61600,shorterMs:readable.ms,schedulerSteps:readable.trace.length,heroActions:readable.heroActions,casts:readable.casts}));
});

test('measured actual parity engine mixed normal/special fight preserves trace at equal tactical boundaries',()=>{
 // Control only randomness, not outcomes: the production parity engine executes
 // every attack/special. 99 fixes its 8% critical roll to noncritical for both runs.
 const original=crypto.randomInt;crypto.randomInt=()=>99;syncBuiltinESMExports();
 try{
  const baseline=run(false,true),readable=run(true,true);
  assert.deepEqual(readable.trace,baseline.trace);assert.equal(readable.winner,baseline.winner);assert.equal(readable.casts,baseline.casts);
  assert.ok(readable.specialActions>0);assert.ok(readable.heroActions>readable.specialActions);assert.ok(readable.ms>baseline.ms);assert.equal(readable.ms,52000);
  console.log('Measured mixed actual-engine fixture:',JSON.stringify({baselineMs:baseline.ms,previousReleasedMs:66100,shorterMs:readable.ms,schedulerSteps:readable.trace.length,heroActions:readable.heroActions,specialActions:readable.specialActions,casts:readable.casts}));
 }finally{crypto.randomInt=original;syncBuiltinESMExports();}
});
