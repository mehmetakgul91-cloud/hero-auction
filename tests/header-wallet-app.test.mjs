import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHeaderWallet} from '../public/header-wallet.js';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const refresh=source.slice(source.indexOf('async function refreshGold(){'),source.indexOf('\nfunction clearExpiredLogin()'));
const post=source.slice(source.indexOf('async function post(url,data){'),source.indexOf('\nfunction save(token,r)'));
const fixture=()=>{
 const nodes=new Map(),document={documentElement:{lang:'tr'},getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},setAttribute(){}});return nodes.get(id)}};
 const headerWallet=createHeaderWallet({document});headerWallet.setLogin({authToken:'a'});
 const pending=[],shown=[];
 const ctx={headerWallet,login:{authToken:'a'},signedIn:()=>Boolean(ctx.login?.authToken),roomEntryPending:0,roomInvitesUI:{busy:false},uiText:String,gameIdentity:()=>({authToken:ctx.login?.authToken}),showGold:value=>shown.push(value),console:{warn(){}},fetch:(url,request)=>new Promise(resolve=>pending.push({url,body:JSON.parse(request.body),resolve:(data,status=200)=>resolve({ok:status===200,status,json:async()=>data})}))};
 vm.createContext(ctx);vm.runInContext(post+'\n'+refresh,ctx);
 return {ctx,pending,shown,values:()=>['gold-balance','magic-dust-balance','diamond-balance'].map(id=>nodes.get(id).textContent)};
};
test('real app wallet polling sends auth only, applies all currencies and never calculates a reward',async()=>{
 const f=fixture(),request=f.ctx.refreshGold();assert.equal(f.pending[0].url,'/api/wallet');assert.deepEqual(f.pending[0].body,{authToken:'a'});
 f.pending[0].resolve({gold:450,magicDust:0,diamonds:0});await request;assert.deepEqual(f.values(),['450','0','0']);assert.deepEqual(f.shown,[450]);
});
test('delayed pre-upgrade poll cannot overwrite the successful three-currency upgrade response',async()=>{
 const f=fixture(),poll=f.ctx.refreshGold(),upgrade=f.ctx.post('/api/commander/upgrade',{stat:'attack'});
 f.pending[1].resolve({gold:200,magicDust:4,diamonds:2});await upgrade;f.pending[0].resolve({gold:550,magicDust:9,diamonds:3});await poll;
 assert.deepEqual(f.values(),['200','4','2']);assert.deepEqual(f.shown,[]);
});
test('wallet failure after a mutation does not erase newly confirmed balances',async()=>{
 const f=fixture(),poll=f.ctx.refreshGold(),upgrade=f.ctx.post('/api/diamonds/exchange',{diamondsToSpend:1});
 f.pending[1].resolve({gold:1000,diamonds:4});await upgrade;f.pending[0].resolve({error:'Offline'},503);await poll;assert.deepEqual(f.values(),['1.000','—','4']);
});
test('real refresh ignores an old account after login switch; current failure displays dash',async()=>{
 const f=fixture(),old=f.ctx.refreshGold();f.ctx.login={authToken:'b'};f.ctx.headerWallet.setLogin(f.ctx.login);const next=f.ctx.refreshGold();
 f.pending[1].resolve({gold:900,magicDust:10,diamonds:8});await next;f.pending[0].resolve({gold:1,magicDust:1,diamonds:1});await old;assert.deepEqual(f.values(),['900','10','8']);assert.deepEqual(f.shown,[900]);
 const failed=f.ctx.refreshGold();f.pending[2].resolve({error:'Offline'},503);await failed;assert.deepEqual(f.values(),['—','—','—']);
});
test('unauthorized mutation errors never apply response-like balances',async()=>{
 const f=fixture(),request=f.ctx.post('/api/commander/upgrade',{stat:'attack'});f.pending[0].resolve({error:'No permission',gold:1000,magicDust:1000,diamonds:1000},403);await assert.rejects(request,/No permission/);assert.deepEqual(f.values(),['—','—','—']);
});
