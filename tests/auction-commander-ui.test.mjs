import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auctionCommanderView,auctionCommanderMarkup,auctionCommanderDialogMarkup,createAuctionCommanderDialog} from '../public/auction-commander.js';
import {crazyGamesSource} from '../crazygames-build.js';
for(const english of [false,true])for(const commanderId of ['attack','defense','magic','support'])test(`class-only ${commanderId} identity and abilities (${english?'EN':'TR'})`,()=>{
 const input={commanderId,levels:{attack:9999},gold:9999,secret:'SENSITIVE'};
 const view=auctionCommanderView(input,{english});assert.equal(view.id,commanderId);
 for(const seat of [0,1]){
  const badge=auctionCommanderMarkup(input,seat,{english});assert.match(badge,new RegExp(`data-auction-commander="${seat}"`));assert.match(badge,/aria-haspopup="dialog"/);assert.match(badge,/<img.*alt=""/);
  assert.doesNotMatch(badge,/9999|SENSITIVE|level|seviye/i);
 }
 const popup=auctionCommanderDialogMarkup(input,{english});assert.match(popup,english?/Normal ability.*Ultimate/s:/Normal yetenek.*Nihai yetenek/s);assert.match(popup,/form method="dialog"/);assert.doesNotMatch(popup,/9999|SENSITIVE|level|seviye/i);
 assert.ok(fs.existsSync(new URL('../public'+decodeURIComponent(view.portrait),import.meta.url)));
});
test('missing and forged classes never become markup or image paths',()=>{
 for(const commanderId of [undefined,'','constructor','__proto__','<script>','../../private']){
  assert.equal(auctionCommanderView({commanderId}),null);assert.equal(auctionCommanderMarkup({commanderId},0),'');assert.equal(auctionCommanderDialogMarkup({commanderId}),'');
 }
 assert.equal(auctionCommanderMarkup({commanderId:'attack'},8),'');
});
test('latest attack and other core ultimate semantics are concise and bilingual',()=>{
 for(const english of [true,false]){
  const attack=auctionCommanderView({commanderId:'attack'},{english});assert.match(attack.ultimate,/20/);assert.match(attack.ultimate,english?/next attack/:/sonraki saldırı/);
  for(const commanderId of ['attack','defense','magic','support'])assert.match(auctionCommanderDialogMarkup({commanderId},{english}),english?/Once per battle/:/Savaşta 1 kez/);
 }
});
test('both oriented player panels use room identity and CrazyGames remaps module import',()=>{
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(source,/const seat=r.me===1\?1-i:i;const p=r.players\[seat\]/);
 assert.match(source,/auctionCommanderMarkup\(p.commander,seat/);
 assert.match(crazyGamesSource(source,'.js'),/from '\/crazygames\/auction-commander.js'/);
 assert.match(source,/auctionCommanderDialog.sync\(r\)/);
});
test('native dialog survives same-auction snapshots, closes on departure/class change, and restores current button focus',()=>{
 const events={},dialogs=[];let focused=0;
 const document={documentElement:{lang:'en'},addEventListener:(type,fn)=>events[type]=fn,body:{append:dialog=>dialogs.push(dialog)},querySelector:()=>({focus:()=>focused++}),createElement:tag=>{
  assert.equal(tag,'dialog');const handlers={};return {open:false,setAttribute(){},addEventListener:(type,fn)=>handlers[type]=fn,showModal(){this.open=true;},close(){this.open=false;handlers.close();}};
 }};
 let room={phase:'auction',code:'ABC',players:[{commander:{commanderId:'attack'}},{commander:{commanderId:'magic'}}]};
 const controller=createAuctionCommanderDialog({document,getRoom:()=>room});
 const click=seat=>events.click({target:{closest:()=>({dataset:{auctionCommander:String(seat)}})}});
 click(1);assert.equal(dialogs.length,1);assert.equal(dialogs[0].open,true);assert.match(dialogs[0].innerHTML,/Mage Commander/);
 controller.sync(structuredClone(room));assert.equal(dialogs[0].open,true);
 click(0);assert.equal(dialogs.length,1);assert.match(dialogs[0].innerHTML,/Attack Commander/);
 controller.sync({...room,phase:'finished'});assert.equal(dialogs[0].open,false);assert.equal(focused,1);
 click(0);controller.sync({...room,players:[{commander:{commanderId:'support'}},room.players[1]]});assert.equal(dialogs[0].open,false);
 click(1);controller.sync(null);assert.equal(dialogs[0].open,false);
 room={...room,phase:'waiting'};click(0);assert.equal(dialogs[0].open,false);
});

test('queued native close events cannot clear or steal focus from a reopened popup; rematch keys invalidate old identity',()=>{
 const events={},dialogs=[],closeQueue=[],focused=[];
 const document={documentElement:{lang:'en'},addEventListener:(type,fn)=>events[type]=fn,body:{append:dialog=>dialogs.push(dialog)},querySelector:selector=>({focus:()=>focused.push(selector)}),createElement:()=>{
  const handlers={};return {open:false,removed:false,setAttribute(){},addEventListener:(type,fn)=>handlers[type]=fn,showModal(){this.open=true;},remove(){this.removed=true;},close(){this.open=false;closeQueue.push(()=>handlers.close());}};
 }};
 let room={phase:'auction',code:'ABC',matchKey:'ABC:1:100',players:[{commander:{commanderId:'attack'}},{commander:{commanderId:'magic'}}]};
 const controller=createAuctionCommanderDialog({document,getRoom:()=>room});
 const click=seat=>events.click({target:{closest:()=>({dataset:{auctionCommander:String(seat)}})}});
 click(0);controller.close();click(1);
 assert.equal(dialogs.length,2);assert.equal(dialogs[1].open,true);
 closeQueue.shift()();assert.equal(dialogs[0].removed,true);assert.equal(dialogs[1].open,true);assert.deepEqual(focused,[]);
 // A second close/reopen/close before either native event arrives also cannot
 // let the older event consume the latest popup's state or restore old focus.
 controller.close();click(0);controller.close();
 closeQueue.shift()();assert.deepEqual(focused,[]);
 closeQueue.shift()();assert.deepEqual(focused,['[data-auction-commander="0"]']);
 click(1);const beforeRematch=dialogs.at(-1);room={...room,matchKey:'ABC:2:100'};
 controller.sync(room);assert.equal(beforeRematch.open,false);
 click(1);const afterRematch=dialogs.at(-1);closeQueue.shift()();assert.equal(afterRematch.open,true);assert.equal(focused.length,1);
 controller.sync({...room,players:[room.players[0],{commander:{commanderId:'support'}}]});assert.equal(afterRematch.open,false);
 closeQueue.shift()();assert.equal(focused.at(-1),'[data-auction-commander="1"]');
});

test('integrated heading combines escaped player identity and class without levels',()=>{
 const html=auctionCommanderMarkup({commanderId:'defense',levels:{defense:777}},1,{playerName:'<script> & "Player"',isMe:true});
 assert.match(html,/auction-commander-copy/);assert.match(html,/class="name" translate="no">&lt;script&gt; &amp; &quot;Player&quot;/);assert.match(html,/auction-commander-self">SEN/);assert.match(html,/auction-commander-type">Savunma/);assert.doesNotMatch(html,/<script>|777|level|seviye/i);
 const en=auctionCommanderMarkup({commanderId:'magic'},0,{english:true,playerName:'Opponent',isMe:false});
 assert.match(en,/Opponent/);assert.match(en,/Mage/);assert.doesNotMatch(en,/auction-commander-self/);
 assert.match(auctionCommanderMarkup({commanderId:'support'},0,{english:true,playerName:'Me',isMe:true}),/auction-commander-self">YOU/);
});
test('integrated heading remains full-width accessible and compact without a separate badge shell',()=>{
 const css=fs.readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 assert.match(css,/#game \.auction-commander\{[^}]*width:100%[^}]*min-height:58px[^}]*border:0[^}]*background:transparent/);
 assert.match(css,/@media\(max-width:520px\)\{#game \.auction-commander\{[^}]*min-height:48px/);
 const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/playerName:displayPlayerName\(p,r.mode==='bot'&&seat===1\),isMe:r.me===seat/);
});
