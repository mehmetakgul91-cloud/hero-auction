import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRevealedTeams,renderDeliveryPortraits} from '../public/auction-delivery-portraits.js';
import {deliveryBox} from './helpers/delivery-dom.mjs';
const card=n=>({name:'Hero '+n,universe:'original',rarity:'rare'});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
for(const count of [0,1,3,5])test(`${count} revealed cards create exactly ${count} portraits and art requests; no empty slots`,async()=>{
 const {slot}=deliveryBox(),cards=Array.from({length:count},(_,i)=>card(i)),requests=[];
 renderDeliveryPortraits(slot,cards,{english:true,loadArt:async hero=>{requests.push(hero.name);return '/images/'+hero.name+'.webp';}});
 await flush();assert.equal(slot.children.length,count);assert.deepEqual(requests,cards.map(c=>c.name));
 assert.equal(slot.attributes['aria-label'],`${count} revealed cards`);
 for(const [index,node] of slot.children.entries()){
  assert.equal(node.title,cards[index].name);assert.equal(node.children[0].tag,'img');assert.equal(node.children[0].alt,cards[index].name);
  node.children[0].onload();assert.equal(node.children[1].hidden,true);
 }
});
test('live arrivals accumulate without duplicates and do not reveal pending cards or mutate gameplay',()=>{
 const full=[{team:[0,1,2,3,4].map(card)},{team:[5,6,7,8,9].map(card)}];
 const pending=[{seat:0,card:card(1)},{seat:1,card:card(9)},{seat:0,card:card(3)}];
 const before=JSON.stringify(full),delivery=createRevealedTeams(full,pending,pending);
 assert.deepEqual(delivery.teams.map(team=>team.map(c=>c.name)),[['Hero 0','Hero 2','Hero 4'],['Hero 5','Hero 6','Hero 7','Hero 8']]);
 delivery.receive(pending[0]);delivery.receive(pending[0]);
 assert.deepEqual(delivery.teams[0].map(c=>c.name),['Hero 0','Hero 2','Hero 4','Hero 1']);
 delivery.receive(pending[2]);assert.equal(delivery.teams[0].length,5);assert.equal(delivery.teams[1].length,4);
 assert.equal(JSON.stringify(full),before);
 const next=createRevealedTeams(full,pending,pending);assert.equal(next.teams[0].length,3,'new match gets fresh receipts');
});
test('resume preserves tail reveal order rather than reordering by final team',()=>{
 const full=[{team:[0,1,2,3,4].map(card)}],tail=[3,1,4].map(n=>({seat:0,card:card(n)}));
 const delivery=createRevealedTeams(full,[tail[2]],tail);
 assert.deepEqual(delivery.teams[0].map(c=>c.name),['Hero 0','Hero 2','Hero 3','Hero 1']);
 delivery.receive(tail[2]);assert.deepEqual(delivery.teams[0].map(c=>c.name),['Hero 0','Hero 2','Hero 3','Hero 1','Hero 4']);
});
test('late art cannot insert stale portraits after live update, reset, rematch or detached destination',async()=>{
 for(const mode of ['update','reset','rematch','detached']){
  const {slot}=deliveryBox();let resolve;
  renderDeliveryPortraits(slot,[card(1)],{loadArt:()=>new Promise(r=>resolve=r)});await flush();
  const old=slot.children[0];
  if(mode==='detached')slot.isRoot=false;
  else renderDeliveryPortraits(slot,mode==='reset'?[]:[card(2)],{loadArt:async()=>'/new.webp'});
  resolve('/old.webp');await flush();
  assert.equal(old.children.some(node=>node.tag==='img'),false);
  if(mode==='reset')assert.equal(slot.children.length,0);
  if(mode==='update'||mode==='rematch'){assert.equal(slot.children.length,1);assert.equal(slot.children[0].title,'Hero 2');assert.equal(slot.children[0].children[0].src,'/new.webp');}
 }
});
test('missing, failed or rejected artwork keeps one named receipt, never a broken image or extra slot',async()=>{
 for(const mode of ['missing','failed','rejected']){
  const {slot}=deliveryBox();renderDeliveryPortraits(slot,[card(1)],{loadArt:()=>mode==='rejected'?Promise.reject(Error('offline')):Promise.resolve(mode==='missing'?null:'/failed.webp')});await flush();
  const portrait=slot.children[0];if(mode==='failed')portrait.children[0].onerror();
  assert.equal(slot.children.length,1);assert.equal(portrait.children.length,1);assert.equal(portrait.children[0].textContent,'Hero 1');assert.notEqual(portrait.children[0].hidden,true);
 }
});
test('portrait layout shrinks within receiver at mobile widths without reserved card slots',()=>{
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 assert.match(css,/\.delivery-slot\{[^}]*min-width:0[^}]*display:flex[^}]*gap:4px/);
 assert.match(css,/\.delivery-portrait\{[^}]*flex:0 1 34px;min-width:0/);
 assert.match(css,/\.delivery-portrait img\{[^}]*object-fit:cover/);
});
