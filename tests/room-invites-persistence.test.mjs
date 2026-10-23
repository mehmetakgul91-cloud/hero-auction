import {requireModerationForInteraction} from '../moderation-availability.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('function sameSeat('),source.indexOf('function seatRoom('))+source.slice(source.indexOf('function applyInvitationReceipt('),source.indexOf('async function invitationApi('));
function fixture({gold=[500,500],lostCommit=false,receiptReadFails=false}={}){
 const room={code:'123',created:1,matchNumber:1,mode:'friend',phase:'waiting',players:[{accountId:'host',name:'Host',token:'hosttoken',team:[]},null],history:[]};
 const invite={id:'invite-1',from:'host',to:'guest',code:'123',created:1,status:'queued'};
 const durable={gold:new Map([['host',gold[0]],['guest',gold[1]]]),receipt:null,room:null,social:null};let staged=null;const statements=[];
 const client={release(){},async query(sql,args){statements.push(sql);
  if(sql==='BEGIN'){staged={gold:new Map(durable.gold),receipt:durable.receipt,room:durable.room,social:durable.social};return{}}
  if(sql==='ROLLBACK'){staged=null;return{}}
  if(sql==='COMMIT'){Object.assign(durable,staged);staged=null;if(lostCommit)throw Error('lost COMMIT response');return{}}
  if(sql.startsWith('INSERT INTO hero_auction_invite_joins')){if(staged.receipt)return{rowCount:0};staged.receipt=JSON.parse(args[1]);return{rowCount:1}}
  if(sql.startsWith('SELECT state FROM hero_auction_invite_joins'))return{rows:staged.receipt?[{state:staged.receipt}]:[]};
  if(sql.startsWith('INSERT INTO hero_auction_wallets'))return{};
  if(sql.startsWith('UPDATE hero_auction_wallets')){const gold=staged.gold.get(args[0]);if(gold<50)return{rowCount:0};staged.gold.set(args[0],gold-50);return{rowCount:1}}
  if(sql.startsWith('INSERT INTO hero_auction_rooms')){staged.room=JSON.parse(args[1]);return{}}
  if(sql.startsWith('INSERT INTO hero_auction_social')){staged.social=JSON.parse(args[1]);return{}}
  throw Error('unexpected query '+sql);
 }};
 const ctx={structuredClone,Map,Date,JSON,console,roomFlushes:new Map(),rooms:new Map([['123',room]]),activeSeats:new Map(),token:()=> 'guest-room-token',log:(r,text)=>r.history.push(text),publish:()=>{},previewGuestMode:false,databaseReady:true,ratings:new Map(),matchRecords:new Map(),friends:{snapshot:()=>({})},roomInvites:{snapshot:()=>[['invite-1',invite]]},error:(message,status=400)=>{throw Object.assign(Error(message),{status})},database:{connect:async()=>client,query:async()=>{if(receiptReadFails)throw Error('database unavailable');return{rows:durable.receipt?[{state:durable.receipt}]:[]}}}};
 vm.createContext(ctx);vm.runInContext(functions,ctx);
 return{ctx,room,invite,durable,statements,join:()=>ctx.commitInvitationJoin(invite,room,{sub:'guest',name:'Guest'})};
}
test('durable invitation atomically stores unique receipt, both debits, room and social before COMMIT',async()=>{
 const f=fixture();assert.equal(await f.join(),true);assert.deepEqual([...f.durable.gold.values()],[450,450]);assert.equal(f.durable.room.players[1].token,'guest-room-token');assert.equal(f.durable.social.roomInvites[0][1].status,'joined');
 assert.ok(f.statements.findIndex(s=>s.startsWith('INSERT INTO hero_auction_invite_joins'))<f.statements.findIndex(s=>s.startsWith('UPDATE hero_auction_wallets')));
 assert.equal(f.statements.at(-1),'COMMIT');
 // A retried accepted snapshot discovers durable receipt and never debits twice.
 f.invite.status='queued';f.room.phase='waiting';f.room.players[1]=null;await f.join();assert.deepEqual([...f.durable.gold.values()],[450,450]);assert.equal(f.room.players[1].token,'guest-room-token');
});
test('insufficient balance rolls both debits and room/receipt back',async()=>{
 const f=fixture({gold:[0,500]});await assert.rejects(f.join(),/50 altın/);assert.deepEqual([...f.durable.gold.values()],[0,500]);assert.equal(f.durable.receipt,null);assert.equal(f.room.players[1],null);assert.equal(f.invite.status,'queued');assert.equal(f.room.joinPending,undefined);
});
test('lost COMMIT response recovers receipt without another charge or rewinding a progressed room',async()=>{
 const f=fixture({lostCommit:true});assert.equal(await f.join(),true);assert.deepEqual([...f.durable.gold.values()],[450,450]);f.room.round=4;f.room.players[1].credits=9;
 f.ctx.applyInvitationReceipt(f.invite,f.durable.receipt);assert.equal(f.room.round,4);assert.equal(f.room.players[1].credits,9);
});
test('unconfirmed commit reserves room and surfaces uncertainty instead of charging again',async()=>{
 const f=fixture({lostCommit:true,receiptReadFails:true});await assert.rejects(f.join(),e=>e.uncertain===true);assert.equal(f.room.joinPending,true);assert.equal(f.room.inviteUncertain,true);assert.equal(f.invite.status,'queued');assert.deepEqual([...f.durable.gold.values()],[450,450]);
});

test('uncertain invitation blocks either actor entry and detach before mutation',async()=>{
 const wrapper=source.slice(source.indexOf('async function api(url,b)'),source.indexOf('async function apiAction(url,b)'));
 const ctx={requireModerationForInteraction,moderationReady:true,rooms:new Map([['123',{inviteUncertain:true}]]),roomInvites:{items:new Map([['i',{from:'host',to:'guest',code:'123',status:'queued'}]])},readLogin:value=>({sub:value,name:value}),friends:{register:async()=>{},afterMutations:fn=>fn()},error:(message,status)=>{throw Object.assign(Error(message),{status})},apiAction:()=>{throw Error('must not mutate')},authorize:()=>{throw Error('must not detach')}};
 vm.createContext(ctx);vm.runInContext(wrapper,ctx);
 for(const actor of ['host','guest'])for(const path of ['/api/create','/api/join','/api/match','/api/bot','/api/rematch','/api/room/detach'])await assert.rejects(ctx.api(path,{authToken:actor}),e=>e.status===503);
});
test('receipt recovery does not replace a newer active-seat pointer',async()=>{
 const f=fixture();await f.join();const newer={code:'456',created:99,matchNumber:1,seat:0};f.ctx.activeSeats.set('guest',newer);f.ctx.applyInvitationReceipt(f.invite,f.durable.receipt);assert.equal(f.ctx.activeSeats.get('guest'),newer);
});

test('startup fails closed when durable unfinished rematch has same timestamp but newer match number',()=>{
 const begin=source.indexOf('for(const [id,pointer] of activeSeats){const newer=');const end=source.indexOf('friends.seed(',begin);assert.ok(begin>=0&&end>begin);
 const pointer={code:'123',created:10,matchNumber:1,seat:1};const ctx={activeSeats:new Map([['guest',pointer]]),rooms:new Map([['123',{code:'123',created:10,matchNumber:2,phase:'auction',players:[{accountId:'host'},{accountId:'guest'}]}]])};
 vm.createContext(ctx);vm.runInContext(source.slice(begin,end),ctx);assert.equal(ctx.activeSeats.get('guest').ambiguous,true);
});
