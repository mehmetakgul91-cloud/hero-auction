import {createWalletOperations} from '../public/wallet-operations.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {commanderExchangeQuote,renderCommanderExchange} from '../public/commander-exchange-view.js';
const policy={enabled:true,available:true,rate:500,pricingVersion:'diamonds-to-gold-500-v1'};
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.className='';this.text='';this.disabled=false;}
 set textContent(text){this.text=String(text);this.children=[];}
 get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;this.text='';}
 setAttribute(key,value){this.attributes[key]=value;}
}
const document={createElement:tag=>new Element(tag)},walk=root=>[root,...root.children.flatMap(walk)],find=(root,tag)=>walk(root).filter(node=>node.tagName===tag);
const render=options=>{const root=new Element('div');renderCommanderExchange(root,{policy,diamonds:10,gold:1000,document,...options});return root;};

test('server quote owns the exchange rate; no fabricated balance or controls when unavailable',()=>{
 for(const p of [null,{...policy,enabled:false},{...policy,available:false},{...policy,rate:null}]){
  const root=render({policy:p,diamonds:null});assert.equal(find(root,'input').length,0);assert.equal(find(root,'button').length,0);assert.match(root.textContent,/henüz açık değil/);assert.doesNotMatch(root.textContent,/Mevcut elmas: 0/);
 }
 assert.equal(commanderExchangeQuote({...policy,rate:600},10,1000,2).goldGranted,1200);
});
for(const value of ['',0,-1,1.5,'1.5','1e2','01','-1','abc',Infinity,Number.MAX_SAFE_INTEGER])test('invalid exchange amount is blocked: '+String(value),()=>{
 assert.equal(commanderExchangeQuote(policy,10,1000,value).canExchange,false);
});
test('exact quote, insufficient diamonds and gold ceiling are shown before confirmation',()=>{
 assert.equal(commanderExchangeQuote(policy,10,1000,10).goldGranted,5000);
 assert.equal(commanderExchangeQuote(policy,10,1000,11).reason,'insufficient_diamonds');
 assert.equal(commanderExchangeQuote(policy,null,1000,1).reason,'insufficient_diamonds');
 assert.equal(commanderExchangeQuote(policy,10,2147483600,1).reason,'gold_limit');
 const root=render({amount:'10'});assert.match(root.textContent,/10 elmas harcanır → 5.000 altın alınır/);
});
test('editing amount only previews and invalid amount cannot invoke the exchange callback',()=>{
 const calls=[],root=render({onExchange:value=>calls.push(value)}),input=find(root,'input')[0],button=find(root,'button')[0];
 input.value='-1';input.oninput();assert.equal(button.disabled,true);button.onclick();assert.deepEqual(calls,[]);
 input.value='2';input.oninput();assert.deepEqual(calls,[]);assert.match(root.textContent,/2 elmas harcanır → 1.000 altın alınır/);button.onclick();assert.deepEqual(calls,[2]);
});
test('pending recovery keeps original accepted quote and permits same-key recovery even at zero diamonds',()=>{
 const calls=[],root=render({diamonds:0,pending:{diamondsToSpend:10,expectedRate:500},onExchange:value=>calls.push(value)});
 assert.equal(find(root,'input').length,0);assert.match(root.textContent,/10 elmas → 5.000 altın/);find(root,'button')[0].onclick();assert.deepEqual(calls,[10]);
});
test('English exchange copy is complete and busy states block mutations',()=>{
 const calls=[],root=render({english:true,busy:true,onExchange:value=>calls.push(value)});assert.doesNotMatch(root.textContent,/[ğışİçüö]|elmas|altın/);assert.equal(find(root,'input')[0].disabled,true);assert.equal(find(root,'button')[0].disabled,true);find(root,'button')[0].onclick();assert.deepEqual(calls,[]);
});

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('async function exchangeCommanderDiamonds(amount){'),app.indexOf('async function upgradeCommander(stat){'));
function harness({confirmed=true,post}={}){
 const calls=[],prompts=[],memory=new Map();let nextId=0;
 const walletOperations=createWalletOperations({storage:()=>({getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)})});
 const context={walletOperations,commanderProfile:{commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}},commanderBusy:false,commanderProgression:null,commanderDiamonds:10,commanderExchange:policy,commanderExchangeRequest:null,walletGold:1000,login:{authToken:'first',user:{sub:'test-account'}},document:{documentElement:{lang:'en'}},crypto:{randomUUID:()=>`exchange-request-${++nextId}`},commanderExchangeQuote,signedIn:()=>!!context.login?.authToken,renderCommanderProfile(){},showGold(value){context.walletGold=value;},$:()=>({textContent:''}),window:{confirm:message=>{prompts.push(message);return confirmed;}},post:async(url,body)=>{calls.push({url,body:structuredClone(body)});return post(url,body,calls.length);}};
 vm.createContext(context);vm.runInContext(source,context);return {context,calls,prompts,run:amount=>context.exchangeCommanderDiamonds(amount)};
}
test('canceling the exact quote sends no request and creates no pending transaction',async()=>{
 const h=harness({confirmed:false,post:()=>{throw Error('Unexpected');}});await h.run(2);assert.equal(h.calls.length,0);assert.equal(h.context.commanderExchangeRequest,null);assert.match(h.prompts[0],/Spend 2 diamonds to receive 1,000 gold/);
});
test('exchange locks double-clicks and applies only exact authoritative returned balances',async()=>{
 let finish;const h=harness({post:()=>new Promise(resolve=>finish=resolve)});const first=h.run(2);await h.run(2);assert.equal(h.calls.length,1);assert.equal(h.prompts.length,1);
 assert.deepEqual(h.calls[0].body,{diamondsToSpend:2,expectedRate:500,pricingVersion:policy.pricingVersion,requestId:'exchange-request-1'});
 finish({gold:2000,diamonds:8,diamondsSpent:2,goldGranted:1000,exchange:policy});await first;assert.equal(h.context.walletGold,2000);assert.equal(h.context.commanderDiamonds,8);assert.equal(h.context.commanderExchangeRequest,null);assert.equal(h.context.commanderProfile.levels.attack,0);
});
test('lost response retains same accepted request even after GET shows zero diamonds; retry does not ask for a new debit',async()=>{
 const h=harness({post:(url,body,count)=>{if(count===1)throw Error('Response lost');if(url.endsWith('/get'))return {profile:h.context.commanderProfile,gold:6000,diamonds:0,exchange:policy};return {gold:6000,diamonds:0,diamondsSpent:10,goldGranted:5000,replayed:true,exchange:policy};}});
 await h.run(10);assert.equal(h.context.commanderDiamonds,0);assert.ok(h.context.commanderExchangeRequest);await h.run(10);
 const exchanges=h.calls.filter(call=>call.url.endsWith('/exchange'));assert.equal(exchanges.length,2);assert.equal(exchanges[0].body.requestId,exchanges[1].body.requestId);assert.equal(h.prompts.length,1);assert.equal(h.context.walletGold,6000);assert.equal(h.context.commanderExchangeRequest,null);
});
test('explicit server conflict clears the pending quote, but5xx keeps its key',async()=>{
 for(const status of [409,503]){
  const h=harness({post:url=>{if(url.endsWith('/exchange'))throw Object.assign(Error('Rejected'),{status});throw Error('Offline');}});await h.run(1);assert.equal(Boolean(h.context.commanderExchangeRequest),status===503);
 }
});
test('account switch ignores delayed exchange balances',async()=>{
 let finish;const h=harness({post:()=>new Promise(resolve=>finish=resolve)});const first=h.run(1);h.context.login={authToken:'other'};h.context.walletGold=25;h.context.commanderDiamonds=2;
 finish({gold:1500,diamonds:9,exchange:policy});await first;assert.equal(h.context.walletGold,25);assert.equal(h.context.commanderDiamonds,2);
});
test('unavailable, invalid, insufficient or unauthenticated exchange never prompts or sends',async()=>{
 for(const change of [c=>c.commanderExchange=null,c=>c.commanderDiamonds=0,c=>c.login=null]){const h=harness({post:()=>{throw Error('Unexpected');}});change(h.context);await h.run(1);assert.equal(h.calls.length,0);assert.equal(h.prompts.length,0);}
 const h=harness({post:()=>{throw Error('Unexpected');}});await h.run(-1);assert.equal(h.calls.length,0);assert.equal(h.prompts.length,0);
});
