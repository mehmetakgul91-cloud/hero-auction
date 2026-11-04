import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const portraitManifest=JSON.parse(readFileSync(new URL('../image-asset-manifest.json',import.meta.url),'utf8'));
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
test('calculation starts before optional room actions, without deleting global chrome or escape controls',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(css,/body:has\(#game\.auction-results-only:not\(\[hidden\]\)\) \.shell>\.lobby-header,\s*#game\.auction-results-only \.room-tools\{display:none\}/);
 assert.match(css,/#game\.auction-results-only:not\(\[hidden\]\)\{display:flex;flex-direction:column\}/);
 assert.match(css,/#game\.auction-results-only \.arena-layout\{order:-1\}/);
 for(const id of ['friend-opponent','leave','chat-panel','room-invites','join-invite-notice','lobby-home','account-status'])assert.ok(html.includes(`id="${id}"`),id);
 assert.doesNotMatch(css,/#game\.auction-results-only[^{}]*\.(?:friend-opponent-bar|chat-panel)[^{]*\{display:none/);
 const reset=app.indexOf("classList.remove('auction-results-only','auction-delivery-active')",app.indexOf('function show(r)'));
 assert.ok(reset>0&&reset<app.indexOf("if(r.phase==='finished'&&(tailAwards.length",reset));
 assert.match(app.slice(app.indexOf('function showCancelledRoom'),app.indexOf('function show(r)')),/classList.remove\('auction-results-only'/);
});
test('bot and human calculations retain both five-hero teams in either language and seat',()=>{
 for(const english of [false,true])for(const bot of [false,true])for(const me of [0,1]){
  const players=[{name:'Player',credits:2},{name:bot?(english?'Computer':'Bilgisayar'):'Opponent',credits:-1}].map((p,seat)=>({...p,team:Array.from({length:5},(_,n)=>({name:`Hero ${seat}-${n}`,power:90}))}));
  const before=JSON.stringify(players),markup=auctionCalculationMarkup(players,me,{english});
  assert.equal((markup.match(/class="calculation-hero"/g)||[]).length,10);
  assert.equal((markup.match(/class="calculation-total"/g)||[]).length,2);
  assert.ok(markup.includes(english?'Your team':'Senin takımın'));
  assert.ok(markup.includes(players[me].name));assert.ok(markup.includes('+2%'));assert.ok(markup.includes('-1%'));
  assert.equal(JSON.stringify(players),before);
 }
});
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
 assert.match(result,/auctionCalculationMarkup\(r.final\.map\(/);
 assert.doesNotMatch(result,/p.team.map|hero.name|final-hero/);
 assert.match(result,/id="confirm-arena-entry"/);
 assert.match(result,/location.assign\('\/battle-preview.html\?'/);
});

import {heroCalculation,teamCalculation,auctionCalculationMarkup} from '../public/auction-calculation.js';
test('compact calculation tables show each hero power, credit effect, and auction power exactly once',()=>{
 const players=[{name:'Local <safe>',credits:12,team:[{name:'Hero <A>',power:77,cost:999},{name:'Hero B',power:69}]},{name:'Opponent',credits:-3,team:[{name:'Hero C',power:80}]}];
 assert.deepEqual(teamCalculation(players[0]),{base:146,credits:12,multiplier:1.12,total:146*1.12});
 const markup=auctionCalculationMarkup(players,0);
 assert.equal((markup.match(/<table /g)||[]).length,2);
 assert.equal((markup.match(/class="calculation-hero"/g)||[]).length,3);
 assert.equal((markup.match(/class="calculation-total"/g)||[]).length,2);
 for(const name of ['Hero &lt;A&gt;','Hero B','Hero C'])assert.equal(markup.split('translate="no">'+name+'</span>').length-1,1);
 for(const value of ['77','+9.24','86.24','69','+8.28','77.28','80','-2.40','77.60','163.52'])assert.ok(markup.includes('>'+value+'<'),value);
 assert.ok(markup.includes('+12%'));assert.ok(markup.includes('-3%'));
 assert.ok(markup.includes('Local &lt;safe&gt;'));assert.ok(!markup.includes('<safe>'));assert.ok(!markup.includes('<A>'));
 assert.ok(!markup.includes('999'),'paid cost is not mistaken for power');
 assert.doesNotMatch(markup,/final-teams|final-hero|SON TAKIM GÜCÜ|FINAL TEAM POWER/);
 assert.ok(markup.includes('Komutan, diziliş ve arena etkileri bu hesapta yer almaz.'));
 const reversed=auctionCalculationMarkup(players,1,{english:true});
 assert.ok(reversed.indexOf('Opponent')<reversed.indexOf('Local &lt;safe&gt;'));
 assert.ok(reversed.includes('Auction power'));assert.ok(reversed.includes('Commander, formation and arena effects are not included.'));
});
test('per-hero calculation preserves authoritative base power and the existing team formula',()=>{
 for(const credits of [-20,-3,0,8,20]){
  const heroes=[{power:90},{power:83},{power:84},{power:71},{power:57}];
  const before=JSON.stringify(heroes),rows=heroes.map(hero=>heroCalculation(hero,credits));
  const team=teamCalculation({credits,team:heroes});
  assert.equal(JSON.stringify(heroes),before);
  assert.ok(Math.abs(rows.reduce((sum,row)=>sum+row.total,0)-team.total)<1e-10);
  assert.ok(rows.every((row,index)=>row.base===heroes[index].power));
  assert.ok(rows.every(row=>Math.abs(row.base+row.adjustment-row.total)<1e-10));
 }
 assert.deepEqual(heroCalculation({power:90,cost:4},0),{base:90,adjustment:0,total:90});
});
test('known hero uses its local portrait and compact rarity frame; unknown names stay escaped',()=>{
 const players=[{name:'Self',credits:8,team:[{name:'Obsidyen Muhafız',universe:'original',power:90}]},{name:'Opponent',credits:0,team:[{name:'<img src=x onerror=alert(1)>',power:70,portrait:'javascript:alert(1)',rarity:'" onload="x'}]}];
 const markup=auctionCalculationMarkup(players,0);
 assert.ok(markup.includes('src="'+portraitManifest.assets.find(a=>a.source==='/images/original/hero-01.png').url+'"'));
 assert.ok(markup.includes('data-rarity="legendary"'));
 assert.ok(markup.includes('title="Efsanevi"'));
 assert.ok(markup.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert.doesNotMatch(markup,/javascript:|data-rarity="" onload/);
 assert.equal((markup.match(/<img /g)||[]).length,1);
 assert.match(css,/@media\(max-width:780px\)\{\.auction-calculation-teams\{grid-template-columns:minmax\(0,1fr\)/);
});

test('calculation team backgrounds follow the viewer in both seats and languages',()=>{
 const players=[{name:'Seat zero',credits:2,team:[{name:'Obsidyen Muhafız',power:90}]},{name:'Seat one',credits:-1,team:[{name:'Eloren',power:76}]}];
 for(const me of [0,1])for(const english of [false,true]){
  const html=auctionCalculationMarkup(players,me,{english});
  const sections=[...html.matchAll(/<section class="calculation-team" data-team="(own|opponent)">([\s\S]*?)<\/section>/g)];
  assert.equal(sections.length,2);
  assert.equal(sections[0][1],'own');assert.ok(sections[0][2].includes(players[me].name));
  assert.equal(sections[1][1],'opponent');assert.ok(sections[1][2].includes(players[1-me].name));
  assert.ok(sections[0][2].includes(english?'Your team':'Senin takımın'));
 }
 const theme=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');
 assert.match(theme,/data-team="own".*--calculation-row:#e2eef9/);
 assert.match(theme,/data-team="opponent".*--calculation-row:#f7e6e1/);
 assert.match(theme,/\.calculation-hero\{background:var\(--calculation-row\)\}/);
 assert.doesNotMatch(theme,/calculation-portrait/,'rarity portrait colors are not overridden');
});

test('team surface text colors remain AA readable',()=>{
 const luminance=hex=>hex.match(/../g).map(c=>parseInt(c,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 for(const ink of ['203047','485666'])for(const surface of ['e2eef9','cfdfef','bfd5e9','f7e6e1','efd3ca','e7c2b7'])assert.ok((luminance(surface)+.05)/(luminance(ink)+.05)>=4.5,`${ink} on ${surface}`);
});
