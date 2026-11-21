import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
const start=source.indexOf('let battleRematchShown=false;');
const end=source.indexOf('if(!auctionMode&&!arenaMode){window.HeroPlatform?.loaded();',start);
const rematchRenderer=source.slice(start,end);
class Element{
 children=[];isConnected=true;attributes={};classes=new Set();textContent='';
 classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};
 append(...elements){this.children.push(...elements)}
 prepend(element){this.children.unshift(element)}
 after(element){this.next=element}
 setAttribute(name,value){this.attributes[name]=value}
 replaceChildren(...elements){this.textContent='';this.children=elements}
}
const matchKey='1:100',expectedMatchId='123:'+matchKey;
async function setup({lang='tr',mode='friend',platform=false}={}){
 const ids=Object.fromEntries(['battle-summary','battle-summary-title','message'].map(k=>[k,new Element()]));
 const timers=[],requests=[],nav=[],consents=[],completed=[];
 const state={status:'available',result:{error:'retry'},accept:false,consent:null};
 const response=(result,ok=true)=>({ok,json:async()=>result});
 const context={
  $:id=>ids[id],auctionCode:'123',auctionToken:'seat-two',auctionMode:true,leavingBattle:false,preparationMatchKey:matchKey,
  document:{hidden:false,documentElement:{lang},createElement:()=>new Element()},
  window:platform?{HeroPlatform:{beforeNavigate(){}}}:{},location:{replace:to=>nav.push(to)},
  localStorage:{getItem:()=>JSON.stringify({authToken:'test',user:{sub:'someone'}})},showVictoryChest(){},showBotSettlementStatus(){},translate:s=>s,
  URLSearchParams,AbortSignal,setTimeout:cb=>timers.push(cb),
  botEntryConsent:{request:async(...args)=>{consents.push(args);return state.consent},complete:scope=>completed.push(scope)},
  fetch:async(url,options)=>{
   const body=options.body&&JSON.parse(options.body);
   const path=new URL(url,'http://localhost').pathname;
   requests.push({path,body});
   if(path==='/api/battle-auction-complete')return response({mode,seat:1,series:[1,2],players:[{name:'Rakip'},{name:'Ben'}]});
   if(path==='/api/battle-rematch-status'){
    const params=new URL(url,'http://localhost').searchParams;
    assert.deepEqual(Object.fromEntries(params),{code:'123',token:'seat-two',matchKey});
    return response({status:state.status});
   }
   if(path==='/api/state')return response({room:{mode:'bot',matchId:expectedMatchId,difficulty:'medium'}});
   if(path==='/api/rematch')return response(state.result,state.accept);
   throw Error('Unexpected URL: '+url);
  }
 };
 await vm.runInNewContext(rematchRenderer+'\nshowAuctionRematch()',context);
 await new Promise(setImmediate);
 const actions=ids['battle-summary-title'].next,[notice,button,error]=actions.children;
 return {actions,notice,button,error,state,context,requests,nav,consents,completed,
  tick:async()=>{assert.ok(timers.length,'a status check is scheduled');await timers.shift()()},
  pending:()=>timers.length,
  posts:()=>requests.filter(r=>r.path==='/api/rematch')};
}
for(const lang of ['tr','en'])test('an incoming rematch appears before any click and remains retryable on an error ('+lang+')',async()=>{
 const f=await setup({lang,platform:lang==='en'});
 assert.equal(f.posts().length,0);
 assert.equal(f.requests[0].body.expectedMatchId,expectedMatchId);
 assert.equal(f.button.textContent,lang==='en'?'Request rematch':'Rövanş iste');
 f.state.status='incoming';await f.tick();
 assert.ok(f.actions.classes.has('arena-rematch-has-incoming'));
 assert.equal(f.notice.attributes.role,'status');
 assert.equal(f.notice.children[0].textContent,lang==='en'?'Your opponent wants a rematch!':'Rakibin rövanş istiyor!');
 assert.equal(f.button.textContent,lang==='en'?'Accept rematch':'Rövanşı kabul et');
 await Promise.all([f.button.onclick(),f.button.onclick()]);
 assert.equal(f.posts().length,1);
 assert.equal(f.posts()[0].body.expectedMatchId,expectedMatchId);
 assert.equal(f.error.attributes.role,'alert');
 assert.match(f.error.textContent,/retry/);
 assert.ok(!f.button.disabled);
 assert.deepEqual(f.nav,[]);
 f.state.accept=true;f.state.result={room:{phase:'auction'}};
 await f.button.onclick();
 assert.equal(f.error.textContent,'');
 assert.deepEqual(f.nav,[lang==='en'?'/crazygames/':'/']);
});
test('outgoing state waits without duplicate requests, then follows the accepted rematch',async()=>{
 const f=await setup();
 f.state.accept=true;f.state.result={room:{phase:'finished'}};
 await f.button.onclick();
 assert.match(f.notice.textContent,/Rakibin onayı bekleniyor/);
 assert.ok(f.button.disabled);
 await f.button.onclick();assert.equal(f.posts().length,1);
 f.state.status='starting';await f.tick();assert.ok(f.button.disabled);
 f.state.status='started';await f.tick();
 assert.deepEqual(f.nav,['/']);assert.equal(f.pending(),0);
});
test('hidden and replaced result screens cannot poll a stale match',async()=>{
 const f=await setup();const prior=f.requests.length;
 f.context.document.hidden=true;await f.tick();assert.equal(f.requests.length,prior);
 f.context.document.hidden=false;f.context.preparationMatchKey='2:101';
 await f.tick();assert.equal(f.requests.length,prior);assert.equal(f.pending(),0);
});
test('bot rematches retain the explicit consent guard and do not watch for an opponent',async()=>{
 const f=await setup({mode:'bot'});
 assert.equal(f.pending(),0);
 await f.button.onclick();
 assert.deepEqual(f.consents,[['someone:'+expectedMatchId,'medium']]);
 assert.equal(f.posts().length,0);assert.ok(!f.button.disabled);
 f.state.consent={requestId:'confirmed-test-request'};f.state.accept=true;f.state.result={room:{phase:'auction'}};
 await f.button.onclick();
 assert.equal(f.posts()[0].body.requestId,'confirmed-test-request');
 assert.deepEqual(f.completed,['someone:'+expectedMatchId]);
});
