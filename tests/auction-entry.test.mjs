import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isAuctionEntry,resetAuctionEntryViewport} from '../public/auction-entry.js';
const auction={code:'ROOM',phase:'auction',matchKey:'ROOM:1',round:0};
test('entry resets once for create/join, invitation, matching, restore and rematch only',()=>{
 for(const before of [null,{...auction,phase:'waiting'},{...auction,phase:'matching'},{...auction,code:'OLD'},{...auction,phase:'finished'},{...auction,matchKey:'ROOM:0'},{...auction,round:9}])assert.equal(isAuctionEntry(before,auction),true);
 for(const after of [auction,{...auction,round:1},{...auction,revision:123},{...auction,chat:[{message:'hello'}]}])assert.equal(isAuctionEntry(auction,after),false,'SSE/poll/reconnect/card/chat must not steal scroll');
 for(const phase of ['waiting','matching','finished'])assert.equal(isAuctionEntry(auction,{...auction,phase}),false);
});
test('only hidden home focus is blurred; chat focus is retained at all tested viewport sizes',()=>{
 for(const [innerWidth,innerHeight] of [[320,480],[390,700],[844,390]]){
  let blurred=0;const scrolls=[],input={blur:()=>blurred++};
  const window={innerWidth,innerHeight,scrollTo:options=>scrolls.push(options)},document={activeElement:input};
  resetAuctionEntryViewport({window,document,home:{contains:()=>true}});assert.equal(blurred,1);
  resetAuctionEntryViewport({window,document,home:{contains:()=>false}});assert.equal(blurred,1);
  assert.deepEqual(scrolls,[{top:0,left:0,behavior:'instant'},{top:0,left:0,behavior:'instant'}]);
 }
});
test('application scroll reset occurs after auction card markup, before reveal, not in chat or polling',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.equal(source.match(/if\(enteredAuction\)resetAuctionEntryViewport/g).length,1);
 const reset=source.indexOf('if(enteredAuction)resetAuctionEntryViewport');
 assert.ok(source.lastIndexOf('stage.innerHTML=',reset)>source.indexOf('const enteredAuction=isAuctionEntry(room,r)'));
 assert.ok(reset<source.indexOf('revealAuctionCard(stage',reset));
});
