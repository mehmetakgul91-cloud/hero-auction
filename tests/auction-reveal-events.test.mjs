import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {auctionMatchKey,auctionRevealSnapshot,recordTailAward} from '../auction-reveal-events.js';
import {rarityForPower} from '../auction-card-pool.js';
import {startRoomArenaTheme,roomArenaPresentation} from '../arena-theme.js';

const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const card=n=>({name:'Hero '+n,universe:'original',power:[40,60,80,95][n%4]});
const price=card=>({common:2,advanced:3,rare:4,legendary:5})[rarityForPower(card.power)];
const clone=value=>JSON.parse(JSON.stringify(value));
function advance(room){
 const context={recordTailAward,forcedCardCost:price,log(){},endGame:r=>{r.phase='finished'}};
 vm.createContext(context);
 vm.runInContext(server.slice(server.indexOf('function advanceRound(r)'),server.indexOf('function settleFinishedMatch')),context);
 context.advanceRound(room);
}
for(const receiver of [0,1])for(let count=1;count<=4;count++)test(`actual automatic allocation records ${count} hidden cards for seat ${receiver} without changing cost`,()=>{
 const cards=Array.from({length:10},(_,n)=>card(n));
 const full={name:'Full',credits:15,team:cards.slice(0,5).map(c=>({...c,cost:1}))};
 const short={name:'Receiver',credits:1,team:cards.slice(5,10-count).map(c=>({...c,cost:1}))};
 const room={code:'123',created:1234,phase:'auction',round:10-count,cards,players:receiver===0?[short,full]:[full,short]};
 const originalCredits=short.credits;
 advance(room);
 const view=clone(auctionRevealSnapshot(room));
 assert.equal(room.phase,'finished');assert.equal(room.round,10);
 assert.equal(view.tailAwards.length,count);
 assert.deepEqual(view.tailAwards.map(a=>a.round),Array.from({length:count},(_,i)=>10-count+i));
 assert.ok(view.tailAwards.every(a=>a.seat===receiver));
 assert.ok(view.tailAwards.every(a=>a.id===`${view.matchKey}:${a.round}:${receiver}`));
 assert.equal(new Set(view.tailAwards.map(a=>a.id)).size,count);
 assert.deepEqual(view.tailAwards.map(a=>a.card),cards.slice(10-count).map(c=>({...c,cost:price(c),rarity:rarityForPower(c.power)})));
 assert.equal(short.credits,originalCredits-view.tailAwards.reduce((n,a)=>n+a.card.cost,0));
 assert.ok(short.credits<0,'negative balance remains legal');
 assert.equal(full.credits,15);assert.equal(short.team.length,5);assert.equal(full.team.length,5);
 assert.deepEqual(auctionRevealSnapshot(clone(room)),view,'persisted restore retains presentation IDs and payloads');
 view.tailAwards[0].card.cost=999;assert.notEqual(room.tailAwards[0].card.cost,999,'snapshot cannot mutate authoritative metadata');
});
for(const credits of [[0,0],[1,0],[0,1]])test(`unfunded automatic run ${credits} preserves chronological two-team allocation and debt`,()=>{
 const cards=Array.from({length:10},(_,n)=>card(n));
 const room={code:'456',created:1000,matchNumber:2,phase:'auction',round:6,cards,players:[0,1].map(seat=>({credits:credits[seat],team:cards.slice(seat*3,seat*3+3)}))};
 advance(room);
 assert.equal(room.tailAwards.length,4);
 assert.deepEqual(clone(room.tailAwards.map(a=>a.round)),[6,7,8,9]);
 assert.equal(room.tailAwards[0].seat,credits[1]===1?1:0);
 for(const seat of [0,1]){
  assert.equal(room.players[seat].team.length,5);
  assert.equal(room.players[seat].credits,credits[seat]-room.tailAwards.filter(a=>a.seat===seat).reduce((sum,a)=>sum+a.card.cost,0));
 }
});
test('manifest is final-only, contains no unused deck or credentials, supports no-tail finals and legacy rooms',()=>{
 const room={code:'123',created:45,phase:'auction',round:9,players:[{team:Array(5)},{team:Array(5)}],revision:7,cards:[card(0)],secret:'not-public'};
 recordTailAward(room,1,card(1),3);
 assert.deepEqual(auctionRevealSnapshot(room),{matchKey:'123:1:45',matchNumber:1,created:45,revision:7});
 room.phase='finished';assert.deepEqual(Object.keys(auctionRevealSnapshot(room)),['matchKey','matchNumber','created','revision','tailAwards']);
 delete room.tailAwards;assert.equal('tailAwards' in auctionRevealSnapshot(room),false,'legacy final uses client fallback');
 room.phase='auction';advance(room);assert.deepEqual(clone(auctionRevealSnapshot(room).tailAwards),[]);
 assert.equal(auctionMatchKey({...room,matchNumber:2}),'123:2:45');
 assert.notEqual(auctionMatchKey({...room,created:46}),auctionMatchKey(room));
});
test('publishing increments one revision shared by both seats, reads do not increment',()=>{
 const sent=[[],[]],room={code:'123',created:45,phase:'finished',tailAwards:[]};
 const context={markRoom(){},listeners:new Map([['123',new Set(sent.map((rows,seat)=>({seat,res:{write:line=>rows.push(JSON.parse(line.slice(6)))}})))]]),publicRoom:(r,seat)=>({...auctionRevealSnapshot(r),me:seat})};
 vm.createContext(context);vm.runInContext(server.slice(server.indexOf('function publish(r)'),server.indexOf('function log(r')),context);
 for(let n=1;n<=3;n++){context.publish(room);assert.equal(room.revision,n);for(let seat=0;seat<2;seat++)assert.equal(sent[seat].at(-1).revision,n);}
 assert.equal(auctionRevealSnapshot(room).revision,3);assert.equal(auctionRevealSnapshot(room).revision,3);
});
test('actual rematch reset clears tail metadata and changes match identity before first new publish',async()=>{
 const room={code:'123',phase:'finished',created:45,matchNumber:1,revision:8,tailAwards:[{id:'old'}],players:[0,1].map(()=>({team:Array(5).fill(card(0)),credits:-3})),rematch:[false,true],mode:'friend',universe:'mixed'};
 const oldKey=auctionMatchKey(room),oldTheme=startRoomArenaTheme(room,{randomIndex:()=>0});let published;
 const context={startRoomArenaTheme,b:{},authorize:()=>({r:room,seat:0}),error:message=>{throw Error(message)},chargeEntry:async()=>{},liveArenaLifecycle:{endRoom(){}},liveArenaMatchKeys:new Map(),newCards:()=>Array.from({length:10},(_,n)=>card(n)),log(){},publish:r=>{r.revision++;published=auctionRevealSnapshot(r)},publicRoom:r=>auctionRevealSnapshot(r),Date};
 const start=server.lastIndexOf("if(url==='/api/rematch'){")+"if(url==='/api/rematch')".length,end=server.indexOf("if(url==='/api/bot')",start);
 vm.createContext(context);vm.runInContext('async function rematch()'+server.slice(start,end),context);
 await context.rematch();
 assert.equal(room.phase,'auction');assert.equal(room.matchNumber,2);assert.notEqual(published.matchKey,oldKey);assert.equal(published.revision,1);assert.deepEqual(clone(room.tailAwards),[]);assert.equal('tailAwards' in published,false);
 assert.equal(roomArenaPresentation(room).matchKey,published.matchKey);
 assert.equal(roomArenaPresentation(room).theme,'savanna','two-theme rematch excludes forest without changing auction allocation');
 assert.notEqual(roomArenaPresentation(room).theme,oldTheme.theme);
 assert.notEqual(roomArenaPresentation(room).matchKey,oldTheme.matchKey,'cosmetic identity still resets with the new match');
});
