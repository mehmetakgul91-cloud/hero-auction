import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {isStaleAuctionSnapshot} from '../public/auction-delivery-state.js';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
class Node{
 constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.dataset={};this.attributes={};this.className='';this.copy='';this.classList={remove(){}};}
 set textContent(value){this.copy=String(value);this.children=[]}get textContent(){return this.copy+this.children.map(child=>child.textContent).join(' ')}
 append(...items){this.children.push(...items)}replaceChildren(...items){this.copy='';this.children=items}setAttribute(key,value){this.attributes[key]=String(value)}
}
const cancelledRoom=(patch={})=>({code:'123',matchKey:'123:1:99',revision:12,phase:'finished',me:0,mode:'friend',cancellation:{reason:'admin-entry-refund',refundGoldPerSeat:50},history:['İlk kart alındı','Son kart alındı'],players:[{name:'Alice',team:[{name:'First hero'}]},{name:'Bob',team:[{name:'Other hero'}]}],final:[{name:'Alice',score:9999,team:Array(5).fill({})},{name:'Bob',score:0,team:Array(5).fill({})}],series:[3,4],rankChange:null,...patch});
function fixture({english=false,activeTail=true}={}){
 const ids=['stage','game','login-gate','home','room-title','phase','player0','player1','log','leave'],nodes=Object.fromEntries(ids.map(id=>[id,new Node()]));
 const counts={tail:0,flights:0,reveal:0,wallet:0,chat:0,leave:0,normalPath:0},platform=[];nodes.leave.click=()=>counts.leave++;
 const ctx={auctionCommanderDialog:{sync(){}},room:{code:'123',matchKey:'123:1:99',revision:11,phase:'finished'},session:{code:'123',token:'seat'},lastCardKey:'old',tailReveal:activeTail?{active:true,cancel:()=>counts.tail++}:null,
  document:{documentElement:{lang:english?'en':'tr'},createElement:tag=>new Node(tag)},$:id=>nodes[id],window:{HeroPlatform:{setRoom:r=>platform.push(r),gameplay:active=>platform.push(active)}},displayPlayerName:p=>p?.name||'Player',cancelAwardFlights:()=>counts.flights++,cancelAuctionReveal:()=>counts.reveal++,renderChat:()=>counts.chat++,refreshGold:()=>counts.wallet++,signedIn:()=>true,isStaleAuctionSnapshot,storefrontUI:{close(){}},roomInvitesUI:{setRoom(){}},friendsUI:{setRoom(){}},collectTailAwards(){counts.normalPath++;throw Error('cancelled room entered normal result branch')}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function showCancelledRoom(r)'),source.indexOf('// Recover game progress')),ctx);
 return{ctx,nodes,counts,platform};
}
const all=node=>[node,...node.children.flatMap(all)];
test('committed cancellation bypasses pending tail reveal, arena entry and classic winner computation',()=>{
 const f=fixture(),room=cancelledRoom(),before=JSON.stringify(room);f.ctx.show(room);
 assert.equal(f.counts.normalPath,0);assert.equal(f.counts.tail,1);assert.equal(f.counts.flights,1);assert.equal(f.counts.reveal,1);assert.equal(f.ctx.tailReveal,null);
 assert.equal(f.nodes.game.hidden,false);assert.equal(f.nodes.home.hidden,true);assert.equal(f.nodes.phase.textContent,'MAÇ İPTAL EDİLDİ');
 assert.match(f.nodes.stage.textContent,/50 altın giriş ücreti iade edildi/);assert.match(f.nodes.stage.textContent,/Kazanan veya lig sonucu oluşturulmadı/);assert.doesNotMatch(f.nodes.stage.textContent,/ZAFER|BERABERE|9999|RÖVANŞ|ONAYLA VE ARENAYA/);
 assert.equal(JSON.stringify(room),before);assert.deepEqual(f.platform,[room,false]);assert.equal(f.counts.wallet,1);
});
test('rosters and history stay visible, text is inert, and home uses the existing detach action',()=>{
 const f=fixture(),room=cancelledRoom({history:['<script>not html</script>','preserved']});f.ctx.show(room);
 assert.match(f.nodes.player0.textContent,/Alice.*First hero/);assert.match(f.nodes.player1.textContent,/Bob.*Other hero/);assert.equal(f.nodes.log.children.length,2);assert.equal(f.nodes.log.children[1].textContent,'<script>not html</script>');
 const button=all(f.nodes.stage).find(node=>node.tag==='button');button.onclick();assert.equal(f.counts.leave,1);assert.equal(f.counts.normalPath,0);
});
test('repeated snapshots do not repeat wallet refresh or create extra panels',()=>{
 const f=fixture();f.ctx.show(cancelledRoom());f.ctx.show(cancelledRoom({revision:13}));assert.equal(f.counts.wallet,1);assert.equal(f.nodes.stage.children.length,1);assert.equal(f.nodes.log.children.length,2);
});
test('stale, other-session and signed-out snapshots cannot show a cancellation for the wrong room',()=>{
 for(const setup of [f=>{f.ctx.room.revision=99},f=>{f.ctx.session={code:'456'}},f=>{f.ctx.signedIn=()=>false}]){const f=fixture();setup(f);f.ctx.show(cancelledRoom());assert.equal(f.nodes.stage.children.length,0);assert.equal(f.counts.wallet,0);}
});
test('invalid refund metadata never invents a50gold grant; English message is explicit and neutral',()=>{
 const unknown=fixture();unknown.ctx.show(cancelledRoom({cancellation:{reason:'admin-entry-refund'}}));assert.match(unknown.nodes.stage.textContent,/iade kaydı doğrulanıyor/);assert.doesNotMatch(unknown.nodes.stage.textContent,/50 altın.*iade edildi/);
 const english=fixture({english:true});english.ctx.show(cancelledRoom({me:1}));assert.match(english.nodes.stage.textContent,/Your 50 gold entry fee has been refunded/);assert.match(english.nodes.stage.textContent,/No winner or league result was recorded/);assert.match(english.nodes.player0.textContent,/Bob/);
});
test('cancellation guard is ahead of tail capture, preparation and results; no grant or cancellation API in player renderer',()=>{
 const show=source.slice(source.indexOf('function show(r)'),source.indexOf('// Recover game progress'));const guard=show.indexOf("r.cancellation?.reason==='admin-entry-refund'");assert.ok(guard>0);assert.ok(guard<show.indexOf('tailReveal?.active'));assert.ok(guard<show.indexOf('collectTailAwards'));assert.ok(guard<show.indexOf('const winnerIndex'));
 const render=source.slice(source.indexOf('function showCancelledRoom(r)'),source.indexOf('function show(r)'));assert.doesNotMatch(render,/fetch\(|post\(|rankChange\s*=|series\s*=|history\s*=|gold\s*\+=/);
});
