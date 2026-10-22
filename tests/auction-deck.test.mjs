import test from 'node:test';
import assert from 'node:assert/strict';
import {auctionDeckState,auctionDeckMarkup,revealAuctionCard,cancelAuctionReveal} from '../public/auction-deck.js';
import {readFileSync} from 'node:fs';
test('public round alone determines remaining facedown cards and final reveals',()=>{
 assert.deepEqual(auctionDeckState(0),{remaining:9,layers:3,finalCards:false});
 assert.deepEqual(auctionDeckState(7),{remaining:2,layers:2,finalCards:true});
 assert.deepEqual(auctionDeckState(9),{remaining:0,layers:0,finalCards:true});
 for(const round of [-4,99,NaN,undefined])assert.ok(auctionDeckState(round).remaining>=0);
});
test('facedown deck contains only neutral backs/counts, never hero or rarity metadata',()=>{
 const markup=auctionDeckMarkup(7,true);
 assert.match(markup,/2 cards in deck/);assert.equal((markup.match(/class="auction-deck-back"/g)||[]).length,2);
 assert.doesNotMatch(markup,/legendary|rare|power|portrait|img|data-hero/);
 assert.match(auctionDeckMarkup(9),/Son kart/);
 assert.doesNotMatch(auctionDeckMarkup(9),/class="auction-deck-back"/);
});
function fixture(){const classes=new Set();const listeners={};const scene={classList:{add(...v){v.forEach(x=>classes.add(x))},remove(...v){v.forEach(x=>classes.delete(x))}},addEventListener(n,fn){listeners[n]=fn}};return {classes,listeners,root:{querySelector:()=>scene,querySelectorAll:()=>[scene]}};}
test('new cards animate once; repeated updates, navigation and reduced motion cancel effects',()=>{
 const f=fixture();revealAuctionCard(f.root,{round:8,newCard:true});assert.ok(f.classes.has('auction-drawing'));assert.ok(f.classes.has('auction-final-draw'));
 revealAuctionCard(f.root,{round:8,newCard:false});assert.equal(f.classes.size,0);
 revealAuctionCard(f.root,{round:8,newCard:true,reducedMotion:true});assert.equal(f.classes.size,0);
 revealAuctionCard(f.root,{round:0,newCard:true});assert.equal(f.classes.has('auction-final-draw'),false);
 cancelAuctionReveal(f.root);assert.equal(f.classes.size,0);
 revealAuctionCard(f.root,{round:8,newCard:true});f.listeners.animationend({animationName:'auctionDrawFront'});assert.equal(f.classes.size,0);
});
test('deck is cosmetic with reduced-motion fallback and final snapshot reveals',()=>{
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/auction-deck.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\).*auction-drawing/s);
 assert.match(css,/\.auction-deck-backs\{[^}]*pointer-events:none/);
 assert.doesNotMatch(js,/fetch\(|setTimeout|deadline|credits|topBid/);
 assert.match(app,/previousTeamNames\[seat\]\.has\(hero.name\)/);
 assert.match(app,/pagehide.*cancelAuctionReveal/);
});
