import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuctionTeamPortraitLoader} from '../public/auction-team-portraits.js';
const portrait=(name='Morvan',universe='original')=>({dataset:{heroName:name,heroUniverse:universe},isConnected:true,removeAttribute(name){delete this[name];}});
const root=(...images)=>({querySelectorAll:selector=>{assert.equal(selector,'.side-hero-portrait');return images;}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('production name/universe metadata resolves portraits once across teams and repaints without extra private fields',async()=>{
 const requests=[];
 const load=createAuctionTeamPortraitLoader({fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({url:'/verified.webp',power:777,description:'Do not inject',active:{secret:true}})};}});
 const first=portrait('Hero & <one>','original / custom'),duplicate=portrait('Hero & <one>','original / custom');
 await load(root(first,duplicate));await load(root(portrait('Hero & <one>','original / custom')));
 assert.deepEqual(requests,['/api/art?universe=original%20%2F%20custom&name=Hero%20%26%20%3Cone%3E']);
 assert.equal(first.src,'/verified.webp');assert.equal(duplicate.src,first.src);
 assert.equal(first.power,undefined);assert.equal(first.innerHTML,undefined);assert.equal(first.dataset.heroName,'Hero & <one>');
 await load(root(portrait('Hero & <one>','other')));assert.equal(requests.length,2,'same name in another universe has a different key');
});
test('in-flight requests are deduplicated and never paint disconnected prior room nodes',async()=>{
 let resolve,requests=0;
 const load=createAuctionTeamPortraitLoader({fetch:()=>{requests++;return new Promise(r=>resolve=r);}});
 const old=portrait(),next=portrait();const pending=load(root(old));await flush();old.isConnected=false;
 const repaint=load(root(next));resolve({ok:true,json:async()=>({url:'/real.webp'})});await Promise.all([pending,repaint]);
 assert.equal(requests,1);assert.equal(old.src,undefined);assert.equal(next.src,'/real.webp');
});
test('empty/missing metadata does not request art, and unavailable art never adds a broken image or retries on poll',async()=>{
 for(const failure of ['http','network','json','missing','invalid']){
  let count=0;const load=createAuctionTeamPortraitLoader({fetch:()=>{count++;if(failure==='network')throw Error('offline');return {ok:failure!=='http',json:()=>failure==='json'?Promise.reject(Error('JSON')):Promise.resolve(failure==='invalid'?{url:{not:'a URL'}}:{url:null})};}});
  await load(root());await load(root(portrait('',null)));assert.equal(count,0);
  const img=portrait();await load(root(img));assert.equal(img.src,undefined);assert.equal(img.dataset.portraitState,'missing');
  await load(root(portrait()));assert.equal(count,1,'cached failure prevents a repeated request on every room repaint');
 }
});
test('image decode/load errors remove the failed URL while preserving the fixed portrait slot and visible name metadata',async()=>{
 const img=portrait(),load=createAuctionTeamPortraitLoader({fetch:async()=>({ok:true,json:async()=>({url:'/missing.webp'})})});
 await load(root(img));img.onerror();assert.equal(img.src,undefined);assert.equal(img.dataset.portraitState,'missing');assert.equal(img.dataset.heroName,'Morvan');
});
