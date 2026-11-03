import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf('function availableRoomCode(){');
const body=source.slice(start,source.indexOf('\n}',start)+2);
function allocator({rooms=new Map(),roomFlushes=new Map(),dirtyRooms=new Set(),start=100}={}){
 const context={rooms,roomFlushes,dirtyRooms,crypto:{randomInt:(min,max)=>{assert.equal(min,100);assert.equal(max,1000);return start;}},error:(message,status)=>{throw Object.assign(Error(message),{status});}};
 vm.createContext(context);vm.runInContext(body+'\nthis.allocate=availableRoomCode;',context);return context.allocate;
}
test('room code allocation wraps and finds the only free code without changing occupied rooms',()=>{
 const rooms=new Map(Array.from({length:900},(_,n)=>[String(100+n),{}]));rooms.delete('421');const before=[...rooms.keys()];
 assert.equal(allocator({rooms,start:999})(),'421');assert.deepEqual([...rooms.keys()],before);
});
test('full room capacity returns 503 after at most 900 checks',()=>{
 let visits=0;const rooms={has(){visits++;return true}};
 assert.throws(()=>allocator({rooms})(),error=>error.status===503&&/odaları/.test(error.message));assert.equal(visits,900);
});
test('pending room writes and deletes reserve codes until persistence completes',()=>{
 const rooms=new Map(Array.from({length:897},(_,n)=>[String(103+n),{}])),roomFlushes=new Map([['100',{}]]),dirtyRooms=new Set(['101']);
 const allocate=allocator({rooms,roomFlushes,dirtyRooms});assert.equal(allocate(),'102');rooms.set('102',{});assert.throws(allocate,error=>error.status===503);dirtyRooms.delete('101');assert.equal(allocate(),'101');
 assert.equal((source.match(/availableRoomCode\(\)/g)||[]).length,4,'create, match and new bot admission use one bounded allocator');
 assert.doesNotMatch(source,/do\{id=code\(\)\}/);
});
test('HTTP full capacity rejects new rooms while wallet reads and the server remain responsive',{timeout:30000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1',HERO_VICTORY_CHESTS_ENABLED:'0',HERO_DIAMONDS_ENABLED:'0',HERO_LOGIN_REWARDS_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
 const base='http://127.0.0.1:'+port;
 const call=async(path,body={})=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});return{status:response.status,...await response.json()};};
 try{
  for(let attempt=0;attempt<120;attempt++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,25));}
  const guest=await call('/api/auth/guest',{name:'Capacity fixture'});assert.equal(guest.status,200);const auth={authToken:guest.authToken};
  const before=(await call('/api/wallet',auth)).gold,codes=new Set();
  for(let i=0;i<900;i++){const created=await call('/api/create',auth);assert.equal(created.status,200,JSON.stringify(created));codes.add(created.room.code);}
  assert.equal(codes.size,900);
  assert.equal((await call('/api/create',auth)).status,503);
  assert.equal((await call('/api/match',auth)).status,503);
  assert.equal((await call('/api/wallet',auth)).gold,before,'capacity failures never debit the wallet');
  assert.equal((await fetch(base+'/api/info',{signal:AbortSignal.timeout(5000)})).status,200,'exhausted allocation does not block the event loop');
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve();},2000).unref();});}
});
