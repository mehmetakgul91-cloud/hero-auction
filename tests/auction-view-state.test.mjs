import test from 'node:test';
import assert from 'node:assert/strict';
import {auctionViewKey} from '../public/auction-view-state.js';
import {crazyGamesSource} from '../crazygames-build.js';
import {readFileSync} from 'node:fs';

const auction={code:'123',matchKey:'123:1:100',matchNumber:1,created:100,me:0,
 phase:'auction',round:6,card:{name:'Morvan',universe:'original',rarity:'legendary'},
 turn:0,topBid:0,topSeat:null,deadline:20000,universe:'mixed',mode:'bot',
 players:[{name:'Player',credits:10,team:[]},{name:'Computer',credits:10,team:[]}]};

test('poll, SSE, chat, history and presence clocks do not invalidate bid controls',()=>{
 const key=auctionViewKey(auction);
 for(const patch of [{revision:100},{presence:{serverNow:Date.now(),seats:[]}},{chat:[{message:'hello'}]},{history:['Player joined']},{players:auction.players.map(p=>({...p,connected:true,commander:{commanderId:'attack'}}))}]){
  assert.equal(auctionViewKey({...structuredClone(auction),...patch}),key);
 }
});

test('new decisions, participants, budgets and displayed card details invalidate the stage',()=>{
 const key=auctionViewKey(auction);
 for(const patch of [{code:'456'},{matchKey:'123:2:100'},{me:1},{phase:'finished'},{round:7},{turn:1},{topBid:2},{topSeat:1},{deadline:40000},{mode:'friend'},{universe:'original'},
  ...['name','rarity','universe','description'].map(field=>({card:{...auction.card,[field]:'changed'}})),
  ...[0,1].flatMap(seat=>['name','credits'].map(field=>({players:auction.players.map((p,i)=>i===seat?{...p,[field]:field==='credits'?5:'Other'}:p)})))]){
  assert.notEqual(auctionViewKey({...structuredClone(auction),...patch}),key,JSON.stringify(patch));
 }
});

test('legacy match fallback distinguishes same-code rematches and recreated rooms',()=>{
 const room={...auction,matchKey:undefined};
 assert.notEqual(auctionViewKey(room),auctionViewKey({...room,matchNumber:2}));
 assert.notEqual(auctionViewKey(room),auctionViewKey({...room,created:200}));
 assert.equal(auctionViewKey(null),null);
 assert.equal(auctionViewKey({...room,phase:'waiting'}),null);
});

test('CrazyGames includes the same auction view protection',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(crazyGamesSource(source,'.js'),/from '\/crazygames\/auction-view-state.js'/);
});
