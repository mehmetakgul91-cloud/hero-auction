import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveArenaRunner} from '../commander-live-arena-runner.js';
function setup({fail=false}={}){
 let now=0,callback=null,cancelled=0,actions=0,errors=[];
 const registry={
  snapshot:()=>({round:1,finished:false,nextHero:{actorId:'a',round:1}}),
  stepServerHero:()=>{if(fail)throw Error('Combat rejected');actions++;return {version:actions}},
  advanceServerRound:()=>{throw Error('Unexpected round')}
 };
 const runner=createLiveArenaRunner({registry,matchKey:'123:1',token:'seatA',intervalMs:1000,clock:()=>now,scheduler:fn=>{callback=fn;return 7},canceller:id=>{assert.equal(id,7);cancelled++},onError:e=>errors.push(e.message)});
 return {runner,setTime:t=>{now=t},fire:()=>callback?.(),counts:()=>({cancelled,actions,errors})};
}
test('runner schedules exactly once and stops cleanly',()=>{
 const f=setup();
 f.runner.start();f.runner.start();
 f.setTime(1000);f.fire();assert.equal(f.counts().actions,1);
 f.setTime(5000);f.fire();assert.equal(f.counts().actions,2);
 f.runner.stop();f.fire();
 assert.equal(f.counts().actions,2);
 assert.equal(f.counts().cancelled,1);
});
test('server combat error stops runner instead of retrying endlessly',()=>{
 const f=setup({fail:true});f.runner.start();f.setTime(1000);f.fire();
 assert.deepEqual(f.counts().errors,['Combat rejected']);
 assert.equal(f.runner.status().scheduled,false);
 assert.throws(()=>f.runner.start(),/stopped after error/);
});
