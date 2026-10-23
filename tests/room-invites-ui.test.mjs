import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomInvitesUI} from '../public/room-invites.js';
class Element{
 constructor(){this.children=[];this.hidden=false;this.value='';this.textContent='';this.attrs={}}
 append(...values){this.children.push(...values)}replaceChildren(...values){this.children=values}setAttribute(k,v){this.attrs[k]=v}contains(el){return this===el||this.children.some(c=>c.contains?.(el))}
}
const invitation={id:'invite-1',from:{name:'Host',playerId:'HA-HOST'},to:{name:'Guest',playerId:'HA-GUEST'},code:'123',status:'pending'};
function setup({fetcher,onJoined=()=>{},onHosted=()=>{},storage=new Map()}={}){
 const ids=['room-invites','room-invites-list','room-invites-summary','room-invites-message','room-invite-compose-message','room-invite-open','room-invite-compose','room-invite-friend','room-invite-send'];const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));nodes['room-invite-compose'].hidden=true;
 const calls=[],events={},timers=[];const win={fetch:async(path,options)=>{calls.push([path,JSON.parse(options.body),options]);return {ok:true,json:async()=>fetcher?fetcher(path,JSON.parse(options.body)):path==='/api/friend/invitations'?{incoming:[invitation],outgoing:[]}:{}}},setInterval:fn=>{timers.push(fn);return 1},clearInterval(){},addEventListener:(n,fn)=>events[n]=fn,removeEventListener:n=>delete events[n],localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
 const doc={getElementById:id=>nodes[id],createElement:()=>new Element(),activeElement:null};const ui=createRoomInvitesUI({document:doc,window:win,onJoined,onHosted});return {ui,nodes,calls,events,timers,storage};
}
const tick=()=>new Promise(r=>setImmediate(r));
function buttons(f){return f.nodes['room-invites-list'].children.flatMap(row=>row.children.filter(c=>typeof c.onclick==='function'))}
test('receiving a pending invitation never accepts automatically; explicit response includes cost and current room proof',async()=>{
 const f=setup();f.ui.setLogin({authToken:'account'});f.ui.setRoom({code:'456'},'seat-proof');await tick();assert.equal(f.calls.length,1);assert.equal(f.nodes['room-invites'].hidden,false);assert.equal(f.nodes['room-invites'].open,undefined);
 const accept=buttons(f).find(b=>b.textContent==='GELECEĞİM');accept.onclick();await tick();const body=f.calls.find(([p])=>p==='/api/friend/invite/respond')[1];assert.deepEqual(body,{inviteId:'invite-1',response:'accept',consent:true,expectedCost:50,sourceCode:'456',sourceToken:'seat-proof',authToken:'account'});
});
test('queued invitation offers cancellation and does not navigate before authoritative joined payload',async()=>{
 let joins=0;const f=setup({fetcher:p=>p==='/api/friend/invitations'?{incoming:[{...invitation,status:'queued'}],outgoing:[]}:{},onJoined:()=>joins++});f.ui.setLogin({authToken:'account'});await tick();assert.equal(joins,0);const cancel=buttons(f).find(b=>b.textContent==='VAZGEÇ');cancel.onclick();await tick();assert.ok(f.calls.some(([p,b])=>p==='/api/friend/invite/cancel'&&b.inviteId==='invite-1'));assert.equal(joins,0);
});
test('joined receipt navigates once across polls and reloaded controllers then ACKs',async()=>{
 let joins=0;const storage=new Map(),fetcher=p=>p==='/api/friend/invitations'?{incoming:[{...invitation,status:'joined',token:'new-seat',room:{code:'123',phase:'auction'}}],outgoing:[]}:{};
 const f=setup({fetcher,storage,onJoined:()=>joins++});f.ui.setLogin({authToken:'account'});await tick();await f.ui.refresh();assert.equal(joins,1);assert.ok(f.calls.some(([p,,options])=>p==='/api/friend/invite/ack'&&options.keepalive));
 const second=setup({fetcher,storage,onJoined:()=>joins++});second.ui.setLogin({authToken:'account'});await tick();assert.equal(joins,1);
});
test('account switch discards stale invitation and room navigation response',async()=>{
 let release,joins=0;const f=setup({fetcher:p=>p==='/api/friend/invitations'?new Promise(r=>release=()=>r({incoming:[{...invitation,status:'joined',token:'old-seat',room:{code:'123'}}],outgoing:[]})):{},onJoined:()=>joins++});f.ui.setLogin({authToken:'old'});await tick();f.ui.setLogin(null);release();await tick();assert.equal(joins,0);assert.equal(f.nodes['room-invites'].hidden,true);
});
test('explicit send creates a hosted room first and then sends only chosen accepted-friend ID',async()=>{
 let hosted=0;const f=setup({onHosted:()=>hosted++,fetcher:p=>p==='/api/friend/invitations'?{incoming:[],outgoing:[]}:p==='/api/friends'?{friends:[{name:'Friend',playerId:'HA-GUEST',online:true}]}:p==='/api/create'?{token:'host-seat',room:{code:'123',me:0,phase:'waiting',players:[{},null]}}:{}});
 f.ui.setLogin({authToken:'account'});await tick();f.nodes['room-invite-open'].onclick();await tick();assert.equal(f.calls.some(([p])=>p==='/api/create'),false);f.nodes['room-invite-friend'].value='HA-GUEST';f.nodes['room-invite-send'].onclick();await tick();assert.equal(hosted,1);assert.ok(f.calls.some(([p,b])=>p==='/api/friend/invite'&&b.code==='123'&&b.token==='host-seat'&&b.playerId==='HA-GUEST'));
});
test('pagehide suspends polling and pageshow refreshes without accepting',async()=>{
 const f=setup();f.ui.setLogin({authToken:'account'});await tick();f.events.pagehide();const count=f.calls.length;f.timers[0]();await tick();assert.equal(f.calls.length,count);f.events.pageshow();await tick();assert.equal(f.calls.length,count+1);assert.ok(f.calls.every(([p])=>p==='/api/friend/invitations'));
});
test('save completes before ACK and navigation; failed save is retried without marking handled',async()=>{
 const order=[];let saveFails=true;
 const f=setup({fetcher:p=>{if(p==='/api/friend/invite/ack')order.push('ack');return p==='/api/friend/invitations'?{incoming:[{...invitation,status:'joined',token:'new-seat',room:{code:'123'}}],outgoing:[]}:{}},onJoined:()=>{order.push('save');if(saveFails)throw Error('Storage full');return ()=>order.push('navigate')}});
 f.ui.setLogin({authToken:'account'});await tick();assert.deepEqual(order,['save']);assert.equal(f.storage.size,0);saveFails=false;await f.ui.refresh();assert.deepEqual(order,['save','save','ack','navigate']);
});
test('pending invitations stay visible ahead of terminal invitation history',async()=>{
 const f=setup({fetcher:p=>p==='/api/friend/invitations'?{incoming:[invitation,...Array.from({length:30},(_,i)=>({...invitation,id:'old-'+i,status:'declined'}))],outgoing:[]}:{} });
 f.ui.setLogin({authToken:'account'});await tick();
 assert.ok(buttons(f).some(b=>b.textContent==='GELECEĞİM'));
 assert.equal(f.nodes['room-invites-list'].children.length,11);
});
