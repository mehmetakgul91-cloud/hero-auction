import test from 'node:test';
import assert from 'node:assert/strict';
import {watchRecoveredRoom} from '../public/room-recovery-watch.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('formation presence reuses authenticated reads, never gameplay or admission',async()=>{
 const calls=[],rooms=[];let interval,closed=false,auth={authToken:'auth'};
 class Source{constructor(url){calls.push(url);this.close=()=>closed=true;}}
 const stop=watchRecoveredRoom({code:'123',token:'seat',readAuth:()=>auth,onRoom:r=>rooms.push(r),EventSource:Source,fetch:async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return{ok:true,json:async()=>({room:{code:'123'}})}},setInterval:fn=>(interval=fn,1),clearInterval:()=>{}});
 await tick();assert.equal(rooms.length,1);assert.equal(calls[1][0],'/api/state');assert.deepEqual(calls[1][1],{code:'123',token:'seat',authToken:'auth'});auth={authToken:'other'};await interval();assert.equal(closed,true);assert.equal(rooms.length,1);stop();
});
test('late previous account response and wrong room are not delivered',async()=>{
 let finish,auth={authToken:'a'};const rooms=[];
 const stop=watchRecoveredRoom({code:'123',token:'seat',readAuth:()=>auth,onRoom:r=>rooms.push(r),EventSource:null,fetch:()=>new Promise(r=>finish=r),setInterval:()=>1,clearInterval:()=>{}});
 auth={authToken:'b'};finish({ok:true,json:async()=>({room:{code:'123'}})});await tick();assert.equal(rooms.length,0);stop();
});
