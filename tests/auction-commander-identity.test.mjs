import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {publicAuctionCommander,refreshAuctionCommanders,auctionAdmissions} from '../auction-commander-identity.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve()};
function room(mode='random'){return{mode,players:[{accountId:'a',name:'A',team:[]},{accountId:'b',name:'B',team:[]}]}}
test('public identity is an exact class allowlist and strips all progression',()=>{
 for(const commanderId of ['attack','defense','magic','support'])assert.deepEqual(publicAuctionCommander({commanderId,levels:{attack:40},level:40,gold:999,accountId:'secret'}),{commanderId});
 for(const value of [null,undefined,{},'attack',{commanderId:'constructor'},{commanderId:'__proto__'},{commanderId:'ATTACK'},{commanderId:'<script>'}])assert.equal(publicAuctionCommander(value),null);
});
test('authenticated profiles determine both identities without mutating original progression',async()=>{
 const r=room(),profiles=new Map([['a',{commanderId:'magic',levels:{magic:31}}],['b',{commanderId:'support',levels:{support:18}}]]),before=JSON.stringify([...profiles]);
 await refreshAuctionCommanders(r,{profiles});assert.deepEqual(r.players.map(p=>p.commander),[{commanderId:'magic'},{commanderId:'support'}]);assert.equal(JSON.stringify([...profiles]),before);assert.doesNotMatch(JSON.stringify(r),/level|progression/);
 const restored=JSON.parse(JSON.stringify(r));assert.deepEqual(restored.players.map(p=>p.commander),r.players.map(p=>p.commander),'identities survive persisted room restoration');
});
test('database lookup requests classes only and sanitizes untrusted stored values',async()=>{
 const r=room();let statement,args;
 await refreshAuctionCommanders(r,{databaseReady:true,database:{query:async(sql,params)=>{statement=sql.text;args=sql.values;assert.equal(sql.query_timeout,750);return{rows:[{account_id:'a',commander_id:'defense',levels:{defense:40}},{account_id:'b',commander_id:'not-a-class'}]}}}});
 assert.match(statement,/profile->>'commanderId' AS commander_id/);assert.doesNotMatch(statement,/SELECT\s+(?:\*|account_id,profile\s)/i);assert.deepEqual(args,[['a','b']]);assert.deepEqual(r.players.map(p=>p.commander),[{commanderId:'defense'},null]);
});
test('default 750ms cosmetic bound ignores late successful results permanently',async()=>{
 const r=room(),lookup=deferred();let timeout,cleared=false;
 r.players[0].commander={commanderId:'attack',levels:{attack:40}};
 const pending=refreshAuctionCommanders(r,{databaseReady:true,database:{query:()=>lookup.promise},setTimer:(fn,ms)=>{assert.equal(ms,750);timeout=fn;return 7},clearTimer:id=>{assert.equal(id,7);cleared=true}});
 await flush();timeout();await pending;assert.equal(cleared,true);assert.deepEqual(r.players.map(p=>p.commander),[{commanderId:'attack'},undefined]);
 const snapshot=JSON.stringify(r);lookup.resolve({rows:[{account_id:'a',commander_id:'magic'},{account_id:'b',commander_id:'support'}]});await flush();assert.equal(JSON.stringify(r),snapshot,'losing query must not overwrite current identity');
});
test('database failure is cosmetic only and cannot expose unsanitized fallback',async()=>{
 const r=room();r.players[0].commander={commanderId:'magic',levels:{magic:40}};
 await refreshAuctionCommanders(r,{databaseReady:true,database:{query:async()=>{throw Error('offline')}}});assert.deepEqual(r.players.map(p=>p.commander),[{commanderId:'magic'},undefined]);
});
test('a replaced seat cannot inherit the previous occupants late identity',async()=>{
 const r=room(),lookup=deferred(),pending=refreshAuctionCommanders(r,{databaseReady:true,database:{query:()=>lookup.promise}});await flush();const replacement={accountId:'replacement'};r.players[1]=replacement;
 lookup.resolve({rows:[{account_id:'a',commander_id:'attack'},{account_id:'b',commander_id:'defense'}]});await pending;assert.equal(replacement.commander,undefined);assert.deepEqual(r.players[0].commander,{commanderId:'attack'});
});
test('bot and rematch identities track transient commander with no difficulty progression',async()=>{
 const r=room('bot');r.players[1]={name:'Bot'};r.botCommander={commanderId:'defense',levels:{defense:15}};
 await refreshAuctionCommanders(r,{profiles:new Map()});assert.deepEqual(r.players.map(p=>p.commander),[{commanderId:'attack'},{commanderId:'defense'}]);
 r.botCommander={commanderId:'support',levels:{support:15}};await refreshAuctionCommanders(r,{profiles:new Map([['a',{commanderId:'magic',levels:{magic:40}}]])});assert.deepEqual(r.players.map(p=>p.commander),[{commanderId:'magic'},{commanderId:'support'}]);
 assert.doesNotMatch(JSON.stringify(r.players),/level/);
});
test('reservation has no serializable room flag',()=>{const r=room();auctionAdmissions.add(r);assert.equal(auctionAdmissions.has(r),true);assert.equal(JSON.stringify(r),JSON.stringify(room()));auctionAdmissions.delete(r)});
test('actual publicRoom projection sanitizes saved identity on reconnect',()=>{
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');const statement=source.slice(source.indexOf('const publicRoom='),source.indexOf('function publish('));
 const r={...room(),phase:'auction',round:0,cards:[{name:'Card',universe:'mixed',power:1}],history:[]};r.players[0].commander={commanderId:'attack',levels:{attack:40},progression:{secret:true}};r.players[1].commander={commanderId:'invalid',levels:{magic:40}};
 const context={publicAuctionCommander,auctionRevealSnapshot:()=>({}),roomArenaPresentation:()=>({}),victoryChestView:()=>({}),moderationReady:false,friends:{playerId:()=>null},rarityForPower:()=> 'common',catalogue:new Map(),r};
 vm.createContext(context);vm.runInContext(statement+'result=publicRoom(r,0);',context);assert.equal(JSON.stringify(context.result.players[0].commander),JSON.stringify({commanderId:'attack'}));assert.equal(context.result.players[1].commander,null);assert.doesNotMatch(JSON.stringify(context.result),/level|progression|secret/);
});
