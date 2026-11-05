import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {auctionViewKey} from '../public/auction-view-state.js';
import {auctionMatchKey,isStaleAuctionSnapshot,createTailReceipts} from '../public/auction-delivery-state.js';
import {isAuctionEntry} from '../public/auction-entry.js';
import {collectOfferedAwards,displaySeat} from '../public/auction-awards.js';
import {collectTailAwards} from '../public/auction-tail-reveal.js';
const source=readFileSync(process.env.HERO_AUCTION_APP_SOURCE||new URL('../public/app.js',import.meta.url),'utf8');
const fixture=()=>({code:'123',matchKey:'123:1:100',matchNumber:1,created:100,revision:1,me:0,
 phase:'auction',round:6,card:{name:'Morvan',universe:'original',rarity:'legendary'},
 turn:0,topBid:0,topSeat:null,deadline:Date.now()+20000,universe:'mixed',mode:'bot',
 presence:{serverNow:100,seats:[]},history:[],chat:[],series:[0,0],rematch:[false,false],
 players:[{name:'Player',credits:10,team:[]},{name:'Computer',credits:10,team:[]}]});

// Small DOM seam, not a browser/device test. Execute the real show(), polling,
// snapshot and action code and record node replacement, focus and sent amounts.
function harness(){
 const nodes=new Map(),intervals=[],sent=[];let context;
 const document={hidden:false,documentElement:{lang:'tr'},activeElement:null,querySelector:()=>null};
 function element(id){
  const el={id,dataset:{},classList:{add(){},remove(){}},textContent:'',value:'',children:[],querySelectorAll:()=>[],querySelector:()=>null};
  el.focus=()=>{document.activeElement=el;};
  let html='';
  Object.defineProperty(el,'innerHTML',{get:()=>html,set:value=>{
   html=value;
   if(id!=='stage')return;
   if(el.children.includes(document.activeElement))document.activeElement=null;
   for(const child of el.children)nodes.delete(child.id);
   el.children=[];el.firstElementChild={parent:el,html:value};
   for(const [,tag,attrs,nodeId] of value.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
    const child=element(nodeId);child.tagName=tag.toUpperCase();
    for(const attr of ['value','min','max'])child[attr]=attrs.match(new RegExp('\\b'+attr+'="([^"]*)"'))?.[1]||'';
    nodes.set(nodeId,child);el.children.push(child);
   }
  }});
  return el;
 }
 for(const id of ['stage','game','player0','player1','phase','log','login-gate','home','room-title'])nodes.set(id,element(id));
 context={document,window:{matchMedia:()=>({matches:true})},$:id=>nodes.get(id),room:null,
  login:{authToken:'test-account'},session:{code:'123',token:'test-seat'},signedIn:()=>true,
  auctionViewKey,renderedAuction:null,lastCardKey:null,tailReveal:null,awardFlights:new Set(),tailReceipts:createTailReceipts(),
  auctionMatchKey,isStaleAuctionSnapshot,isAuctionEntry,collectTailAwards,collectOfferedAwards,displaySeat,
  dailyRewardOverlay:{defer(){}},auctionCommanderDialog:{sync(){}},storefrontUI:{close(){}},roomInvitesUI:{setRoom(){}},friendsUI:{setRoom(){}},
  cancelAwardFlights(){},cancelAuctionReveal(){},animateWonAuctionCard(){},refreshGold(){},commanderVisibility(){},
  auctionCommanderMarkup:()=>'',displayPlayerName:p=>p.name,esc:String,specialtyLabel:()=>'',rarityLabel:r=>r,
  resetAuctionEntryViewport(){},revealAuctionCard(){},loadHeroInfo(){},auctionDeckMarkup:()=>'',renderChat(){context.chat=context.room?.chat;},
  worldNames:{mixed:'Mixed',original:'Original'},emojis:{original:'Hero'},playAuctionActionSound(){},notify(){},
  setInterval:(callback,ms)=>intervals.push({callback,ms}),Date,
  post:async(url,body)=>{sent.push({url,body});return{room:context.next};}
 };
 Object.assign(context,{auctionEmotes:{update(){},hide(){},destroy(){}}});vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function show(r)'),source.indexOf('// Recover game progress')),context);
 vm.runInContext(source.slice(source.indexOf('async function syncRoomSnapshot'),source.indexOf('// Guard reconnects')),context);
 vm.runInContext(source.slice(source.indexOf('async function act('),source.indexOf("\n\n$('create')")),context);
 vm.runInContext(source.match(/setInterval\(\(\)=>\{if\(!session\|\|!room\|\|document.hidden\)return;[^\n]+/)[0],context);
 return {context,nodes,sent,document,show:r=>context.show(r),select:value=>{const input=nodes.get('bidrange');input.value=String(value);input.oninput({target:input});},poll:()=>intervals.find(i=>i.ms===4000).callback()};
}

test('real render/snapshot path preserves selected bid and connected controls on 4-second presence refresh',async()=>{
 const h=harness(),r=fixture();h.show(r);h.select(6);
 const input=h.nodes.get('bidrange'),button=h.nodes.get('bidbutton');input.focus();
 h.context.next={...r,presence:{...r.presence,serverNow:200}};
 h.poll();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.nodes.get('bidrange').value,'6');
 assert.equal(h.nodes.get('bidrange'),input);assert.equal(h.nodes.get('bidbutton'),button);assert.equal(h.document.activeElement,input);
 assert.equal(h.context.room.presence.serverNow,200,'authoritative snapshot still advances');
 assert.equal(h.sent[0].url,'/api/state');
});

test('SSE/chat/revision changes keep the bid, refresh side panels and submit selected amount',async()=>{
 const h=harness(),r=fixture();h.show(r);h.select(6);
 const input=h.nodes.get('bidrange');
 const next={...r,revision:2,history:['Updated log'],chat:[{message:'Hello'}],players:r.players.map(p=>({...p,connected:true}))};
 h.show(next);assert.equal(h.nodes.get('bidrange'),input);assert.equal(input.value,'6');
 assert.match(h.nodes.get('log').innerHTML,/Updated log/);assert.deepEqual(h.context.chat,next.chat);
 h.nodes.get('plusbid').onclick();assert.equal(input.value,7);h.nodes.get('minusbid').onclick();assert.equal(input.value,6);
 h.context.next={...next,revision:3,topBid:6,topSeat:0,turn:1,deadline:r.deadline+20000};
 h.nodes.get('bidbutton').onclick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.sent.at(-1).url,'/api/bid');assert.equal(h.sent.at(-1).body.amount,6);assert.equal(h.nodes.has('bidrange'),false);
});

test('new turn, minimum, budget, card, round and rematch rebuild at the correct bound',()=>{
 for(const change of [r=>({...r,topBid:7,topSeat:1}),r=>({...r,deadline:r.deadline+20000}),r=>({...r,round:7}),r=>({...r,card:{...r.card,name:'New hero'}}),r=>({...r,matchKey:'123:2:100',matchNumber:2}),r=>({...r,players:[{...r.players[0],credits:3},r.players[1]]})]){
  const h=harness(),r=fixture();h.show(r);h.select(9);const input=h.nodes.get('bidrange'),next=change(r);h.show(next);
  assert.notEqual(h.nodes.get('bidrange'),input);assert.equal(Number(h.nodes.get('bidrange').value),next.topBid+1);
 }
 const h=harness(),r=fixture();h.show(r);h.select(6);h.show({...r,turn:1});assert.equal(h.nodes.has('bidrange'),false);h.show({...r,deadline:r.deadline+20000});assert.equal(h.nodes.get('bidrange').value,'1');
 h.show({...r,topBid:10,topSeat:1});assert.equal(h.nodes.has('bidrange'),false,'unaffordable decisions have no bid control');
});

test('stale snapshots cannot erase current input; account, seat, re-entry and language changes invalidate reuse',()=>{
 const h=harness(),r={...fixture(),revision:10};h.show(r);h.select(6);const input=h.nodes.get('bidrange');
 h.show({...r,revision:9,topBid:8});assert.equal(h.nodes.get('bidrange'),input);assert.equal(input.value,'6');
 for(const change of [()=>{h.context.session={...h.context.session,token:'new-seat'};},()=>{h.context.login={authToken:'other-account'};},()=>{h.document.documentElement.lang='en';h.context.heroDescriptionEnglish=()=>'';},()=>{h.context.room=null;}]){
  h.select(6);change();h.show(r);assert.equal(h.nodes.get('bidrange').value,'1');
 }
});

test('missing/replaced stage is restored even when snapshot identity is unchanged',()=>{
 const h=harness(),r=fixture();h.show(r);h.select(6);h.nodes.get('stage').innerHTML='<p>Other content</p>';h.show(r);
 assert.equal(h.nodes.get('bidrange').value,'1');
});
