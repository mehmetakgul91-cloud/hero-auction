import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {refreshAuctionCommanders,hydrateAuctionCommanders,setAuctionCommanderIdentity} from '../auction-commander-identity.js';
const deferred=()=>{let resolve;const promise=new Promise(a=>resolve=a);return{promise,resolve}};
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve()};
const room=()=>({mode:'friend',players:[{accountId:'a'},{accountId:'b'}]});
test('hydration deduplicates simultaneous reconnect reads of legacy rooms',async()=>{
 const r=room(),lookup=deferred();let reads=0;
 const options={databaseReady:true,database:{query:()=>{reads++;return lookup.promise}}};
 const first=hydrateAuctionCommanders(r,options),second=hydrateAuctionCommanders(r,options);await flush();assert.equal(reads,1);
 lookup.resolve({rows:[{account_id:'a',commander_id:'magic'},{account_id:'b',commander_id:'support'}]});await Promise.all([first,second]);assert.deepEqual(r.players.map(p=>p.commander),[{commanderId:'magic'},{commanderId:'support'}]);
 await hydrateAuctionCommanders(r,options);assert.equal(reads,1,'known identities do not perform repeated reads');
});
test('hydration fills only missing values, preserving known class and explicit null',async()=>{
 const r=room();r.players[0].commander={commanderId:'attack'};r.players[1].commander=null;let reads=0;
 const options={databaseReady:true,database:{query:async()=>{reads++;return{rows:[{account_id:'a',commander_id:'magic'},{account_id:'b',commander_id:'defense'}]}}}};
 await hydrateAuctionCommanders(r,options);assert.equal(reads,0);assert.deepEqual(r.players.map(p=>p.commander),[{commanderId:'attack'},null]);
 delete r.players[1].commander;await hydrateAuctionCommanders(r,options);assert.equal(reads,1);assert.deepEqual(r.players.map(p=>p.commander),[{commanderId:'attack'},{commanderId:'defense'}]);
});
test('a successful selection during stale cosmetic lookup wins over old DB response',async()=>{
 const r=room(),lookup=deferred();const pending=refreshAuctionCommanders(r,{databaseReady:true,database:{query:()=>lookup.promise}});await flush();
 setAuctionCommanderIdentity(r.players[0],{commanderId:'support',levels:{support:40}});
 lookup.resolve({rows:[{account_id:'a',commander_id:'attack'},{account_id:'b',commander_id:'magic'}]});await pending;
 assert.deepEqual(r.players.map(p=>p.commander),[{commanderId:'support'},{commanderId:'magic'}]);assert.doesNotMatch(JSON.stringify(r),/level/);
});
test('setting identity strips secrets and represents absent or invalid profiles as null',()=>{
 const p={accountId:'a'};setAuctionCommanderIdentity(p,{commanderId:'defense',levels:{defense:40},gold:1000});assert.deepEqual(p.commander,{commanderId:'defense'});
 setAuctionCommanderIdentity(p,null);assert.equal(p.commander,null);setAuctionCommanderIdentity(p,{commanderId:'invalid'});assert.equal(p.commander,null);
});
test('server account identity update reaches all account seats and publishes changed rooms only',()=>{
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');const start=source.indexOf('function updateAuctionCommandersForAccount(');assert.ok(start>=0);let depth=0,end=start;const brace=source.indexOf('{',start);for(let i=brace;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&--depth===0){end=i+1;break}}
 const a=room(),b=room(),other={players:[{accountId:'other',commander:null},null]},published=[];b.players.reverse();
 const context={rooms:new Map([['a',a],['b',b],['other',other]]),setAuctionCommanderIdentity,publish:r=>published.push(r)};vm.createContext(context);vm.runInContext(source.slice(start,end),context);context.updateAuctionCommandersForAccount('a',{commanderId:'magic',levels:{magic:40}});
 assert.deepEqual(a.players[0].commander,{commanderId:'magic'});assert.deepEqual(b.players[1].commander,{commanderId:'magic'});assert.equal(other.players[0].commander,null);assert.deepEqual(published,[a,b]);
});
test('server updates auction identity only after successful select/change, using authenticated account and saved profile',async()=>{
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');const wrapper=source.slice(source.indexOf('async function api(url,b,requestContext)'),source.indexOf('async function apiAction(url,b,requestContext)'));
 let fail=false;const updates=[],saved={commanderId:'defense',levels:{defense:3}};
 const context={requireModerationForInteraction(){},moderationReady:true,diamondPolicy:{enabled:false},magicDustPolicy:{enabled:false},diamondExchangePolicy:{},diamondSignupPolicy:{enabled:false},diamondExchangeView:()=>({}),readLogin:()=>({sub:'verified-account'}),apiAction:async()=>{if(fail)throw Error('insufficient gold');return{profile:saved,progression:{}}},updateAuctionCommandersForAccount:(id,profile)=>updates.push({id,profile})};
 vm.createContext(context);vm.runInContext(wrapper,context);
 for(const route of ['/api/commander/select','/api/commander/change'])await context.api(route,{authToken:'signed',accountId:'forged',commanderId:'magic'});
 assert.deepEqual(updates,[{id:'verified-account',profile:saved},{id:'verified-account',profile:saved}]);
 for(const route of ['/api/commander/get','/api/commander/upgrade'])await context.api(route,{});assert.equal(updates.length,2);
 fail=true;await assert.rejects(context.api('/api/commander/change',{}),/insufficient gold/);assert.equal(updates.length,2);
});
test('state reconnect awaits hydration before producing the public snapshot',async()=>{
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');const start=source.indexOf("if(url==='/api/state')"),end=source.indexOf("if(url==='/api/bid')",start),r=room(),hydration=deferred();let reads=0;
 const context={Date,authorize:()=>({r,seat:0}),hydrateAuctionCommanders:async()=>{await hydration.promise;setAuctionCommanderIdentity(r.players[0],{commanderId:'support'})},isCancellationReserved:()=>false,publicRoom:room=>{reads++;return structuredClone(room)}};
 vm.createContext(context);vm.runInContext('async function state(url,b){'+source.slice(start,end)+'}',context);const pending=context.state('/api/state',{});await flush();assert.equal(reads,0);hydration.resolve();const result=await pending;assert.equal(reads,1);assert.deepEqual(result.room.players[0].commander,{commanderId:'support'});
 // SSE uses the same awaited hydration before the initial public event.
 const events=source.slice(source.indexOf("if(req.method==='GET'&&url.pathname==='/api/events')"));assert.ok(events.indexOf('await hydrateAuctionCommanders(r)')<events.indexOf('res.writeHead(200'));
});
test('timed-out hydration leaves missing identity retryable and next reconnect succeeds',async()=>{
 const r=room();let timeout,reads=0;const first=hydrateAuctionCommanders(r,{databaseReady:true,database:{query:()=>{reads++;return new Promise(()=>{})}},setTimer:fn=>{timeout=fn;return 1},clearTimer(){}});await flush();timeout();await first;assert.equal(r.players[0].commander,undefined);assert.equal(r.players[1].commander,undefined);
 await hydrateAuctionCommanders(r,{databaseReady:true,database:{query:async()=>{reads++;return{rows:[{account_id:'a',commander_id:'magic'}]}}}});assert.equal(reads,2);assert.deepEqual(r.players.map(p=>p.commander),[{commanderId:'magic'},null]);
});
