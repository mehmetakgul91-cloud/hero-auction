import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
test('only auction calculation view hides duplicate player cards and uses full-width single column',()=>{
 assert.match(app,/if\(r.phase==='finished'&&r.final\?\.length===2&&r.final.every\(p=>p.team\?\.length===5\)&&session\?\.token\)\{\s*\$\('game'\).classList.add\('auction-results-only'\)/);
 assert.match(css,/#game\.auction-results-only \.player-side\{display:none\}/);
 assert.match(css,/#game\.auction-results-only \.arena-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(css,/#game\.auction-results-only \.arena-stage\{grid-column:1;grid-row:1;width:100%;min-width:0\}/);
});
test('auction/rematch transitions restore cards; calculation rows and arena confirmation stay intact',()=>{
 const reset=app.indexOf("classList.remove('auction-results-only','auction-delivery-active')");
 const tail=app.indexOf("if(r.phase==='finished'&&(tailAwards.length");assert.ok(reset>0&&reset<tail);
 const result=app.slice(app.indexOf("classList.add('auction-results-only')"),app.indexOf(" }renderChat(r);"));
 assert.match(result,/auctionCalculationMarkup\(r.final,r.me/);
 assert.doesNotMatch(result,/p.team.map|hero.name|final-hero/);
 assert.match(result,/id="confirm-arena-entry"/);
 assert.match(result,/location.assign\('\/battle-preview.html\?'/);
});

import {teamCalculation,auctionCalculationMarkup} from '../public/auction-calculation.js';
test('rendered results contain only team calculations, not acquired hero list',()=>{
 const players=[{name:'Local <safe>',credits:12,team:[{name:'SecretHeroA',power:77},{name:'SecretHeroB',power:69}]},{name:'Opponent',credits:-3,team:[{name:'SecretHeroC',power:80}]}];
 assert.deepEqual(teamCalculation(players[0]),{base:146,credits:12,multiplier:1.12,total:146*1.12});
 const markup=auctionCalculationMarkup(players,0);
 assert.equal((markup.match(/<table /g)||[]).length,1);
 assert.equal((markup.match(/<tr/g)||[]).length,5);
 assert.equal((markup.match(/<td>/g)||[]).length,8);
 for(const name of ['SecretHeroA','SecretHeroB','SecretHeroC'])assert.ok(!markup.includes(name));
 assert.ok(markup.includes('163.52'));assert.ok(markup.includes('77.60'));assert.ok(markup.includes('-3%'));
 assert.ok(markup.includes('Local &lt;safe&gt;'));assert.ok(!markup.includes('<safe>'));
 const reversed=auctionCalculationMarkup(players,1,{english:true});
 assert.ok(reversed.indexOf('Opponent')<reversed.indexOf('Local &lt;safe&gt;'));
 assert.ok(reversed.includes('FINAL TEAM POWER'));
});
