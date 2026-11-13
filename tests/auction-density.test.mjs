import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crazyGamesSource} from '../crazygames-build.js';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const css=read('auction-density.css'),app=read('app.js');
test('both supported entry surfaces load the compact stylesheet after the theme and invalidate changed script caches',()=>{
 for(const html of [read('index.html'),crazyGamesSource(read('index.html'),'.html')]){
  assert.ok(html.indexOf('/auction-density.css?v=compact-auction-reveal-fix-20261106')>html.indexOf('/theme.css?'));
  assert.match(html,/app\.js\?v=foreground-return-20261113/);
  assert.equal((html.match(/auction-density\.css/g)||[]).length,1);
 }
 assert.match(crazyGamesSource(app,'.js'),/from '\/crazygames\/auction-team-portraits\.js\?v=compact-auction-20261106'/);
});
test('compact rules are auction-scoped with no permanent reaction rail or preview-only viewport override',()=>{
 const rules=[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
 assert.ok(rules.length>35);
 for(const [,selectors] of rules)for(const selector of selectors.split(','))assert.ok(selector.trim().startsWith('#game[data-phase="auction"]:not(.auction-delivery-active)'),selector+' must preserve the separate card delivery layout');
 assert.doesNotMatch(css,/scrollbar|overflow-y:hidden|battle-arena|180px.*(?:emote|heading)/);
 assert.match(css,/\.auction-player-heading\{[^}]*display:flex;[^}]*min-height:50px/);
 assert.match(css,/\.auction-player-heading \.arena-emotes\{[^}]*flex:0 0 44px;[^}]*height:44px/);
 assert.match(css,/\.auction-player-heading \.arena-emotes\{[^}]*position:static;z-index:auto;/,'own reaction must escape the static flex-item stacking context above chat');
 assert.match(read('arena-emotes.css'),/\.arena-emote-slot\{[^}]*pointer-events:none;z-index:30/,'reaction layer remains pointer-through above the chat panel');
 assert.match(css,/\.auction-player-heading \.arena-emote-slot\{top:calc\(100% \+ 23px\)/);
 assert.match(css,/\.side-hero-name\{grid-column:2\/4;overflow-wrap:anywhere/);
 assert.match(css,/\.side-hero-cost\{grid-row:2;font-size:11px/);
 assert.match(css,/\.player-side \.teams\{[^}]*max-height:none;overflow:visible/);
});
test('card delivery retains its original fixed receivers and reveal geometry instead of compact bidding rules',()=>{
 assert.match(app,/stage=\$\('stage'\);\$\('game'\)\.dataset\.phase='auction'/,'delivery intentionally uses the auction phase');
 assert.match(app,/\$\('game'\)\.classList\.add\('auction-delivery-active'\)/);
 assert.match(read('style.css'),/#game\.auction-delivery-active \.player-side\{position:fixed;top:auto;bottom:/);
 assert.match(read('style.css'),/#game \.auction-tail-sequence \.auction-deck-scene\{width:min\(300px,calc\(100vw - 100px\)\)/);
 assert.match(css,/#game\[data-phase="auction"\]:not\(\.auction-delivery-active\) \.player-side\{padding:8px;position:relative;top:auto\}/,'normal bidding keeps its approved compact layout');
 assert.match(css,/#game\[data-phase="auction"\]:not\(\.auction-delivery-active\) \.auction-deck-scene\{max-width:165px/,'compact card width must not leak into delivery');
});
test('active and passive ability explanations are always visible below the full main composition, with readable lane bonuses and no added lore',()=>{
 const stage=app.slice(app.indexOf('stage.innerHTML=`<div class="auction-main">'),app.indexOf('if(enteredAuction)resetAuctionEntryViewport'));
 assert.match(stage,/<\/div><\/div><div class="auction-card-details"><div class="auction-abilities"/);
 for(const id of ['auction-active','auction-passive'])assert.equal((stage.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.match(css,/\.auction-card-details \.auction-abilities\{font-size:12px!important;line-height:1\.4!important/);
 assert.match(css,/#auction-lane-bonuses\{font-size:11px;[^}]*white-space:normal/);
 assert.doesNotMatch(css,/\.auction-abilities[^{}]*\{[^}]*display:none|hero-description/);
 assert.doesNotMatch(stage,/<details|<summary|lore|hikâye/i);
});
