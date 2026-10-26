import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHeaderWallet} from '../public/header-wallet.js';
import {crazyGamesSource} from '../crazygames-build.js';
const keys=['gold','magicDust','diamonds'];
const ids=['gold-wallet','gold-balance','magic-dust-balance','diamond-balance','header-gold','header-magic-dust','header-diamonds','header-gold-label','header-magic-dust-label','header-diamonds-label'];
function setup(lang='tr'){
 const nodes=Object.fromEntries(ids.map(id=>[id,{textContent:'',hidden:false,dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;}}]));
 const document={documentElement:{lang},getElementById:id=>nodes[id]};
 const wallet=createHeaderWallet({document});
 return {nodes,wallet,document,values:()=>['gold-balance','magic-dust-balance','diamond-balance'].map(id=>nodes[id].textContent)};
}
const balances={gold:1050,magicDust:12,diamonds:3,currencies:Object.fromEntries(keys.map(key=>[key,{available:true,reason:null}]))};
const signIn=f=>f.wallet.setLogin({authToken:'account-a'});

test('signed-out and new account never invent a zero, spend control or stored balance',()=>{
 const f=setup();assert.equal(f.nodes['gold-wallet'].hidden,true);assert.deepEqual(f.values(),['—','—','—']);
 signIn(f);assert.equal(f.nodes['gold-wallet'].hidden,false);assert.deepEqual(f.values(),['—','—','—']);
 for(const id of ['header-gold','header-magic-dust','header-diamonds']){assert.equal(f.nodes[id].attrs['aria-disabled'],'true');assert.match(f.nodes[id].attrs['aria-label'],/kullanılamıyor/);}
});
test('current server balances appear in gold, dust, diamond order; actual zero is valid',()=>{
 const f=setup();signIn(f);assert.equal(f.wallet.receive(balances,f.wallet.begin(),{complete:true}),true);
 assert.deepEqual(f.values(),['1.050','12','3']);assert.equal(f.nodes['header-magic-dust'].attrs['aria-label'],'Büyü tozu: 12');
 f.wallet.receive({gold:0,magicDust:0,diamonds:0},f.wallet.begin(),{complete:true});assert.deepEqual(f.values(),['0','0','0']);
});
test('disabled or unavailable capability overrides even a supplied balance',()=>{
 const f=setup();signIn(f);f.wallet.receive({...balances,currencies:{gold:{available:true},magicDust:{available:false,reason:'disabled'},diamonds:{available:false,reason:'storage_unavailable'}}},f.wallet.begin(),{complete:true});
 assert.deepEqual(f.values(),['1.050','—','—']);
});
test('null, missing, strings, negative, nonfinite, fractional and overflow are not balances',()=>{
 const f=setup();signIn(f);
 for(const value of [null,undefined,'2',-1,Infinity,NaN,1.2,2147483648]){f.wallet.receive({gold:value,magicDust:value,diamonds:value},f.wallet.begin(),{complete:true});assert.deepEqual(f.values(),['—','—','—']);}
 f.wallet.receive({gold:2147483647},f.wallet.begin(),{complete:true});assert.equal(f.values()[0],'2.147.483.647');
});
test('partial commander/auth response does not erase currencies omitted from that API',()=>{
 const f=setup();signIn(f);f.wallet.receive(balances,f.wallet.begin());f.wallet.receive({gold:500},f.wallet.begin());assert.deepEqual(f.values(),['500','12','3']);
 f.wallet.receive({profile:{}},f.wallet.begin());assert.deepEqual(f.values(),['500','12','3']);
});
test('fresh complete read clears omitted balances rather than retaining fake availability',()=>{
 const f=setup();signIn(f);f.wallet.receive(balances,f.wallet.begin());f.wallet.receive({gold:500},f.wallet.begin(),{complete:true});assert.deepEqual(f.values(),['500','—','—']);
});
test('account switch, logout and reauthentication discard old balances and late responses',()=>{
 const f=setup();signIn(f);f.wallet.receive(balances,f.wallet.begin());const old=f.wallet.begin();
 f.wallet.setLogin({authToken:'account-b'});assert.deepEqual(f.values(),['—','—','—']);assert.equal(f.wallet.receive(balances,old),false);assert.equal(f.wallet.unavailable(old),false);
 f.wallet.receive({gold:200},f.wallet.begin());const next=f.wallet.begin();f.wallet.setLogin(null);assert.equal(f.wallet.receive(balances,next),false);assert.equal(f.nodes['gold-wallet'].hidden,true);
 f.wallet.setLogin({authToken:'account-b-renewed'});assert.deepEqual(f.values(),['—','—','—']);assert.equal(f.wallet.update(balances,'account-b'),false);
});
test('identical login render does not clear data or invalidate an in-flight read',()=>{
 const f=setup();signIn(f);const ticket=f.wallet.begin();assert.equal(f.wallet.setLogin({authToken:'account-a'}),false);assert.equal(f.wallet.receive(balances,ticket),true);
});
test('newer read wins when network responses arrive in reverse order',()=>{
 const f=setup();signIn(f);const old=f.wallet.begin(),next=f.wallet.begin();f.wallet.receive({gold:700},next);assert.equal(f.wallet.receive({gold:500},old),false);assert.equal(f.values()[0],'700');
});
test('mutation completing after a later-started read still supplies authoritative new amount',()=>{
 const f=setup();signIn(f);const mutation=f.wallet.begin(),read=f.wallet.begin();f.wallet.receive({gold:700},read);f.wallet.receive({gold:500,magicDust:7},mutation,{mutation:true});assert.deepEqual(f.values(),['500','7','—']);
});
test('older read or network failure cannot overwrite a completed mutation',()=>{
 const f=setup();signIn(f);const read=f.wallet.begin(),mutation=f.wallet.begin();f.wallet.receive({gold:800,magicDust:7},mutation,{mutation:true});
 assert.equal(f.wallet.receive(balances,read,{complete:true}),false);assert.equal(f.wallet.unavailable(read),false);assert.deepEqual(f.values(),['800','7','—']);
});
test('store callbacks invalidate previous wallet polls but only for the current account',()=>{
 const f=setup();signIn(f);const read=f.wallet.begin();f.wallet.update({gold:900,diamonds:8},'account-a');assert.equal(f.wallet.receive(balances,read),false);assert.deepEqual(f.values(),['900','—','8']);
 assert.equal(f.wallet.update(balances,'other-account'),false);assert.deepEqual(f.values(),['900','—','8']);
});
test('failed current wallet read clears stale balances, then reconnect restores actual amounts',()=>{
 const f=setup();signIn(f);f.wallet.receive(balances,f.wallet.begin());f.wallet.unavailable(f.wallet.begin());assert.deepEqual(f.values(),['—','—','—']);
 f.wallet.receive(balances,f.wallet.begin(),{complete:true});assert.deepEqual(f.values(),['1.050','12','3']);
});
test('English uses localized labels, number separators and unavailable explanation',()=>{
 const f=setup('en');signIn(f);f.wallet.receive({...balances,diamonds:null},f.wallet.begin());assert.deepEqual(f.values(),['1,050','12','—']);
 assert.equal(f.nodes['header-magic-dust-label'].textContent,'Magic dust');assert.equal(f.nodes['header-diamonds'].attrs['aria-label'],'Diamonds: unavailable');
});
test('native header preserves accessibility and has no click, claim, purchase or local wallet storage',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),module=readFileSync(new URL('../public/header-wallet.js',import.meta.url),'utf8'),css=readFileSync(new URL('../public/header-wallet.css',import.meta.url),'utf8');
 const wallet=html.slice(html.indexOf('<div id="gold-wallet"'),html.indexOf('<div id="account-bar"'));
 assert.ok(wallet.indexOf('id="gold-balance"')<wallet.indexOf('id="magic-dust-balance"'));assert.ok(wallet.indexOf('id="magic-dust-balance"')<wallet.indexOf('id="diamond-balance"'));
 assert.match(wallet,/hidden aria-live="polite" aria-atomic="true"/);assert.doesNotMatch(wallet,/<button|onclick|>0</);assert.doesNotMatch(module,/localStorage|sessionStorage|fetch\(|setInterval/);
 assert.match(css,/repeat\(3,minmax\(0,1fr\)\)/);assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/@media\(max-width:350px\)/);
 assert.match(crazyGamesSource(html,'.html'),/id="magic-dust-balance"/);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');assert.equal((app.match(/setInterval\(refreshGold,/g)||[]).length,1);assert.match(crazyGamesSource(app,'.js'),/from '\/crazygames\/header-wallet.js'/);
});
