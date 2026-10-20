import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveArenaPacer} from '../commander-live-arena-pacer.js';
test('paced hero actions and round transitions never fast-forward',()=>{
 let round=1,index=0;const calls=[];
 const registry={
  snapshot:()=>({round,finished:false,nextHero:index<2?{actorId:'h'+index,round}:null}),
  stepServerHero:()=>{calls.push('hero');index++;return {version:calls.length}},
  advanceServerRound:()=>{calls.push('round');round++;index=0;return {round}}
 };
 const pacer=createLiveArenaPacer({registry,matchKey:'room:1',token:'seat-secret',intervalMs:1000,clock:()=>0});
 pacer.start(0);
 assert.equal(pacer.tick(999).advanced,false);
 assert.equal(pacer.tick(1000).kind,'hero');
 assert.equal(pacer.tick(5000).kind,'hero');
 assert.equal(pacer.tick(5001).advanced,false);
 assert.equal(pacer.tick(6000).kind,'round');
 assert.deepEqual(calls,['hero','hero','round']);
 pacer.stop();
 assert.equal(pacer.tick(9000).advanced,false);
});
test('pacer ends safely after final round',()=>{
 const registry={snapshot:()=>({round:15,finished:false,nextHero:null}),stepServerHero:()=>{throw Error('should not step')},advanceServerRound:()=>{throw Error('should not advance')}};
 const pacer=createLiveArenaPacer({registry,matchKey:'room:1',token:'seat-secret',intervalMs:100});
 pacer.start(0);
 assert.equal(pacer.tick(100).finished,true);
 assert.throws(()=>pacer.start(200),/finished/);
});
