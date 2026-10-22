import test from 'node:test';
import assert from 'node:assert/strict';
import {selectAuctionCards,rarityForPower} from '../auction-card-pool.js';
import {battleRoster} from '../battle-roster.js';
import {readFileSync} from 'node:fs';
const select=(heroes,shuffle=x=>x)=>selectAuctionCards(heroes,{shuffle,powerFor:id=>heroes.find(h=>h.id===id).proposedPower});
test('draws ten distinct supported active heroes without requiring common heroes',()=>{
 const cards=select(battleRoster);assert.equal(cards.length,10);assert.equal(new Set(cards.map(c=>c.id)).size,10);
 for(const card of cards){const hero=battleRoster.find(h=>h.id===card.id);assert.ok(hero);assert.equal(card.power,hero.proposedPower)}
 assert.equal(battleRoster.length,50);
});
test('selection follows shuffle order and imposes no legendary or rare quota',()=>{
 const roster=Array.from({length:20},(_,i)=>({id:String(i),proposedPower:i<10?95:80}));
 assert.ok(select(roster).every(c=>rarityForPower(c.power)==='legendary'));
 assert.ok(select(roster,x=>x.reverse()).every(c=>rarityForPower(c.power)==='rare'));
 assert.equal(roster[0].id,'0','selection does not mutate caller array');
});
test('duplicates are removed before sampling and insufficient unique heroes fail clearly',()=>{
 const roster=Array.from({length:10},(_,i)=>({id:String(i),proposedPower:80}));
 assert.equal(select([...roster,...roster]).length,10);
 assert.throws(()=>select(roster.slice(1)),/10/);
});
test('all auction modes share sampler and final-card pricing/debt rules remain intact',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/return selectAuctionCards\(eligible/);
 assert.doesNotMatch(server,/AUCTION_RARITY_COUNTS|byRarity/);
 assert.match(server,/function forcedCardCost/);
 assert.match(server,/open.length===1/);
 assert.match(server,/r.players\[seat\].credits-=cost/);
});
